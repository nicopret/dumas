import { test } from "node:test";
import assert from "node:assert/strict";
import { getAwsConfig, isS3Configured } from "./aws-config.ts";

const variableNames = ["AWS_REGION", "DUMAS_S3_BUCKET", "DUMAS_S3_PREFIX"] as const;

function withEnvironment(values: Partial<Record<(typeof variableNames)[number], string>>, callback: () => void) {
  const original = Object.fromEntries(variableNames.map((name) => [name, process.env[name]]));
  try {
    for (const name of variableNames) delete process.env[name];
    Object.assign(process.env, values);
    callback();
  } finally {
    for (const name of variableNames) {
      const value = original[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("AWS configuration is optional and has a safe default prefix", () => {
  withEnvironment({}, () => {
    assert.deepEqual(getAwsConfig(), {
      region: undefined,
      bucket: undefined,
      prefix: "projects/",
    });
    assert.equal(isS3Configured(), false);
  });
});

test("S3 is configured when trimmed region and bucket values exist", () => {
  withEnvironment(
    {
      AWS_REGION: " eu-west-2 ",
      DUMAS_S3_BUCKET: " dumas-projects ",
      DUMAS_S3_PREFIX: " series/ ",
    },
    () => {
      const config = getAwsConfig();
      assert.deepEqual(config, {
        region: "eu-west-2",
        bucket: "dumas-projects",
        prefix: "series/",
      });
      assert.equal(isS3Configured(config), true);
    },
  );
});
