import { test } from "node:test";
import assert from "node:assert/strict";
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { InvalidTitleError } from "./project-repository.ts";
import { S3ProjectRepository } from "./s3-project-repository.ts";

class FakeS3 {
  readonly objects = new Map<string, string>();
  readonly puts: PutObjectCommand[] = [];
  listPageSize = 1000;

  async send(command: GetObjectCommand | PutObjectCommand | ListObjectsV2Command): Promise<unknown> {
    if (command instanceof GetObjectCommand) {
      const value = this.objects.get(command.input.Key!);
      if (value === undefined) throw Object.assign(new Error("missing"), { name: "NoSuchKey", $metadata: { httpStatusCode: 404 } });
      return { Body: { transformToString: async () => value } };
    }
    if (command instanceof PutObjectCommand) {
      if (command.input.IfNoneMatch === "*" && this.objects.has(command.input.Key!)) {
        throw Object.assign(new Error("exists"), { name: "PreconditionFailed", $metadata: { httpStatusCode: 412 } });
      }
      this.puts.push(command);
      this.objects.set(command.input.Key!, String(command.input.Body));
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

test("creates a formatted JSON project directly in S3", async () => {
  const { fake, repository } = fixture();
  const project = await repository.createProject("  S3 Series  ");
  const command = fake.puts[0];
  assert.equal(project.series.title, "S3 Series");
  assert.equal(command.input.Key, `projects/${project.id}.json`);
  assert.equal(command.input.ContentType, "application/json");
  assert.match(String(command.input.Body), /\n  "schemaVersion"/);
  assert.ok(String(command.input.Body).endsWith("\n"));
  assert.equal([...fake.objects.keys()].some(key => key.includes(".tmp")), false);
  await assert.rejects(repository.createProject("  "), InvalidTitleError);
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
