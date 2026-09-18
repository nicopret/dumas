import { test } from "node:test";
import assert from "node:assert/strict";
import { InvalidMainStoryOrderError } from "./project-repository.ts";
import { mainStoryOrderFromPayload } from "./main-story-payload.ts";

const valid = ["setup", "disaster1", "disaster2", "disaster3", "resolution"];

test("accepts unique generic Main Story section IDs in any order", () => {
  const order = ["setup", "disaster2", "disaster1", "resolution", "disaster3"];
  assert.deepEqual(mainStoryOrderFromPayload({ order }), order);
  assert.deepEqual(mainStoryOrderFromPayload({ order: [] }), []);
});

test("rejects duplicate and malformed Main Story orders", () => {
  const invalid: unknown[] = [
    null, {}, { order: null }, { order: "setup" },
    { order: [...valid, "setup"] },
    { order: ["setup", "disaster1", "disaster1", "disaster3", "resolution"] },
    { order: ["setup", "bad id"] },
  ];
  for (const payload of invalid) assert.throws(() => mainStoryOrderFromPayload(payload), InvalidMainStoryOrderError);
});
