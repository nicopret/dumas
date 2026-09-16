import Link from "next/link";
import { notFound } from "next/navigation";
import { projectRepository } from "@/lib/projects/project-repository";
import { MainStoryWorkflow } from "@/components/snowflake/main-story-workflow";
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
  return <main><Link href="/">← Dumas</Link><h1>{project.series.title}</h1>
    <MainStoryWorkflow key={`main-story-${project.id}`} project={project} /></main>;
}
