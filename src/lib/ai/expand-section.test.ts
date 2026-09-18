import { test } from "node:test";
import assert from "node:assert/strict";
import { EXPAND_ASSOCIATION_INSTRUCTIONS, EXPAND_CONTEXT_INSTRUCTIONS, EXPAND_EXISTING_ENTITY_INSTRUCTIONS,
  friendlyOpenAIError, requestExpansionSuggestions } from "./expand-section.ts";

test("parses an OpenAI structured heading response in chronological order", async () => {
  let suppliedTitle = "";
  let suppliedDetails = "";
  const existingCharacter = "550e8400-e29b-41d4-a716-446655440000";
  const existingPlace = "550e8400-e29b-41d4-a716-446655440001";
  const result = await requestExpansionSuggestions("The murder happens", "First discovery. Then police arrive.", "gpt-test",
    { characters: { [existingCharacter]: { id: existingCharacter, name: "Sarah Mercer", description: "The novelist." } },
      places: { [existingPlace]: { id: existingPlace, name: "Riverside Hotel", description: "The discovery location." } } },
    async (title, details, model, catalogue) => {
      suppliedTitle = title; suppliedDetails = details;
      assert.equal(model, "gpt-test");
      assert.match(catalogue, new RegExp(existingCharacter));
      assert.match(catalogue, /Name: Sarah Mercer/);
      assert.doesNotMatch(catalogue, /CURRENT SECTION/);
      return JSON.stringify({ headings: [
        { id: "heading-1", title: "  The Victim Is Discovered  ", characterRefs: ["character-1"], placeRefs: ["place-1"] },
        { id: "heading-2", title: "Police Arrive", characterRefs: ["character-1"], placeRefs: ["place-1"] }],
        characters: [{ ref: "character-1", name: " Sarah Mercer ", description: " The novelist. ", existingId: existingCharacter }],
        places: [{ ref: "place-1", name: " Riverside Hotel ", description: " The discovery location. ", existingId: existingPlace }] });
    });
  assert.equal(suppliedTitle, "The murder happens");
  assert.equal(suppliedDetails, "First discovery. Then police arrive.");
  assert.deepEqual(result, { headings: [
    { id: "heading-1", title: "The Victim Is Discovered", characterRefs: ["character-1"], placeRefs: ["place-1"] },
    { id: "heading-2", title: "Police Arrive", characterRefs: ["character-1"], placeRefs: ["place-1"] }],
    characters: [{ ref: "character-1", name: "Sarah Mercer", description: "The novelist.", existingId: existingCharacter }],
    places: [{ ref: "place-1", name: "Riverside Hotel", description: "The discovery location.", existingId: existingPlace }] });
});

test("accepts empty character and place arrays and explicitly prohibits invention", async () => {
  const result = await requestExpansionSuggestions("Storm", "Rain intensifies, then stops.", "gpt-test", { characters: {}, places: {} }, async () =>
    JSON.stringify({ headings: [
      { id: "heading-1", title: "Rain Intensifies", characterRefs: [], placeRefs: [] },
      { id: "heading-2", title: "The Storm Passes", characterRefs: [], placeRefs: [] }], characters: [], places: [] }));
  assert.deepEqual(result.characters, []);
  assert.deepEqual(result.places, []);
  assert.match(EXPAND_CONTEXT_INSTRUCTIONS, /Do not invent names or characters/);
  assert.match(EXPAND_CONTEXT_INSTRUCTIONS, /Do not invent place names/);
  assert.match(EXPAND_CONTEXT_INSTRUCTIONS, /empty arrays when no characters or places are present/);
  assert.match(EXPAND_ASSOCIATION_INSTRUCTIONS, /Do not associate every character and place with every heading/);
  assert.match(EXPAND_EXISTING_ENTITY_INSTRUCTIONS, /existingId must be one of the supplied IDs or null/);
});

test("rejects malformed or out-of-range structured heading responses", async () => {
  for (const value of [
    { headings: [{ id: "h1", title: "Only one", characterRefs: [], placeRefs: [] }], characters: [], places: [] },
    { headings: [{ id: "h1", title: "", characterRefs: [], placeRefs: [] },
      { id: "h2", title: "Two", characterRefs: [], placeRefs: [] }], characters: [], places: [] },
    { headings: [{ id: "h1", title: "One", characterRefs: ["missing"], placeRefs: [] },
      { id: "h2", title: "Two", characterRefs: [], placeRefs: [] }], characters: [], places: [] }, { nope: [] },
  ]) {
    await assert.rejects(requestExpansionSuggestions("Title", "Details", "gpt-test", { characters: {}, places: {} }, async () => JSON.stringify(value)));
  }
});

test("reconciles invalid model IDs and exact case-insensitive duplicate names", async () => {
  const sarahId = "550e8400-e29b-41d4-a716-446655440000";
  const result = await requestExpansionSuggestions("Title", "Details", "gpt-test", {
    characters: { [sarahId]: { id: sarahId, name: "Sarah Mercer", description: "Novelist" } }, places: {},
  }, async () => JSON.stringify({
    headings: [{ id: "h1", title: "One", characterRefs: ["c1", "c2"], placeRefs: [] },
      { id: "h2", title: "Two", characterRefs: [], placeRefs: [] }],
    characters: [
      { ref: "c1", name: "sarah mercer", description: "Same person", existingId: null },
      { ref: "c2", name: "The victim", description: "New person", existingId: "invented-uuid" },
    ], places: [],
  }));
  assert.equal(result.characters[0].existingId, sarahId);
  assert.equal(result.characters[1].existingId, null);
});

test("maps OpenAI failures without exposing raw error details", () => {
  assert.deepEqual(friendlyOpenAIError({ status: 429, message: "secret raw response" }),
    { status: 429, message: "OpenAI rate limit or quota exceeded. Please wait and try again." });
  assert.deepEqual(friendlyOpenAIError({ name: "APIConnectionTimeoutError" }),
    { status: 408, message: "OpenAI did not respond in time." });
});
