import type { StoryContextEntity } from "./project-types.ts";

export type StoryContextKind = "characters" | "places";
export interface StoryContextSuggestion { id?: string; name: string; description: string }
export interface StoryContextSelection { kind: StoryContextKind; item: StoryContextEntity | StoryContextSuggestion; suggested: boolean }

export function persistedStoryContextSelection(kind: StoryContextKind, item: StoryContextEntity): StoryContextSelection {
  return { kind, item, suggested: false };
}

export function normalizedEntityName(name: string): string { return name.trim().toLocaleLowerCase(); }

export function findDuplicateEntity(collection: Record<string, StoryContextEntity>, name: string): StoryContextEntity | undefined {
  const normalized = normalizedEntityName(name);
  return Object.values(collection).find(entity => normalizedEntityName(entity.name) === normalized);
}

export function mergeContextSuggestions(current: StoryContextSuggestion[], incoming: StoryContextSuggestion[]): StoryContextSuggestion[] {
  const merged = [...current];
  for (const suggestion of incoming) {
    const index = merged.findIndex(item => normalizedEntityName(item.name) === normalizedEntityName(suggestion.name));
    if (index >= 0) merged[index] = suggestion; else merged.push(suggestion);
  }
  return merged;
}

export function visibleStoryContextGroups(characters: Record<string, StoryContextEntity>, places: Record<string, StoryContextEntity>): StoryContextKind[] {
  return [...(Object.keys(characters).length ? ["characters" as const] : []),
    ...(Object.keys(places).length ? ["places" as const] : [])];
}

export function contextSuggestionStatus(collection: Record<string, StoryContextEntity>, name: string, addedNow = false): "available" | "added" | "duplicate" {
  if (addedNow) return "added";
  return findDuplicateEntity(collection, name) ? "duplicate" : "available";
}
