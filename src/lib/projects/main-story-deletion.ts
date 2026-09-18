import type { MainStorySectionId, MainStoryWorkflow, StoryFlows } from "./project-types.ts";

export function mainStoryDeletionIds(workflow: MainStoryWorkflow, sectionId: MainStorySectionId): Set<MainStorySectionId> | null {
  if (!workflow.sections[sectionId]) return null;
  const deleted = new Set<MainStorySectionId>();
  const visit = (id: MainStorySectionId) => {
    if (deleted.has(id)) return;
    const section = workflow.sections[id];
    if (!section) return;
    deleted.add(id);
    for (const childId of section.childIds ?? []) visit(childId);
  };
  visit(sectionId);
  return deleted;
}

export function deleteFromMainStory(workflow: MainStoryWorkflow, sectionId: MainStorySectionId): MainStoryWorkflow | null {
  const deleted = mainStoryDeletionIds(workflow, sectionId);
  if (!deleted) return null;
  const sections = Object.fromEntries(Object.entries(workflow.sections)
    .filter(([id]) => !deleted.has(id))
    .map(([id, section]) => {
      if (!section.childIds?.some(childId => deleted.has(childId))) return [id, section];
      const childIds = section.childIds.filter(childId => !deleted.has(childId));
      const updatedSection = { ...section };
      if (childIds.length) updatedSection.childIds = childIds;
      else delete updatedSection.childIds;
      return [id, updatedSection];
    }));
  return { sections };
}

export function deleteFromStoryFlows(storyFlows: StoryFlows, deleted: Set<string>): StoryFlows {
  const flows = Object.fromEntries(Object.entries(storyFlows.flows).map(([id, flow]) =>
    [id, { ...flow, placements: flow.placements.filter(placement => !deleted.has(placement.sectionId)) }]));
  const links = Object.fromEntries(Object.entries(storyFlows.links).filter(([, link]) => !deleted.has(link.sourceSectionId) &&
    !(link.target.type === "section" && deleted.has(link.target.sectionId))));
  return { ...storyFlows, flows, links };
}

export async function requestMainStorySectionDeletion(projectId: string, sectionId: MainStorySectionId,
  request: typeof fetch = fetch): Promise<void> {
  const response = await request(`/api/projects/${projectId}/main-story/${sectionId}`, { method: "DELETE" });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: unknown } | null;
    throw new Error(typeof body?.error === "string" ? body.error : "Unable to delete this story section. Please try again.");
  }
}
