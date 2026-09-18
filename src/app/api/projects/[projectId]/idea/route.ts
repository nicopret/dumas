import { InvalidIdeaError, isProjectId, projectRepository } from "@/lib/projects/project-repository";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!isProjectId(projectId)) return Response.json({ error: "Invalid project ID." }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Send valid JSON containing a story idea." }, { status: 400 });
  }
  try {
    const idea = body && typeof body === "object" && "idea" in body ? body.idea : undefined;
    const project = await projectRepository.updateIdea(projectId, idea);
    if (!project) return Response.json({ error: "Series not found." }, { status: 404 });
    return Response.json(project, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof InvalidIdeaError) return Response.json({ error: error.message }, { status: 400 });
    console.error(`Unable to save story idea for project ${projectId}.`, error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Unable to save your story idea. Please try again." }, { status: 500 });
  }
}
