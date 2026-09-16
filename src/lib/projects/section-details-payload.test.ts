import { test } from "node:test";
import assert from "node:assert/strict";
import { InvalidSectionDetailsError, InvalidSectionTitleError } from "./project-repository.ts";
import { sectionFromPayload } from "./section-details-payload.ts";

test("accepts title and string section details including empty text", () => {
  assert.deepEqual(sectionFromPayload({ title: "Custom", details: "Paragraph one.\n\nParagraph two." }),
    { title: "Custom", details: "Paragraph one.\n\nParagraph two." });
  assert.deepEqual(sectionFromPayload({ title: "Custom", details: "" }), { title: "Custom", details: "" });
});

test("rejects malformed details and missing or blank section titles", () => {
  for (const body of [{ title: "Custom" }, { title: "Custom", details: null }, { title: "Custom", details: 42 }]) {
    assert.throws(() => sectionFromPayload(body), InvalidSectionDetailsError);
  }
  for (const body of [null, {}, { details: "" }, { title: null, details: "" }, { title: "  ", details: "" }]) {
    assert.throws(() => sectionFromPayload(body), InvalidSectionTitleError);
  }
});
