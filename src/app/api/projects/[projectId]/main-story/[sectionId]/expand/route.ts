import { isMainStorySectionId } from "@/lib/projects/main-story";
import { InvalidMainStorySectionError, InvalidSectionTitleError, isProjectId, projectRepository } from "@/lib/projects/project-repository";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string; sectionId: string }> }) {
  const { projectId, sectionId } = await params;
  if (!isProjectId(projectId) || !isMainStorySectionId(sectionId)) {
    return Response.json({ error: "Invalid project or section ID." }, { status: 400 });
  }
  let body: unknown;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Send valid JSON containing selected headings." }, { status: 400 });
  }
  const headings = body && typeof body === "object" && "headings" in body && Array.isArray(body.headings)
    ? body.headings : [];
  try {
    const project = await projectRepository.expandMainStorySection(projectId, sectionId, headings);
    if (!project) return Response.json({ error: "Series not found." }, { status: 404 });
    return Response.json(project, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof InvalidMainStorySectionError || error instanceof InvalidSectionTitleError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error(`Unable to expand project ${projectId}, section ${sectionId}.`, error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Unable to replace the section. Your selections have been preserved." }, { status: 500 });
  }
}
