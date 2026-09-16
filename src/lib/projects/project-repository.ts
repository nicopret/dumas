import "server-only";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, readdir, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { areMainStorySections, defaultMainStoryOrder, emptyMainStorySections, isMainStoryOrder, isMainStorySectionId } from "./main-story.ts";
import { emptySummary, type DumasProject, type FiveSentenceSummary, type MainStorySectionId, type ProjectSummary } from "./project-types.ts";

export function isProjectId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}
export class InvalidTitleError extends Error {
  constructor() { super("Enter a series title."); }
}
export class InvalidPremiseError extends Error {
  constructor() { super("Premise must be a string."); }
}
export class InvalidSummaryError extends Error {
  constructor() { super("Summary must contain setup, three disasters, and resolution as strings."); }
}
export class InvalidMainStoryOrderError extends Error {
  constructor() { super("Order must contain each Main Story section exactly once."); }
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
export class InvalidProjectFileError extends Error {
  constructor(id: string) { super(`Project ${id} contains invalid or unsupported JSON.`); }
}
export function isProject(value: unknown, id: string): value is DumasProject {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<DumasProject>;
  const validDate = (date: unknown) => typeof date === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(date) && Number.isFinite(Date.parse(date));
  const summary = p.series?.summary;
  const validSummary = summary === undefined || (summary !== null && typeof summary === "object" &&
    typeof summary.setup === "string" && typeof summary.disaster1 === "string" &&
    typeof summary.disaster2 === "string" && typeof summary.disaster3 === "string" &&
    typeof summary.resolution === "string");
  const mainStory = p.series?.mainStory;
  const validMainStory = mainStory === undefined || (mainStory !== null && typeof mainStory === "object" &&
    isMainStoryOrder(mainStory.order) && (mainStory.sections === undefined || areMainStorySections(mainStory.sections)));
  return p.schemaVersion === 1 && p.id === id && typeof p.series?.title === "string" &&
    (p.series.premise === undefined || typeof p.series.premise === "string") &&
    validSummary && validMainStory && p.series.title.trim().length > 0 && validDate(p.createdAt) && validDate(p.updatedAt);
}
export function parseProject(raw: string, id: string): DumasProject {
  let project: unknown;
  try { project = JSON.parse(raw); } catch { throw new InvalidProjectFileError(id); }
  if (!isProject(project, id)) throw new InvalidProjectFileError(id);
  project.series.premise ??= "";
  project.series.summary ??= emptySummary();
  project.series.mainStory ??= { order: defaultMainStoryOrder(), sections: emptyMainStorySections() };
  project.series.mainStory.sections ??= emptyMainStorySections();
  return project;
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
  async function createProject(title: unknown): Promise<DumasProject> {
    if (typeof title !== "string" || !title.trim()) throw new InvalidTitleError();
    await mkdir(root, { recursive: true });
    const id = randomUUID();
    const now = new Date().toISOString();
    const project: DumasProject = { schemaVersion: 1, id, series: { title: title.trim(), premise: "", summary: emptySummary(), mainStory: { order: defaultMainStoryOrder(), sections: emptyMainStorySections() } }, createdAt: now, updatedAt: now };
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
  async function updateSummary(id: string, summary: FiveSentenceSummary): Promise<DumasProject | null> {
    if (!isProjectId(id)) return null;
    const project = await getProject(id);
    if (!project) return null;
    project.series.summary = {
      setup: summary.setup.trim(), disaster1: summary.disaster1.trim(), disaster2: summary.disaster2.trim(),
      disaster3: summary.disaster3.trim(), resolution: summary.resolution.trim(),
    };
    project.updatedAt = new Date().toISOString();
    return writeProject(project);
  }
  async function updateMainStoryOrder(id: string, order: MainStorySectionId[]): Promise<DumasProject | null> {
    if (!isProjectId(id)) return null;
    if (!isMainStoryOrder(order)) throw new InvalidMainStoryOrderError();
    const project = await getProject(id);
    if (!project) return null;
    project.series.mainStory.order = [...order];
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
    project.series.summary[sectionId] = section.title.trim();
    project.series.mainStory.sections[sectionId].details = section.details.trim();
    project.updatedAt = new Date().toISOString();
    return writeProject(project);
  }
  return { listProjects, createProject, getProject, updatePremise, updateSummary, updateMainStoryOrder, updateMainStorySection };
}
export type ProjectRepository = ReturnType<typeof createProjectRepository>;

// The filesystem implementation above is retained for tests and manual migration only.
// Runtime persistence is wired to S3 and deliberately has no local fallback.
import { createRuntimeS3ProjectRepository } from "./s3-project-repository.ts";
export const projectRepository: ProjectRepository = createRuntimeS3ProjectRepository();
