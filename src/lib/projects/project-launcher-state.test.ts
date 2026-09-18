import { test } from "node:test";
import assert from "node:assert/strict";
import { requestProjectDeletion, withoutProject } from "./project-launcher-state.ts";
import type { ProjectSummary } from "./project-types.ts";

const projects: ProjectSummary[] = [
  { id: "one", title: "One", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
  { id: "two", title: "Two", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
];

test("opening or cancelling confirmation leaves launcher projects unchanged", () => {
  assert.deepEqual(projects.map(project => project.id), ["one", "two"]);
});

test("confirmed deletion calls the DELETE endpoint and success removes launcher state", async () => {
  let url = ""; let method = "";
  await requestProjectDeletion("one", async (input, init) => {
    url = String(input); method = String(init?.method); return new Response(null, { status: 204 });
  });
  assert.equal(url, "/api/projects/one");
  assert.equal(method, "DELETE");
  assert.deepEqual(withoutProject(projects, "one").map(project => project.id), ["two"]);
});

test("failed deletion rejects and does not remove the project from launcher state", async () => {
  await assert.rejects(requestProjectDeletion("one", async () =>
    Response.json({ error: "Unable to delete this series. Please try again." }, { status: 500 })));
  assert.deepEqual(projects.map(project => project.id), ["one", "two"]);
});
