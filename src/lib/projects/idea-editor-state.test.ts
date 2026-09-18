import { test } from "node:test";
import assert from "node:assert/strict";
import { countWords, needsIdeaOnboarding } from "./idea-editor-state.ts";
import { emptySummary, type DumasProject } from "./project-types.ts";
import { emptyStoryFlows } from "./story-flows.ts";

function project(idea = "", order: string[] = []): DumasProject {
  return { schemaVersion: 4, id: "00000000-0000-4000-8000-000000000000", series: {
    title: "Series", idea, premise: "", summary: emptySummary(), mainStory: { sections: order.length ? {
      setup: { id: "setup", title: "Opening", details: "Details", characterIds: [], placeIds: [] },
    } : {} }, storyFlows: emptyStoryFlows(order),
  }, characters: {}, places: {}, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
}

test("a new empty project opens idea onboarding", () => assert.equal(needsIdeaOnboarding(project()), true));
test("an existing workflow bypasses onboarding even when its idea is missing", () =>
  assert.equal(needsIdeaOnboarding(project("", ["setup"])), false));
test("a saved idea with an empty workflow has completed onboarding", () =>
  assert.equal(needsIdeaOnboarding(project("A rough story idea.")), false));
test("word count handles blank text and paragraph breaks", () => {
  assert.equal(countWords(" \n\n "), 0);
  assert.equal(countWords("One paragraph.\n\nA second paragraph."), 5);
});
