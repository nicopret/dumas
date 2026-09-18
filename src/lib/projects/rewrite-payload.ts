export class InvalidRewritePayloadError extends Error {
  constructor() { super("Draft must be non-empty, paragraphCount must be an integer from 0 to 5, and previousSuggestion must be a string when supplied."); }
}

export function rewritePayload(body: unknown): { draft: string; paragraphCount: number; previousSuggestion?: string } {
  if (!body || typeof body !== "object" || !("draft" in body) ||
      typeof body.draft !== "string" || !body.draft.trim()) throw new InvalidRewritePayloadError();
  if ("previousSuggestion" in body && body.previousSuggestion !== undefined &&
      typeof body.previousSuggestion !== "string") throw new InvalidRewritePayloadError();
  const paragraphCount = "paragraphCount" in body ? body.paragraphCount : 0;
  if (!Number.isInteger(paragraphCount) || typeof paragraphCount !== "number" || paragraphCount < 0 || paragraphCount > 5) {
    throw new InvalidRewritePayloadError();
  }
  return { draft: body.draft, paragraphCount, ...("previousSuggestion" in body && body.previousSuggestion
    ? { previousSuggestion: body.previousSuggestion as string } : {}) };
}
