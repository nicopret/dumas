import type { StoryContextCollection } from "../projects/project-types.ts";

export interface ExistingEntityCatalogue {
  characters: StoryContextCollection;
  places: StoryContextCollection;
}

export interface ReconciledContextSuggestion {
  ref: string;
  name: string;
  description: string;
  existingId: string | null;
}

export function expansionEntityCatalogue(catalogue: ExistingEntityCatalogue): string {
  const group = (heading: string, entities: StoryContextCollection) => {
    const entries = Object.values(entities).map(entity =>
      `ID: ${entity.id}\nName: ${entity.name}\nDescription: ${entity.description}`);
    return `${heading}:\n\n${entries.length ? entries.join("\n\n") : "None"}`;
  };
  return `${group("EXISTING CHARACTERS", catalogue.characters)}\n\n${group("EXISTING PLACES", catalogue.places)}`;
}

export function reconcileExpansionEntities(
  suggestions: ReconciledContextSuggestion[],
  existing: StoryContextCollection,
): ReconciledContextSuggestion[] {
  const normalized = (name: string) => name.trim().toLocaleLowerCase();
  const byName = new Map(Object.values(existing).map(entity => [normalized(entity.name), entity.id]));
  return suggestions.map(suggestion => ({
    ...suggestion,
    existingId: (suggestion.existingId && existing[suggestion.existingId]
      ? suggestion.existingId
      : byName.get(normalized(suggestion.name))) ?? null,
  }));
}
