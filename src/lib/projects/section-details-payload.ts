import { InvalidSectionDetailsError, InvalidSectionTitleError } from "./project-repository.ts";

export function sectionFromPayload(body: unknown): { title: string; details: string } {
  if (!body || typeof body !== "object") throw new InvalidSectionTitleError();
  if (!("title" in body) || typeof body.title !== "string" || !body.title.trim()) {
    throw new InvalidSectionTitleError();
  }
  if (!("details" in body) || typeof body.details !== "string") {
    throw new InvalidSectionDetailsError();
  }
  return { title: body.title, details: body.details };
}
