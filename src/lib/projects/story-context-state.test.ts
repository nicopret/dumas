import { test } from "node:test";
import assert from "node:assert/strict";
import { contextSuggestionStatus, findDuplicateEntity, mergeContextSuggestions, persistedStoryContextSelection, visibleStoryContextGroups,
  type StoryContextSelection } from "./story-context-state.ts";

test("duplicate detection is trimmed and case-insensitive", () => {
  const entity = { id: "one", name: "Sarah Mercer", description: "Novelist" };
  assert.equal(findDuplicateEntity({ one: entity }, "  sarah mercer "), entity);
  assert.equal(findDuplicateEntity({ one: entity }, "Detective"), undefined);
});

test("Story Context selection changes independently of workflow state", () => {
  const workflowState = { expandedSection: "setup", order: ["setup", "resolution"] };
  const before = structuredClone(workflowState);
  const selection: StoryContextSelection = { kind: "characters",
    item: { name: "Sarah", description: "Novelist" }, suggested: true };
  assert.equal(selection.item.name, "Sarah");
  assert.deepEqual(workflowState, before);
});

test("a workflow association chip targets the canonical persisted Story Context entity", () => {
  const entity = { id: "character-uuid", name: "Sarah", description: "Novelist" };
  assert.deepEqual(persistedStoryContextSelection("characters", entity), { kind: "characters", item: entity, suggested: false });
});

test("new AI results merge by name while preserving unsaved suggestions", () => {
  const merged = mergeContextSuggestions([{ name: "Sarah", description: "First" }], [
    { name: " sarah ", description: "Updated" }, { name: "Hotel", description: "Location" },
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].description, "Updated");
});

test("permanent pane groups derive only from persisted collections", () => {
  const character = { id: "character-1", name: "Sarah", description: "Novelist" };
  const place = { id: "place-1", name: "Hotel", description: "Crime scene" };
  assert.deepEqual(visibleStoryContextGroups({}, {}), []);
  assert.deepEqual(visibleStoryContextGroups({ [character.id]: character }, {}), ["characters"]);
  assert.deepEqual(visibleStoryContextGroups({}, { [place.id]: place }), ["places"]);
  assert.deepEqual(visibleStoryContextGroups({ [character.id]: character }, { [place.id]: place }), ["characters", "places"]);
  const temporarySuggestion = { name: "Detective", description: "Investigator" };
  assert.equal(temporarySuggestion.name, "Detective");
  assert.deepEqual(visibleStoryContextGroups({}, {}), []);
});

test("suggestion status distinguishes successful adds and existing duplicates", () => {
  const entity = { id: "one", name: "Sarah Mercer", description: "Novelist" };
  assert.equal(contextSuggestionStatus({}, "Sarah Mercer"), "available");
  assert.equal(contextSuggestionStatus({}, "Sarah Mercer", true), "added");
  assert.equal(contextSuggestionStatus({ one: entity }, " sarah mercer "), "duplicate");
});
