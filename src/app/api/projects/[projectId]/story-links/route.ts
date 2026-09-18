import { InvalidMainStorySectionError, isProjectId, projectRepository } from "@/lib/projects/project-repository";
import type { StoryLinkTarget } from "@/lib/projects/project-types";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!isProjectId(projectId)) return Response.json({ error: "Invalid project ID." }, { status: 400 });
  let body: unknown; try { body = await request.json(); } catch { return Response.json({ error: "Send a valid story link." }, { status: 400 }); }
  const value = body as { sourceSectionId?: unknown; target?: Partial<StoryLinkTarget> };
  const target = value?.target;
  if (typeof value?.sourceSectionId !== "string" || !target ||
      !(target.type === "section" && typeof target.sectionId === "string") &&
      !(target.type === "flow" && typeof target.flowId === "string")) return Response.json({ error: "Invalid story link." }, { status: 400 });
  try {
    const project = await projectRepository.createStoryLink(projectId, value.sourceSectionId, target as StoryLinkTarget);
    return project ? Response.json(project) : Response.json({ error: "Series not found." }, { status: 404 });
  } catch (error) {
    if (error instanceof InvalidMainStorySectionError) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ error: "Unable to create the story link. Please try again." }, { status: 500 });
  }
}
