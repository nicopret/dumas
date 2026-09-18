import { test } from "node:test";
import assert from "node:assert/strict";
import type { TextGenerator } from "./gemini-client.ts";
import { buildRewritePrompt, getRewriteContext, parseGeminiRewriteResponse, rewriteSection } from "./rewrite-section.ts";
import { emptySummary, type DumasProject } from "../projects/project-types.ts";
import { defaultMainStoryOrder, emptyMainStorySections } from "../projects/main-story.ts";
import { emptyStoryFlows } from "../projects/story-flows.ts";

function project(): DumasProject {
  const summary = emptySummary();
  summary.setup = "Opening"; summary.disaster1 = "First"; summary.disaster2 = "Second";
  summary.disaster3 = "Third"; summary.resolution = "Ending";
  const sections = emptyMainStorySections(summary);
  sections.setup.details = "Setup context";
  sections.disaster1.details = "First context";
  sections.disaster2.details = "Second context";
  sections.disaster3.details = "Third context";
  sections.resolution.details = "Resolution context";
  return { schemaVersion: 4, id: "00000000-0000-4000-8000-000000000000", series: {
    title: "Series", idea: "Idea", premise: "Premise", summary, mainStory: { sections }, storyFlows: emptyStoryFlows(defaultMainStoryOrder()),
  }, characters: {}, places: {}, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
}

test("rewrite context follows visual order and uses only immediate populated neighbours", () => {
  const value = project();
  value.series.storyFlows.flows.main.placements = ["disaster3", "setup", "resolution", "disaster2", "disaster1"]
    .map((sectionId, index) => ({ sectionId, row: index + 1 }));
  assert.deepEqual(getRewriteContext(value, "resolution"), {
    title: "Ending",
    previous: { title: "Opening", details: "Setup context" },
    next: { title: "Second", details: "Second context" },
  });
  assert.equal(getRewriteContext(value, "disaster3").previous, undefined);
  assert.equal(getRewriteContext(value, "disaster1").next, undefined);
  value.series.mainStory.sections.setup.details = "  ";
  assert.equal(getRewriteContext(value, "resolution").previous, undefined);
});

test("prompt clearly delimits current draft, adjacent context, and rejected suggestion", () => {
  const prompt = buildRewritePrompt(getRewriteContext(project(), "disaster1"), "UNSAVED DRAFT", "REJECTED TEXT");
  assert.match(prompt, /CURRENT SECTION TITLE:[\s\S]*First/);
  assert.match(prompt, /PREVIOUS SECTION CONTEXT:[\s\S]*Setup context/);
  assert.match(prompt, /CURRENT SECTION DETAIL TO REWRITE:[\s\S]*UNSAVED DRAFT/);
  assert.match(prompt, /NEXT SECTION CONTEXT:[\s\S]*Second context/);
  assert.match(prompt, /PREVIOUS REWRITE REJECTED BY AUTHOR:[\s\S]*REJECTED TEXT/);
  assert.match(prompt, /materially different rewrite/);
});

test("paragraph constraints are omitted for zero and exact for one or five", () => {
  const context = getRewriteContext(project(), "disaster2");
  assert.doesNotMatch(buildRewritePrompt(context, "Draft", undefined, 0), /exactly \d+ paragraphs?/);
  const one = buildRewritePrompt(context, "Draft", undefined, 1);
  assert.match(one, /exactly 1 paragraph\./);
  assert.match(one, /only to the rewrite string, not to titleSuggestions or the JSON structure/);
  const five = buildRewritePrompt(context, "Draft", undefined, 5);
  assert.match(five, /exactly 5 paragraphs\./);
  assert.match(five, /more or fewer than 5 paragraphs/);
});

test("mocked Gemini receives the unsaved draft and cannot modify project persistence data", async () => {
  const value = project();
  const before = structuredClone(value);
  let received = "";
  const generator: TextGenerator = { async generate(_system, prompt) {
    received = prompt; return JSON.stringify({ rewrite: "Polished result", titleSuggestions: ["Better title"] });
  } };
  assert.deepEqual(await rewriteSection(generator, value, "disaster2", "Current unsaved draft", undefined, 5),
    { rewrite: "Polished result", titleSuggestions: ["Better title"] });
  assert.match(received, /Current unsaved draft/);
  assert.match(received, /exactly 5 paragraphs/);
  assert.deepEqual(value, before);
});

test("structured Gemini output supports zero, one, or two titles and clamps extras", () => {
  assert.deepEqual(parseGeminiRewriteResponse('{"rewrite":"Text","titleSuggestions":[]}').titleSuggestions, []);
  assert.deepEqual(parseGeminiRewriteResponse('{"rewrite":"Text","titleSuggestions":["One"]}').titleSuggestions, ["One"]);
  assert.deepEqual(parseGeminiRewriteResponse('{"rewrite":"Text","titleSuggestions":["One","Two"]}').titleSuggestions, ["One", "Two"]);
  assert.deepEqual(parseGeminiRewriteResponse('{"rewrite":"Text","titleSuggestions":["One","Two","Three"]}').titleSuggestions, ["One", "Two"]);
});

test("Gemini failure leaves the draft and project untouched", async () => {
  const value = project();
  const before = structuredClone(value);
  const draft = "Do not lose this draft";
  const generator: TextGenerator = { async generate() { throw new Error("network failure"); } };
  await assert.rejects(rewriteSection(generator, value, "setup", draft));
  assert.equal(draft, "Do not lose this draft");
  assert.deepEqual(value, before);
});
