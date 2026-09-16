"use client";

import { useRef, useState } from "react";
import type { DumasProject, MainStorySectionId } from "@/lib/projects/project-types";

export function SectionDetailEditor({ projectId, sectionId, initialTitle, initialDetails, onSavedTitle }: {
  projectId: string;
  sectionId: MainStorySectionId;
  initialTitle: string;
  initialDetails: string;
  onSavedTitle: (title: string) => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [details, setDetails] = useState(initialDetails);
  const [saved, setSaved] = useState({ title: initialTitle, details: initialDetails });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const dirty = title !== saved.title || details !== saved.details;
  const words = details.trim() ? details.trim().split(/\s+/u).length : 0;

  async function save() {
    if (!dirty || inFlight.current) return;
    if (!title.trim()) { setError("Enter a section title."); return; }
    inFlight.current = true;
    setSaving(true);
    setError("");
    const submitted = { title, details };
    try {
      const response = await fetch(`/api/projects/${projectId}/main-story/${sectionId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(submitted),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Unable to save section details. Please try again.");
      }
      const result: DumasProject = await response.json();
      const stored = {
        title: result.series.summary[sectionId],
        details: result.series.mainStory.sections[sectionId].details,
      };
      setSaved(stored);
      setTitle(current => current === submitted.title ? stored.title : current);
      setDetails(current => current === submitted.details ? stored.details : current);
      onSavedTitle(stored.title);
    } catch (cause) {
      setError(cause instanceof Error && cause.message !== "Failed to fetch"
        ? cause.message : "Unable to save section details. Check your connection and try again.");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return <form className="section-detail-editor" onSubmit={event => { event.preventDefault(); void save(); }}
    onKeyDown={event => {
      if (dirty && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault(); void save();
      }
    }}>
    <label htmlFor={`section-title-${sectionId}`}>Title</label>
    <input id={`section-title-${sectionId}`} value={title}
      onChange={event => { setTitle(event.target.value); setError(""); }} />
    <label htmlFor={`section-details-${sectionId}`}>Section detail</label>
    <textarea id={`section-details-${sectionId}`} rows={10} value={details}
      onChange={event => { setDetails(event.target.value); setError(""); }} />
    <div className="detail-editor-footer">
      <p className="muted">{words} {words === 1 ? "word" : "words"}</p>
      <div className="detail-save">
        <p role="status" aria-live="polite" className={error ? "error" : "muted"}>
          {saving ? "Saving…" : error || (dirty ? "Unsaved changes" : "Saved")}
        </p>
        <button type="submit" disabled={!dirty || saving}>Save</button>
      </div>
    </div>
  </form>;
}
