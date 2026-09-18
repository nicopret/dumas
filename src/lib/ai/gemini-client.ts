import "server-only";

import { GoogleGenAI } from "@google/genai";

export interface TextGenerator {
  generate(systemInstruction: string, prompt: string): Promise<string>;
}

export class GeminiConfigurationError extends Error {
  constructor() { super("Gemini is not configured."); }
}

export class EmptyGeminiResponseError extends Error {
  constructor() { super("Gemini returned an empty response."); }
}

export function geminiGenerationRequest(model: string, systemInstruction: string, prompt: string) {
  return {
    model, contents: prompt,
    config: {
      systemInstruction, responseMimeType: "application/json" as const,
      responseJsonSchema: {
        type: "object" as const, properties: {
          rewrite: { type: "string" as const },
          titleSuggestions: { type: "array" as const, items: { type: "string" as const }, maxItems: 2 },
        },
        required: ["rewrite", "titleSuggestions"], additionalProperties: false,
      },
    },
  };
}

export function createGeminiTextGenerator(model = getGeminiModel()): TextGenerator {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  return {
    async generate(systemInstruction, prompt) {
      if (!apiKey) throw new GeminiConfigurationError();
      const client = new GoogleGenAI({ apiKey, httpOptions: { timeout: 60_000 } });
      const response = await client.models.generateContent(geminiGenerationRequest(model, systemInstruction, prompt));
      const text = response.text?.trim();
      if (!text) throw new EmptyGeminiResponseError();
      return text;
    },
  };
}

export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
}
