import { isProjectId, projectRepository } from "@/lib/projects/project-repository";
import { deleteProjectResponse } from "@/lib/projects/delete-project-response";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!isProjectId(projectId)) return Response.json({ error: "Invalid project ID." }, { status: 400 });
  try {
    const project = await projectRepository.getProject(projectId);
    if (!project) return Response.json({ error: "Series not found." }, { status: 404 });
    return Response.json(project, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(`Unable to load project ${projectId}.`, error);
    return Response.json({ error: "This series could not be loaded. Its file has not been changed." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return deleteProjectResponse(projectId, id => projectRepository.deleteProject(id));
}
