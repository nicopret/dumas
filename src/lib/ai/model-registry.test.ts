import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedModel, createAiModelRegistry } from "./model-registry.ts";

test("configured defaults are selected and lists trim whitespace and remove duplicates", () => {
  const registry = createAiModelRegistry({ GEMINI_MODEL: " gemini-b ", GEMINI_MODELS: " gemini-a, gemini-b,gemini-a ",
    OPENAI_MODEL: "gpt-b", OPENAI_MODELS: "gpt-a, gpt-b, gpt-a" }, () => {});
  assert.equal(registry.gemini.defaultModel, "gemini-b");
  assert.deepEqual(registry.gemini.models.map(model => model.id), ["gemini-a", "gemini-b"]);
  assert.deepEqual(registry.openai.models.map(model => model.id), ["gpt-a", "gpt-b"]);
});

test("missing lists retain defaults and excluded defaults are added with warnings", () => {
  const missing = createAiModelRegistry({ GEMINI_MODEL: "gemini-custom", OPENAI_MODEL: "gpt-custom" }, () => {});
  assert.ok(missing.gemini.models.some(model => model.id === "gemini-custom"));
  assert.ok(missing.openai.models.some(model => model.id === "gpt-custom"));
  const warnings: string[] = [];
  const excluded = createAiModelRegistry({ GEMINI_MODEL: "gemini-custom", GEMINI_MODELS: "gemini-other",
    OPENAI_MODEL: "gpt-custom", OPENAI_MODELS: "gpt-other" }, message => warnings.push(message));
  assert.equal(excluded.gemini.models[0].id, "gemini-custom");
  assert.equal(excluded.openai.models[0].id, "gpt-custom");
  assert.equal(warnings.length, 2);
});

test("only allow-listed overrides are accepted and omission uses the default", () => {
  const registry = createAiModelRegistry({ GEMINI_MODEL: "gemini-a", GEMINI_MODELS: "gemini-a,gemini-b",
    OPENAI_MODEL: "gpt-a", OPENAI_MODELS: "gpt-a,gpt-b" }, () => {});
  assert.equal(allowedModel(registry, "gemini"), "gemini-a");
  assert.equal(allowedModel(registry, "gemini", "gemini-b"), "gemini-b");
  assert.equal(allowedModel(registry, "gemini", "arbitrary-model"), null);
  assert.equal(allowedModel(registry, "openai", "gpt-b"), "gpt-b");
});

test("safe registry serialization contains no credentials", () => {
  const registry = createAiModelRegistry({ GEMINI_API_KEY: "gemini-secret", OPENAI_API_KEY: "openai-secret" }, () => {});
  const serialized = JSON.stringify(registry);
  assert.doesNotMatch(serialized, /gemini-secret|openai-secret|API_KEY/);
  assert.match(serialized, /Gemini 3\.8 Flash/);
  assert.match(serialized, /GPT-5\.6 Sol/);
});
