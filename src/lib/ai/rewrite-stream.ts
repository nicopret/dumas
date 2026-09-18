import "server-only";

import { performance } from "node:perf_hooks";
import type { TextGenerator } from "./gemini-client.ts";
import { mapGeminiError } from "./gemini-errors.ts";
import { buildRewritePrompt, getRewriteContext, parseGeminiRewriteResponse, REWRITE_SYSTEM_INSTRUCTION } from "./rewrite-section.ts";
import type { DumasProject, MainStorySectionId } from "../projects/project-types.ts";

export type RewriteStreamEvent =
  | { type: "status"; status: "loading_context" | "prompt_created" | "submitting" | "waiting" | "response_received" }
  | { type: "result"; rewrite: string; titleSuggestions: string[] }
  | { type: "error"; code: string; status?: number; message: string };

type Log = (entry: Record<string, unknown>) => void;

export async function* runRewriteStream(input: {
  requestId: string;
  projectId: string;
  sectionId: MainStorySectionId;
  draft: string;
  paragraphCount: number;
  previousSuggestion?: string;
  model: string;
  generator: TextGenerator;
  loadProject: () => Promise<DumasProject | null>;
  log?: Log;
}): AsyncGenerator<RewriteStreamEvent> {
  const started = performance.now();
  const log = input.log ?? (entry => console.info(JSON.stringify(entry)));
  const metadata = { requestId: input.requestId, projectId: input.projectId, sectionId: input.sectionId,
    model: input.model, paragraphCount: input.paragraphCount };
  let prompt = "";
  log({ event: "gemini.rewrite.started", ...metadata });
  try {
    yield { type: "status", status: "loading_context" };
    const project = await input.loadProject();
    if (!project) {
      log({ event: "gemini.rewrite.failed", ...metadata, durationMs: Math.round(performance.now() - started),
        errorName: "ProjectNotFound", httpStatus: 404, errorMessage: "Project not found" });
      yield { type: "error", code: "project_not_found", status: 404, message: "Series not found." };
      return;
    }
    const context = getRewriteContext(project, input.sectionId);
    log({ event: "gemini.context.loaded", ...metadata, hasPrevious: Boolean(context.previous), hasNext: Boolean(context.next) });
    prompt = buildRewritePrompt(context, input.draft, input.previousSuggestion, input.paragraphCount);
    yield { type: "status", status: "prompt_created" };
    log({ event: "gemini.prompt.created", ...metadata, promptLength: prompt.length });
    yield { type: "status", status: "submitting" };
    log({ event: "gemini.request.started", ...metadata, promptLength: prompt.length });
    const generation = input.generator.generate(REWRITE_SYSTEM_INSTRUCTION, prompt);
    yield { type: "status", status: "waiting" };
    const rawResponse = await generation;
    const result = parseGeminiRewriteResponse(rawResponse);
    yield { type: "status", status: "response_received" };
    log({ event: "gemini.response.received", ...metadata, responseLength: rawResponse.length,
      durationMs: Math.round(performance.now() - started) });
    yield { type: "result", rewrite: result.rewrite, titleSuggestions: result.titleSuggestions };
    log({ event: "gemini.rewrite.completed", ...metadata, promptLength: prompt.length, responseLength: rawResponse.length,
      durationMs: Math.round(performance.now() - started) });
  } catch (error) {
    const friendly = mapGeminiError(error);
    const authorContent = [prompt, input.draft, input.previousSuggestion]
      .filter((value): value is string => Boolean(value));
    const safeDiagnostic = authorContent.reduce(
      (message, authorText) => message.split(authorText).join("[AUTHOR CONTENT REDACTED]"),
      friendly.diagnostic.message,
    ).slice(0, 1_000);
    log({ event: "gemini.rewrite.failed", ...metadata, durationMs: Math.round(performance.now() - started),
      promptLength: prompt.length || undefined, errorName: friendly.diagnostic.name, httpStatus: friendly.status,
      errorMessage: safeDiagnostic });
    yield { type: "error", code: friendly.code, ...(friendly.status === undefined ? {} : { status: friendly.status }), message: friendly.message };
  }
}
