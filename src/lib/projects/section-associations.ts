import type { DumasProject, MainStorySectionId } from "./project-types.ts";

export type SectionEntityType = "character" | "place";
export interface SectionEntityDragData { type: SectionEntityType; id: string }

export function associationCollection(type: SectionEntityType): "characters" | "places" {
  return type === "character" ? "characters" : "places";
}

export function associationField(type: SectionEntityType): "characterIds" | "placeIds" {
  return type === "character" ? "characterIds" : "placeIds";
}

export function hasSectionAssociation(project: DumasProject, sectionId: MainStorySectionId,
  type: SectionEntityType, entityId: string): boolean {
  return project.series.mainStory.sections[sectionId]?.[associationField(type)].includes(entityId) ?? false;
}

export async function requestSectionAssociation(projectId: string, sectionId: string,
  data: SectionEntityDragData, request: typeof fetch = fetch): Promise<DumasProject> {
  const response = await request(`/api/projects/${projectId}/main-story/${sectionId}/associations`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: data.type, entityId: data.id }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || "Unable to associate this Story Context item. Please try again.");
  return body as DumasProject;
}
