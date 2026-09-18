import "server-only";

import OpenAI from "openai";

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OpenAI is not configured.");
  client ??= new OpenAI({ apiKey, timeout: 60_000, maxRetries: 1 });
  return client;
}

export function getOpenAIModel(): string {
  return process.env.OPENAI_MODEL?.trim() || "gpt-5.6";
}
