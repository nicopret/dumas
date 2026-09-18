"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import type { ProjectSummary } from "@/lib/projects/project-types";
import { formatDate } from "@/lib/projects/format-date";
import { requestProjectDeletion, withoutProject } from "@/lib/projects/project-launcher-state";
export function ProjectLauncher({ projects, loadError }: { projects: ProjectSummary[]; loadError?: string }) {
  const router = useRouter();
  const [visibleProjects, setVisibleProjects] = useState(projects);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const newButton = useRef<HTMLButtonElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const deleteOpener = useRef<HTMLButtonElement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  function requestDelete(project: ProjectSummary, opener: HTMLButtonElement) {
    deleteOpener.current = opener;
    setDeleteTarget(project);
    setDeleteError("");
    deleteDialog.current?.showModal();
  }

  function closeDeleteDialog() {
    if (deleting) return;
    deleteDialog.current?.close();
    setDeleteTarget(null);
    setDeleteError("");
    requestAnimationFrame(() => deleteOpener.current?.focus());
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true); setDeleteError("");
    try {
      await requestProjectDeletion(deleteTarget.id);
      const deletedId = deleteTarget.id;
      deleteDialog.current?.close();
      setDeleteTarget(null);
      setVisibleProjects(current => withoutProject(current, deletedId));
      requestAnimationFrame(() => newButton.current?.focus());
    } catch (cause) {
      setDeleteError(cause instanceof Error && cause.message !== "Failed to fetch"
        ? cause.message : "Unable to delete this series. Please try again.");
    } finally { setDeleting(false); }
  }
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
    {loadError ? <p role="alert" className="panel error">{loadError}</p> : visibleProjects.length === 0 ?
      <div className="panel empty-state"><h3>No series yet.</h3><p>Create your first series to begin developing its story.</p></div> :
      <ul className="project-list">{visibleProjects.map((project) => <li className="panel project-card" key={project.id}>
        <div><h3>{project.title}</h3><p className="muted">Last modified: <time dateTime={project.updatedAt}>{formatDate(project.updatedAt)}</time></p></div>
        <div className="project-actions"><Link className="button secondary" href={`/projects/${project.id}`}
          aria-label={`Open ${project.title}`}>Open</Link>
          <button type="button" className="danger-secondary" aria-label={`Delete ${project.title}`}
            onClick={event => requestDelete(project, event.currentTarget)}>Delete</button></div>
      </li>)}</ul>}
    <dialog ref={deleteDialog} className="delete-dialog" aria-labelledby="delete-series-title"
      onCancel={event => { event.preventDefault(); if (!deleting) closeDeleteDialog(); }}>
      <h2 id="delete-series-title">Delete series?</h2>
      {deleteTarget && <><p>You are about to permanently delete:</p><p className="delete-series-name">“{deleteTarget.title}”</p>
        <p>This will remove the series and its stored project file.<br />This action cannot be undone.</p></>}
      {deleteError && <p className="error" role="alert">{deleteError}</p>}
      <div className="actions">
        <button type="button" className="secondary" disabled={deleting} onClick={closeDeleteDialog}>Cancel</button>
        <button type="button" className="danger" disabled={deleting} onClick={() => void confirmDelete()}>
          {deleting ? "Deleting…" : "Delete series"}</button>
      </div>
    </dialog>
  </section>;
}
