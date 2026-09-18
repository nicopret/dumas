import { test } from "node:test";
import assert from "node:assert/strict";
import type { TextGenerator } from "./gemini-client.ts";
import { runRewriteStream, type RewriteStreamEvent } from "./rewrite-stream.ts";
import { defaultMainStoryOrder, emptyMainStorySections } from "../projects/main-story.ts";
import { emptySummary, type DumasProject } from "../projects/project-types.ts";
import { emptyStoryFlows } from "../projects/story-flows.ts";

function fixture(): DumasProject {
  const summary = emptySummary(); summary.setup = "Opening";
  return { schemaVersion: 4, id: "00000000-0000-4000-8000-000000000000", series: {
    title: "Series", idea: "Idea", premise: "Premise", summary,
    mainStory: { sections: emptyMainStorySections(summary) }, storyFlows: emptyStoryFlows(defaultMainStoryOrder()),
  }, characters: {}, places: {}, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
}

async function collect(generator: TextGenerator, logs: Array<Record<string, unknown>>): Promise<RewriteStreamEvent[]> {
  const events: RewriteStreamEvent[] = [];
  for await (const event of runRewriteStream({ requestId: "request-1", projectId: fixture().id,
    sectionId: "setup", draft: "unsaved private draft", paragraphCount: 3, model: "test-model", generator,
    loadProject: async () => fixture(), log: entry => logs.push(entry) })) events.push(event);
  return events;
}

test("streams accurate progress events followed by a successful rewrite", async () => {
  const logs: Array<Record<string, unknown>> = [];
  const events = await collect({ async generate() {
    return JSON.stringify({ rewrite: "Polished", titleSuggestions: ["Title one", "Title two"] });
  } }, logs);
  assert.deepEqual(events, [
    { type: "status", status: "loading_context" },
    { type: "status", status: "prompt_created" },
    { type: "status", status: "submitting" },
    { type: "status", status: "waiting" },
    { type: "status", status: "response_received" },
    { type: "result", rewrite: "Polished", titleSuggestions: ["Title one", "Title two"] },
  ]);
  assert.deepEqual(logs.map(log => log.event), ["gemini.rewrite.started", "gemini.context.loaded",
    "gemini.prompt.created", "gemini.request.started", "gemini.response.received", "gemini.rewrite.completed"]);
  assert.equal(logs.every(log => log.requestId === "request-1" && log.model === "test-model"), true);
  assert.equal(logs.every(log => log.paragraphCount === 3), true);
  assert.doesNotMatch(JSON.stringify(logs), /unsaved private draft/);
});

test("streams mapped failures, preserves draft externally, and never logs or returns API keys", async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "never-log-this-key";
  try {
    const logs: Array<Record<string, unknown>> = [];
    const draft = "draft remains here";
    const events = await collect({ async generate() {
      throw Object.assign(new Error("never-log-this-key quota involving unsaved private draft"), { statusCode: 429, name: "ApiError" });
    } }, logs);
    assert.equal(draft, "draft remains here");
    assert.deepEqual(events.at(-1), { type: "error", code: "rate_limit", status: 429,
      message: "Gemini rate limit or quota exceeded. Please wait and try again." });
    assert.equal(logs.at(-1)?.event, "gemini.rewrite.failed");
    assert.equal(logs.at(-1)?.httpStatus, 429);
    assert.doesNotMatch(JSON.stringify({ logs, events }), /never-log-this-key/);
    assert.doesNotMatch(JSON.stringify(logs), /unsaved private draft/);
  } finally {
    if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous;
  }
});

test("streams a timeout failure instead of remaining in waiting", async () => {
  const logs: Array<Record<string, unknown>> = [];
  const events = await collect({ async generate() { throw Object.assign(new Error("timed out"), { name: "TimeoutError" }); } }, logs);
  assert.deepEqual(events.at(-1), { type: "error", code: "timeout", status: 408, message: "Gemini did not respond in time." });
});
