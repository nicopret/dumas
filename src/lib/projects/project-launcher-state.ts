import type { ProjectSummary } from "./project-types.ts";

export function withoutProject(projects: ProjectSummary[], deletedId: string): ProjectSummary[] {
  return projects.filter(project => project.id !== deletedId);
}

export async function requestProjectDeletion(projectId: string,
  request: typeof fetch = fetch): Promise<void> {
  const response = await request(`/api/projects/${projectId}`, { method: "DELETE" });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: unknown } | null;
    throw new Error(typeof body?.error === "string" ? body.error : "Unable to delete this series. Please try again.");
  }
}
