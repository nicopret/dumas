import { isProjectId } from "./project-repository.ts";

export async function deleteProjectResponse(projectId: string, remove: (id: string) => Promise<boolean>,
  log: (message: string, error: unknown) => void = (message, error) => console.error(message, error)): Promise<Response> {
  if (!isProjectId(projectId)) return Response.json({ error: "Invalid project ID." }, { status: 400 });
  try {
    if (!await remove(projectId)) return Response.json({ error: "Series not found." }, { status: 404 });
    return new Response(null, { status: 204 });
  } catch (error) {
    log(`Unable to delete project ${projectId}.`, error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Unable to delete this series. Please try again." }, { status: 500 });
  }
}
