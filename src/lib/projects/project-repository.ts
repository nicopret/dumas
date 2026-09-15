import "server-only";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, readdir, rename, unlink } from "node:fs/promises";
import path from "node:path";
import type { DumasProject, ProjectSummary } from "./project-types.ts";

export function isProjectId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}
export class InvalidTitleError extends Error {
  constructor() { super("Enter a series title."); }
}
export class InvalidProjectFileError extends Error {
  constructor(id: string) { super(`Project ${id} contains invalid or unsupported JSON.`); }
}
function isProject(value: unknown, id: string): value is DumasProject {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<DumasProject>;
  const validDate = (date: unknown) => typeof date === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(date) && Number.isFinite(Date.parse(date));
  return p.schemaVersion === 1 && p.id === id && typeof p.series?.title === "string" &&
    p.series.title.trim().length > 0 && validDate(p.createdAt) && validDate(p.updatedAt);
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
      let project: unknown;
      try { project = JSON.parse(raw); } catch { throw new InvalidProjectFileError(id); }
      if (!isProject(project, id)) throw new InvalidProjectFileError(id);
      return project;
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
    const project: DumasProject = { schemaVersion: 1, id, series: { title: title.trim() }, createdAt: now, updatedAt: now };
    const temporary = path.join(root, `${id}.json.tmp`);
    let handle;
    let ownsTemporary = false;
    try {
      handle = await open(temporary, "wx", 0o644);
      ownsTemporary = true;
      await handle.writeFile(JSON.stringify(project, null, 2) + "\n", "utf8");
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
  return { listProjects, createProject, getProject };
}
export const projectRepository = createProjectRepository(path.join(process.cwd(), "data", "projects"));
