import { test } from "node:test";
import assert from "node:assert/strict";
import { InvalidRewritePayloadError, rewritePayload } from "./rewrite-payload.ts";

test("rewrite payload accepts an unsaved draft and optional rejected suggestion", () => {
  assert.deepEqual(rewritePayload({ draft: "Rough", paragraphCount: 3, previousSuggestion: "Rejected" }),
    { draft: "Rough", paragraphCount: 3, previousSuggestion: "Rejected" });
  assert.equal(rewritePayload({ draft: "Rough" }).paragraphCount, 0);
  for (let paragraphCount = 0; paragraphCount <= 5; paragraphCount += 1) {
    assert.equal(rewritePayload({ draft: "Rough", paragraphCount }).paragraphCount, paragraphCount);
  }
});

test("rewrite payload rejects empty drafts and invalid rejected suggestions", () => {
  for (const body of [null, {}, { draft: "" }, { draft: "  " }, { draft: 1 }, { draft: "ok", previousSuggestion: 2 },
    { draft: "ok", paragraphCount: -1 }, { draft: "ok", paragraphCount: 6 },
    { draft: "ok", paragraphCount: 1.5 }, { draft: "ok", paragraphCount: "3" }]) {
    assert.throws(() => rewritePayload(body), InvalidRewritePayloadError);
  }
});
