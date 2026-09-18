import type { StoryContextEntity } from "./project-types.ts";

export const MAX_VISIBLE_ENTITY_AVATARS = 5;

export function entityInitials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  if (!words.length) return "?";
  const initials = words.length > 1 ? `${words[0][0] ?? ""}${words[1][0] ?? ""}` : words[0].slice(0, 2);
  return initials.toLocaleUpperCase() || "?";
}

export function usableEntityImage(imageUrl: string | null | undefined, failed = false): string | null {
  if (failed || typeof imageUrl !== "string" || !imageUrl.trim()) return null;
  return imageUrl.trim();
}

export function visibleEntityAvatars(entities: StoryContextEntity[]) {
  return { visible: entities.slice(0, MAX_VISIBLE_ENTITY_AVATARS), overflow: Math.max(0, entities.length - MAX_VISIBLE_ENTITY_AVATARS) };
}

export function workflowEntityAvatarLayout(characters: StoryContextEntity[], places: StoryContextEntity[]) {
  return { characters: visibleEntityAvatars(characters), places: visibleEntityAvatars(places),
    showSeparator: characters.length > 0 && places.length > 0 };
}
