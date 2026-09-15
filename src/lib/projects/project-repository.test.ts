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
