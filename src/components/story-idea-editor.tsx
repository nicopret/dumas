"use client";

import { useState } from "react";
import type { DumasProject } from "@/lib/projects/project-types";
import { countWords } from "@/lib/projects/idea-editor-state";

export function StoryIdeaEditor({ project, onboarding, onSaved, onCancel }: {
  project: DumasProject;
  onboarding: boolean;
  onSaved: (project: DumasProject) => void;
  onCancel?: () => void;
}) {
  const [idea, setIdea] = useState(project.series.idea);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!idea.trim()) { setError("Please describe your story idea before continuing."); return; }
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/idea`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idea }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Unable to save your story idea. Please try again.");
      onSaved(body as DumasProject);
    } catch (cause) {
      setError(cause instanceof Error && cause.message !== "Failed to fetch" ? cause.message
        : "Unable to save your story idea. Check your connection and try again.");
    } finally { setSaving(false); }
  }

  return <section className="story-idea-editor" aria-labelledby="story-idea-heading">
    <p className="muted eyebrow">Your series</p>
    <h2>{project.series.title}</h2>
    <h3 id="story-idea-heading">{onboarding ? "Start with your story idea" : "Edit story idea"}</h3>
    <p>Write down the idea for the story in as much detail as you want. This can be rough notes, several paragraphs,
      characters, events, conflicts, mysteries, locations, or anything else you already know.</p>
    <label htmlFor="story-idea">Story idea</label>
    <textarea id="story-idea" rows={16} value={idea} disabled={saving} autoFocus
      onChange={event => { setIdea(event.target.value); setError(""); }} />
    <div className="story-idea-footer">
      <p className="muted" aria-live="polite">{countWords(idea)} {countWords(idea) === 1 ? "word" : "words"}</p>
      <div className="actions">
        {!onboarding && onCancel && <button type="button" className="secondary" disabled={saving} onClick={onCancel}>Cancel</button>}
        <button type="button" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : onboarding ? "Save idea and continue" : "Save story idea"}
        </button>
      </div>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
