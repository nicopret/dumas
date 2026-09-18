import { randomUUID } from "node:crypto";
import { createGeminiTextGenerator } from "@/lib/ai/gemini-client";
import { allowedModel, createAiModelRegistry } from "@/lib/ai/model-registry";
import { runRewriteStream } from "@/lib/ai/rewrite-stream";
import { isMainStorySectionId } from "@/lib/projects/main-story";
import { isProjectId, projectRepository } from "@/lib/projects/project-repository";
import { InvalidRewritePayloadError, rewritePayload } from "@/lib/projects/rewrite-payload";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string; sectionId: string }> }) {
  const { projectId, sectionId } = await params;
  if (!isProjectId(projectId)) return Response.json({ error: "Invalid project ID." }, { status: 400 });
  if (!isMainStorySectionId(sectionId)) return Response.json({ error: "Invalid Main Story section ID." }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Send valid JSON containing a non-empty draft." }, { status: 400 });
  }
  try {
    const input = rewritePayload(body);
    const requestedModel = body && typeof body === "object" && "model" in body ? body.model : undefined;
    const model = allowedModel(createAiModelRegistry(), "gemini", requestedModel);
    if (!model) return Response.json({ error: "The requested Gemini model is not configured." }, { status: 400 });
    const requestId = randomUUID();
    const encoder = new TextEncoder();
    const events = runRewriteStream({
      requestId, projectId, sectionId, model, generator: createGeminiTextGenerator(model),
      draft: input.draft, paragraphCount: input.paragraphCount, previousSuggestion: input.previousSuggestion,
      loadProject: () => projectRepository.getProject(projectId),
    });
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of events) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } finally { controller.close(); }
      },
    });
    return new Response(stream, { headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store",
      "X-Accel-Buffering": "no", "X-Request-Id": requestId,
    } });
  } catch (error) {
    if (error instanceof InvalidRewritePayloadError) return Response.json({ error: error.message }, { status: 400 });
    console.error(JSON.stringify({ event: "gemini.rewrite.failed", projectId, sectionId,
      errorName: error instanceof Error ? error.name : "UnknownError" }));
    return Response.json({ error: "Unable to generate a rewrite. Please try again." }, { status: 503 });
  }
}
