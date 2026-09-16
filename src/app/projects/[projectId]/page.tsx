import Link from "next/link";
import { notFound } from "next/navigation";
import { projectRepository } from "@/lib/projects/project-repository";
import { PremiseEditor } from "@/components/snowflake/premise-editor";
import { SummaryEditor } from "@/components/snowflake/summary-editor";
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
    <PremiseEditor key={`premise-${project.id}`} project={project} />
    <SummaryEditor key={`summary-${project.id}`} project={project} /></main>;
}
