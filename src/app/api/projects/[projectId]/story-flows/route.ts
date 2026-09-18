import { InvalidTitleError, isProjectId, projectRepository } from "@/lib/projects/project-repository";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!isProjectId(projectId)) return Response.json({ error: "Invalid project ID." }, { status: 400 });
  let body: unknown; try { body = await request.json(); } catch { return Response.json({ error: "Send a flow title." }, { status: 400 }); }
  const title = body && typeof body === "object" && "title" in body ? body.title : undefined;
  try {
    const project = await projectRepository.createStoryFlow(projectId, title);
    return project ? Response.json(project) : Response.json({ error: "Series not found." }, { status: 404 });
  } catch (error) {
    if (error instanceof InvalidTitleError) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ error: "Unable to create the story flow. Please try again." }, { status: 500 });
  }
}
