import { test } from "node:test";
import assert from "node:assert/strict";
import { mapGeminiError } from "./gemini-errors.ts";

test("maps common Gemini HTTP and timeout errors to safe messages", () => {
  const cases = [
    [401, "authentication", "Gemini rejected the API key."],
    [403, "forbidden", "Gemini access is not permitted for this project."],
    [404, "model_unavailable", "The configured Gemini model is unavailable."],
    [429, "rate_limit", "Gemini rate limit or quota exceeded. Please wait and try again."],
    [500, "service_unavailable", "Gemini is temporarily unavailable."],
    [503, "service_unavailable", "Gemini is temporarily unavailable."],
  ] as const;
  for (const [status, code, message] of cases) {
    assert.deepEqual(mapGeminiError(Object.assign(new Error("raw"), { status })).code, code);
    assert.equal(mapGeminiError(Object.assign(new Error("raw"), { status })).message, message);
  }
  const timeout = mapGeminiError(Object.assign(new Error("request timed out"), { name: "TimeoutError" }));
  assert.equal(timeout.code, "timeout"); assert.equal(timeout.status, 408);
  assert.equal(timeout.message, "Gemini did not respond in time.");
  assert.equal(mapGeminiError(new Error("odd failure")).message, "Unable to generate a rewrite. Please try again.");
});

test("diagnostics redact configured credentials", () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "super-secret-test-key";
  try {
    const mapped = mapGeminiError(new Error("request with super-secret-test-key failed"));
    assert.doesNotMatch(JSON.stringify(mapped), /super-secret-test-key/);
    assert.match(mapped.diagnostic.message, /\[REDACTED\]/);
  } finally {
    if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous;
  }
});
