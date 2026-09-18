import { findDuplicateEntity } from "./story-context-state.ts";
import type { StoryContextCollection } from "./project-types.ts";

export interface AiContextSuggestion { ref: string; name: string; description: string; existingId: string | null }
export interface AiExpansionHeading { id: string; title: string; characterRefs: string[]; placeRefs: string[] }
export interface ExpansionEntityMappings { characters: Record<string, string>; places: Record<string, string> }

export function existingExpansionMappings(characters: StoryContextCollection, places: StoryContextCollection,
  characterSuggestions: AiContextSuggestion[], placeSuggestions: AiContextSuggestion[]): ExpansionEntityMappings {
  const map = (collection: StoryContextCollection, suggestions: AiContextSuggestion[]) => Object.fromEntries(suggestions.flatMap(suggestion => {
    const duplicate = findDuplicateEntity(collection, suggestion.name);
    const existingId = suggestion.existingId && collection[suggestion.existingId] ? suggestion.existingId : duplicate?.id;
    return existingId ? [[suggestion.ref, existingId]] : [];
  }));
  return { characters: map(characters, characterSuggestions), places: map(places, placeSuggestions) };
}

export function persistentExpansionHeading(heading: AiExpansionHeading, mappings: ExpansionEntityMappings) {
  return { title: heading.title,
    characterIds: [...new Set(heading.characterRefs.flatMap(ref => mappings.characters[ref] ? [mappings.characters[ref]] : []))],
    placeIds: [...new Set(heading.placeRefs.flatMap(ref => mappings.places[ref] ? [mappings.places[ref]] : []))],
  };
}
