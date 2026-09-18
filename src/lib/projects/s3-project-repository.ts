import "server-only";

import {
  GetObjectCommand,
  DeleteObjectCommand,
  paginateListObjectsV2,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { getAwsConfig } from "../aws/aws-config.ts";
import { s3Client } from "../aws/s3-client.ts";
import {
  InvalidPremiseError,
  InvalidIdeaError,
  InvalidMainStoryOrderError,
  InvalidMainStorySectionError,
  InvalidSectionDetailsError,
  InvalidSectionTitleError,
  InvalidStoryContextEntityError,
  InvalidSectionAssociationError,
  InvalidTitleError,
  isProjectId,
  parseProject,
  serializeProject,
  type ProjectRepository,
} from "./project-repository.ts";
import { isMainStoryOrder, isMainStorySectionId, MAIN_STORY_SECTION_IDS } from "./main-story.ts";
import { emptySummary, type DumasProject, type FiveSentenceSummary, type MainStorySectionId, type ProjectSummary, type StoryLinkTarget } from "./project-types.ts";
import { deleteFromMainStory, deleteFromStoryFlows, mainStoryDeletionIds } from "./main-story-deletion.ts";
import { associationCollection, associationField, type SectionEntityType } from "./section-associations.ts";
import { emptyStoryFlows, getFlowPlacementsSorted, getSectionPlacement, hasDuplicateStoryLink, movePlacement, sectionFlow } from "./story-flows.ts";

export class S3ConfigurationError extends Error {
  constructor() { super("S3 project storage is not configured."); }
}

function normalizePrefix(prefix: string): string {
  const trimmed = prefix.trim().replace(/^\/+|\/+$/g, "");
  return trimmed ? `${trimmed}/` : "";
}

function isMissingObject(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { name?: string; Code?: string; code?: string; $metadata?: { httpStatusCode?: number } };
  return value.name === "NoSuchKey" || value.Code === "NoSuchKey" || value.code === "NoSuchKey" ||
    value.name === "NotFound" || value.$metadata?.httpStatusCode === 404;
}

async function bodyAsUtf8(body: unknown): Promise<string> {
  if (body && typeof body === "object" && "transformToString" in body &&
      typeof body.transformToString === "function") {
    return body.transformToString("utf-8");
  }
  throw new Error("S3 returned an unreadable project body.");
}

export class S3ProjectRepository {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly prefix: string;

  constructor(client: S3Client, bucket: string, prefix = "projects/") {
    this.client = client;
    this.bucket = bucket;
    this.prefix = normalizePrefix(prefix);
  }

  keyFor(id: string): string { return `${this.prefix}${id}.json`; }

  async getProject(id: string): Promise<DumasProject | null> {
    if (!isProjectId(id)) return null;
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.keyFor(id) }));
      return parseProject(await bodyAsUtf8(response.Body), id);
    } catch (error) {
      if (isMissingObject(error)) return null;
      throw error;
    }
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const projects: ProjectSummary[] = [];
    const keyPattern = new RegExp(`^${this.prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\\.json$`, "i");
    for await (const page of paginateListObjectsV2(
      { client: this.client },
      { Bucket: this.bucket, Prefix: this.prefix },
    )) {
      for (const object of page.Contents ?? []) {
        const match = object.Key?.match(keyPattern);
        if (!match) continue;
        const id = match[1];
        try {
          const project = await this.getProject(id);
          if (project) projects.push({ id: project.id, title: project.series.title, createdAt: project.createdAt, updatedAt: project.updatedAt });
        } catch (error) {
          console.error(`Unable to load S3 project ${id}; skipping it.`, error);
        }
      }
    }
    return projects.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id));
  }

  async deleteProject(id: string): Promise<boolean> {
    if (!isProjectId(id)) return false;
    const project = await this.getProject(id);
    if (!project) return false;
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.keyFor(id) }));
    return true;
  }

  async createProject(title: unknown): Promise<DumasProject> {
    if (typeof title !== "string" || !title.trim()) throw new InvalidTitleError();
    const now = new Date().toISOString();
    const project: DumasProject = {
      schemaVersion: 4,
      id: randomUUID(),
      series: { title: title.trim(), idea: "", premise: "", summary: emptySummary(), mainStory: { sections: {} }, storyFlows: emptyStoryFlows() },
      characters: {}, places: {}, createdAt: now,
      updatedAt: now,
    };
    await this.putProject(project);
    return project;
  }

  async putProject(project: DumasProject, onlyIfMissing = false): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: this.keyFor(project.id),
      Body: serializeProject(project),
      ContentType: "application/json",
      ...(onlyIfMissing ? { IfNoneMatch: "*" } : {}),
    }));
  }

  async updatePremise(id: string, premise: unknown): Promise<DumasProject | null> {
    if (!isProjectId(id)) return null;
    if (typeof premise !== "string") throw new InvalidPremiseError();
    const project = await this.getProject(id);
    if (!project) return null;
    project.series.premise = premise.trim();
    project.updatedAt = new Date().toISOString();
    await this.putProject(project);
    return project;
  }

  async updateIdea(id: string, idea: unknown): Promise<DumasProject | null> {
    if (!isProjectId(id)) return null;
    if (typeof idea !== "string" || !idea.trim()) throw new InvalidIdeaError();
    const project = await this.getProject(id);
    if (!project) return null;
    project.series.idea = idea.trim();
    project.updatedAt = new Date().toISOString();
    await this.putProject(project);
    return project;
  }

  async updateSummary(id: string, summary: FiveSentenceSummary): Promise<DumasProject | null> {
    if (!isProjectId(id)) return null;
    const project = await this.getProject(id);
    if (!project) return null;
    project.series.summary = {
      setup: summary.setup.trim(), disaster1: summary.disaster1.trim(), disaster2: summary.disaster2.trim(),
      disaster3: summary.disaster3.trim(), resolution: summary.resolution.trim(),
    };
    for (const sectionId of MAIN_STORY_SECTION_IDS) {
      if (project.series.mainStory.sections[sectionId]) project.series.mainStory.sections[sectionId].title = project.series.summary[sectionId];
    }
    project.updatedAt = new Date().toISOString();
    await this.putProject(project);
    return project;
  }

  async updateMainStoryOrder(id: string, order: MainStorySectionId[]): Promise<DumasProject | null> {
    if (!isProjectId(id)) return null;
    if (!isMainStoryOrder(order)) throw new InvalidMainStoryOrderError();
    const project = await this.getProject(id);
    if (!project) return null;
    const flow = project.series.storyFlows.flows[project.series.storyFlows.primaryFlowId];
    if (!flow || !order.every(sectionId => sectionId in project.series.mainStory.sections) ||
      order.length !== flow.placements.length ||
      order.some(sectionId => sectionFlow(project.series.storyFlows, sectionId)?.id !== flow.id)) throw new InvalidMainStoryOrderError();
    const rows = getFlowPlacementsSorted(flow).map(placement => placement.row);
    flow.placements = order.map((sectionId, index) => ({ sectionId, row: rows[index] }));
    project.updatedAt = new Date().toISOString();
    await this.putProject(project);
    return project;
  }

  async updateMainStorySection(id: string, sectionId: string, section: { title: unknown; details: unknown }): Promise<DumasProject | null> {
    if (!isProjectId(id)) return null;
    if (!isMainStorySectionId(sectionId)) throw new InvalidMainStorySectionError();
    if (typeof section.title !== "string" || !section.title.trim()) throw new InvalidSectionTitleError();
    if (typeof section.details !== "string") throw new InvalidSectionDetailsError();
    const project = await this.getProject(id);
    if (!project) return null;
    if (!project.series.mainStory.sections[sectionId]) throw new InvalidMainStorySectionError();
    project.series.mainStory.sections[sectionId].title = section.title.trim();
    if (MAIN_STORY_SECTION_IDS.includes(sectionId as never)) project.series.summary[sectionId as keyof FiveSentenceSummary] = section.title.trim();
    project.series.mainStory.sections[sectionId].details = section.details.trim();
    project.updatedAt = new Date().toISOString();
    await this.putProject(project);
    return project;
  }

  async deleteMainStorySection(id: string, sectionId: string): Promise<DumasProject | null> {
    if (!isProjectId(id)) return null;
    if (!isMainStorySectionId(sectionId)) throw new InvalidMainStorySectionError();
    const project = await this.getProject(id);
    if (!project) return null;
    const deleted = mainStoryDeletionIds(project.series.mainStory, sectionId);
    const mainStory = deleteFromMainStory(project.series.mainStory, sectionId);
    if (!mainStory) throw new InvalidMainStorySectionError();
    project.series.mainStory = mainStory;
    project.series.storyFlows = deleteFromStoryFlows(project.series.storyFlows, deleted!);
    project.updatedAt = new Date().toISOString();
    await this.putProject(project);
    return project;
  }

  async updateMainStorySectionDetails(id: string, sectionId: string, details: unknown): Promise<DumasProject | null> {
    if (!isProjectId(id)) return null;
    if (!isMainStorySectionId(sectionId)) throw new InvalidMainStorySectionError();
    if (typeof details !== "string") throw new InvalidSectionDetailsError();
    const project = await this.getProject(id);
    if (!project) return null;
    if (!project.series.mainStory.sections[sectionId]) throw new InvalidMainStorySectionError();
    project.series.mainStory.sections[sectionId].details = details.trim();
    project.updatedAt = new Date().toISOString();
    await this.putProject(project);
    return project;
  }

  async updateMainStorySectionTitle(id: string, sectionId: string, title: unknown): Promise<DumasProject | null> {
    if (!isProjectId(id)) return null;
    if (!isMainStorySectionId(sectionId)) throw new InvalidMainStorySectionError();
    if (typeof title !== "string" || !title.trim()) throw new InvalidSectionTitleError();
    const project = await this.getProject(id);
    if (!project) return null;
    if (!project.series.mainStory.sections[sectionId]) throw new InvalidMainStorySectionError();
    project.series.mainStory.sections[sectionId].title = title.trim();
    if (MAIN_STORY_SECTION_IDS.includes(sectionId as never)) project.series.summary[sectionId as keyof FiveSentenceSummary] = title.trim();
    project.updatedAt = new Date().toISOString();
    await this.putProject(project);
    return project;
  }

  async expandMainStorySection(id: string, sectionId: string,
    headings: Array<string | { title: string; characterIds?: string[]; placeIds?: string[] }>): Promise<DumasProject | null> {
    if (!isProjectId(id)) return null;
    if (!isMainStorySectionId(sectionId)) throw new InvalidMainStorySectionError();
    if (!Array.isArray(headings) || headings.length < 2 || headings.length > 10 ||
      headings.some(heading => typeof heading === "string" ? !heading.trim() : !heading || typeof heading !== "object" ||
        typeof heading.title !== "string" || !heading.title.trim() || (heading.characterIds !== undefined && !Array.isArray(heading.characterIds)) ||
        (heading.placeIds !== undefined && !Array.isArray(heading.placeIds)) || heading.characterIds?.some(value => typeof value !== "string") ||
        heading.placeIds?.some(value => typeof value !== "string"))) throw new InvalidSectionTitleError();
    const project = await this.getProject(id);
    if (!project) return null;
    const located = getSectionPlacement(project.series.storyFlows, sectionId);
    const flow = located?.flow;
    const parentRow = located?.placement.row;
    const parent = project.series.mainStory.sections[sectionId];
    if (!flow || parentRow === undefined || !parent) throw new InvalidMainStorySectionError();
    const childIds = headings.map(() => randomUUID());
    childIds.forEach((childId, index) => {
      const supplied = headings[index];
      const heading = typeof supplied === "string" ? { title: supplied, characterIds: [], placeIds: [] } : supplied;
      const characterIds = [...new Set((heading.characterIds ?? []).filter(entityId => isProjectId(entityId) && entityId in project.characters))];
      const placeIds = [...new Set((heading.placeIds ?? []).filter(entityId => isProjectId(entityId) && entityId in project.places))];
      project.series.mainStory.sections[childId] = {
        id: childId, title: heading.title.trim(), details: "", parentId: sectionId, characterIds, placeIds,
      };
    });
    parent.childIds = childIds;
    flow.placements = flow.placements.filter(placement => placement.sectionId !== sectionId);
    childIds.forEach((childId, index) => {
      project.series.storyFlows = movePlacement(project.series.storyFlows, childId, flow.id, parentRow + index)!;
    });
    project.updatedAt = new Date().toISOString();
    await this.putProject(project);
    return project;
  }

  async addStoryContextEntity(id: string, kind: "characters" | "places", name: unknown, description: unknown) {
    if (!isProjectId(id)) return null;
    if (typeof name !== "string" || !name.trim() || typeof description !== "string" || !description.trim()) {
      throw new InvalidStoryContextEntityError();
    }
    const project = await this.getProject(id);
    if (!project) return null;
    const normalizedName = name.trim().toLocaleLowerCase();
    const existing = Object.values(project[kind]).find(entity => entity.name.trim().toLocaleLowerCase() === normalizedName);
    if (existing) return { project, entity: existing, duplicate: true };
    const entityId = randomUUID();
    const entity = { id: entityId, name: name.trim(), description: description.trim() };
    project[kind][entityId] = entity;
    project.updatedAt = new Date().toISOString();
    await this.putProject(project);
    return { project, entity, duplicate: false };
  }

  async associateEntityWithSection(id: string, sectionId: string, entityType: SectionEntityType, entityId: string) {
    if (!isProjectId(id)) return null;
    if (!isMainStorySectionId(sectionId)) throw new InvalidMainStorySectionError();
    if ((entityType !== "character" && entityType !== "place") || !isProjectId(entityId)) throw new InvalidSectionAssociationError();
    const project = await this.getProject(id);
    if (!project) return null;
    const section = project.series.mainStory.sections[sectionId];
    if (!section) throw new InvalidMainStorySectionError();
    if (!project[associationCollection(entityType)][entityId]) throw new InvalidSectionAssociationError("Story Context item not found.");
    const field = associationField(entityType);
    if (section[field].includes(entityId)) return project;
    section[field] = [...new Set([...section[field], entityId])];
    project.updatedAt = new Date().toISOString();
    await this.putProject(project);
    return project;
  }

  async createStoryFlow(id: string, title: unknown) {
    if (!isProjectId(id)) return null;
    if (typeof title !== "string" || !title.trim()) throw new InvalidTitleError();
    const project = await this.getProject(id); if (!project) return null;
    const flowId = randomUUID(); project.series.storyFlows.flows[flowId] = { id: flowId, title: title.trim(), placements: [] };
    project.updatedAt = new Date().toISOString(); await this.putProject(project); return project;
  }

  async moveSectionToGridPosition(id: string, sectionId: string, targetFlowId: string, row: number, newFlowTitle?: unknown) {
    if (!isProjectId(id)) return null;
    if (!isMainStorySectionId(sectionId)) throw new InvalidMainStorySectionError();
    if (!Number.isInteger(row) || row < 1) throw new InvalidMainStoryOrderError();
    const project = await this.getProject(id); if (!project) return null;
    if (!project.series.mainStory.sections[sectionId] || !sectionFlow(project.series.storyFlows, sectionId)) throw new InvalidMainStorySectionError();
    let flowId = targetFlowId;
    if (newFlowTitle !== undefined) {
      if (typeof newFlowTitle !== "string" || !newFlowTitle.trim()) throw new InvalidTitleError();
      flowId = randomUUID(); project.series.storyFlows.flows[flowId] = { id: flowId, title: newFlowTitle.trim(), placements: [] };
    }
    const moved = movePlacement(project.series.storyFlows, sectionId, flowId, row);
    if (!moved) throw new InvalidMainStoryOrderError();
    project.series.storyFlows = moved; project.updatedAt = new Date().toISOString(); await this.putProject(project); return project;
  }

  async createStoryLink(id: string, sourceSectionId: string, target: StoryLinkTarget) {
    if (!isProjectId(id)) return null;
    const project = await this.getProject(id); if (!project) return null;
    if (!project.series.mainStory.sections[sourceSectionId] || (target.type === "section" ? !project.series.mainStory.sections[target.sectionId]
      : !project.series.storyFlows.flows[target.flowId])) throw new InvalidMainStorySectionError();
    if (hasDuplicateStoryLink(project.series.storyFlows, sourceSectionId, target)) return project;
    const linkId = randomUUID(); project.series.storyFlows.links[linkId] = { id: linkId, sourceSectionId, target };
    project.updatedAt = new Date().toISOString(); await this.putProject(project); return project;
  }

  async deleteStoryLink(id: string, linkId: string) {
    if (!isProjectId(id)) return null;
    const project = await this.getProject(id); if (!project) return null;
    if (!project.series.storyFlows.links[linkId]) return project;
    delete project.series.storyFlows.links[linkId]; project.updatedAt = new Date().toISOString(); await this.putProject(project); return project;
  }
}

export function createRuntimeS3ProjectRepository(): ProjectRepository {
  const config = getAwsConfig();
  if (!config.bucket || !config.region) {
    const unavailable = async () => { throw new S3ConfigurationError(); };
    return { listProjects: unavailable, createProject: unavailable, getProject: unavailable, deleteProject: unavailable,
      updateIdea: unavailable, updatePremise: unavailable,
      updateSummary: unavailable, updateMainStoryOrder: unavailable, updateMainStorySection: unavailable,
      deleteMainStorySection: unavailable, updateMainStorySectionDetails: unavailable, updateMainStorySectionTitle: unavailable,
      expandMainStorySection: unavailable, addStoryContextEntity: unavailable, associateEntityWithSection: unavailable,
      createStoryFlow: unavailable, moveSectionToGridPosition: unavailable, createStoryLink: unavailable, deleteStoryLink: unavailable } as ProjectRepository;
  }
  return new S3ProjectRepository(s3Client, config.bucket, config.prefix);
}

export { normalizePrefix, isMissingObject };
