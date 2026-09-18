import Link from "next/link";
import { notFound } from "next/navigation";
import { projectRepository } from "@/lib/projects/project-repository";
import { ProjectWorkspace } from "@/components/project-workspace";
import { createAiModelRegistry } from "@/lib/ai/model-registry";
import { needsIdeaOnboarding } from "@/lib/projects/idea-editor-state";
import { ProjectOnboarding } from "@/components/project-onboarding";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  let project;
  try { project = await projectRepository.getProject(projectId); } catch (error) {
    console.error(`Unable to open project ${projectId}.`, error);
    return <main><Link href="/">← Dumas</Link><h1>Unable to load series</h1>
      <p role="alert">This project could not be read. Its file has not been changed.</p>
      <p>Return to your series and try again.</p></main>;
  }
  if (!project) notFound();
  const modelRegistry = createAiModelRegistry();
  return <main><Link href="/">← Dumas</Link><h1>{project.series.title}</h1>
    {needsIdeaOnboarding(project)
      ? <ProjectOnboarding key={`onboarding-${project.id}`} initialProject={project} modelRegistry={modelRegistry} />
      : <ProjectWorkspace key={`workspace-${project.id}`} initialProject={project} modelRegistry={modelRegistry} />}
  </main>;
}
