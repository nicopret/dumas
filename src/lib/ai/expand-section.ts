import "server-only";

import { getOpenAIClient, getOpenAIModel } from "./openai-client.ts";
import { expansionEntityCatalogue, reconcileExpansionEntities, type ExistingEntityCatalogue } from "./expansion-entity-context.ts";

export const EXPAND_SECTION_INSTRUCTIONS = `You are a story-structure editor helping an author expand a novel outline.

The author has provided one broad story section containing multiple events or developments.

Break this section into smaller, distinct story beats.

Return concise descriptive headings for the beats that are ALREADY present in the supplied section detail.

Rules:
- Preserve the author's story and chronology.
- Do not invent new events.
- Do not add characters, motivations, facts or world-building.
- Do not rewrite the prose.
- Each heading should represent a meaningful distinct event, change, discovery, decision or turning point.
- Keep headings concise but descriptive.
- Put them in chronological story order.
- Avoid headings that merely repeat the parent title.
- Return between 2 and 10 headings depending on how much real structure exists in the supplied material.`;

export const EXPAND_CONTEXT_INSTRUCTIONS = `

Also identify characters and places explicitly present or clearly described in the supplied section.

CHARACTERS:
- Include named characters.
- You may include clearly distinct unnamed characters where they obviously represent a story character, such as "the detective" or "the victim".
- Do not invent names or characters.
- Give each character a concise factual description based only on the supplied material.

PLACES:
- Identify meaningful story locations.
- Include named places and clearly distinct locations such as "Sarah's apartment" or "the police station".
- Do not invent place names or add unsupported locations.
- Give each place a concise factual description based only on the supplied material.

Do not infer unsupported biography, personality, geography or world-building.
Return only information supported by the author's section. Return empty arrays when no characters or places are present.`;

export const EXPAND_ASSOCIATION_INSTRUCTIONS = `

Assign a unique temporary ID to every heading, character, and place.
For every suggested story beat, identify which extracted characters and places are actually involved in that beat.
Use only temporary IDs from the characters and places arrays in characterRefs and placeRefs.
Only associate an entity when it is directly involved in or relevant to that specific beat.
Do not associate every character and place with every heading. Do not invent relationships.
A character or place may be associated with multiple story beats. A beat may have no characters or no places.`;

export const EXPAND_EXISTING_ENTITY_INSTRUCTIONS = `

You are also given the characters and places already known to this story.
When the current section refers to an existing entity, reuse it and return its supplied permanent ID as existingId.
Do not create a new entity merely because a name is abbreviated, only a first or surname is used, a location is shortened, or wording differs slightly.
Use the existing description and story context to decide whether it is clearly the same entity.
Only propose a new entity when it is genuinely distinct. If uncertain, prefer a possible existing match over silently creating a duplicate.
Do not invent names or identities. existingId must be one of the supplied IDs or null.`;

export interface ExpansionSuggestion { id: string; title: string; characterRefs: string[]; placeRefs: string[] }
export interface ContextSuggestion { ref: string; name: string; description: string; existingId: string | null }
export interface ExpansionResult { headings: ExpansionSuggestion[]; characters: ContextSuggestion[]; places: ContextSuggestion[] }

const entitySchema = {
  type: "object", additionalProperties: false,
  properties: { ref: { type: "string", minLength: 1 }, name: { type: "string", minLength: 1 }, description: { type: "string", minLength: 1 },
    existingId: { type: ["string", "null"] } },
  required: ["ref", "name", "description", "existingId"],
} as const;

export const expansionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    headings: {
      type: "array",
      minItems: 2,
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        properties: { id: { type: "string", minLength: 1 }, title: { type: "string", minLength: 1 },
          characterRefs: { type: "array", items: { type: "string" } },
          placeRefs: { type: "array", items: { type: "string" } } },
        required: ["id", "title", "characterRefs", "placeRefs"],
      },
    },
    characters: { type: "array", maxItems: 10, items: entitySchema },
    places: { type: "array", maxItems: 10, items: entitySchema },
  },
  required: ["headings", "characters", "places"],
} as const;

export function parseExpansionResult(raw: string): ExpansionResult {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || !("headings" in parsed) || !Array.isArray(parsed.headings) ||
      !("characters" in parsed) || !Array.isArray(parsed.characters) || !("places" in parsed) || !Array.isArray(parsed.places)) {
    throw new Error("OpenAI returned an invalid heading response.");
  }
  const headings = parsed.headings.map(item => {
    if (!item || typeof item !== "object" || !("id" in item) || typeof item.id !== "string" || !item.id.trim() ||
        !("title" in item) || typeof item.title !== "string" || !item.title.trim() ||
        !("characterRefs" in item) || !Array.isArray(item.characterRefs) || !item.characterRefs.every((ref: unknown) => typeof ref === "string") ||
        !("placeRefs" in item) || !Array.isArray(item.placeRefs) || !item.placeRefs.every((ref: unknown) => typeof ref === "string")) {
      throw new Error("OpenAI returned an invalid heading response.");
    }
    return { id: item.id.trim(), title: item.title.trim(),
      characterRefs: [...new Set(item.characterRefs as string[])], placeRefs: [...new Set(item.placeRefs as string[])] };
  });
  if (headings.length < 2 || headings.length > 10) throw new Error("OpenAI returned an invalid number of headings.");
  const entities = (items: unknown[]): ContextSuggestion[] => items.map(item => {
    if (!item || typeof item !== "object" || !("ref" in item) || typeof item.ref !== "string" || !item.ref.trim() ||
        !("name" in item) || !("description" in item) || typeof item.name !== "string" || !item.name.trim() ||
        typeof item.description !== "string" || !item.description.trim() || !("existingId" in item) ||
        (item.existingId !== null && typeof item.existingId !== "string")) {
      throw new Error("OpenAI returned an invalid context response.");
    }
    return { ref: item.ref.trim(), name: item.name.trim(), description: item.description.trim(),
      existingId: typeof item.existingId === "string" && item.existingId.trim() ? item.existingId.trim() : null };
  });
  if (parsed.characters.length > 10 || parsed.places.length > 10) throw new Error("OpenAI returned too many context suggestions.");
  const characters = entities(parsed.characters);
  const places = entities(parsed.places);
  const characterRefs = new Set(characters.map(item => item.ref));
  const placeRefs = new Set(places.map(item => item.ref));
  if (characterRefs.size !== characters.length || placeRefs.size !== places.length || new Set(headings.map(item => item.id)).size !== headings.length ||
      headings.some(heading => heading.characterRefs.some(ref => !characterRefs.has(ref)) || heading.placeRefs.some(ref => !placeRefs.has(ref)))) {
    throw new Error("OpenAI returned invalid context references.");
  }
  return { headings, characters, places };
}

export type ExpansionGenerator = (title: string, details: string, model: string, catalogue: string) => Promise<string>;

export async function requestExpansionSuggestions(title: string, details: string, model = getOpenAIModel(),
  catalogue: ExistingEntityCatalogue = { characters: {}, places: {} },
  generate: ExpansionGenerator = async (sectionTitle, sectionDetails, selectedModel, existingCatalogue) => {
    const response = await getOpenAIClient().responses.create({
      model: selectedModel,
      instructions: EXPAND_SECTION_INSTRUCTIONS + EXPAND_CONTEXT_INSTRUCTIONS + EXPAND_ASSOCIATION_INSTRUCTIONS + EXPAND_EXISTING_ENTITY_INSTRUCTIONS,
      input: `${existingCatalogue}\n\nCURRENT SECTION TITLE:\n${sectionTitle}\n\nCURRENT SECTION DETAIL:\n${sectionDetails}`,
      store: false,
      text: { format: { type: "json_schema", name: "story_beat_headings", strict: true, schema: expansionSchema } },
    });
    return response.output_text;
  }): Promise<ExpansionResult> {
  const context = expansionEntityCatalogue(catalogue);
  const parsed = parseExpansionResult(await generate(title, details, model, context));
  return { ...parsed,
    characters: reconcileExpansionEntities(parsed.characters, catalogue.characters),
    places: reconcileExpansionEntities(parsed.places, catalogue.places),
  };
}

export function friendlyOpenAIError(error: unknown): { status: number; message: string } {
  const candidate = error && typeof error === "object" ? error as { status?: number; code?: string; name?: string } : {};
  const status = candidate.status ?? (candidate.name === "APIConnectionTimeoutError" || candidate.code === "ETIMEDOUT" ? 408 : 500);
  if (status === 401) return { status, message: "OpenAI rejected the API key." };
  if (status === 403) return { status, message: "OpenAI access is not permitted for this project." };
  if (status === 404) return { status, message: "The configured OpenAI model is unavailable." };
  if (status === 408) return { status, message: "OpenAI did not respond in time." };
  if (status === 429) return { status, message: "OpenAI rate limit or quota exceeded. Please wait and try again." };
  if (status >= 500) return { status, message: "OpenAI is temporarily unavailable." };
  return { status, message: "Unable to expand this section. Please try again." };
}
