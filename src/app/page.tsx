import { ProjectLauncher } from "@/components/project-launcher";
import { projectRepository } from "@/lib/projects/project-repository";
import type { ProjectSummary } from "@/lib/projects/project-types";
import { createAiModelRegistry } from "@/lib/ai/model-registry";
import { AiModelsPanel } from "@/components/ai-models-panel";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function Home() {
  let projects: ProjectSummary[] = [];
  let error: string | undefined;
  try { projects = await projectRepository.listProjects(); } catch (cause) {
    console.error("Unable to load the launcher.", cause);
    error = "Your series could not be loaded. Please reload the page to try again.";
  }
  return <main>
    <header><h1>Dumas</h1><p className="muted">Visual story development</p></header>
    <ProjectLauncher projects={projects} loadError={error} />
    <AiModelsPanel registry={createAiModelRegistry()} />
  </main>;
}
