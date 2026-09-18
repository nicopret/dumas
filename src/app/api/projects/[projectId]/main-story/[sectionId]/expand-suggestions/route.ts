import { friendlyOpenAIError, requestExpansionSuggestions } from "@/lib/ai/expand-section";
import { allowedModel, createAiModelRegistry, modelLabel } from "@/lib/ai/model-registry";
import { isMainStorySectionId } from "@/lib/projects/main-story";
import { isProjectId, projectRepository } from "@/lib/projects/project-repository";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string; sectionId: string }> }) {
  const { projectId, sectionId } = await params;
  if (!isProjectId(projectId) || !isMainStorySectionId(sectionId)) {
    return Response.json({ error: "Invalid project or section ID." }, { status: 400 });
  }
  let body: unknown;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Send valid JSON containing the current title and detail." }, { status: 400 });
  }
  const title = body && typeof body === "object" && "title" in body ? body.title : undefined;
  const details = body && typeof body === "object" && "details" in body ? body.details : undefined;
  const requestedModel = body && typeof body === "object" && "model" in body ? body.model : undefined;
  const model = allowedModel(createAiModelRegistry(), "openai", requestedModel);
  if (!model) return Response.json({ error: "The requested OpenAI model is not configured." }, { status: 400 });
  if (typeof title !== "string" || !title.trim() || typeof details !== "string" || !details.trim()) {
    return Response.json({ error: "A section title and detail are required." }, { status: 400 });
  }
  try {
    const project = await projectRepository.getProject(projectId);
    if (!project) return Response.json({ error: "Series not found." }, { status: 404 });
    if (!project.series.mainStory.sections[sectionId]) return Response.json({ error: "Story section not found." }, { status: 404 });
    console.info(JSON.stringify({ event: "openai.expansion.started", projectId, sectionId, model }));
    const result = await requestExpansionSuggestions(title.trim(), details.trim(), model,
      { characters: project.characters, places: project.places });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const mapped = friendlyOpenAIError(error);
    console.error("openai.expansion.failed", { projectId, sectionId, model, status: mapped.status,
      errorName: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: `${modelLabel(model)}: ${mapped.message} Try again or select another model.`, code: mapped.status }, { status: mapped.status });
  }
}
