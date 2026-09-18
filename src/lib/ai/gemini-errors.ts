export interface FriendlyGeminiError {
  code: string;
  status?: number;
  message: string;
  diagnostic: { name: string; status?: number; message: string };
}

function numericStatus(error: Record<string, unknown>): number | undefined {
  for (const value of [error.status, error.statusCode, error.code]) {
    if (typeof value === "number") return value;
    if (typeof value === "string" && /^\d{3}$/.test(value)) return Number(value);
  }
  return undefined;
}

function redactSecrets(message: string): string {
  const secrets = [process.env.GEMINI_API_KEY, process.env.AWS_ACCESS_KEY_ID,
    process.env.AWS_SECRET_ACCESS_KEY, process.env.AWS_SESSION_TOKEN].filter(Boolean) as string[];
  return secrets.reduce((safe, secret) => safe.split(secret).join("[REDACTED]"), message);
}

export function mapGeminiError(error: unknown): FriendlyGeminiError {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const name = typeof value.name === "string" ? value.name : "UnknownError";
  const rawMessage = typeof value.message === "string" ? value.message : String(error ?? "Unknown error");
  const diagnosticMessage = redactSecrets(rawMessage);
  let status = numericStatus(value);
  const timeout = status === 408 || /timeout|timed out/i.test(`${name} ${rawMessage}`);
  if (timeout) status ??= 408;
  const mapped = status === 401 ? { code: "authentication", message: "Gemini rejected the API key." } :
    status === 403 ? { code: "forbidden", message: "Gemini access is not permitted for this project." } :
    status === 404 ? { code: "model_unavailable", message: "The configured Gemini model is unavailable." } :
    status === 429 ? { code: "rate_limit", message: "Gemini rate limit or quota exceeded. Please wait and try again." } :
    timeout ? { code: "timeout", message: "Gemini did not respond in time." } :
    status !== undefined && status >= 500 && status <= 599
      ? { code: "service_unavailable", message: "Gemini is temporarily unavailable." }
      : { code: "unknown", message: "Unable to generate a rewrite. Please try again." };
  return { ...mapped, ...(status === undefined ? {} : { status }), diagnostic: { name, ...(status === undefined ? {} : { status }), message: diagnosticMessage } };
}
