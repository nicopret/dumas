import { test } from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createProjectRepository, InvalidProjectFileError, InvalidTitleError } from "./project-repository.ts";

async function fixture(t: TestContext) {
  const root = await mkdtemp(path.join(tmpdir(), "dumas-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, "projects");
  return { root, directory, repository: createProjectRepository(directory) };
}
test("create, trim, persist readable JSON, and reload through a new repository", async (t) => {
  const { directory, repository } = await fixture(t);
  const p = await repository.createProject("  My series  ");
  assert.equal(p.schemaVersion, 1);
  assert.equal(p.series.title, "My series");
  assert.equal(p.createdAt, p.updatedAt);
  assert.equal(new Date(p.createdAt).toISOString(), p.createdAt);
  const raw = await readFile(path.join(directory, `${p.id}.json`), "utf8");
  assert.ok(raw.endsWith("\n"));
  assert.ok(raw.includes('\n  "schemaVersion"'));
  assert.deepEqual(JSON.parse(raw), p);
  assert.deepEqual(await createProjectRepository(directory).getProject(p.id), p);
  assert.deepEqual(await readdir(directory), [`${p.id}.json`]);
});
test("invalid titles create no files", async (t) => {
  const { root, repository } = await fixture(t);
  for (const title of [undefined, null, 42, {}, "", " \t\n "]) {
    await assert.rejects(repository.createProject(title), InvalidTitleError);
  }
  assert.deepEqual(await readdir(root), []);
});
test("empty listing; invalid and missing IDs are controlled", async (t) => {
  const { repository } = await fixture(t);
  assert.deepEqual(await repository.listProjects(), []);
  for (const id of ["../outside", "../../secret.json", "invalid", "", randomUUID()]) {
    assert.equal(await repository.getProject(id), null);
  }
});
test("listing sorts by updated date and returns only metadata", async (t) => {
  const { directory, repository } = await fixture(t);
  const old = await repository.createProject("Older");
  const newer = await repository.createProject("Newer");
  old.updatedAt = "2020-01-01T00:00:00.000Z";
  await writeFile(path.join(directory, `${old.id}.json`), JSON.stringify(old));
  const list = await repository.listProjects();
  assert.deepEqual(list.map(p => p.id), [newer.id, old.id]);
  assert.deepEqual(Object.keys(list[0]).sort(), ["createdAt", "id", "title", "updatedAt"]);
});
test("corrupt and unsupported projects are logged, preserved, and skipped", async (t) => {
  const { directory, repository } = await fixture(t);
  const healthy = await repository.createProject("Healthy");
  const corrupt = randomUUID();
  const unsupported = randomUUID();
  await writeFile(path.join(directory, `${corrupt}.json`), "{broken");
  await writeFile(path.join(directory, `${unsupported}.json`), JSON.stringify({ ...healthy, id: unsupported, schemaVersion: 2 }));
  const log = t.mock.method(console, "error", () => {});
  assert.equal((await repository.listProjects()).length, 1);
  assert.equal(log.mock.callCount(), 2);
  await assert.rejects(repository.getProject(corrupt), InvalidProjectFileError);
  assert.equal(await readFile(path.join(directory, `${corrupt}.json`), "utf8"), "{broken");
});
test("does not read project symlinks outside storage", async (t) => {
  const { root, directory, repository } = await fixture(t);
  await mkdir(directory);
  const id = randomUUID();
  const outside = path.join(root, "outside.json");
  await writeFile(outside, "{}");
  await symlink(outside, path.join(directory, `${id}.json`));
  assert.deepEqual(await repository.listProjects(), []);
  await assert.rejects(repository.getProject(id));
});
test("filesystem failures propagate without destroying existing data", async (t) => {
  const { root } = await fixture(t);
  const file = path.join(root, "not-a-directory");
  await writeFile(file, "keep");
  const repository = createProjectRepository(file);
  await assert.rejects(repository.listProjects());
  await assert.rejects(repository.createProject("Series"));
  assert.equal(await readFile(file, "utf8"), "keep");
});
test("concurrent creates with identical titles have independent UUID files", async (t) => {
  const { directory, repository } = await fixture(t);
  const projects = await Promise.all(Array.from({ length: 8 }, () => repository.createProject("Same title")));
  assert.equal(new Set(projects.map(p => p.id)).size, 8);
  assert.equal((await readdir(directory)).length, 8);
  assert.equal((await repository.listProjects()).length, 8);
});

test("premise updates preserve unrelated data and creation time, and update modification time", async (t) => {
  const { directory, repository } = await fixture(t);
  const p = await repository.createProject("Test Series");
  assert.equal(p.series.premise, "");
  const extended = { ...p, updatedAt: "2020-01-01T00:00:00.000Z", future: { books: [1, 2] }, series: { ...p.series, notes: "Keep me" } };
  await writeFile(path.join(directory, `${p.id}.json`), JSON.stringify(extended));
  const result = await repository.updatePremise(p.id, "  A traveller’s café hides 世界.  ");
  assert.ok(result);
  assert.equal(result.series.premise, "A traveller’s café hides 世界.");
  assert.equal(result.createdAt, p.createdAt);
  assert.notEqual(result.updatedAt, extended.updatedAt);
  const disk = JSON.parse(await readFile(path.join(directory, `${p.id}.json`), "utf8"));
  assert.deepEqual(disk.future, extended.future);
  assert.equal(disk.series.notes, "Keep me");
  assert.equal(disk.series.title, p.series.title);
  assert.deepEqual(await repository.getProject(p.id), result);
  assert.equal((await repository.updatePremise(p.id, "   "))?.series.premise, "");
});
test("legacy premise defaults in memory without rewriting until save", async (t) => {
  const { directory, repository } = await fixture(t);
  const p = await repository.createProject("Legacy");
  const legacy = { ...p, series: { title: p.series.title } };
  const raw = JSON.stringify(legacy);
  const file = path.join(directory, `${p.id}.json`);
  await writeFile(file, raw);
  assert.equal((await repository.getProject(p.id))?.series.premise, "");
  await repository.listProjects();
  assert.equal(await readFile(file, "utf8"), raw);
  await repository.updatePremise(p.id, "New premise");
  assert.equal(JSON.parse(await readFile(file, "utf8")).series.premise, "New premise");
});
test("premise update rejects invalid input and missing projects without creating files", async (t) => {
  const { directory, repository } = await fixture(t);
  const p = await repository.createProject("Valid");
  for (const value of [null, undefined, 1, {}]) await assert.rejects(repository.updatePremise(p.id, value));
  for (const id of ["../outside", "invalid", randomUUID()]) assert.equal(await repository.updatePremise(id, "Text"), null);
  assert.deepEqual(await readdir(directory), [`${p.id}.json`]);
  assert.deepEqual(await repository.getProject(p.id), p);
});
test("corrupt premise files are rejected and preserved", async (t) => {
  const { directory, repository } = await fixture(t);
  const p = await repository.createProject("Valid");
  const file = path.join(directory, `${p.id}.json`);
  for (const raw of ['{broken', JSON.stringify({ ...p, series: { ...p.series, premise: 42 } })]) {
    await writeFile(file, raw);
    await assert.rejects(repository.updatePremise(p.id, "New"), InvalidProjectFileError);
    assert.equal(await readFile(file, "utf8"), raw);
  }
});

test("legacy projects default summary in memory without rewriting on load", async (t) => {
  const { directory, repository } = await fixture(t);
  const project = await repository.createProject("Legacy summary");
  const legacy = { ...project, series: { title: project.series.title, premise: project.series.premise } };
  const raw = JSON.stringify(legacy);
  const file = path.join(directory, `${project.id}.json`);
  await writeFile(file, raw);
  assert.deepEqual((await repository.getProject(project.id))?.series.summary,
    { setup: "", disaster1: "", disaster2: "", disaster3: "", resolution: "" });
  assert.equal(await readFile(file, "utf8"), raw);
});

test("summary update trims all fields and preserves premise, timestamps, and unrelated data", async (t) => {
  const { directory, repository } = await fixture(t);
  const project = await repository.createProject("Summary");
  project.series.premise = "Keep this premise.";
  const extended = { ...project, updatedAt: "2020-01-01T00:00:00.000Z", future: { threads: [1] }, series: { ...project.series, notes: "keep" } };
  await writeFile(path.join(directory, `${project.id}.json`), JSON.stringify(extended));
  const updated = await repository.updateSummary(project.id, {
    setup: "  Setup.  ", disaster1: " First. ", disaster2: "Second.  ", disaster3: "  Third.", resolution: " End. ",
  });
  assert.deepEqual(updated?.series.summary,
    { setup: "Setup.", disaster1: "First.", disaster2: "Second.", disaster3: "Third.", resolution: "End." });
  assert.equal(updated?.createdAt, project.createdAt);
  assert.notEqual(updated?.updatedAt, extended.updatedAt);
  assert.equal(updated?.series.premise, "Keep this premise.");
  const stored = JSON.parse(await readFile(path.join(directory, `${project.id}.json`), "utf8"));
  assert.deepEqual(stored.future, extended.future);
  assert.equal(stored.series.notes, "keep");
  assert.equal(await repository.updateSummary(randomUUID(), { setup: "", disaster1: "", disaster2: "", disaster3: "", resolution: "" }), null);
});
