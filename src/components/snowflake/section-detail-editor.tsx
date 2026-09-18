"use client";

import { useRef, useState } from "react";
import type { DumasProject, MainStorySectionId, StoryContextCollection, StoryContextEntity } from "@/lib/projects/project-types";
import { findDuplicateEntity, normalizedEntityName, type StoryContextKind, type StoryContextSuggestion } from "@/lib/projects/story-context-state";
import { acceptedRewriteUpdate, acceptedTitleUpdate, acceptRewriteSuggestion, createAiRewritePreview, DEFAULT_PARAGRAPH_COUNT,
  emptyAiRewriteSession, markPreviewTitleAccepted, rewriteRequestPayload } from "@/lib/projects/rewrite-editor-state";
import type { AiModelRegistry } from "@/lib/ai/model-registry";
import { existingExpansionMappings, persistentExpansionHeading, type AiContextSuggestion, type AiExpansionHeading,
  type ExpansionEntityMappings } from "@/lib/projects/expansion-associations";

type RewriteStatus = "idle" | "preparing_rewrite" | "loading_context" | "prompt_created" | "submitting" |
  "waiting" | "response_received" | "rewrite_ready" | "rewrite_failed";
type AiSaveStatus = "idle" | "saving" | "saved" | "failed";
type ExpandStatus = "idle" | "preparing" | "submitting" | "analysing" | "ready" | "failed";

const rewriteStatusLabels: Record<RewriteStatus, string> = {
  idle: "Idle", preparing_rewrite: "Preparing rewrite…", loading_context: "Loading story context…",
  prompt_created: "Prompt created", submitting: "Submitting to Gemini…", waiting: "Waiting for Gemini…",
  response_received: "Response received", rewrite_ready: "Rewrite ready", rewrite_failed: "Rewrite failed",
};
const expandStatusLabels: Record<ExpandStatus, string> = {
  idle: "Idle", preparing: "Preparing…", submitting: "Submitting to OpenAI…",
  analysing: "Analysing story…", ready: "Suggestions ready", failed: "Expansion failed",
};

export function SectionDetailEditor({ projectId, sectionId, initialTitle, initialDetails, onSavedTitle, onDetailsChange,
  onExpanded, characters, places, onAcceptContextSuggestion, modelRegistry, geminiModel, onGeminiModelChange,
  openaiModel, onOpenaiModelChange, onSelectContext }: {
  projectId: string;
  sectionId: MainStorySectionId;
  initialTitle: string;
  initialDetails: string;
  onSavedTitle: (title: string) => void;
  onDetailsChange: (details: string) => void;
  onExpanded: (project: DumasProject) => void;
  characters: StoryContextCollection;
  places: StoryContextCollection;
  onAcceptContextSuggestion: (kind: StoryContextKind, suggestion: StoryContextSuggestion) => Promise<{ entity: StoryContextEntity; duplicate: boolean }>;
  onSelectContext: (kind: StoryContextKind, entity: StoryContextEntity) => void;
  modelRegistry: AiModelRegistry;
  geminiModel: string; onGeminiModelChange: (model: string) => void;
  openaiModel: string; onOpenaiModelChange: (model: string) => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [details, setDetails] = useState(initialDetails);
  const [saved, setSaved] = useState({ title: initialTitle, details: initialDetails });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [rewriting, setRewriting] = useState(false);
  const [rewriteError, setRewriteError] = useState("");
  const [rewriteErrorCode, setRewriteErrorCode] = useState<string | number | null>(null);
  const [rewriteStatus, setRewriteStatus] = useState<RewriteStatus>("idle");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [acceptedTitle, setAcceptedTitle] = useState<string | null>(null);
  const [rewriteSaveStatus, setRewriteSaveStatus] = useState<AiSaveStatus>("idle");
  const [titleSaveStatus, setTitleSaveStatus] = useState<AiSaveStatus>("idle");
  const [rewriteSaveError, setRewriteSaveError] = useState("");
  const [titleSaveError, setTitleSaveError] = useState("");
  const [pendingRewrite, setPendingRewrite] = useState("");
  const [pendingTitle, setPendingTitle] = useState("");
  const [rewriteDraft, setRewriteDraft] = useState("");
  const [paragraphCount, setParagraphCount] = useState(DEFAULT_PARAGRAPH_COUNT);
  const [expandStatus, setExpandStatus] = useState<ExpandStatus>("idle");
  const [expanding, setExpanding] = useState(false);
  const [expandError, setExpandError] = useState("");
  const [headings, setHeadings] = useState<AiExpansionHeading[]>([]);
  const [characterSuggestions, setCharacterSuggestions] = useState<AiContextSuggestion[]>([]);
  const [placeSuggestions, setPlaceSuggestions] = useState<AiContextSuggestion[]>([]);
  const [entityMappings, setEntityMappings] = useState<ExpansionEntityMappings>({ characters: {}, places: {} });
  const [addingContextKey, setAddingContextKey] = useState("");
  const [addedContextKeys, setAddedContextKeys] = useState<Set<string>>(() => new Set());
  const [selectedHeadings, setSelectedHeadings] = useState<Set<number>>(() => new Set());
  const [replacing, setReplacing] = useState(false);
  const inFlight = useRef(false);
  const dirty = title !== saved.title || details !== saved.details;
  const words = details.trim() ? details.trim().split(/\s+/u).length : 0;

  function clearRewritePanel() {
    const empty = emptyAiRewriteSession();
    setSuggestion(empty.rewriteSuggestion);
    setTitleSuggestions(empty.titleSuggestions);
    setRewriteDraft(empty.previousSuggestion ?? "");
    setAcceptedTitle(null);
    setRewriteStatus("idle");
    setRewriteError(""); setRewriteErrorCode(null);
    setRewriteSaveStatus("idle"); setTitleSaveStatus("idle");
    setRewriteSaveError(""); setTitleSaveError("");
    setPendingRewrite(""); setPendingTitle("");
  }

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
        title: result.series.mainStory.sections[sectionId].title,
        details: result.series.mainStory.sections[sectionId].details,
      };
      setSaved(stored);
      setTitle(current => current === submitted.title ? stored.title : current);
      setDetails(current => current === submitted.details ? stored.details : current);
      if (details === submitted.details) onDetailsChange(stored.details);
      onSavedTitle(stored.title);
    } catch (cause) {
      setError(cause instanceof Error && cause.message !== "Failed to fetch"
        ? cause.message : "Unable to save section details. Check your connection and try again.");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  async function rewrite(originalDraft: string, rejectedSuggestion?: string) {
    if (!originalDraft.trim() || rewriting) return;
    setRewriting(true);
    setRewriteError("");
    setRewriteErrorCode(null);
    setRewriteStatus("preparing_rewrite");
    try {
      const response = await fetch(`/api/projects/${projectId}/main-story/${sectionId}/rewrite`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rewriteRequestPayload(originalDraft, paragraphCount, rejectedSuggestion, geminiModel)),
      });
      if (!response.ok || !response.body) throw new Error("Unable to generate a rewrite. Please try again.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let receivedResult = false;
      let receivedError = false;
      const processLine = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as { type?: string; status?: RewriteStatus | number; rewrite?: unknown;
          titleSuggestions?: unknown; code?: string; message?: string };
        if (event.type === "status" && typeof event.status === "string" && event.status in rewriteStatusLabels) {
          setRewriteStatus(event.status as RewriteStatus);
        } else if (event.type === "result" && typeof event.rewrite === "string" && event.rewrite.trim()) {
          receivedResult = true;
          const preview = createAiRewritePreview(event.rewrite, Array.isArray(event.titleSuggestions)
            ? event.titleSuggestions.filter((value): value is string => typeof value === "string") : []);
          setSuggestion(preview.rewrite);
          setTitleSuggestions(preview.titleSuggestions);
          setAcceptedTitle(null); setRewriteSaveStatus("idle"); setTitleSaveStatus("idle");
          setRewriteSaveError(""); setTitleSaveError(""); setRewriteStatus("rewrite_ready");
        } else if (event.type === "error") {
          receivedError = true;
          const label = modelRegistry.gemini.models.find(option => option.id === geminiModel)?.label ?? geminiModel;
          setRewriteError(`${label}: ${event.message || "Unable to generate a rewrite. Please try again."} Try again or select another model.`);
          setRewriteErrorCode(typeof event.status === "number" ? event.status : event.code || null);
          setRewriteStatus("rewrite_failed");
        }
      };
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) processLine(line);
        if (done) break;
      }
      processLine(buffer);
      if (!receivedResult && !receivedError) throw new Error("Unable to generate a rewrite. Please try again.");
    } catch {
      setRewriteError("Unable to generate a rewrite. Please try again.");
      setRewriteStatus("rewrite_failed");
    } finally { setRewriting(false); }
  }

  function requestFirstRewrite() {
    clearRewritePanel();
    setRewriteDraft(details);
    void rewrite(details);
  }

  async function saveAcceptedRewrite(accepted: string) {
    const update = acceptedRewriteUpdate(accepted);
    setPendingRewrite(update.localDetails);
    setDetails(update.localDetails);
    onDetailsChange(update.localDetails);
    setRewriteSaveStatus("saving");
    setRewriteSaveError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/main-story/${sectionId}/details`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(update.requestBody),
      });
      if (!response.ok) throw new Error("Rewrite generated successfully, but saving failed.");
      const result: DumasProject = await response.json();
      const stored = result.series.mainStory.sections[sectionId].details;
      setSaved(current => ({ ...current, details: stored }));
      setDetails(current => {
        if (current === accepted) { onDetailsChange(stored); return stored; }
        return current;
      });
      clearRewritePanel();
    } catch {
      setRewriteSaveStatus("failed");
      setRewriteSaveError("Rewrite generated successfully, but saving failed.");
    }
  }

  async function saveAcceptedTitle(selectedTitle: string) {
    const update = acceptedTitleUpdate(selectedTitle);
    setPendingTitle(update.localTitle);
    setTitle(update.localTitle);
    onSavedTitle(update.localTitle);
    setAcceptedTitle(update.localTitle);
    setTitleSaveStatus("saving");
    setTitleSaveError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/main-story/${sectionId}/title`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(update.requestBody),
      });
      if (!response.ok) throw new Error("Title selected, but saving failed.");
      const result: DumasProject = await response.json();
      const stored = result.series.mainStory.sections[sectionId].title;
      setSaved(current => ({ ...current, title: stored }));
      setTitle(current => current === selectedTitle ? stored : current);
      onSavedTitle(stored);
      setAcceptedTitle(stored);
      setTitleSaveStatus("saved");
      if (suggestion) {
        const preview = markPreviewTitleAccepted(createAiRewritePreview(suggestion, titleSuggestions), stored);
        setSuggestion(preview.rewrite); setTitleSuggestions(preview.titleSuggestions); setAcceptedTitle(preview.acceptedTitle);
      }
    } catch {
      setTitleSaveStatus("failed");
      setTitleSaveError("Title selected, but saving failed.");
    }
  }

  async function generateExpansion() {
    if (!title.trim() || !details.trim() || expanding) return;
    setExpanding(true); setExpandError(""); setExpandStatus("preparing");
    try {
      setExpandStatus("submitting");
      const pending = fetch(`/api/projects/${projectId}/main-story/${sectionId}/expand-suggestions`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, details, model: openaiModel }),
      });
      setExpandStatus("analysing");
      const response = await pending;
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Unable to expand this section. Please try again.");
      const nextHeadings: AiExpansionHeading[] = Array.isArray(body?.headings) ? body.headings.filter((heading: unknown): heading is AiExpansionHeading =>
        Boolean(heading && typeof heading === "object" && "id" in heading && typeof heading.id === "string" &&
          "title" in heading && typeof heading.title === "string" && "characterRefs" in heading && Array.isArray(heading.characterRefs) &&
          "placeRefs" in heading && Array.isArray(heading.placeRefs))) : [];
      if (nextHeadings.length < 2) throw new Error("OpenAI did not return enough distinct story beats.");
      const contextItems = (value: unknown): AiContextSuggestion[] => Array.isArray(value) ? value.filter((item): item is AiContextSuggestion =>
        Boolean(item && typeof item === "object" && "ref" in item && typeof item.ref === "string" &&
          "name" in item && typeof item.name === "string" &&
          "description" in item && typeof item.description === "string" && "existingId" in item &&
          (item.existingId === null || typeof item.existingId === "string"))) : [];
      const nextCharacters = contextItems(body?.characters);
      const nextPlaces = contextItems(body?.places);
      setHeadings(nextHeadings); setSelectedHeadings(new Set(nextHeadings.map((_, index) => index)));
      setCharacterSuggestions(nextCharacters); setPlaceSuggestions(nextPlaces);
      setEntityMappings(existingExpansionMappings(characters, places, nextCharacters, nextPlaces));
      setAddedContextKeys(new Set());
      setExpandStatus("ready");
    } catch (cause) {
      setExpandError(cause instanceof Error && cause.message !== "Failed to fetch"
        ? cause.message : "Unable to expand this section. Check your connection and try again.");
      setExpandStatus("failed");
    } finally { setExpanding(false); }
  }

  async function addContextSuggestion(kind: StoryContextKind, suggestion: AiContextSuggestion) {
    const key = `${kind}:${normalizedEntityName(suggestion.name)}`;
    setAddingContextKey(key);
    try {
      const result = await onAcceptContextSuggestion(kind, suggestion);
      setEntityMappings(current => ({ ...current, [kind]: { ...current[kind], [suggestion.ref]: result.entity.id } }));
      setAddedContextKeys(current => new Set(current).add(key));
    } catch {
      // The workspace displays the save error; keep the suggestion available here for retry.
    } finally { setAddingContextKey(""); }
  }

  async function replaceWithExpansion() {
    const selected = headings.filter((_, index) => selectedHeadings.has(index))
      .map(heading => persistentExpansionHeading(heading, entityMappings));
    if (selected.length < 2 || replacing) return;
    setReplacing(true); setExpandError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/main-story/${sectionId}/expand`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ headings: selected }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Unable to replace the section. Your selections have been preserved.");
      onExpanded(body as DumasProject);
    } catch (cause) {
      setExpandError(cause instanceof Error && cause.message !== "Failed to fetch"
        ? cause.message : "Unable to replace the section. Check your connection and try again.");
    } finally { setReplacing(false); }
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
      onChange={event => { setDetails(event.target.value); onDetailsChange(event.target.value); setError(""); }} />
    <div className="ai-rewrite-actions">
      <label className="model-select" htmlFor={`gemini-model-${sectionId}`}>Model:
        <select id={`gemini-model-${sectionId}`} value={geminiModel} disabled={rewriting}
          onChange={event => onGeminiModelChange(event.target.value)}>
          {modelRegistry.gemini.models.map(option => <option value={option.id} key={option.id}>{option.label}</option>)}
        </select>
      </label>
      <label className="paragraph-count" htmlFor={`paragraph-count-${sectionId}`}>Paragraphs:
        <select id={`paragraph-count-${sectionId}`} value={paragraphCount} disabled={rewriting}
          onChange={event => setParagraphCount(Number(event.target.value))}>
          {[0, 1, 2, 3, 4, 5].map(value => <option value={value} key={value}>{value}</option>)}
        </select>
      </label>
      <button type="button" className="secondary" disabled={!details.trim() || rewriting} onClick={requestFirstRewrite}>
        {rewriting ? "Rewriting…" : "Rewrite with AI"}
      </button>
      <span className={rewriteStatus === "rewrite_failed" ? "ai-status error" : "ai-status muted"} role="status" aria-live="polite">
        {rewriteStatusLabels[rewriteStatus]}{rewriteStatus === "rewrite_failed" && rewriteErrorCode ? ` — ${rewriteErrorCode}` : ""}
      </span>
    </div>
    {rewriteError && <p role="alert" className="error ai-error-detail">{rewriteError}</p>}
    {suggestion !== null && <aside className="rewrite-preview" aria-labelledby={`rewrite-heading-${sectionId}`}>
      <h3 id={`rewrite-heading-${sectionId}`}>AI rewrite</h3>
      <p>{suggestion}</p>
      <div className="rewrite-preview-actions">
        <button type="button" disabled={rewriteSaveStatus === "saving" || rewriteSaveStatus === "saved" || titleSaveStatus === "saving"}
          onClick={() => void saveAcceptedRewrite(acceptRewriteSuggestion(details, suggestion))}>
          {rewriteSaveStatus === "saving" ? "Saving AI rewrite…" : rewriteSaveStatus === "saved" ? "Rewrite accepted" : "Accept rewrite"}
        </button>
        <button type="button" className="secondary" disabled={rewriting || rewriteSaveStatus === "saving" || titleSaveStatus === "saving"}
          onClick={() => void rewrite(rewriteDraft, suggestion)}>Try another</button>
        <button type="button" className="secondary" disabled={rewriting || rewriteSaveStatus === "saving" || titleSaveStatus === "saving"}
          onClick={clearRewritePanel}>Cancel</button>
      </div>
      {rewriteSaveStatus === "saved" && <p className="success" role="status">AI rewrite saved.</p>}
      {rewriteSaveError && <div className="ai-save-error"><p className="error" role="alert">{rewriteSaveError}</p>
        <button type="button" className="secondary" onClick={() => void saveAcceptedRewrite(pendingRewrite)}>Retry saving rewrite</button></div>}
      {titleSuggestions.length > 0 && <div className="title-suggestions">
        <h4>Suggested titles</h4>
        {titleSuggestions.map(titleSuggestion => <div className="title-suggestion" key={titleSuggestion}>
          <span>{titleSuggestion}</span>
          <button type="button" className="secondary" disabled={titleSaveStatus === "saving" || rewriteSaveStatus === "saving" ||
            (acceptedTitle === titleSuggestion && titleSaveStatus === "saved")}
            onClick={() => void saveAcceptedTitle(titleSuggestion)}>
            {acceptedTitle === titleSuggestion && titleSaveStatus === "saved" ? "Title saved" : "Use this title"}
          </button>
        </div>)}
        {titleSaveStatus === "saving" && <p className="muted" role="status">Saving title…</p>}
        {titleSaveError && <div className="ai-save-error"><p className="error" role="alert">{titleSaveError}</p>
          <button type="button" className="secondary" onClick={() => void saveAcceptedTitle(pendingTitle)}>Retry saving title</button></div>}
      </div>}
    </aside>}
    <div className="ai-expand-actions">
      <label className="model-select" htmlFor={`openai-model-${sectionId}`}>Model:
        <select id={`openai-model-${sectionId}`} value={openaiModel} disabled={expanding}
          onChange={event => onOpenaiModelChange(event.target.value)}>
          {modelRegistry.openai.models.map(option => <option value={option.id} key={option.id}>{option.label}</option>)}
        </select>
      </label>
      <button type="button" className="secondary" disabled={!title.trim() || !details.trim() || expanding || replacing}
        onClick={() => void generateExpansion()}>{expanding ? "Expanding…" : "Expand with AI"}</button>
      <span className={expandStatus === "failed" ? "ai-status error" : "ai-status muted"} role="status" aria-live="polite">
        {expandStatusLabels[expandStatus]}
      </span>
    </div>
    {expandError && <p role="alert" className="error ai-error-detail">{expandError}</p>}
    {headings.length > 0 && <aside className="expansion-preview" aria-labelledby={`expand-heading-${sectionId}`}>
      <h3 id={`expand-heading-${sectionId}`}>Suggested story beats</h3>
      <button type="button" className="text-button" onClick={() => setSelectedHeadings(current =>
        current.size === headings.length ? new Set() : new Set(headings.map((_, index) => index)))}>
        {selectedHeadings.size === headings.length ? "Deselect all" : "Select all"}
      </button>
      <ol className="expansion-headings">
        {headings.map((heading, index) => <li key={heading.id}>
          <label><input type="checkbox" checked={selectedHeadings.has(index)} onChange={() => setSelectedHeadings(current => {
            const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next;
          })} /> <span>{heading.title}</span></label>
          {(heading.characterRefs.length > 0 || heading.placeRefs.length > 0) && <div className="suggested-associations">
            {heading.characterRefs.length > 0 && <div><span className="association-label">Characters</span><div className="association-chips">
              {heading.characterRefs.flatMap(ref => { const item = characterSuggestions.find(suggestion => suggestion.ref === ref);
                return item ? [<span className="association-chip static" key={ref}>{item.name}</span>] : []; })}</div></div>}
            {heading.placeRefs.length > 0 && <div><span className="association-label">Places</span><div className="association-chips">
              {heading.placeRefs.flatMap(ref => { const item = placeSuggestions.find(suggestion => suggestion.ref === ref);
                return item ? [<span className="association-chip static" key={ref}>{item.name}</span>] : []; })}</div></div>}
          </div>}
        </li>)}
      </ol>
      {characterSuggestions.length > 0 && <div className="analysis-context"><h4>Characters</h4>
        {characterSuggestions.map(item => {
          const key = `characters:${normalizedEntityName(item.name)}`;
          const justAdded = addedContextKeys.has(key);
          const existing = (item.existingId && characters[item.existingId]) || findDuplicateEntity(characters, item.name);
          return <div key={item.name} className="analysis-context-item"><div><strong>{item.name}</strong>
            <p>{item.description}</p></div>{existing ? <div><span className="success">Already in project</span>
              <button type="button" className="text-button" onClick={() => onSelectContext("characters", existing)}>View</button></div>
              : justAdded ? <span className="success">Added</span>
              : <button type="button" className="secondary" disabled={addingContextKey === key}
                onClick={() => void addContextSuggestion("characters", item)}>
                {addingContextKey === key ? "Adding…" : "Add character"}</button>}</div>;
        })}</div>}
      {placeSuggestions.length > 0 && <div className="analysis-context"><h4>Places</h4>
        {placeSuggestions.map(item => {
          const key = `places:${normalizedEntityName(item.name)}`;
          const justAdded = addedContextKeys.has(key);
          const existing = (item.existingId && places[item.existingId]) || findDuplicateEntity(places, item.name);
          return <div key={item.name} className="analysis-context-item"><div><strong>{item.name}</strong>
            <p>{item.description}</p></div>{existing ? <div><span className="success">Already in project</span>
              <button type="button" className="text-button" onClick={() => onSelectContext("places", existing)}>View</button></div>
              : justAdded ? <span className="success">Added</span>
              : <button type="button" className="secondary" disabled={addingContextKey === key}
                onClick={() => void addContextSuggestion("places", item)}>
                {addingContextKey === key ? "Adding…" : "Add place"}</button>}</div>;
        })}</div>}
      <p className="muted">Select at least two headings. The original section is retained as the parent.</p>
      <div className="rewrite-preview-actions">
        <button type="button" className="secondary" disabled={expanding || replacing}
          onClick={() => { setHeadings([]); setCharacterSuggestions([]); setPlaceSuggestions([]); setEntityMappings({ characters: {}, places: {} });
            setSelectedHeadings(new Set()); setExpandError(""); setExpandStatus("idle"); }}>Cancel</button>
        <button type="button" className="secondary" disabled={expanding || replacing} onClick={() => void generateExpansion()}>Generate again</button>
        <button type="button" disabled={selectedHeadings.size < 2 || expanding || replacing}
          onClick={() => void replaceWithExpansion()}>{replacing ? "Replacing section…" : "Replace section with selected headings"}</button>
      </div>
    </aside>}
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
