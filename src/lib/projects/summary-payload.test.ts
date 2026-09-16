import { test } from "node:test";
import assert from "node:assert/strict";
import { InvalidSummaryError } from "./project-repository.ts";
import { summaryFromPayload } from "./summary-payload.ts";

const valid = { setup: "", disaster1: "", disaster2: "", disaster3: "", resolution: "" };

test("accepts a summary containing all five string fields, including empty strings", () => {
  assert.deepEqual(summaryFromPayload({ summary: valid }), valid);
});

test("rejects invalid summary API payloads", () => {
  const invalid: unknown[] = [
    null, {}, { summary: null }, { summary: "text" },
    { summary: { ...valid, resolution: undefined } },
    { summary: { ...valid, setup: 1 } },
    { summary: { setup: "", disaster1: "", disaster2: "", disaster3: "" } },
  ];
  for (const payload of invalid) assert.throws(() => summaryFromPayload(payload), InvalidSummaryError);
});
