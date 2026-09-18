import { test } from "node:test";
import assert from "node:assert/strict";
import { deleteProjectResponse } from "./delete-project-response.ts";

const id = "00000000-0000-4000-8000-000000000000";

test("successful project deletion returns 204", async () => {
  let received = "";
  const response = await deleteProjectResponse(id, async projectId => { received = projectId; return true; });
  assert.equal(received, id);
  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");
});

test("missing project returns 404 and malformed IDs are rejected before repository access", async () => {
  assert.equal((await deleteProjectResponse(id, async () => false)).status, 404);
  let called = false;
  const malformed = await deleteProjectResponse("../other-key", async () => { called = true; return true; });
  assert.equal(malformed.status, 400);
  assert.equal(called, false);
});

test("repository deletion errors return a safe retryable response", async () => {
  const response = await deleteProjectResponse(id, async () => { throw new Error("raw AWS secret"); }, () => {});
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Unable to delete this series. Please try again." });
});
