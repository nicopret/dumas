import { isMainStorySectionId } from "@/lib/projects/main-story";
import { InvalidSectionDetailsError, isProjectId, projectRepository } from "@/lib/projects/project-repository";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string; sectionId: string }> }) {
  const { projectId, sectionId } = await params;
  if (!isProjectId(projectId) || !isMainStorySectionId(sectionId)) return Response.json({ error: "Invalid project or section ID." }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Send valid JSON containing details." }, { status: 400 }); }
  try {
    const details = body && typeof body === "object" && "details" in body ? body.details : undefined;
    const project = await projectRepository.updateMainStorySectionDetails(projectId, sectionId, details);
    if (!project) return Response.json({ error: "Series not found." }, { status: 404 });
    return Response.json(project, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof InvalidSectionDetailsError) return Response.json({ error: error.message }, { status: 400 });
    console.error(`Unable to save AI details for project ${projectId}, section ${sectionId}.`, error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Rewrite generated successfully, but saving failed." }, { status: 500 });
  }
}
