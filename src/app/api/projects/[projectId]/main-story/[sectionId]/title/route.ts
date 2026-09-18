import { isMainStorySectionId } from "@/lib/projects/main-story";
import { InvalidSectionTitleError, isProjectId, projectRepository } from "@/lib/projects/project-repository";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string; sectionId: string }> }) {
  const { projectId, sectionId } = await params;
  if (!isProjectId(projectId) || !isMainStorySectionId(sectionId)) return Response.json({ error: "Invalid project or section ID." }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Send valid JSON containing a title." }, { status: 400 }); }
  try {
    const title = body && typeof body === "object" && "title" in body ? body.title : undefined;
    const project = await projectRepository.updateMainStorySectionTitle(projectId, sectionId, title);
    if (!project) return Response.json({ error: "Series not found." }, { status: 404 });
    return Response.json(project, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof InvalidSectionTitleError) return Response.json({ error: error.message }, { status: 400 });
    console.error(`Unable to save AI title for project ${projectId}, section ${sectionId}.`, error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Title selected, but saving failed." }, { status: 500 });
  }
}
