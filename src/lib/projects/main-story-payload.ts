import { isMainStoryOrder } from "./main-story.ts";
import { InvalidMainStoryOrderError } from "./project-repository.ts";
import type { MainStorySectionId } from "./project-types.ts";

export function mainStoryOrderFromPayload(body: unknown): MainStorySectionId[] {
  if (!body || typeof body !== "object" || !("order" in body) || !isMainStoryOrder(body.order)) {
    throw new InvalidMainStoryOrderError();
  }
  return [...body.order];
}
