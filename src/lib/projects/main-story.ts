import type { FiveSentenceSummary, MainStorySection, MainStorySectionId } from "./project-types.ts";

export const MAIN_STORY_SECTION_IDS = [
  "setup", "disaster1", "disaster2", "disaster3", "resolution",
] as const satisfies readonly MainStorySectionId[];

export function defaultMainStoryOrder(): MainStorySectionId[] {
  return [...MAIN_STORY_SECTION_IDS];
}

export function emptyMainStorySections(summary?: FiveSentenceSummary): Record<MainStorySectionId, MainStorySection> {
  return {
    setup: { id: "setup", title: summary?.setup ?? "", details: "", characterIds: [], placeIds: [] },
    disaster1: { id: "disaster1", title: summary?.disaster1 ?? "", details: "", characterIds: [], placeIds: [] },
    disaster2: { id: "disaster2", title: summary?.disaster2 ?? "", details: "", characterIds: [], placeIds: [] },
    disaster3: { id: "disaster3", title: summary?.disaster3 ?? "", details: "", characterIds: [], placeIds: [] },
    resolution: { id: "resolution", title: summary?.resolution ?? "", details: "", characterIds: [], placeIds: [] },
  };
}

export function isMainStorySectionId(value: unknown): value is MainStorySectionId {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(value);
}

export function areMainStorySections(value: unknown): value is Record<MainStorySectionId, MainStorySection> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const sections = value as Record<string, unknown>;
  return Object.entries(sections).every(([id, section]) => {
    if (!isMainStorySectionId(id) || !section || typeof section !== "object") return false;
    const candidate = section as Partial<MainStorySection>;
    return candidate.id === id && typeof candidate.title === "string" && typeof candidate.details === "string" &&
      (candidate.characterIds === undefined || (Array.isArray(candidate.characterIds) && candidate.characterIds.every(isMainStorySectionId))) &&
      (candidate.placeIds === undefined || (Array.isArray(candidate.placeIds) && candidate.placeIds.every(isMainStorySectionId))) &&
      (candidate.parentId === undefined || isMainStorySectionId(candidate.parentId)) &&
      (candidate.childIds === undefined || (Array.isArray(candidate.childIds) &&
        candidate.childIds.every(isMainStorySectionId) && new Set(candidate.childIds).size === candidate.childIds.length));
  });
}

export function isMainStoryOrder(value: unknown): value is MainStorySectionId[] {
  return Array.isArray(value) && new Set(value).size === value.length && value.every(isMainStorySectionId);
}
