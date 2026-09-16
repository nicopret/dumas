import { InvalidSummaryError, isProjectId, projectRepository } from "@/lib/projects/project-repository";
import { summaryFromPayload } from "@/lib/projects/summary-payload";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!isProjectId(projectId)) return Response.json({ error: "Invalid project ID." }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Send valid JSON containing all five summary fields." }, { status: 400 });
  }
  try {
    const project = await projectRepository.updateSummary(projectId, summaryFromPayload(body));
    if (!project) return Response.json({ error: "Series not found." }, { status: 404 });
    return Response.json(project, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof InvalidSummaryError) return Response.json({ error: error.message }, { status: 400 });
    console.error(`Unable to save summary for project ${projectId}.`, error);
    return Response.json({ error: "Unable to save summary. Please try again." }, { status: 500 });
  }
}
