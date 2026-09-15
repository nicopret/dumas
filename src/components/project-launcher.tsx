"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import type { ProjectSummary } from "@/lib/projects/project-types";
import { formatDate } from "@/lib/projects/format-date";
export function ProjectLauncher({ projects, loadError }: { projects: ProjectSummary[]; loadError?: string }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const newButton = useRef<HTMLButtonElement>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if (!title.trim()) { setError("Enter a series title."); return; }
    submitting.current = true;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/projects", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: title.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The series could not be saved. Please try again.");
      router.push(`/projects/${result.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The series could not be saved. Please try again.");
      submitting.current = false;
      setPending(false);
    }
  }
  return <section aria-labelledby="series-heading">
    <div className="section-heading"><h2 id="series-heading">Your series</h2>
      <button ref={newButton} onClick={() => { setShowForm(true); setError(""); }} disabled={showForm}>+ New Series</button>
    </div>
    {showForm && <form className="panel" onSubmit={submit} aria-labelledby="new-series-heading" aria-busy={pending}>
      <h3 id="new-series-heading">New series</h3>
      <label htmlFor="series-title">Series title</label>
      <input id="series-title" value={title} onChange={(event) => setTitle(event.target.value)} required autoFocus disabled={pending}
        aria-invalid={Boolean(error)} aria-describedby={error ? "create-error" : undefined} />
      {error && <p id="create-error" role="alert" className="error">{error}</p>}
      <div className="actions">
        <button type="button" className="secondary" disabled={pending} onClick={() => {
          setShowForm(false); setTitle(""); setError(""); requestAnimationFrame(() => newButton.current?.focus());
        }}>Cancel</button>
        <button disabled={pending} type="submit">{pending ? "Creating…" : "Create Series"}</button>
      </div>
    </form>}
    {loadError ? <p role="alert" className="panel error">{loadError}</p> : projects.length === 0 ?
      <div className="panel empty-state"><h3>No series yet.</h3><p>Create your first series to begin developing its story.</p></div> :
      <ul className="project-list">{projects.map((project) => <li className="panel project-card" key={project.id}>
        <div><h3>{project.title}</h3><p className="muted">Last modified: <time dateTime={project.updatedAt}>{formatDate(project.updatedAt)}</time></p></div>
        <Link className="button secondary" href={`/projects/${project.id}`} aria-label={`Open ${project.title}`}>Open</Link>
      </li>)}</ul>}
  </section>;
}
