"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import type { DumasProject, FiveSentenceSummary } from "@/lib/projects/project-types";
import { formatDate } from "@/lib/projects/format-date";

const subscribeToHydration = () => () => {};
const fields: Array<{ key: keyof FiveSentenceSummary; label: string }> = [
  { key: "setup", label: "1 — Setup" },
  { key: "disaster1", label: "2 — First disaster" },
  { key: "disaster2", label: "3 — Second disaster" },
  { key: "disaster3", label: "4 — Third disaster" },
  { key: "resolution", label: "5 — Resolution" },
];

function sameSummary(a: FiveSentenceSummary, b: FiveSentenceSummary) {
  return fields.every(({ key }) => a[key] === b[key]);
}

export function SummaryEditor({ project }: { project: DumasProject }) {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [summary, setSummary] = useState(project.series.summary);
  const [saved, setSaved] = useState(project.series.summary);
  const [updatedAt, setUpdatedAt] = useState(project.updatedAt);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const dirty = !sameSummary(summary, saved);

  async function save() {
    if (!dirty || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError("");
    const submitted = summary;
    try {
      const response = await fetch(`/api/projects/${project.id}/summary`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: submitted }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Unable to save summary. Please try again.");
      }
      const result: DumasProject = await response.json();
      setSaved(result.series.summary);
      setSummary(current => sameSummary(current, submitted) ? result.series.summary : current);
      setUpdatedAt(result.updatedAt);
    } catch (cause) {
      setError(cause instanceof Error && cause.message !== "Failed to fetch"
        ? cause.message : "Unable to save summary. Check your connection and try again.");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return <section aria-labelledby="summary-heading" onKeyDown={event => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void save();
    }
  }}>
    <form className="panel" onSubmit={event => { event.preventDefault(); void save(); }}>
      <p className="muted">Step 2</p>
      <h2 id="summary-heading">Five-sentence summary</h2>
      <p id="summary-help">Outline the setup, three major disasters or plot shifts, and the resolution.</p>
      <div className="summary-fields">
        {fields.map(({ key, label }) => <div key={key}>
          <label htmlFor={`summary-${key}`}>{label}</label>
          <textarea id={`summary-${key}`} rows={3} value={summary[key]} disabled={!hydrated}
            aria-describedby="summary-help"
            onChange={event => {
              setSummary(current => ({ ...current, [key]: event.target.value }));
              setError("");
            }} />
        </div>)}
      </div>
      <div className="actions">
        <p role="status" aria-live="polite" className={error ? "error" : "muted"}>
          {saving ? "Saving…" : error || (dirty ? "Unsaved changes" : "Saved")}
        </p>
        <button type="submit" disabled={!dirty || saving}>Save summary</button>
      </div>
    </form>
    <p className="muted">Last updated: <time dateTime={updatedAt}>{formatDate(updatedAt)}</time></p>
  </section>;
}
