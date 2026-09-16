"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import type { DumasProject } from "@/lib/projects/project-types";
import { formatDate } from "@/lib/projects/format-date";

const subscribeToHydration = () => () => {};

export function PremiseEditor({ project }: { project: DumasProject }) {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [text, setText] = useState(project.series.premise);
  const [saved, setSaved] = useState(project.series.premise);
  const [updatedAt, setUpdatedAt] = useState(project.updatedAt);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const dirty = text !== saved;
  const words = text.trim() ? text.trim().split(/\s+/u).length : 0;

  async function save() {
    if (!dirty || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError("");
    const submitted = text;
    try {
      const response = await fetch(`/api/projects/${project.id}/premise`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ premise: submitted }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Unable to save premise. Please try again.");
      }
      const result: DumasProject = await response.json();
      setSaved(result.series.premise);
      setText(current => current === submitted ? result.series.premise : current);
      setUpdatedAt(result.updatedAt);
    } catch (cause) {
      setError(cause instanceof Error && cause.message !== "Failed to fetch"
        ? cause.message : "Unable to save premise. Check your connection and try again.");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return <section aria-labelledby="snowflake-heading" onKeyDown={event => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void save();
    }
  }}>
    <h2 id="snowflake-heading">Snowflake</h2>
    <form className="panel" onSubmit={event => { event.preventDefault(); void save(); }}>
      <p className="muted">Step 1</p>
      <label htmlFor="premise">One-sentence premise</label>
      <p id="premise-help">Describe the entire series in one sentence.</p>
      <textarea id="premise" rows={6} value={text} disabled={!hydrated}
        onChange={event => { setText(event.target.value); setError(""); }}
        aria-describedby="premise-help premise-count" />
      <p id="premise-count" className="muted">{words} {words === 1 ? "word" : "words"}</p>
      <div className="actions">
        <p role="status" aria-live="polite" className={error ? "error" : "muted"}>
          {saving ? "Saving…" : error || (dirty ? "Unsaved changes" : "Saved")}
        </p>
        <button type="submit" disabled={!dirty || saving}>Save premise</button>
      </div>
    </form>
    <p className="muted">Last updated: <time dateTime={updatedAt}>{formatDate(updatedAt)}</time></p>
  </section>;
}
