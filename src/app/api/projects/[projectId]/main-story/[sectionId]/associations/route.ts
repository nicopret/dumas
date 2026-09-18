import { isMainStorySectionId } from "@/lib/projects/main-story";
import { InvalidMainStorySectionError, InvalidSectionAssociationError, isProjectId, projectRepository } from "@/lib/projects/project-repository";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string; sectionId: string }> }) {
  const { projectId, sectionId } = await params;
  if (!isProjectId(projectId) || !isMainStorySectionId(sectionId)) {
    return Response.json({ error: "Invalid project or section ID." }, { status: 400 });
  }
  let body: unknown;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Send a valid Story Context association." }, { status: 400 });
  }
  const type = body && typeof body === "object" && "type" in body ? body.type : undefined;
  const entityId = body && typeof body === "object" && "entityId" in body ? body.entityId : undefined;
  if ((type !== "character" && type !== "place") || typeof entityId !== "string" || !isProjectId(entityId)) {
    return Response.json({ error: "Invalid Story Context association." }, { status: 400 });
  }
  try {
    const project = await projectRepository.associateEntityWithSection(projectId, sectionId, type, entityId);
    if (!project) return Response.json({ error: "Series not found." }, { status: 404 });
    return Response.json(project, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof InvalidMainStorySectionError || error instanceof InvalidSectionAssociationError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    console.error("section.association.failed", { projectId, sectionId, errorName: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "Unable to associate this Story Context item. Please try again." }, { status: 500 });
  }
}
