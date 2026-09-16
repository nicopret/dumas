import { InvalidPremiseError, isProjectId, projectRepository } from "@/lib/projects/project-repository";
export const runtime = "nodejs";
export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!isProjectId(projectId)) return Response.json({ error: "Invalid project ID." }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Send valid JSON containing a premise string." }, { status: 400 });
  }
  try {
    const premise = body && typeof body === "object" && "premise" in body ? body.premise : undefined;
    const project = await projectRepository.updatePremise(projectId, premise);
    if (!project) return Response.json({ error: "Series not found." }, { status: 404 });
    return Response.json(project, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof InvalidPremiseError) return Response.json({ error: error.message }, { status: 400 });
    console.error(`Unable to save premise for project ${projectId}.`, error);
    return Response.json({ error: "Unable to save premise. Please try again." }, { status: 500 });
  }
}
