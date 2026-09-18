import { test } from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createProjectRepository, InvalidProjectFileError, InvalidTitleError } from "./project-repository.ts";
import { defaultMainStoryOrder, emptyMainStorySections } from "./main-story.ts";
import type { DumasProject } from "./project-types.ts";
import { emptyStoryFlows } from "./story-flows.ts";

async function fixture(t: TestContext) {
  const root = await mkdtemp(path.join(tmpdir(), "dumas-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, "projects");
  return { root, directory, repository: createProjectRepository(directory) };
}
async function establishWorkflow(directory: string, project: DumasProject) {
  project.series.mainStory = { sections: emptyMainStorySections(project.series.summary) };
  project.series.storyFlows = emptyStoryFlows(defaultMainStoryOrder());
  await writeFile(path.join(directory, `${project.id}.json`), JSON.stringify(project));
}
const primaryOrder = (project: DumasProject) => project.series.storyFlows.flows[project.series.storyFlows.primaryFlowId].placements
  .sort((a, b) => a.row - b.row).map(placement => placement.sectionId);
test("create, trim, persist readable JSON, and reload through a new repository", async (t) => {
  const { directory, repository } = await fixture(t);
  const p = await repository.createProject("  My series  ");
  assert.equal(p.schemaVersion, 4);
  assert.equal(p.series.title, "My series");
  assert.equal(p.series.idea, "");
  assert.deepEqual(p.series.mainStory, { sections: {} });
  assert.deepEqual(primaryOrder(p), []);
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
test("deletes only an existing validated project file", async (t) => {
  const { directory, repository } = await fixture(t);
  const deleted = await repository.createProject("Delete me");
  const retained = await repository.createProject("Keep me");
  assert.equal(await repository.deleteProject(deleted.id), true);
  assert.equal(await repository.getProject(deleted.id), null);
  assert.ok(await repository.getProject(retained.id));
  assert.deepEqual(await readdir(directory), [`${retained.id}.json`]);
  assert.equal(await repository.deleteProject(deleted.id), false);
  assert.equal(await repository.deleteProject("../outside"), false);
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
  await writeFile(path.join(directory, `${unsupported}.json`), JSON.stringify({ ...healthy, id: unsupported, schemaVersion: 99 }));
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
test("story idea saves trimmed outer whitespace, preserves paragraphs, and leaves workflow unchanged", async (t) => {
  const { directory, repository } = await fixture(t);
  const project = await repository.createProject("Idea");
  await establishWorkflow(directory, project);
  const workflow = structuredClone(project.series.mainStory);
  project.updatedAt = "2020-01-01T00:00:00.000Z";
  await writeFile(path.join(directory, `${project.id}.json`), JSON.stringify(project));
  const updated = await repository.updateIdea(project.id, "  First paragraph.\n\nSecond paragraph.  ");
  assert.equal(updated?.series.idea, "First paragraph.\n\nSecond paragraph.");
  assert.notEqual(updated?.updatedAt, project.updatedAt);
  assert.deepEqual(updated?.series.mainStory, workflow);
  await assert.rejects(repository.updateIdea(project.id, " \n "));
});

test("legacy project without a story idea normalizes in memory without rewriting", async (t) => {
  const { directory, repository } = await fixture(t);
  const project = await repository.createProject("Legacy idea");
  const legacy = JSON.parse(JSON.stringify(project));
  delete legacy.series.idea;
  const raw = JSON.stringify(legacy);
  const file = path.join(directory, `${project.id}.json`);
  await writeFile(file, raw);
  assert.equal((await repository.getProject(project.id))?.series.idea, "");
  assert.equal(await readFile(file, "utf8"), raw);
});
test("legacy premise defaults in memory without rewriting until save", async (t) => {
  const { directory, repository } = await fixture(t);
  const p = await repository.createProject("Legacy");
  const legacy = { ...p, schemaVersion: 1, series: { title: p.series.title } };
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
  const legacy = { ...project, schemaVersion: 1, series: { title: project.series.title, premise: project.series.premise } };
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

test("legacy projects with no Main Story normalize to an empty workflow without rewriting", async (t) => {
  const { directory, repository } = await fixture(t);
  const project = await repository.createProject("Legacy workflow");
  const legacySeries = { title: project.series.title, premise: project.series.premise, summary: project.series.summary };
  const legacy = { ...project, schemaVersion: 1, series: legacySeries };
  const raw = JSON.stringify(legacy);
  const file = path.join(directory, `${project.id}.json`);
  await writeFile(file, raw);
  assert.deepEqual((await repository.getProject(project.id))?.series.mainStory, { sections: {} });
  assert.equal(await readFile(file, "utf8"), raw);
});

test("schema v2 with a missing Main Story normalizes to empty without inventing nodes", async (t) => {
  const { directory, repository } = await fixture(t);
  const project = await repository.createProject("Missing workflow");
  const stored = JSON.parse(JSON.stringify(project));
  stored.schemaVersion = 2;
  delete stored.series.mainStory;
  delete stored.series.storyFlows;
  const raw = JSON.stringify(stored);
  const file = path.join(directory, `${project.id}.json`);
  await writeFile(file, raw);
  assert.deepEqual((await repository.getProject(project.id))?.series.mainStory, { sections: {} });
  assert.equal(await readFile(file, "utf8"), raw);
});

test("Main Story order update preserves project content and timestamps correctly", async (t) => {
  const { directory, repository } = await fixture(t);
  const project = await repository.createProject("Workflow");
  await establishWorkflow(directory, project);
  project.series.premise = "Keep premise.";
  project.series.summary.setup = "Keep setup.";
  const extended = { ...project, updatedAt: "2020-01-01T00:00:00.000Z", future: { thread: true } };
  await writeFile(path.join(directory, `${project.id}.json`), JSON.stringify(extended));
  const order = ["setup", "disaster2", "disaster1", "disaster3", "resolution"] as const;
  const updated = await repository.updateMainStoryOrder(project.id, [...order]);
  assert.deepEqual(primaryOrder(updated!), order);
  assert.equal(updated?.createdAt, project.createdAt);
  assert.notEqual(updated?.updatedAt, extended.updatedAt);
  assert.equal(updated?.series.premise, "Keep premise.");
  assert.equal(updated?.series.summary.setup, "Keep setup.");
  assert.deepEqual((updated as unknown as { future: unknown }).future, extended.future);
  assert.equal(await repository.updateMainStoryOrder(randomUUID(), [...order]), null);
});

test("legacy Main Story data defaults every section detail without rewriting", async (t) => {
  const { directory, repository } = await fixture(t);
  const project = await repository.createProject("Legacy details");
  const legacyOrder = defaultMainStoryOrder();
  const legacy = { ...project, schemaVersion: 1, series: { ...project.series, storyFlows: undefined, mainStory: { order: legacyOrder } } };
  const raw = JSON.stringify(legacy);
  const file = path.join(directory, `${project.id}.json`);
  await writeFile(file, raw);
  const loaded = await repository.getProject(project.id);
  for (const id of ["setup", "disaster1", "disaster2", "disaster3", "resolution"]) {
    assert.deepEqual(loaded?.series.mainStory.sections[id], { id, title: "", details: "", characterIds: [], placeIds: [] });
  }
  assert.equal(await readFile(file, "utf8"), raw);
});

test("saves trimmed details for every section while preserving paragraphs and other data", async (t) => {
  const { directory, repository } = await fixture(t);
  const project = await repository.createProject("Details");
  await establishWorkflow(directory, project);
  project.updatedAt = "2020-01-01T00:00:00.000Z";
  project.series.premise = "Keep premise.";
  primaryOrder(project).splice(0, primaryOrder(project).length, "resolution", "setup", "disaster1", "disaster2", "disaster3");
  const extended = { ...project, future: { value: 1 } };
  await writeFile(path.join(directory, `${project.id}.json`), JSON.stringify(extended));
  const ids = ["setup", "disaster1", "disaster2", "disaster3", "resolution"] as const;
  for (const id of ids) await repository.updateMainStorySection(project.id, id, {
    title: `  Custom ${id}  `, details: `  ${id} first paragraph.\n\n${id} second paragraph.  `,
  });
  const updated = await repository.getProject(project.id);
  for (const id of ids) {
    assert.equal(updated?.series.summary[id], `Custom ${id}`);
    assert.equal(updated?.series.mainStory.sections[id].details, `${id} first paragraph.\n\n${id} second paragraph.`);
  }
  assert.equal(updated?.createdAt, project.createdAt);
  assert.notEqual(updated?.updatedAt, project.updatedAt);
  assert.equal(updated?.series.premise, "Keep premise.");
  assert.deepEqual(primaryOrder(updated!), primaryOrder(project));
  assert.deepEqual((updated as unknown as { future: unknown }).future, extended.future);
  assert.equal(await repository.updateMainStorySection(randomUUID(), "setup", { title: "Missing", details: "missing" }), null);
});

test("section updates accept empty details and reject blank titles, invalid IDs, and values", async (t) => {
  const { directory, repository } = await fixture(t);
  const project = await repository.createProject("Validation");
  await establishWorkflow(directory, project);
  const updated = await repository.updateMainStorySection(project.id, "setup", { title: "  Opening  ", details: "   " });
  assert.equal(updated?.series.summary.setup, "Opening");
  assert.deepEqual(updated?.series.mainStory.sections.setup,
    { id: "setup", title: "Opening", details: "", characterIds: [], placeIds: [] });
  assert.equal(updated?.series.summary.disaster1, "");
  await assert.rejects(repository.updateMainStorySection(project.id, "setup", { title: "   ", details: "text" }));
  await assert.rejects(repository.updateMainStorySection(project.id, "unknown", { title: "Title", details: "text" }));
  await assert.rejects(repository.updateMainStorySection(project.id, "setup", { title: "Title", details: 42 }));
});

test("AI partial updates save only the accepted field", async (t) => {
  const { directory, repository } = await fixture(t);
  const project = await repository.createProject("AI fields");
  await establishWorkflow(directory, project);
  await repository.updateMainStorySection(project.id, "setup", { title: "Stored title", details: "Stored details" });
  const detailsUpdate = await repository.updateMainStorySectionDetails(project.id, "setup", "  AI details  ");
  assert.equal(detailsUpdate?.series.mainStory.sections.setup.details, "AI details");
  assert.equal(detailsUpdate?.series.summary.setup, "Stored title");
  const titleUpdate = await repository.updateMainStorySectionTitle(project.id, "setup", "  AI title  ");
  assert.equal(titleUpdate?.series.summary.setup, "AI title");
  assert.equal(titleUpdate?.series.mainStory.sections.setup.details, "AI details");
  assert.deepEqual(primaryOrder(titleUpdate!), primaryOrder(project));
});

test("expansion replaces one active parent with ordered children while retaining its history", async (t) => {
  const { directory, repository } = await fixture(t);
  const project = await repository.createProject("Expansion");
  await establishWorkflow(directory, project);
  await repository.updateMainStorySection(project.id, "disaster1", { title: "Broad event", details: "Original details" });
  const before = await repository.getProject(project.id);
  const expanded = await repository.expandMainStorySection(project.id, "disaster1", [" First beat ", "Second beat", "Third beat"]);
  assert.ok(before && expanded);
  const position = primaryOrder(before).indexOf("disaster1");
  const childIds = expanded.series.mainStory.sections.disaster1.childIds!;
  assert.equal(childIds.length, 3);
  assert.equal(new Set(childIds).size, 3);
  assert.ok(childIds.every(id => /^[0-9a-f-]{36}$/i.test(id)));
  assert.deepEqual(primaryOrder(expanded).slice(position, position + 3), childIds);
  assert.deepEqual(primaryOrder(expanded).slice(0, position), primaryOrder(before).slice(0, position));
  assert.deepEqual(primaryOrder(expanded).slice(position + 3), primaryOrder(before).slice(position + 1));
  assert.deepEqual(childIds.map(id => expanded.series.mainStory.sections[id].title), ["First beat", "Second beat", "Third beat"]);
  for (const id of childIds) {
    assert.equal(expanded.series.mainStory.sections[id].details, "");
    assert.equal(expanded.series.mainStory.sections[id].parentId, "disaster1");
  }
  assert.equal(expanded.series.mainStory.sections.disaster1.title, "Broad event");
  assert.equal(expanded.series.mainStory.sections.disaster1.details, "Original details");
  assert.deepEqual(expanded.characters, {});
  assert.deepEqual(expanded.places, {});

  const recursivelyExpanded = await repository.expandMainStorySection(project.id, childIds[1], ["Nested one", "Nested two"]);
  assert.ok(recursivelyExpanded);
  const nestedIds = recursivelyExpanded.series.mainStory.sections[childIds[1]].childIds!;
  assert.equal(nestedIds.length, 2);
  assert.ok(nestedIds.every(id => recursivelyExpanded.series.mainStory.sections[id].parentId === childIds[1]));
});

test("legacy projects normalize missing context collections without rewriting on load", async (t) => {
  const { directory, repository } = await fixture(t);
  const project = await repository.createProject("Legacy context");
  const legacy: Record<string, unknown> = { ...project };
  delete legacy.characters;
  delete legacy.places;
  const raw = JSON.stringify(legacy);
  const file = path.join(directory, `${project.id}.json`);
  await writeFile(file, raw);
  const loaded = await repository.getProject(project.id);
  assert.deepEqual(loaded?.characters, {});
  assert.deepEqual(loaded?.places, {});
  assert.equal(await readFile(file, "utf8"), raw);
});

test("adds characters and places without changing workflow and detects trimmed case-insensitive duplicates", async (t) => {
  const { repository } = await fixture(t);
  const project = await repository.createProject("Context");
  const order = [...primaryOrder(project)];
  const sections = structuredClone(project.series.mainStory.sections);
  const character = await repository.addStoryContextEntity(project.id, "characters", " Sarah Mercer ", " Novelist. ");
  assert.ok(character && !character.duplicate);
  assert.match(character.entity.id, /^[0-9a-f-]{36}$/i);
  const duplicate = await repository.addStoryContextEntity(project.id, "characters", "sarah mercer", "Different text");
  assert.ok(duplicate?.duplicate);
  assert.equal(duplicate?.entity.id, character.entity.id);
  assert.equal(Object.keys(duplicate!.project.characters).length, 1);
  const place = await repository.addStoryContextEntity(project.id, "places", "Riverside Hotel", "Discovery location.");
  assert.ok(place && !place.duplicate);
  assert.deepEqual(primaryOrder(place.project), order);
  assert.deepEqual(place.project.series.mainStory.sections, sections);
  assert.equal(Object.keys(place.project.characters).length, 1);
  assert.equal(Object.keys(place.project.places).length, 1);
});
