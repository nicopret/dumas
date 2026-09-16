import { paginateListObjectsV2, PutObjectCommand } from "@aws-sdk/client-s3";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { getAwsConfig, isS3Configured } from "../src/lib/aws/aws-config.ts";
import { s3Client } from "../src/lib/aws/s3-client.ts";
import { isProjectId, parseProject, serializeProject } from "../src/lib/projects/project-repository.ts";

const config = getAwsConfig();
if (!isS3Configured(config)) throw new Error("Set AWS_REGION and DUMAS_S3_BUCKET before migrating projects.");
const prefix = config.prefix.trim().replace(/^\/+|\/+$/g, "");
const normalizedPrefix = prefix ? `${prefix}/` : "";
const source = path.join(process.cwd(), "data", "projects");

const existing = new Set<string>();
for await (const page of paginateListObjectsV2(
  { client: s3Client },
  { Bucket: config.bucket!, Prefix: normalizedPrefix },
)) {
  for (const object of page.Contents ?? []) if (object.Key) existing.add(object.Key);
}

let uploaded = 0;
let skipped = 0;
for (const entry of await readdir(source, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
  const id = entry.name.slice(0, -5);
  if (!isProjectId(id)) {
    console.warn(`Skipping ${entry.name}: filename is not a project UUID.`);
    skipped++;
    continue;
  }
  const project = parseProject(await readFile(path.join(source, entry.name), "utf8"), id);
  const key = `${normalizedPrefix}${id}.json`;
  if (existing.has(key)) {
    console.log(`Skipping ${entry.name}: s3://${config.bucket}/${key} already exists.`);
    skipped++;
    continue;
  }
  try {
    await s3Client.send(new PutObjectCommand({
      Bucket: config.bucket!, Key: key, Body: serializeProject(project), ContentType: "application/json", IfNoneMatch: "*",
    }));
    console.log(`Uploaded ${entry.name} to s3://${config.bucket}/${key}.`);
    uploaded++;
  } catch (error) {
    if (error && typeof error === "object" && "$metadata" in error &&
        (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 412) {
      console.log(`Skipping ${entry.name}: s3://${config.bucket}/${key} was created concurrently.`);
      skipped++;
      continue;
    }
    throw error;
  }
}
console.log(`Migration complete: ${uploaded} uploaded, ${skipped} skipped. Local files were not changed.`);
