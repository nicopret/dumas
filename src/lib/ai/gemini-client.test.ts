import { test } from "node:test";
import assert from "node:assert/strict";
import { geminiGenerationRequest } from "./gemini-client.ts";

test("Gemini override reaches the provider request", () => {
  const request = geminiGenerationRequest("gemini-3.7-flash", "system", "draft prompt");
  assert.equal(request.model, "gemini-3.7-flash");
  assert.equal(request.config.systemInstruction, "system");
  assert.equal(request.contents, "draft prompt");
});
