import { InvalidStoryContextEntityError, isProjectId, projectRepository } from "@/lib/projects/project-repository";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string; kind: string }> }) {
  const { projectId, kind } = await params;
  if (!isProjectId(projectId) || (kind !== "characters" && kind !== "places")) {
    return Response.json({ error: "Invalid project or story-context type." }, { status: 400 });
  }
  let body: unknown;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Send valid JSON containing a name and description." }, { status: 400 });
  }
  const name = body && typeof body === "object" && "name" in body ? body.name : undefined;
  const description = body && typeof body === "object" && "description" in body ? body.description : undefined;
  try {
    const result = await projectRepository.addStoryContextEntity(projectId, kind, name, description);
    if (!result) return Response.json({ error: "Series not found." }, { status: 404 });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof InvalidStoryContextEntityError) return Response.json({ error: error.message }, { status: 400 });
    console.error(`Unable to save ${kind} for project ${projectId}.`, error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Unable to save this Story Context item. Your suggestion has been preserved." }, { status: 500 });
  }
}
