import { test } from "node:test";
import assert from "node:assert/strict";
import { InvalidMainStoryOrderError } from "./project-repository.ts";
import { mainStoryOrderFromPayload } from "./main-story-payload.ts";

const valid = ["setup", "disaster1", "disaster2", "disaster3", "resolution"];

test("accepts every Main Story section exactly once in any order", () => {
  const order = ["setup", "disaster2", "disaster1", "resolution", "disaster3"];
  assert.deepEqual(mainStoryOrderFromPayload({ order }), order);
});

test("rejects duplicate, missing, unknown, and malformed Main Story orders", () => {
  const invalid: unknown[] = [
    null, {}, { order: null }, { order: "setup" },
    { order: valid.slice(0, 4) },
    { order: [...valid, "setup"] },
    { order: ["setup", "disaster1", "disaster1", "disaster3", "resolution"] },
    { order: ["setup", "disaster1", "disaster2", "unknown", "resolution"] },
  ];
  for (const payload of invalid) assert.throws(() => mainStoryOrderFromPayload(payload), InvalidMainStoryOrderError);
});
