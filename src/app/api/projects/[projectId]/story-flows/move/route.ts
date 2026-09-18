import { InvalidMainStoryOrderError, InvalidMainStorySectionError, InvalidTitleError, isProjectId, projectRepository } from "@/lib/projects/project-repository";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!isProjectId(projectId)) return Response.json({ error: "Invalid project ID." }, { status: 400 });
  let body: unknown; try { body = await request.json(); } catch { return Response.json({ error: "Send a valid section move." }, { status: 400 }); }
  const value = body as { sectionId?: unknown; targetFlowId?: unknown; row?: unknown; newFlowTitle?: unknown };
  if (!body || typeof body !== "object" || typeof value.sectionId !== "string" || typeof value.targetFlowId !== "string" ||
      !Number.isInteger(value.row) || (value.row as number) < 1) {
    return Response.json({ error: "Invalid section move." }, { status: 400 });
  }
  try {
    const project = await projectRepository.moveSectionToGridPosition(projectId, value.sectionId, value.targetFlowId,
      value.row as number, value.newFlowTitle);
    return project ? Response.json(project) : Response.json({ error: "Series not found." }, { status: 404 });
  } catch (error) {
    if (error instanceof InvalidMainStoryOrderError || error instanceof InvalidMainStorySectionError || error instanceof InvalidTitleError)
      return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ error: "Unable to move the story section. Please try again." }, { status: 500 });
  }
}
