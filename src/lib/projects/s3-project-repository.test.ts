import { test } from "node:test";
import assert from "node:assert/strict";
import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { InvalidMainStorySectionError, InvalidSectionAssociationError, InvalidTitleError } from "./project-repository.ts";
import { S3ProjectRepository } from "./s3-project-repository.ts";
import { defaultMainStoryOrder, emptyMainStorySections } from "./main-story.ts";
import type { DumasProject } from "./project-types.ts";
import { emptyStoryFlows } from "./story-flows.ts";

class FakeS3 {
  readonly objects = new Map<string, string>();
  readonly puts: PutObjectCommand[] = [];
  readonly deletes: DeleteObjectCommand[] = [];
  listPageSize = 1000;
  failNextPut = false;
  failNextDelete = false;

  async send(command: DeleteObjectCommand | GetObjectCommand | PutObjectCommand | ListObjectsV2Command): Promise<unknown> {
    if (command instanceof GetObjectCommand) {
      const value = this.objects.get(command.input.Key!);
      if (value === undefined) throw Object.assign(new Error("missing"), { name: "NoSuchKey", $metadata: { httpStatusCode: 404 } });
      return { Body: { transformToString: async () => value } };
    }
    if (command instanceof PutObjectCommand) {
      if (this.failNextPut) { this.failNextPut = false; throw new Error("simulated S3 failure"); }
      if (command.input.IfNoneMatch === "*" && this.objects.has(command.input.Key!)) {
        throw Object.assign(new Error("exists"), { name: "PreconditionFailed", $metadata: { httpStatusCode: 412 } });
      }
      this.puts.push(command);
      this.objects.set(command.input.Key!, String(command.input.Body));
      return {};
    }
    if (command instanceof DeleteObjectCommand) {
      if (this.failNextDelete) { this.failNextDelete = false; throw new Error("simulated S3 delete failure"); }
      this.deletes.push(command);
      this.objects.delete(command.input.Key!);
      return {};
    }
    if (command instanceof ListObjectsV2Command) {
      const keys = [...this.objects.keys()].filter(key => key.startsWith(command.input.Prefix ?? "")).sort();
      const start = command.input.ContinuationToken ? Number(command.input.ContinuationToken) : 0;
      const page = keys.slice(start, start + this.listPageSize);
      const next = start + page.length;
      return {
        Contents: page.map(Key => ({ Key })),
        IsTruncated: next < keys.length,
        NextContinuationToken: next < keys.length ? String(next) : undefined,
      };
    }
    throw new Error("Unexpected command");
  }
}

function fixture(prefix = "projects/") {
  const fake = new FakeS3();
  const client = new S3Client({ region: "eu-west-2" });
  client.send = fake.send.bind(fake) as typeof client.send;
  return { fake, repository: new S3ProjectRepository(client, "test-bucket", prefix) };
}
function establishWorkflow(fake: FakeS3, repository: S3ProjectRepository, project: DumasProject) {
  project.series.mainStory = { sections: emptyMainStorySections(project.series.summary) };
  project.series.storyFlows = emptyStoryFlows(defaultMainStoryOrder());
  fake.objects.set(repository.keyFor(project.id), JSON.stringify(project));
}
const primaryOrder = (project: DumasProject) => project.series.storyFlows.flows[project.series.storyFlows.primaryFlowId].placements
  .sort((a, b) => a.row - b.row).map(placement => placement.sectionId);

test("creates a formatted JSON project directly in S3", async () => {
  const { fake, repository } = fixture();
  const project = await repository.createProject("  S3 Series  ");
  const command = fake.puts[0];
  assert.equal(project.series.title, "S3 Series");
  assert.equal(project.series.idea, "");
  assert.deepEqual(project.series.mainStory, { sections: {} });
  assert.equal(command.input.Key, `projects/${project.id}.json`);
  assert.equal(command.input.ContentType, "application/json");
  assert.match(String(command.input.Body), /\n  "schemaVersion"/);
  assert.ok(String(command.input.Body).endsWith("\n"));
  assert.equal([...fake.objects.keys()].some(key => key.includes(".tmp")), false);
  await assert.rejects(repository.createProject("  "), InvalidTitleError);
});

test("deletes only the requested S3 project object using the normalized project key", async () => {
  const { fake, repository } = fixture("projects");
  const deleted = await repository.createProject("Delete me");
  const retained = await repository.createProject("Keep me");
  assert.equal(await repository.deleteProject(deleted.id), true);
  assert.equal(fake.deletes.length, 1);
  assert.equal(fake.deletes[0].input.Bucket, "test-bucket");
  assert.equal(fake.deletes[0].input.Key, `projects/${deleted.id}.json`);
  assert.equal(fake.objects.has(repository.keyFor(deleted.id)), false);
  assert.equal(fake.objects.has(repository.keyFor(retained.id)), true);
  assert.equal(await repository.deleteProject(deleted.id), false);
  assert.equal(fake.deletes.length, 1);
  assert.equal(await repository.deleteProject("../other-key"), false);
});

test("failed S3 deletion leaves the project object available for retry", async () => {
  const { fake, repository } = fixture();
  const project = await repository.createProject("Retry deletion");
  fake.failNextDelete = true;
  await assert.rejects(repository.deleteProject(project.id));
  assert.ok(await repository.getProject(project.id));
  assert.equal(await repository.deleteProject(project.id), true);
});

test("S3 section associations validate entities, deduplicate, and use one coherent write", async () => {
  const { fake, repository } = fixture();
  const project = await repository.createProject("Associations");
  const sectionId = randomUUID(); const characterId = randomUUID(); const placeId = randomUUID();
  project.series.mainStory = { sections: { [sectionId]: {
    id: sectionId, title: "Discovery", details: "", characterIds: [], placeIds: [],
  } } };
  project.series.storyFlows = emptyStoryFlows([sectionId]);
  project.characters[characterId] = { id: characterId, name: "Sarah", description: "Novelist" };
  project.places[placeId] = { id: placeId, name: "Hotel", description: "Scene" };
  fake.objects.set(repository.keyFor(project.id), JSON.stringify(project));
  fake.puts.length = 0;
  const withCharacter = await repository.associateEntityWithSection(project.id, sectionId, "character", characterId);
  assert.deepEqual(withCharacter?.series.mainStory.sections[sectionId].characterIds, [characterId]);
  assert.equal(fake.puts.length, 1);
  await repository.associateEntityWithSection(project.id, sectionId, "character", characterId);
  assert.equal(fake.puts.length, 1, "duplicate association avoids an S3 write");
  const withPlace = await repository.associateEntityWithSection(project.id, sectionId, "place", placeId);
  assert.deepEqual(withPlace?.series.mainStory.sections[sectionId].placeIds, [placeId]);
  assert.equal(fake.puts.length, 2);
  await assert.rejects(repository.associateEntityWithSection(project.id, randomUUID(), "place", placeId), InvalidMainStorySectionError);
  await assert.rejects(repository.associateEntityWithSection(project.id, sectionId, "character", randomUUID()), InvalidSectionAssociationError);
  await assert.rejects(repository.associateEntityWithSection(project.id, sectionId, "place", randomUUID()), InvalidSectionAssociationError);
  fake.failNextPut = true;
  const newCharacter = randomUUID();
  const stored = await repository.getProject(project.id);
  stored!.characters[newCharacter] = { id: newCharacter, name: "Harris", description: "Detective" };
  fake.objects.set(repository.keyFor(project.id), JSON.stringify(stored));
  await assert.rejects(repository.associateEntityWithSection(project.id, sectionId, "character", newCharacter));
  assert.deepEqual((await repository.getProject(project.id))!.series.mainStory.sections[sectionId].characterIds, [characterId]);
});

test("S3 flow moves and links preserve stable section data and commit atomically", async () => {
  const { fake, repository } = fixture(); const project = await repository.createProject("Multiple flows");
  const a = randomUUID(); const b = randomUUID(); const characterId = randomUUID(); const placeId = randomUUID();
  project.series.mainStory.sections = {
    [a]: { id: a, title: "A", details: "Keep A", characterIds: [characterId], placeIds: [placeId], childIds: [b] },
    [b]: { id: b, title: "B", details: "Keep B", characterIds: [], placeIds: [], parentId: a },
  };
  project.series.storyFlows = emptyStoryFlows([a, b]);
  project.characters[characterId] = { id: characterId, name: "Sarah", description: "Writer" };
  project.places[placeId] = { id: placeId, name: "Hotel", description: "Scene" };
  fake.objects.set(repository.keyFor(project.id), JSON.stringify(project)); fake.puts.length = 0;
  const created = await repository.createStoryFlow(project.id, "Investigation");
  const flowId = Object.keys(created!.series.storyFlows.flows).find(id => id !== "main")!;
  const moved = await repository.moveSectionToGridPosition(project.id, a, flowId, 1);
  assert.deepEqual(primaryOrder(moved!), [b]); assert.deepEqual(moved!.series.storyFlows.flows[flowId].placements, [{ sectionId: a, row: 1 }]);
  assert.deepEqual(moved!.series.mainStory.sections[a], project.series.mainStory.sections[a]);
  const linked = await repository.createStoryLink(project.id, a, { type: "section", sectionId: b });
  const linkId = Object.keys(linked!.series.storyFlows.links)[0]; const putsAfterLink = fake.puts.length;
  await repository.createStoryLink(project.id, a, { type: "section", sectionId: b });
  assert.equal(fake.puts.length, putsAfterLink, "exact duplicate link avoids a write");
  const flowLinked = await repository.createStoryLink(project.id, a, { type: "flow", flowId: "main" });
  assert.equal(Object.keys(flowLinked!.series.storyFlows.links).length, 2);
  const movedAgain = await repository.moveSectionToGridPosition(project.id, a, "main", 2);
  assert.ok(movedAgain!.series.storyFlows.links[linkId]);
  const removed = await repository.deleteStoryLink(project.id, linkId);
  assert.equal(removed!.series.storyFlows.links[linkId], undefined);
  assert.ok(removed!.series.mainStory.sections[a]); assert.ok(removed!.characters[characterId]); assert.ok(removed!.places[placeId]);
  const putsBeforeFailure = fake.puts.length; const beforeFailure = fake.objects.get(repository.keyFor(project.id)); fake.failNextPut = true;
  await assert.rejects(repository.moveSectionToGridPosition(project.id, b, flowId, 1));
  assert.equal(fake.objects.get(repository.keyFor(project.id)), beforeFailure); assert.equal(fake.puts.length, putsBeforeFailure);
});

test("moving a section into a new flow is one atomic S3 update and may empty its source", async () => {
  const { fake, repository } = fixture(); const project = await repository.createProject("Detach"); const sectionId = randomUUID();
  project.series.mainStory.sections[sectionId] = { id: sectionId, title: "Only", details: "Details", characterIds: [], placeIds: [] };
  project.series.storyFlows = emptyStoryFlows([sectionId]); fake.objects.set(repository.keyFor(project.id), JSON.stringify(project)); fake.puts.length = 0;
  const moved = await repository.moveSectionToGridPosition(project.id, sectionId, "", 1, "New thread");
  assert.deepEqual(primaryOrder(moved!), []); assert.equal(fake.puts.length, 1);
  const target = Object.values(moved!.series.storyFlows.flows).find(flow => flow.id !== "main")!;
  assert.deepEqual(target.placements, [{ sectionId, row: 1 }]); assert.equal(moved!.series.mainStory.sections[sectionId].id, sectionId);
});

test("S3 story-section deletion recursively cleans lineage and preserves unrelated project data", async () => {
  const { fake, repository } = fixture();
  const project = await repository.createProject("Section deletion");
  project.updatedAt = "2020-01-01T00:00:00.000Z";
  project.characters = { character: { id: "character", name: "Sarah", description: "Novelist" } };
  project.places = { place: { id: "place", name: "Hotel", description: "Crime scene" } };
  project.series.mainStory = { sections: {
    before: { id: "before", title: "Before", details: "Before details", characterIds: [], placeIds: [] },
    parent: { id: "parent", title: "Parent", details: "Parent details", childIds: ["child", "sibling"], characterIds: [], placeIds: [] },
    child: { id: "child", title: "Child", details: "Child details", parentId: "parent", childIds: ["grandchild"], characterIds: [], placeIds: [] },
    grandchild: { id: "grandchild", title: "Grandchild", details: "Grandchild details", parentId: "child", characterIds: [], placeIds: [] },
    sibling: { id: "sibling", title: "Sibling", details: "Sibling details", parentId: "parent", characterIds: [], placeIds: [] },
    after: { id: "after", title: "After", details: "After details", characterIds: [], placeIds: [] },
  } };
  project.series.storyFlows = emptyStoryFlows(["before", "child", "grandchild", "after"]);
  const createdAt = project.createdAt;
  fake.objects.set(repository.keyFor(project.id), JSON.stringify(project));
  const updated = await repository.deleteMainStorySection(project.id, "child");
  assert.ok(updated);
  assert.deepEqual(primaryOrder(updated), ["before", "after"]);
  assert.equal(updated.series.mainStory.sections.child, undefined);
  assert.equal(updated.series.mainStory.sections.grandchild, undefined);
  assert.deepEqual(updated.series.mainStory.sections.parent.childIds, ["sibling"]);
  assert.equal(updated.series.mainStory.sections.before.details, "Before details");
  assert.equal(updated.series.mainStory.sections.after.details, "After details");
  assert.deepEqual(updated.characters, project.characters);
  assert.deepEqual(updated.places, project.places);
  assert.equal(updated.createdAt, createdAt);
  assert.notEqual(updated.updatedAt, "2020-01-01T00:00:00.000Z");
});

test("failed S3 story-section deletion leaves the stored workflow unchanged", async () => {
  const { fake, repository } = fixture();
  const project = await repository.createProject("Failed section deletion");
  project.series.mainStory = { sections: {
    section: { id: "section", title: "Keep", details: "Keep details", characterIds: [], placeIds: [] },
  } };
  project.series.storyFlows = emptyStoryFlows(["section"]);
  const key = repository.keyFor(project.id);
  fake.objects.set(key, JSON.stringify(project));
  const before = fake.objects.get(key);
  fake.failNextPut = true;
  await assert.rejects(repository.deleteMainStorySection(project.id, "section"));
  assert.equal(fake.objects.get(key), before);
});

test("gets projects, defaults legacy premise in memory, and maps missing objects to null", async () => {
  const { fake, repository } = fixture("projects");
  const id = randomUUID();
  const legacy = { schemaVersion: 1, id, series: { title: "Legacy" }, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
  const raw = JSON.stringify(legacy);
  fake.objects.set(`projects/${id}.json`, raw);
  assert.equal((await repository.getProject(id))?.series.premise, "");
  assert.equal(fake.objects.get(`projects/${id}.json`), raw);
  assert.equal(await repository.getProject(randomUUID()), null);
  assert.equal(await repository.getProject("invalid"), null);
});

test("updates only premise and updatedAt while preserving unknown fields", async () => {
  const { fake, repository } = fixture();
  const project = await repository.createProject("Preserve");
  const extended = { ...project, updatedAt: "2020-01-01T00:00:00.000Z", future: { books: [1] }, series: { ...project.series, notes: "keep" } };
  fake.objects.set(repository.keyFor(project.id), JSON.stringify(extended));
  const updated = await repository.updatePremise(project.id, "  New premise  ");
  assert.equal(updated?.series.premise, "New premise");
  assert.notEqual(updated?.updatedAt, extended.updatedAt);
  const stored = JSON.parse(fake.objects.get(repository.keyFor(project.id))!);
  assert.deepEqual(stored.future, extended.future);
  assert.equal(stored.series.notes, "keep");
  assert.equal(stored.createdAt, project.createdAt);
  assert.equal(await repository.updatePremise(randomUUID(), "x"), null);
});

test("saves story idea to S3 with paragraphs intact and does not alter workflow", async () => {
  const { fake, repository } = fixture();
  const project = await repository.createProject("Story idea");
  establishWorkflow(fake, repository, project);
  const workflow = structuredClone(project.series.mainStory);
  project.updatedAt = "2020-01-01T00:00:00.000Z";
  fake.objects.set(repository.keyFor(project.id), JSON.stringify(project));
  const updated = await repository.updateIdea(project.id, "  Opening thought.\n\nMore detail.  ");
  assert.equal(updated?.series.idea, "Opening thought.\n\nMore detail.");
  assert.notEqual(updated?.updatedAt, project.updatedAt);
  assert.deepEqual(updated?.series.mainStory, workflow);
  const stored = JSON.parse(fake.objects.get(repository.keyFor(project.id))!);
  assert.equal(stored.series.idea, "Opening thought.\n\nMore detail.");
});

test("lists every page, ignores unrelated keys, skips corrupt projects, and sorts newest first", async (t) => {
  const { fake, repository } = fixture("projects");
  fake.listPageSize = 2;
  const old = await repository.createProject("Old");
  const newer = await repository.createProject("New");
  old.updatedAt = "2020-01-01T00:00:00.000Z";
  fake.objects.set(repository.keyFor(old.id), JSON.stringify(old));
  const corruptId = randomUUID();
  fake.objects.set(repository.keyFor(corruptId), "{broken");
  fake.objects.set("projects/_connection-test.txt", "ok");
  fake.objects.set(`elsewhere/${randomUUID()}.json`, "{}");
  const log = t.mock.method(console, "error", () => {});
  const projects = await repository.listProjects();
  assert.deepEqual(projects.map(project => project.id), [newer.id, old.id]);
  assert.equal(log.mock.callCount(), 1);
});

test("normalizes prefixes with or without a trailing slash", async () => {
  for (const prefix of ["projects", "projects/"]) {
    const { repository } = fixture(prefix);
    const project = await repository.createProject(prefix);
    assert.equal(repository.keyFor(project.id), `projects/${project.id}.json`);
    assert.equal((await repository.listProjects()).length, 1);
  }
});

test("loads a legacy S3 project with an empty summary without rewriting it", async () => {
  const { fake, repository } = fixture();
  const id = randomUUID();
  const legacy = { schemaVersion: 1, id, series: { title: "Legacy", premise: "Existing." }, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
  const raw = JSON.stringify(legacy);
  fake.objects.set(repository.keyFor(id), raw);
  assert.deepEqual((await repository.getProject(id))?.series.summary,
    { setup: "", disaster1: "", disaster2: "", disaster3: "", resolution: "" });
  assert.equal(fake.objects.get(repository.keyFor(id)), raw);
});

test("saves a complete trimmed summary in the same object and preserves all other fields", async () => {
  const { fake, repository } = fixture();
  const project = await repository.createProject("Summary");
  const extended = { ...project, updatedAt: "2020-01-01T00:00:00.000Z", future: { value: 42 }, series: { ...project.series, premise: "Keep.", notes: "keep" } };
  fake.objects.set(repository.keyFor(project.id), JSON.stringify(extended));
  const updated = await repository.updateSummary(project.id, {
    setup: " Setup. ", disaster1: " One. ", disaster2: "  ", disaster3: " Three. ", resolution: " End. ",
  });
  assert.deepEqual(updated?.series.summary,
    { setup: "Setup.", disaster1: "One.", disaster2: "", disaster3: "Three.", resolution: "End." });
  assert.equal(updated?.series.premise, "Keep.");
  assert.equal(updated?.createdAt, project.createdAt);
  assert.notEqual(updated?.updatedAt, extended.updatedAt);
  const stored = JSON.parse(fake.objects.get(repository.keyFor(project.id))!);
  assert.deepEqual(stored.future, extended.future);
  assert.equal(stored.series.notes, "keep");
  assert.equal(fake.objects.size, 1);
  assert.equal(await repository.updateSummary(randomUUID(), { setup: "", disaster1: "", disaster2: "", disaster3: "", resolution: "" }), null);
});

test("normalizes a missing Main Story to empty without rewriting the S3 object", async () => {
  const { fake, repository } = fixture();
  const project = await repository.createProject("Legacy workflow");
  const legacySeries = { title: project.series.title, premise: project.series.premise, summary: project.series.summary };
  const raw = JSON.stringify({ ...project, schemaVersion: 1, series: legacySeries });
  fake.objects.set(repository.keyFor(project.id), raw);
  assert.deepEqual((await repository.getProject(project.id))?.series.mainStory, { sections: {} });
  assert.equal(fake.objects.get(repository.keyFor(project.id)), raw);
});

test("normalizes a schema-v2 missing Main Story to empty without an S3 write", async () => {
  const { fake, repository } = fixture();
  const project = await repository.createProject("Missing workflow");
  const stored = JSON.parse(JSON.stringify(project));
  stored.schemaVersion = 2;
  delete stored.series.mainStory;
  delete stored.series.storyFlows;
  const raw = JSON.stringify(stored);
  fake.objects.set(repository.keyFor(project.id), raw);
  const puts = fake.puts.length;
  assert.deepEqual((await repository.getProject(project.id))?.series.mainStory, { sections: {} });
  assert.equal(fake.objects.get(repository.keyFor(project.id)), raw);
  assert.equal(fake.puts.length, puts);
});

test("saves Main Story order in the existing S3 object and preserves all other data", async () => {
  const { fake, repository } = fixture();
  const project = await repository.createProject("Workflow");
  establishWorkflow(fake, repository, project);
  const extended = { ...project, updatedAt: "2020-01-01T00:00:00.000Z", future: { thread: true }, series: {
    ...project.series, premise: "Keep premise.", summary: { ...project.series.summary, setup: "Keep setup." },
  } };
  fake.objects.set(repository.keyFor(project.id), JSON.stringify(extended));
  const order = ["setup", "disaster2", "disaster1", "disaster3", "resolution"] as const;
  const updated = await repository.updateMainStoryOrder(project.id, [...order]);
  assert.deepEqual(primaryOrder(updated!), order);
  assert.equal(updated?.createdAt, project.createdAt);
  assert.notEqual(updated?.updatedAt, extended.updatedAt);
  assert.equal(updated?.series.premise, "Keep premise.");
  assert.equal(updated?.series.summary.setup, "Keep setup.");
  const stored = JSON.parse(fake.objects.get(repository.keyFor(project.id))!);
  assert.deepEqual(stored.future, extended.future);
  assert.equal(fake.objects.size, 1);
  assert.equal(await repository.updateMainStoryOrder(randomUUID(), [...order]), null);
});

test("loads legacy Main Story sections as empty details without rewriting S3", async () => {
  const { fake, repository } = fixture();
  const project = await repository.createProject("Legacy details");
  establishWorkflow(fake, repository, project);
  const legacySections = Object.fromEntries(Object.entries(project.series.mainStory.sections).map(([id, section]) =>
    [id, { ...section, title: `Old ${id} title` }]));
  const legacy = { ...project, schemaVersion: 2, series: { ...project.series, storyFlows: undefined, mainStory: {
    order: primaryOrder(project), sections: legacySections,
  } } };
  const raw = JSON.stringify(legacy);
  fake.objects.set(repository.keyFor(project.id), raw);
  assert.equal((await repository.getProject(project.id))?.series.mainStory.sections.disaster2.details, "");
  assert.equal(fake.objects.get(repository.keyFor(project.id)), raw);
});

test("S3 detail update targets one section and preserves order, other details, summary, and unrelated data", async () => {
  const { fake, repository } = fixture();
  const project = await repository.createProject("Details");
  establishWorkflow(fake, repository, project);
  project.updatedAt = "2020-01-01T00:00:00.000Z";
  project.series.premise = "Keep premise.";
  project.series.summary.disaster2 = "Keep summary.";
  project.series.summary.disaster1 = "Other summary stays.";
  primaryOrder(project).splice(0, primaryOrder(project).length, "setup", "disaster2", "disaster1", "disaster3", "resolution");
  project.series.mainStory.sections.setup.details = "Keep other details.";
  const extended = { ...project, future: { value: 1 } };
  fake.objects.set(repository.keyFor(project.id), JSON.stringify(extended));
  const updated = await repository.updateMainStorySection(project.id, "disaster2", {
    title: "  The Rival Awakens  ", details: "  First paragraph.\n\nSecond paragraph.  ",
  });
  assert.equal(updated?.series.summary.disaster2, "The Rival Awakens");
  assert.equal(updated?.series.mainStory.sections.disaster2.details, "First paragraph.\n\nSecond paragraph.");
  assert.equal(updated?.series.mainStory.sections.setup.details, "Keep other details.");
  assert.deepEqual(primaryOrder(updated!), primaryOrder(project));
  assert.equal(updated?.series.premise, "Keep premise.");
  assert.equal(updated?.series.summary.disaster1, "Other summary stays.");
  assert.equal(updated?.createdAt, project.createdAt);
  assert.notEqual(updated?.updatedAt, project.updatedAt);
  const stored = JSON.parse(fake.objects.get(repository.keyFor(project.id))!);
  assert.deepEqual(stored.future, extended.future);
  assert.equal(fake.objects.size, 1);
  assert.equal(await repository.updateMainStorySection(randomUUID(), "setup", { title: "Missing", details: "missing" }), null);
  await assert.rejects(repository.updateMainStorySection(project.id, "unknown", { title: "Title", details: "text" }));
  await assert.rejects(repository.updateMainStorySection(project.id, "setup", { title: "  ", details: "text" }));
});

test("S3 AI acceptance operations isolate title and details fields", async () => {
  const { fake, repository } = fixture();
  const project = await repository.createProject("AI fields");
  establishWorkflow(fake, repository, project);
  project.series.summary.setup = "Stored title";
  project.series.summary.disaster1 = "Other title";
  project.series.mainStory.sections.setup.details = "Stored details";
  project.series.mainStory.sections.disaster1.details = "Other details";
  fake.objects.set(repository.keyFor(project.id), JSON.stringify(project));
  const detailsResult = await repository.updateMainStorySectionDetails(project.id, "setup", "AI details");
  assert.equal(detailsResult?.series.mainStory.sections.setup.details, "AI details");
  assert.equal(detailsResult?.series.summary.setup, "Stored title");
  const titleResult = await repository.updateMainStorySectionTitle(project.id, "setup", "AI title");
  assert.equal(titleResult?.series.summary.setup, "AI title");
  assert.equal(titleResult?.series.mainStory.sections.setup.details, "AI details");
  assert.equal(titleResult?.series.summary.disaster1, "Other title");
  assert.equal(titleResult?.series.mainStory.sections.disaster1.details, "Other details");
  assert.deepEqual(primaryOrder(titleResult!), primaryOrder(project));
  assert.equal(fake.objects.size, 1);
});

test("S3 expansion performs one final write and preserves the parent and unrelated data", async () => {
  const { fake, repository } = fixture();
  const project = await repository.createProject("Expansion");
  establishWorkflow(fake, repository, project);
  project.series.mainStory.sections.setup.title = "Parent";
  project.series.mainStory.sections.setup.details = "Keep original detail";
  const characterId = randomUUID(); const placeId = randomUUID(); const parentOnlyCharacterId = randomUUID();
  project.characters = {
    [characterId]: { id: characterId, name: "Sarah", description: "Novelist" },
    [parentOnlyCharacterId]: { id: parentOnlyCharacterId, name: "Witness", description: "Parent only" },
  };
  project.places = { [placeId]: { id: placeId, name: "Hotel", description: "Crime scene" } };
  project.series.mainStory.sections.setup.characterIds = [parentOnlyCharacterId];
  const extended = { ...project, future: { keep: true } };
  fake.objects.set(repository.keyFor(project.id), JSON.stringify(extended));
  const putsBefore = fake.puts.length;
  const expanded = await repository.expandMainStorySection(project.id, "setup", [
    { title: "One", characterIds: [characterId, characterId, "character-1"], placeIds: [placeId, placeId, "place-1"] },
    { title: "Two", characterIds: [], placeIds: [] },
  ]);
  assert.ok(expanded);
  assert.equal(fake.puts.length, putsBefore + 1);
  assert.equal(expanded.series.mainStory.sections.setup.details, "Keep original detail");
  assert.equal(expanded.series.mainStory.sections.setup.title, "Parent");
  assert.deepEqual((expanded as unknown as { future: unknown }).future, extended.future);
  const childIds = expanded.series.mainStory.sections.setup.childIds!;
  assert.deepEqual(primaryOrder(expanded).slice(0, 2), childIds);
  assert.deepEqual(childIds.map(id => expanded.series.mainStory.sections[id].title), ["One", "Two"]);
  assert.deepEqual(expanded.series.mainStory.sections[childIds[0]].characterIds, [characterId]);
  assert.deepEqual(expanded.series.mainStory.sections[childIds[0]].placeIds, [placeId]);
  assert.deepEqual(expanded.series.mainStory.sections[childIds[1]].characterIds, []);
  assert.deepEqual(expanded.series.mainStory.sections[childIds[1]].placeIds, []);
  assert.equal(expanded.series.mainStory.sections[childIds[0]].characterIds.includes(parentOnlyCharacterId), false);
  assert.doesNotMatch(JSON.stringify(expanded.series.mainStory.sections[childIds[0]]), /character-1|place-1/);
});

test("an S3 expansion failure leaves the stored workflow unchanged for retry", async () => {
  const { fake, repository } = fixture();
  const project = await repository.createProject("Failed expansion");
  establishWorkflow(fake, repository, project);
  const key = repository.keyFor(project.id);
  const before = fake.objects.get(key);
  fake.failNextPut = true;
  await assert.rejects(repository.expandMainStorySection(project.id, "setup", ["One", "Two"]));
  assert.equal(fake.objects.get(key), before);
  assert.deepEqual(primaryOrder((await repository.getProject(project.id))!), primaryOrder(project));
});

test("S3 context persistence preserves workflow and failed saves leave storage unchanged", async () => {
  const { fake, repository } = fixture();
  const project = await repository.createProject("Context");
  const order = [...primaryOrder(project)];
  const character = await repository.addStoryContextEntity(project.id, "characters", "Sarah", "The novelist.");
  assert.ok(character && !character.duplicate);
  assert.deepEqual(primaryOrder(character.project), order);
  const beforeFailure = fake.objects.get(repository.keyFor(project.id));
  fake.failNextPut = true;
  await assert.rejects(repository.addStoryContextEntity(project.id, "places", "Hotel", "The crime scene."));
  assert.equal(fake.objects.get(repository.keyFor(project.id)), beforeFailure);
  const place = await repository.addStoryContextEntity(project.id, "places", "Hotel", "The crime scene.");
  assert.ok(place && !place.duplicate);
  assert.equal(Object.keys(place.project.characters).length, 1);
  assert.equal(Object.keys(place.project.places).length, 1);
});
