import "server-only";

import {
  GetObjectCommand,
  paginateListObjectsV2,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { getAwsConfig } from "../aws/aws-config.ts";
import { s3Client } from "../aws/s3-client.ts";
import {
  InvalidPremiseError,
  InvalidMainStoryOrderError,
  InvalidMainStorySectionError,
  InvalidSectionDetailsError,
  InvalidSectionTitleError,
  InvalidTitleError,
  isProjectId,
  parseProject,
  serializeProject,
  type ProjectRepository,
} from "./project-repository.ts";
import { defaultMainStoryOrder, emptyMainStorySections, isMainStoryOrder, isMainStorySectionId } from "./main-story.ts";
import { emptySummary, type DumasProject, type FiveSentenceSummary, type MainStorySectionId, type ProjectSummary } from "./project-types.ts";

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

  async createProject(title: unknown): Promise<DumasProject> {
    if (typeof title !== "string" || !title.trim()) throw new InvalidTitleError();
    const now = new Date().toISOString();
    const project: DumasProject = {
      schemaVersion: 1,
      id: randomUUID(),
      series: { title: title.trim(), premise: "", summary: emptySummary(), mainStory: { order: defaultMainStoryOrder(), sections: emptyMainStorySections() } },
      createdAt: now,
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

  async updateSummary(id: string, summary: FiveSentenceSummary): Promise<DumasProject | null> {
    if (!isProjectId(id)) return null;
    const project = await this.getProject(id);
    if (!project) return null;
    project.series.summary = {
      setup: summary.setup.trim(), disaster1: summary.disaster1.trim(), disaster2: summary.disaster2.trim(),
      disaster3: summary.disaster3.trim(), resolution: summary.resolution.trim(),
    };
    project.updatedAt = new Date().toISOString();
    await this.putProject(project);
    return project;
  }

  async updateMainStoryOrder(id: string, order: MainStorySectionId[]): Promise<DumasProject | null> {
    if (!isProjectId(id)) return null;
    if (!isMainStoryOrder(order)) throw new InvalidMainStoryOrderError();
    const project = await this.getProject(id);
    if (!project) return null;
    project.series.mainStory.order = [...order];
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
    project.series.summary[sectionId] = section.title.trim();
    project.series.mainStory.sections[sectionId].details = section.details.trim();
    project.updatedAt = new Date().toISOString();
    await this.putProject(project);
    return project;
  }
}

export function createRuntimeS3ProjectRepository(): ProjectRepository {
  const config = getAwsConfig();
  if (!config.bucket || !config.region) {
    const unavailable = async () => { throw new S3ConfigurationError(); };
    return { listProjects: unavailable, createProject: unavailable, getProject: unavailable, updatePremise: unavailable, updateSummary: unavailable, updateMainStoryOrder: unavailable, updateMainStorySection: unavailable } as ProjectRepository;
  }
  return new S3ProjectRepository(s3Client, config.bucket, config.prefix);
}

export { normalizePrefix, isMissingObject };
