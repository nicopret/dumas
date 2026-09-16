import type { MainStorySectionId } from "./project-types.ts";

export const MAIN_STORY_SECTION_IDS = [
  "setup", "disaster1", "disaster2", "disaster3", "resolution",
] as const satisfies readonly MainStorySectionId[];

export function defaultMainStoryOrder(): MainStorySectionId[] {
  return [...MAIN_STORY_SECTION_IDS];
}

export function emptyMainStorySections(): Record<MainStorySectionId, { details: string }> {
  return {
    setup: { details: "" }, disaster1: { details: "" }, disaster2: { details: "" },
    disaster3: { details: "" }, resolution: { details: "" },
  };
}

export function isMainStorySectionId(value: unknown): value is MainStorySectionId {
  return typeof value === "string" && MAIN_STORY_SECTION_IDS.includes(value as MainStorySectionId);
}

export function areMainStorySections(value: unknown): value is Record<MainStorySectionId, { details: string }> {
  if (!value || typeof value !== "object") return false;
  const sections = value as Record<string, unknown>;
  return MAIN_STORY_SECTION_IDS.every(id => {
    const section = sections[id];
    if (!section || typeof section !== "object") return false;
    return typeof (section as { details?: unknown }).details === "string";
  });
}

export function isMainStoryOrder(value: unknown): value is MainStorySectionId[] {
  return Array.isArray(value) && value.length === MAIN_STORY_SECTION_IDS.length &&
    new Set(value).size === MAIN_STORY_SECTION_IDS.length &&
    value.every(section => typeof section === "string" &&
      MAIN_STORY_SECTION_IDS.includes(section as MainStorySectionId));
}
