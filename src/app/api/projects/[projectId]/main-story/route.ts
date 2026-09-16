import { InvalidMainStoryOrderError, isProjectId, projectRepository } from "@/lib/projects/project-repository";
import { mainStoryOrderFromPayload } from "@/lib/projects/main-story-payload";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!isProjectId(projectId)) return Response.json({ error: "Invalid project ID." }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Send valid JSON containing the Main Story order." }, { status: 400 });
  }
  try {
    const project = await projectRepository.updateMainStoryOrder(projectId, mainStoryOrderFromPayload(body));
    if (!project) return Response.json({ error: "Series not found." }, { status: 404 });
    return Response.json(project, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof InvalidMainStoryOrderError) return Response.json({ error: error.message }, { status: 400 });
    console.error(`Unable to save Main Story order for project ${projectId}.`, error);
    return Response.json({ error: "Unable to save Main Story order. Please try again." }, { status: 500 });
  }
}
