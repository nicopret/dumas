export type AiProvider = "gemini" | "openai";

export interface AiModelOption { id: string; label: string }
export interface AiProviderModels { defaultModel: string; models: AiModelOption[] }
export type AiModelRegistry = Record<AiProvider, AiProviderModels>;

const defaults = { gemini: "gemini-3.8-flash", openai: "gpt-5.6" } as const;
const configuredFallbacks = {
  gemini: ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"],
  openai: ["gpt-5.6", "gpt-5.6-terra", "gpt-5.6-luna"],
} as const;
const labels: Record<string, string> = {
  "gemini-3.8-flash": "Gemini 3.8 Flash", "gemini-3.7-flash": "Gemini 3.7 Flash",
  "gemini-3.6-flash": "Gemini 3.6 Flash", "gemini-3.5-flash": "Gemini 3.5 Flash",
  "gemini-3.5-flash-lite": "Gemini 3.5 Flash-Lite", "gpt-5.6": "GPT-5.6 Sol",
  "gpt-5.6-terra": "GPT-5.6 Terra", "gpt-5.6-luna": "GPT-5.6 Luna",
};

export function modelLabel(id: string): string {
  return labels[id] ?? id;
}

type ModelEnvironment = Readonly<Record<string, string | undefined>>;

function providerModels(provider: AiProvider, env: ModelEnvironment, warn: (message: string) => void): AiProviderModels {
  const defaultModel = env[provider === "gemini" ? "GEMINI_MODEL" : "OPENAI_MODEL"]?.trim() || defaults[provider];
  const configured = env[provider === "gemini" ? "GEMINI_MODELS" : "OPENAI_MODELS"];
  const ids = [...new Set((configured === undefined ? configuredFallbacks[provider] : configured.split(","))
    .map(id => id.trim()).filter(Boolean))];
  if (!ids.includes(defaultModel)) {
    warn(`${provider.toUpperCase()}_MODEL (${defaultModel}) is not in the configured allow-list; adding it automatically.`);
    ids.unshift(defaultModel);
  }
  return { defaultModel, models: ids.map(id => ({ id, label: modelLabel(id) })) };
}

export function createAiModelRegistry(env: ModelEnvironment = process.env,
  warn: (message: string) => void = message => console.warn(`[Dumas configuration] ${message}`)): AiModelRegistry {
  return { gemini: providerModels("gemini", env, warn), openai: providerModels("openai", env, warn) };
}

export function allowedModel(registry: AiModelRegistry, provider: AiProvider, requested?: unknown): string | null {
  const model = requested === undefined ? registry[provider].defaultModel : requested;
  return typeof model === "string" && registry[provider].models.some(option => option.id === model) ? model : null;
}
