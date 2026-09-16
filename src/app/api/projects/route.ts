import { InvalidTitleError, projectRepository } from "@/lib/projects/project-repository";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(await projectRepository.listProjects(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to list projects.", error);
    return Response.json({ error: "Your series could not be loaded. Please try again." }, { status: 500 });
  }
}
export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Send a valid JSON object with a series title." }, { status: 400 });
  }
  try {
    const title = body && typeof body === "object" && "title" in body ? body.title : undefined;
    const project = await projectRepository.createProject(title);
    return Response.json(project, { status: 201, headers: { Location: `/api/projects/${project.id}` } });
  } catch (error) {
    if (error instanceof InvalidTitleError) return Response.json({ error: error.message }, { status: 400 });
    console.error("Unable to create project.", error);
    return Response.json({ error: "The series could not be saved. Please try again." }, { status: 500 });
  }
}
