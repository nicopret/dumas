import { isProjectId, projectRepository } from "@/lib/projects/project-repository";

export const runtime = "nodejs";
export async function DELETE(_request: Request, { params }: { params: Promise<{ projectId: string; linkId: string }> }) {
  const { projectId, linkId } = await params;
  if (!isProjectId(projectId) || !isProjectId(linkId)) return Response.json({ error: "Invalid story link ID." }, { status: 400 });
  try {
    const project = await projectRepository.deleteStoryLink(projectId, linkId);
    return project ? Response.json(project) : Response.json({ error: "Series not found." }, { status: 404 });
  } catch { return Response.json({ error: "Unable to remove the story link. Please try again." }, { status: 500 }); }
}
