import { isMainStorySectionId } from "@/lib/projects/main-story";
import {
  InvalidMainStorySectionError, InvalidSectionDetailsError, InvalidSectionTitleError, isProjectId, projectRepository,
} from "@/lib/projects/project-repository";
import { sectionFromPayload } from "@/lib/projects/section-details-payload";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string; sectionId: string }> }) {
  const { projectId, sectionId } = await params;
  if (!isProjectId(projectId)) return Response.json({ error: "Invalid project ID." }, { status: 400 });
  if (!isMainStorySectionId(sectionId)) return Response.json({ error: "Invalid Main Story section ID." }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Send valid JSON containing section details." }, { status: 400 });
  }
  try {
    const project = await projectRepository.updateMainStorySection(
      projectId, sectionId, sectionFromPayload(body),
    );
    if (!project) return Response.json({ error: "Series not found." }, { status: 404 });
    return Response.json(project, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof InvalidMainStorySectionError || error instanceof InvalidSectionDetailsError || error instanceof InvalidSectionTitleError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error(`Unable to save details for project ${projectId}, section ${sectionId}.`, error);
    return Response.json({ error: "Unable to save section details. Please try again." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ projectId: string; sectionId: string }> }) {
  const { projectId, sectionId } = await params;
  if (!isProjectId(projectId)) return Response.json({ error: "Invalid project ID." }, { status: 400 });
  if (!isMainStorySectionId(sectionId)) return Response.json({ error: "Invalid Main Story section ID." }, { status: 400 });
  try {
    const project = await projectRepository.deleteMainStorySection(projectId, sectionId);
    if (!project) return Response.json({ error: "Series not found." }, { status: 404 });
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof InvalidMainStorySectionError) {
      return Response.json({ error: "Story section not found." }, { status: 404 });
    }
    console.error(`Unable to delete project ${projectId} story section ${sectionId}.`,
      error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Unable to delete this story section. Please try again." }, { status: 500 });
  }
}
