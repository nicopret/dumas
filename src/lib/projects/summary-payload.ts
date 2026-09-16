import { InvalidSummaryError } from "./project-repository.ts";
import type { FiveSentenceSummary } from "./project-types.ts";

const fields = ["setup", "disaster1", "disaster2", "disaster3", "resolution"] as const;

export function summaryFromPayload(body: unknown): FiveSentenceSummary {
  if (!body || typeof body !== "object" || !("summary" in body) ||
      !body.summary || typeof body.summary !== "object") throw new InvalidSummaryError();
  const summary = body.summary as Record<string, unknown>;
  if (!fields.every(field => Object.hasOwn(summary, field) && typeof summary[field] === "string")) {
    throw new InvalidSummaryError();
  }
  return {
    setup: summary.setup as string,
    disaster1: summary.disaster1 as string,
    disaster2: summary.disaster2 as string,
    disaster3: summary.disaster3 as string,
    resolution: summary.resolution as string,
  };
}
