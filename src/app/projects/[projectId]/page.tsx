import Link from "next/link";
import { notFound } from "next/navigation";
import { projectRepository } from "@/lib/projects/project-repository";
import { formatDate } from "@/lib/projects/format-date";
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
    <p>Series project loaded successfully.</p>
    <dl className="panel"><dt>Project ID</dt><dd>{project.id}</dd>
      <dt>Created</dt><dd><time dateTime={project.createdAt}>{formatDate(project.createdAt)}</time></dd>
      <dt>Last updated</dt><dd><time dateTime={project.updatedAt}>{formatDate(project.updatedAt)}</time></dd>
    </dl></main>;
}
