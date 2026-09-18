import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptedRewriteUpdate, acceptedTitleUpdate, acceptRewriteSuggestion, createAiRewritePreview, DEFAULT_PARAGRAPH_COUNT,
  emptyAiRewriteSession, isSectionIncomplete, markPreviewRewriteAccepted, markPreviewTitleAccepted, rewriteRequestPayload } from "./rewrite-editor-state.ts";

test("incomplete indicator derives only from trimmed section detail", () => {
  assert.equal(DEFAULT_PARAGRAPH_COUNT, 0);
  assert.equal(isSectionIncomplete(""), true);
  assert.equal(isSectionIncomplete("  \n "), true);
  assert.equal(isSectionIncomplete("Detail"), false);
});

test("accepting a rewrite updates visible details and creates a details-only autosave", () => {
  const persisted = "Saved draft";
  const editing = acceptRewriteSuggestion(persisted, "AI suggestion");
  assert.equal(editing, "AI suggestion");
  assert.equal(persisted, "Saved draft");
  assert.deepEqual(acceptedRewriteUpdate(editing), {
    localDetails: "AI suggestion", requestBody: { details: "AI suggestion" },
  });
  assert.equal("title" in acceptedRewriteUpdate(editing).requestBody, false);
});

test("accepting a title creates a title-only autosave", () => {
  assert.deepEqual(acceptedTitleUpdate("Suggested title"), {
    localTitle: "Suggested title", requestBody: { title: "Suggested title" },
  });
  assert.equal("details" in acceptedTitleUpdate("Suggested title").requestBody, false);
});

test("rewrite and title acceptance preserve the other preview options", () => {
  const preview = createAiRewritePreview("Rewrite", ["Title one", "Title two"]);
  const rewriteAccepted = markPreviewRewriteAccepted(preview);
  assert.equal(rewriteAccepted.rewriteAccepted, true);
  assert.deepEqual(rewriteAccepted.titleSuggestions, ["Title one", "Title two"]);
  const titleAccepted = markPreviewTitleAccepted(preview, "Title two");
  assert.equal(titleAccepted.acceptedTitle, "Title two");
  assert.equal(titleAccepted.rewrite, "Rewrite");
});

test("a new Try Another result replaces rewrite and title suggestions", () => {
  const first = createAiRewritePreview("First rewrite", ["First title"]);
  const next = createAiRewritePreview("Different rewrite", ["Different one", "Different two"]);
  assert.notDeepEqual(next, first);
  assert.deepEqual(next.titleSuggestions, ["Different one", "Different two"]);
});

test("Try another retains original draft and passes rejected suggestion", () => {
  assert.deepEqual(rewriteRequestPayload("Original rough draft", 3, "Rejected rewrite", "gemini-3.7-flash"), {
    draft: "Original rough draft", paragraphCount: 3, previousSuggestion: "Rejected rewrite", model: "gemini-3.7-flash",
  });
  assert.equal(rewriteRequestPayload("Original rough draft").paragraphCount, 0);
  assert.equal(acceptRewriteSuggestion("Original rough draft", null), "Original rough draft");
});

test("model selection is request-only and does not enter project updates", () => {
  const request = rewriteRequestPayload("Draft", 2, undefined, "gemini-3.7-flash");
  assert.equal(request.model, "gemini-3.7-flash");
  assert.deepEqual(acceptedRewriteUpdate("Rewrite").requestBody, { details: "Rewrite" });
  assert.deepEqual(acceptedTitleUpdate("Title").requestBody, { title: "Title" });
});

test("successful rewrite acceptance and cancellation clear every preview value", () => {
  const closedAfterSave = emptyAiRewriteSession();
  const closedAfterCancel = emptyAiRewriteSession();
  assert.deepEqual(closedAfterSave, { rewriteSuggestion: null, titleSuggestions: [], previousSuggestion: null });
  assert.deepEqual(closedAfterCancel, closedAfterSave);
});

test("cancelling preview state does not modify section content", () => {
  const details = "Current section content";
  emptyAiRewriteSession();
  assert.equal(details, "Current section content");
});

test("save failure, title acceptance, and Try Another retain or replace an open preview", () => {
  const current = createAiRewritePreview("Rewrite", ["Title"]);
  const failedSave = current;
  assert.equal(failedSave.rewrite, "Rewrite");
  assert.equal(markPreviewTitleAccepted(current, "Title").rewrite, "Rewrite");
  const another = createAiRewritePreview("Another rewrite", ["Another title"]);
  assert.equal(another.rewrite, "Another rewrite");
  assert.notDeepEqual(another, current);
});

test("a fresh rewrite session contains no stale suggestions", () => {
  assert.deepEqual(emptyAiRewriteSession(), { rewriteSuggestion: null, titleSuggestions: [], previousSuggestion: null });
});
