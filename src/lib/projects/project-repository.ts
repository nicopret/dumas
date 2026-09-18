import "server-only";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, readdir, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { areMainStorySections, isMainStoryOrder, isMainStorySectionId, MAIN_STORY_SECTION_IDS } from "./main-story.ts";
import { emptySummary, type DumasProject, type FiveSentenceSummary, type MainStorySection, type MainStorySectionId, type ProjectSummary, type StoryContextCollection } from "./project-types.ts";
import { deleteFromMainStory, deleteFromStoryFlows, mainStoryDeletionIds } from "./main-story-deletion.ts";
import { associationCollection, associationField, type SectionEntityType } from "./section-associations.ts";
import { emptyStoryFlows, getFlowPlacementsSorted, getSectionPlacement, hasDuplicateStoryLink, isStoryFlows, migrateOrderedStoryFlows, movePlacement, sectionFlow } from "./story-flows.ts";
import type { StoryLinkTarget } from "./project-types.ts";

export function isProjectId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}
export class InvalidTitleError extends Error {
  constructor() { super("Enter a series title."); }
}
export class InvalidPremiseError extends Error {
  constructor() { super("Premise must be a string."); }
}
export class InvalidIdeaError extends Error {
  constructor() { super("Please describe your story idea before continuing."); }
}
export class InvalidSummaryError extends Error {
  constructor() { super("Summary must contain setup, three disasters, and resolution as strings."); }
}
export class InvalidMainStoryOrderError extends Error {
  constructor() { super("Order must contain unique, existing Main Story section IDs."); }
}
export class InvalidMainStorySectionError extends Error {
  constructor() { super("Invalid Main Story section ID."); }
}
export class InvalidSectionDetailsError extends Error {
  constructor() { super("Section details must be a string."); }
}
export class InvalidSectionTitleError extends Error {
  constructor() { super("Section title must be a non-blank string."); }
}
export class InvalidStoryContextEntityError extends Error {
  constructor() { super("A non-empty name and description are required."); }
}
export class InvalidSectionAssociationError extends Error {
  constructor(message = "Invalid section association.") { super(message); }
}
export class InvalidProjectFileError extends Error {
  constructor(id: string) { super(`Project ${id} contains invalid or unsupported JSON.`); }
}
function hasValidProjectEnvelope(value: unknown, id: string): value is Record<string, unknown> & { series: Record<string, unknown> } {
  if (!value || typeof value !== "object") return false;
  const p = value as { id?: unknown; schemaVersion?: unknown; series?: Record<string, unknown>; createdAt?: unknown; updatedAt?: unknown };
  const validDate = (date: unknown) => typeof date === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(date) && Number.isFinite(Date.parse(date));
  const summary = p.series?.summary as Partial<FiveSentenceSummary> | undefined;
  const validSummary = summary === undefined || (summary !== null && typeof summary === "object" &&
    typeof summary.setup === "string" && typeof summary.disaster1 === "string" &&
    typeof summary.disaster2 === "string" && typeof summary.disaster3 === "string" &&
    typeof summary.resolution === "string");
  return (p.schemaVersion === 1 || p.schemaVersion === 2 || p.schemaVersion === 3 || p.schemaVersion === 4) && p.id === id && typeof p.series?.title === "string" &&
    (p.series.premise === undefined || typeof p.series.premise === "string") &&
    (p.series.idea === undefined || typeof p.series.idea === "string") &&
    validSummary && p.series.title.trim().length > 0 && validDate(p.createdAt) && validDate(p.updatedAt);
}

export function isProject(value: unknown, id: string): value is DumasProject {
  if (!hasValidProjectEnvelope(value, id)) return false;
  const p = value as unknown as Partial<DumasProject>;
  const mainStory = p.series?.mainStory;
  if (p.schemaVersion === 4) return Boolean(mainStory && areMainStorySections(mainStory.sections) &&
    isStoryFlows(p.series?.storyFlows, mainStory.sections));
  if (p.schemaVersion === 3) return Boolean(mainStory && areMainStorySections(mainStory.sections) &&
    migrateOrderedStoryFlows(p.series?.storyFlows, mainStory.sections));
  if (p.schemaVersion === 2) return mainStory === undefined || Boolean(mainStory && isMainStoryOrder((mainStory as unknown as { order?: unknown }).order) &&
    areMainStorySections(mainStory.sections) && (mainStory as unknown as { order: string[] }).order.every(sectionId => sectionId in mainStory.sections));
  if (p.schemaVersion !== 1 || mainStory === undefined) return p.schemaVersion === 1;
  if (!mainStory || typeof mainStory !== "object" || !isMainStoryOrder((mainStory as unknown as { order?: unknown }).order)) return false;
  const sections = mainStory.sections as unknown;
  if (sections === undefined || !sections || typeof sections !== "object") return sections === undefined;
  return MAIN_STORY_SECTION_IDS.every(id => typeof (sections as Record<string, { details?: unknown }>)[id]?.details === "string");
}

function normalizeContextCollection(value: unknown): StoryContextCollection {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).flatMap(([id, entity]) => {
    if (!isMainStorySectionId(id) || !entity || typeof entity !== "object" || (entity as { id?: unknown }).id !== id ||
      typeof (entity as { name?: unknown }).name !== "string" || typeof (entity as { description?: unknown }).description !== "string") return [];
    const source = entity as { id: string; name: string; description: string; imageUrl?: unknown };
    const imageUrl = typeof source.imageUrl === "string" && source.imageUrl.trim() ? source.imageUrl.trim() : null;
    return [[id, { id, name: source.name, description: source.description, ...(source.imageUrl !== undefined ? { imageUrl } : {}) }]];
  })) as StoryContextCollection;
}
export function parseProject(raw: string, id: string): DumasProject {
  let project: unknown;
  try { project = JSON.parse(raw); } catch { throw new InvalidProjectFileError(id); }
  if (!isProject(project, id)) throw new InvalidProjectFileError(id);
  const legacy = project as unknown as { schemaVersion: 1 | 2 | 3 | 4; id: string; series: { title: string; idea?: string; premise?: string;
    summary?: FiveSentenceSummary; mainStory?: { order?: string[]; sections?: Record<string, Partial<MainStorySection>> }; storyFlows?: unknown };
    createdAt: string; updatedAt: string };
  const summary = legacy.series.summary ?? emptySummary();
  // Missing and explicitly empty workflows are both valid. Never manufacture the
  // retired five-node Snowflake workflow during read-time normalization.
  const order = legacy.series.mainStory?.order ?? [];
  const sourceSections = legacy.series.mainStory?.sections ?? {};
  const sections: Record<string, MainStorySection> = {};
  for (const sectionId of new Set([...Object.keys(sourceSections), ...order])) {
    const source = sourceSections[sectionId];
    const legacyTitle = MAIN_STORY_SECTION_IDS.includes(sectionId as never)
      ? summary[sectionId as keyof FiveSentenceSummary] : "";
    sections[sectionId] = {
      ...source,
      id: sectionId,
      title: legacy.schemaVersion === 1 && MAIN_STORY_SECTION_IDS.includes(sectionId as never)
        ? legacyTitle : typeof source?.title === "string" ? source.title : legacyTitle,
      details: typeof source?.details === "string" ? source.details : "",
      characterIds: Array.isArray(source?.characterIds) ? [...new Set(source.characterIds)] : [],
      placeIds: Array.isArray(source?.placeIds) ? [...new Set(source.placeIds)] : [],
      ...(typeof source?.parentId === "string" ? { parentId: source.parentId } : {}),
      ...(Array.isArray(source?.childIds) ? { childIds: [...source.childIds] } : {}),
    };
  }
  const projectWithContext = legacy as typeof legacy & { characters?: unknown; places?: unknown };
  const storyFlows = isStoryFlows(legacy.series.storyFlows, sections) ? legacy.series.storyFlows
    : migrateOrderedStoryFlows(legacy.series.storyFlows, sections) ?? emptyStoryFlows(order);
  return { ...legacy, schemaVersion: 4, series: { ...legacy.series, title: legacy.series.title,
    idea: legacy.series.idea ?? "", premise: legacy.series.premise ?? "", summary, mainStory: { sections }, storyFlows },
    characters: normalizeContextCollection(projectWithContext.characters), places: normalizeContextCollection(projectWithContext.places),
    createdAt: legacy.createdAt, updatedAt: legacy.updatedAt } as DumasProject;
}
export function serializeProject(project: DumasProject): string {
  return JSON.stringify(project, null, 2) + "\n";
}
function hasCode(error: unknown, code: string) {
  return error instanceof Error && "code" in error && error.code === code;
}
// Only server code configures this directory; requests cannot choose filesystem paths.
export function createProjectRepository(directory: string) {
  const root = path.resolve(directory);
  async function getProject(id: string): Promise<DumasProject | null> {
    if (!isProjectId(id)) return null;
    let handle;
    try {
      handle = await open(path.join(root, `${id}.json`), constants.O_RDONLY | constants.O_NOFOLLOW);
      if (!(await handle.stat()).isFile()) throw new InvalidProjectFileError(id);
      const raw = await handle.readFile("utf8");
      return parseProject(raw, id);
    } catch (error) {
      if (hasCode(error, "ENOENT")) return null;
      throw error;
    } finally { await handle?.close(); }
  }
  async function listProjects(): Promise<ProjectSummary[]> {
    await mkdir(root, { recursive: true });
    const entries = await readdir(root, { withFileTypes: true });
    const projects: ProjectSummary[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const id = entry.name.slice(0, -5);
      if (!isProjectId(id)) continue;
      try {
        const p = await getProject(id);
        if (p) projects.push({ id: p.id, title: p.series.title, createdAt: p.createdAt, updatedAt: p.updatedAt });
      } catch (error) {
        console.error(`Unable to load project ${id}; leaving its file unchanged.`, error);
      }
    }
    return projects.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id));
  }
  async function deleteProject(id: string): Promise<boolean> {
    if (!isProjectId(id)) return false;
    try {
      await unlink(path.join(root, `${id}.json`));
      return true;
    } catch (error) {
      if (hasCode(error, "ENOENT")) return false;
      throw error;
    }
  }
  async function createProject(title: unknown): Promise<DumasProject> {
    if (typeof title !== "string" || !title.trim()) throw new InvalidTitleError();
    await mkdir(root, { recursive: true });
    const id = randomUUID();
    const now = new Date().toISOString();
    const summary = emptySummary();
    const project: DumasProject = { schemaVersion: 4, id, series: { title: title.trim(), idea: "", premise: "", summary,
      mainStory: { sections: {} }, storyFlows: emptyStoryFlows() }, characters: {}, places: {}, createdAt: now, updatedAt: now };
    return writeProject(project);
  }
  async function writeProject(project: DumasProject): Promise<DumasProject> {
    const id = project.id;
    const temporary = path.join(root, `${id}.${randomUUID()}.json.tmp`);
    let handle;
    let ownsTemporary = false;
    try {
      handle = await open(temporary, "wx", 0o644);
      ownsTemporary = true;
      await handle.writeFile(serializeProject(project), "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporary, path.join(root, `${id}.json`));
      return project;
    } finally {
      await handle?.close();
      if (ownsTemporary) await unlink(temporary).catch((error: unknown) => {
        if (!hasCode(error, "ENOENT")) console.error("Unable to clean up project temporary file.", error);
      });
    }
  }
  async function updatePremise(id: string, premise: unknown): Promise<DumasProject | null> {
    if (!isProjectId(id)) return null;
    if (typeof premise !== "string") throw new InvalidPremiseError();
    const project = await getProject(id);
    if (!project) return null;
    project.series.premise = premise.trim();
    project.updatedAt = new Date().toISOString();
    return writeProject(project);
  }
  async function updateIdea(id: string, idea: unknown): Promise<DumasProject | null> {
    if (!isProjectId(id)) return null;
    if (typeof idea !== "string" || !idea.trim()) throw new InvalidIdeaError();
    const project = await getProject(id);
    if (!project) return null;
    project.series.idea = idea.trim();
    project.updatedAt = new Date().toISOString();
    return writeProject(project);
  }
  async function updateSummary(id: string, summary: FiveSentenceSummary): Promise<DumasProject | null> {
    if (!isProjectId(id)) return null;
    const project = await getProject(id);
    if (!project) return null;
    project.series.summary = {
      setup: summary.setup.trim(), disaster1: summary.disaster1.trim(), disaster2: summary.disaster2.trim(),
      disaster3: summary.disaster3.trim(), resolution: summary.resolution.trim(),
    };
    for (const sectionId of MAIN_STORY_SECTION_IDS) {
      if (project.series.mainStory.sections[sectionId]) project.series.mainStory.sections[sectionId].title = project.series.summary[sectionId];
    }
    project.updatedAt = new Date().toISOString();
    return writeProject(project);
  }
  async function updateMainStoryOrder(id: string, order: MainStorySectionId[]): Promise<DumasProject | null> {
    if (!isProjectId(id)) return null;
    if (!isMainStoryOrder(order)) throw new InvalidMainStoryOrderError();
    const project = await getProject(id);
    if (!project) return null;
    const flow = project.series.storyFlows.flows[project.series.storyFlows.primaryFlowId];
    if (!flow || !order.every(sectionId => sectionId in project.series.mainStory.sections) ||
      order.length !== flow.placements.length ||
      order.some(sectionId => sectionFlow(project.series.storyFlows, sectionId)?.id !== flow.id)) throw new InvalidMainStoryOrderError();
    const rows = getFlowPlacementsSorted(flow).map(placement => placement.row);
    flow.placements = order.map((sectionId, index) => ({ sectionId, row: rows[index] }));
    project.updatedAt = new Date().toISOString();
    return writeProject(project);
  }
  async function updateMainStorySection(id: string, sectionId: string, section: { title: unknown; details: unknown }): Promise<DumasProject | null> {
    if (!isProjectId(id)) return null;
    if (!isMainStorySectionId(sectionId)) throw new InvalidMainStorySectionError();
    if (typeof section.title !== "string" || !section.title.trim()) throw new InvalidSectionTitleError();
    if (typeof section.details !== "string") throw new InvalidSectionDetailsError();
    const project = await getProject(id);
    if (!project) return null;
    if (!project.series.mainStory.sections[sectionId]) throw new InvalidMainStorySectionError();
    project.series.mainStory.sections[sectionId].title = section.title.trim();
    project.series.mainStory.sections[sectionId].details = section.details.trim();
    if (MAIN_STORY_SECTION_IDS.includes(sectionId as never)) project.series.summary[sectionId as keyof FiveSentenceSummary] = section.title.trim();
    project.updatedAt = new Date().toISOString();
    return writeProject(project);
  }
  async function deleteMainStorySection(id: string, sectionId: string): Promise<DumasProject | null> {
    if (!isProjectId(id)) return null;
    if (!isMainStorySectionId(sectionId)) throw new InvalidMainStorySectionError();
    const project = await getProject(id);
    if (!project) return null;
    const deleted = mainStoryDeletionIds(project.series.mainStory, sectionId);
    const mainStory = deleteFromMainStory(project.series.mainStory, sectionId);
    if (!mainStory) throw new InvalidMainStorySectionError();
    project.series.mainStory = mainStory;
    project.series.storyFlows = deleteFromStoryFlows(project.series.storyFlows, deleted!);
    project.updatedAt = new Date().toISOString();
    return writeProject(project);
  }
  async function updateMainStorySectionDetails(id: string, sectionId: string, details: unknown): Promise<DumasProject | null> {
    if (!isProjectId(id)) return null;
    if (!isMainStorySectionId(sectionId)) throw new InvalidMainStorySectionError();
    if (typeof details !== "string") throw new InvalidSectionDetailsError();
    const project = await getProject(id);
    if (!project) return null;
    if (!project.series.mainStory.sections[sectionId]) throw new InvalidMainStorySectionError();
    project.series.mainStory.sections[sectionId].details = details.trim();
    project.updatedAt = new Date().toISOString();
    return writeProject(project);
  }
  async function updateMainStorySectionTitle(id: string, sectionId: string, title: unknown): Promise<DumasProject | null> {
    if (!isProjectId(id)) return null;
    if (!isMainStorySectionId(sectionId)) throw new InvalidMainStorySectionError();
    if (typeof title !== "string" || !title.trim()) throw new InvalidSectionTitleError();
    const project = await getProject(id);
    if (!project) return null;
    if (!project.series.mainStory.sections[sectionId]) throw new InvalidMainStorySectionError();
    project.series.mainStory.sections[sectionId].title = title.trim();
    if (MAIN_STORY_SECTION_IDS.includes(sectionId as never)) project.series.summary[sectionId as keyof FiveSentenceSummary] = title.trim();
    project.updatedAt = new Date().toISOString();
    return writeProject(project);
  }
  async function expandMainStorySection(id: string, sectionId: string,
    headings: Array<string | { title: string; characterIds?: string[]; placeIds?: string[] }>): Promise<DumasProject | null> {
    if (!isProjectId(id)) return null;
    if (!isMainStorySectionId(sectionId)) throw new InvalidMainStorySectionError();
    if (!Array.isArray(headings) || headings.length < 2 || headings.length > 10 ||
      headings.some(heading => typeof heading === "string" ? !heading.trim() : !heading || typeof heading !== "object" ||
        typeof heading.title !== "string" || !heading.title.trim() || (heading.characterIds !== undefined && !Array.isArray(heading.characterIds)) ||
        (heading.placeIds !== undefined && !Array.isArray(heading.placeIds)) || heading.characterIds?.some(value => typeof value !== "string") ||
        heading.placeIds?.some(value => typeof value !== "string"))) throw new InvalidSectionTitleError();
    const project = await getProject(id);
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
    return writeProject(project);
  }
  async function addStoryContextEntity(id: string, kind: "characters" | "places", name: unknown, description: unknown) {
    if (!isProjectId(id)) return null;
    if (typeof name !== "string" || !name.trim() || typeof description !== "string" || !description.trim()) {
      throw new InvalidStoryContextEntityError();
    }
    const project = await getProject(id);
    if (!project) return null;
    const normalizedName = name.trim().toLocaleLowerCase();
    const existing = Object.values(project[kind]).find(entity => entity.name.trim().toLocaleLowerCase() === normalizedName);
    if (existing) return { project, entity: existing, duplicate: true };
    const entityId = randomUUID();
    const entity = { id: entityId, name: name.trim(), description: description.trim() };
    project[kind][entityId] = entity;
    project.updatedAt = new Date().toISOString();
    await writeProject(project);
    return { project, entity, duplicate: false };
  }
  async function associateEntityWithSection(id: string, sectionId: string, entityType: SectionEntityType, entityId: string) {
    if (!isProjectId(id)) return null;
    if (!isMainStorySectionId(sectionId)) throw new InvalidMainStorySectionError();
    if ((entityType !== "character" && entityType !== "place") || !isProjectId(entityId)) throw new InvalidSectionAssociationError();
    const project = await getProject(id);
    if (!project) return null;
    const section = project.series.mainStory.sections[sectionId];
    if (!section) throw new InvalidMainStorySectionError();
    if (!project[associationCollection(entityType)][entityId]) throw new InvalidSectionAssociationError("Story Context item not found.");
    const field = associationField(entityType);
    if (section[field].includes(entityId)) return project;
    section[field] = [...new Set([...section[field], entityId])];
    project.updatedAt = new Date().toISOString();
    return writeProject(project);
  }
  async function createStoryFlow(id: string, title: unknown) {
    if (!isProjectId(id)) return null;
    if (typeof title !== "string" || !title.trim()) throw new InvalidTitleError();
    const project = await getProject(id); if (!project) return null;
    const flowId = randomUUID(); project.series.storyFlows.flows[flowId] = { id: flowId, title: title.trim(), placements: [] };
    project.updatedAt = new Date().toISOString(); return writeProject(project);
  }
  async function moveSectionToGridPosition(id: string, sectionId: string, targetFlowId: string, row: number, newFlowTitle?: unknown) {
    if (!isProjectId(id)) return null;
    if (!isMainStorySectionId(sectionId)) throw new InvalidMainStorySectionError();
    if (!Number.isInteger(row) || row < 1) throw new InvalidMainStoryOrderError();
    const project = await getProject(id); if (!project) return null;
    if (!project.series.mainStory.sections[sectionId] || !sectionFlow(project.series.storyFlows, sectionId)) throw new InvalidMainStorySectionError();
    let flowId = targetFlowId;
    if (newFlowTitle !== undefined) {
      if (typeof newFlowTitle !== "string" || !newFlowTitle.trim()) throw new InvalidTitleError();
      flowId = randomUUID(); project.series.storyFlows.flows[flowId] = { id: flowId, title: newFlowTitle.trim(), placements: [] };
    }
    const moved = movePlacement(project.series.storyFlows, sectionId, flowId, row);
    if (!moved) throw new InvalidMainStoryOrderError();
    project.series.storyFlows = moved; project.updatedAt = new Date().toISOString(); return writeProject(project);
  }
  async function createStoryLink(id: string, sourceSectionId: string, target: StoryLinkTarget) {
    if (!isProjectId(id)) return null;
    const project = await getProject(id); if (!project) return null;
    if (!project.series.mainStory.sections[sourceSectionId] || (target.type === "section" ? !project.series.mainStory.sections[target.sectionId]
      : !project.series.storyFlows.flows[target.flowId])) throw new InvalidMainStorySectionError();
    if (hasDuplicateStoryLink(project.series.storyFlows, sourceSectionId, target)) return project;
    const linkId = randomUUID(); project.series.storyFlows.links[linkId] = { id: linkId, sourceSectionId, target };
    project.updatedAt = new Date().toISOString(); return writeProject(project);
  }
  async function deleteStoryLink(id: string, linkId: string) {
    if (!isProjectId(id)) return null;
    const project = await getProject(id); if (!project) return null;
    if (!project.series.storyFlows.links[linkId]) return project;
    delete project.series.storyFlows.links[linkId]; project.updatedAt = new Date().toISOString(); return writeProject(project);
  }
  return { listProjects, createProject, getProject, deleteProject, updateIdea, updatePremise, updateSummary, updateMainStoryOrder,
    updateMainStorySection, deleteMainStorySection, updateMainStorySectionDetails, updateMainStorySectionTitle, expandMainStorySection,
    addStoryContextEntity, associateEntityWithSection, createStoryFlow, moveSectionToGridPosition, createStoryLink, deleteStoryLink };
}
export type ProjectRepository = ReturnType<typeof createProjectRepository>;

// The filesystem implementation above is retained for tests and manual migration only.
// Runtime persistence is wired to S3 and deliberately has no local fallback.
import { createRuntimeS3ProjectRepository } from "./s3-project-repository.ts";
export const projectRepository: ProjectRepository = createRuntimeS3ProjectRepository();
