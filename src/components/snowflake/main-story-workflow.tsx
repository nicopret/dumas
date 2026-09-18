"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDndMonitor, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import type { DumasProject, MainStorySectionId, StoryContextEntity, StoryLinkTarget } from "@/lib/projects/project-types";
import type { StoryContextKind, StoryContextSuggestion } from "@/lib/projects/story-context-state";
import { StorySectionNode } from "./story-section-node";
import type { AiModelRegistry } from "@/lib/ai/model-registry";
import { deleteFromMainStory, deleteFromStoryFlows, mainStoryDeletionIds, requestMainStorySectionDeletion } from "@/lib/projects/main-story-deletion";
import { hasSectionAssociation, requestSectionAssociation, type SectionEntityDragData } from "@/lib/projects/section-associations";
import { changeWorkflowZoom, DEFAULT_WORKFLOW_ZOOM, fitWorkflowZoom, keyboardWorkflowZoom,
  wheelWorkflowZoom } from "@/lib/projects/workflow-zoom";
import { getFlowPlacementsSorted, getHighestOccupiedRow, GRID_TRAILING_ROWS } from "@/lib/projects/story-flows";

type Connector = { id: string; kind: "link" | "progression"; x1: number; y1: number; x2: number; y2: number };

export function MainStoryWorkflow({ project, onProjectChange, onAcceptContextSuggestion, modelRegistry,
  geminiModel, onGeminiModelChange, openaiModel, onOpenaiModelChange, onEditIdea, onSelectContext, zoom, onZoomChange }: {
  project: DumasProject; onProjectChange: (project: DumasProject) => void;
  onAcceptContextSuggestion: (kind: StoryContextKind, suggestion: StoryContextSuggestion) => Promise<{ entity: StoryContextEntity; duplicate: boolean }>;
  onSelectContext: (kind: StoryContextKind, entity: StoryContextEntity) => void; modelRegistry: AiModelRegistry;
  geminiModel: string; onGeminiModelChange: (model: string) => void; openaiModel: string; onOpenaiModelChange: (model: string) => void;
  onEditIdea: () => void;
  zoom: number; onZoomChange: (zoom: number) => void;
}) {
  const [sections, setSections] = useState(project.series.mainStory.sections);
  const [storyFlows, setStoryFlows] = useState(project.series.storyFlows);
  const [expanded, setExpanded] = useState<Set<MainStorySectionId>>(() => new Set());
  const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const [linkSource, setLinkSource] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MainStorySectionId | null>(null);
  const [deleting, setDeleting] = useState(false); const [deleteError, setDeleteError] = useState("");
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [trailingRows, setTrailingRows] = useState(GRID_TRAILING_ROWS);
  const deleteDialog = useRef<HTMLDialogElement>(null); const deleteOpener = useRef<HTMLButtonElement | null>(null);
  const editIdeaButton = useRef<HTMLButtonElement>(null); const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null); const lanesRef = useRef<HTMLDivElement>(null);
  const flows = Object.values(storyFlows.flows);

  function commit(updated: DumasProject) {
    setSections(updated.series.mainStory.sections); setStoryFlows(updated.series.storyFlows); onProjectChange(updated);
  }
  async function mutate(url: string, body?: unknown, method = "POST") {
    if (saving) return null;
    setSaving(true); setError("");
    try {
      const response = await fetch(url, { method, ...(body === undefined ? {} : {
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Unable to save story flows. Please try again.");
      commit(result as DumasProject); return result as DumasProject;
    } catch (cause) {
      setError(cause instanceof Error && cause.message !== "Failed to fetch" ? cause.message : "Unable to save story flows. Check your connection and try again.");
      return null;
    } finally { setSaving(false); }
  }
  const moveSection = (sectionId: string, targetFlowId: string, row: number, newFlowTitle?: string) =>
    mutate(`/api/projects/${project.id}/story-flows/move`, { sectionId, targetFlowId, row, ...(newFlowTitle ? { newFlowTitle } : {}) });

  function dragEnded(event: DragEndEvent) {
    if (!event.over || saving) return;
    const active = event.active.data.current as { type?: string; id?: string; sectionId?: string; flowId?: string } | undefined;
    const over = event.over.data.current as { sectionId?: string; flowId?: string; row?: number } | undefined;
    if ((active?.type === "character" || active?.type === "place") && active.id && over?.sectionId) {
      void associate(over.sectionId, { type: active.type, id: active.id }); return;
    }
    if (active?.type !== "story-section" || !active.sectionId || !over?.flowId || !over.row) return;
    void moveSection(active.sectionId, over.flowId, over.row);
  }
  useDndMonitor({
    onDragEnd: dragEnded,
    onDragOver: event => {
      if (event.active.data.current?.type !== "story-section") return;
      const row = event.over?.data.current?.row;
      const currentFinalRow = getHighestOccupiedRow(storyFlows) + trailingRows;
      if (typeof row === "number" && row >= currentFinalRow - 2) setTrailingRows(value => value + GRID_TRAILING_ROWS);
    },
  });

  async function associate(sectionId: string, data: SectionEntityDragData) {
    const current = { ...project, series: { ...project.series, mainStory: { sections }, storyFlows } };
    if (saving || hasSectionAssociation(current, sectionId, data.type, data.id)) return;
    setSaving(true); setError("");
    try { commit(await requestSectionAssociation(project.id, sectionId, data)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to associate this Story Context item. Please try again."); }
    finally { setSaving(false); }
  }
  async function createFlow() { const title = window.prompt("New flow name:"); if (title?.trim()) await mutate(`/api/projects/${project.id}/story-flows`, { title }); }
  async function moveToNewFlow(sectionId: string) {
    const title = window.prompt("Move section to new flow.\n\nFlow name:");
    if (title?.trim()) await moveSection(sectionId, "", getHighestOccupiedRow(storyFlows) + 1, title);
  }
  async function createLink(target: StoryLinkTarget) {
    if (!linkSource || target.type === "section" && target.sectionId === linkSource) return;
    const updated = await mutate(`/api/projects/${project.id}/story-links`, { sourceSectionId: linkSource, target });
    if (updated) setLinkSource(null);
  }

  function requestDelete(id: MainStorySectionId, opener: HTMLButtonElement) {
    deleteOpener.current = opener; setDeleteTarget(id); setDeleteError(""); deleteDialog.current?.showModal();
  }
  function closeDelete() { if (deleting) return; deleteDialog.current?.close(); setDeleteTarget(null); setDeleteError(""); requestAnimationFrame(() => deleteOpener.current?.focus()); }
  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true); setDeleteError("");
    try {
      await requestMainStorySectionDeletion(project.id, deleteTarget);
      const workflow = { sections }; const deletedIds = mainStoryDeletionIds(workflow, deleteTarget) ?? new Set<string>();
      const next = deleteFromMainStory(workflow, deleteTarget); if (!next) throw new Error("Unable to delete this story section. Please try again.");
      const nextFlows = deleteFromStoryFlows(storyFlows, deletedIds); setSections(next.sections); setStoryFlows(nextFlows);
      setExpanded(current => new Set([...current].filter(id => !deletedIds.has(id))));
      onProjectChange({ ...project, series: { ...project.series, mainStory: next, storyFlows: nextFlows } });
      deleteDialog.current?.close(); setDeleteTarget(null); requestAnimationFrame(() => editIdeaButton.current?.focus());
    } catch (cause) { setDeleteError(cause instanceof Error ? cause.message : "Unable to delete this story section. Please try again."); }
    finally { setDeleting(false); }
  }

  useLayoutEffect(() => {
    const update = () => {
      const root = canvasRef.current; if (!root) return; const base = root.getBoundingClientRect(); const scale = zoom / 100;
      const links: Connector[] = Object.values(storyFlows.links).flatMap(link => {
        const source = root.querySelector<HTMLElement>(`[data-section-id="${CSS.escape(link.sourceSectionId)}"]`);
        const target = link.target.type === "section" ? root.querySelector<HTMLElement>(`[data-section-id="${CSS.escape(link.target.sectionId)}"]`)
          : root.querySelector<HTMLElement>(`[data-flow-id="${CSS.escape(link.target.flowId)}"]`);
        if (!source || !target) return [];
        const a = source.getBoundingClientRect(); const b = target.getBoundingClientRect();
        return [{ id: link.id, kind: "link" as const, x1: (a.right - base.left) / scale, y1: (a.top + a.height / 2 - base.top) / scale,
          x2: (b.left - base.left) / scale, y2: (b.top + b.height / 2 - base.top) / scale }];
      });
      const progression: Connector[] = Object.values(storyFlows.flows).flatMap(flow => {
        const ordered = getFlowPlacementsSorted(flow);
        return ordered.slice(0, -1).flatMap((placement, index) => {
          const source = root.querySelector<HTMLElement>(`[data-section-id="${CSS.escape(placement.sectionId)}"]`);
          const target = root.querySelector<HTMLElement>(`[data-section-id="${CSS.escape(ordered[index + 1].sectionId)}"]`);
          if (!source || !target) return [];
          const a = source.getBoundingClientRect(); const b = target.getBoundingClientRect();
          return [{ id: `progress:${flow.id}:${placement.sectionId}`, kind: "progression" as const,
            x1: (a.left + a.width / 2 - base.left) / scale, y1: (a.bottom - base.top) / scale,
            x2: (b.left + b.width / 2 - base.left) / scale, y2: (b.top - base.top) / scale }];
        });
      });
      setConnectors([...progression, ...links]);
    };
    update(); window.addEventListener("resize", update); return () => window.removeEventListener("resize", update);
  }, [storyFlows, sections, expanded, zoom]);

  function fitToWidth() {
    const viewport = viewportRef.current; const lanes = lanesRef.current;
    if (viewport && lanes) {
      const naturalWidth = lanes.getBoundingClientRect().width / (zoom / 100);
      onZoomChange(fitWorkflowZoom(viewport.clientWidth, naturalWidth));
    }
  }
  function typingTarget(target: EventTarget | null) {
    return target instanceof HTMLElement && (target.matches("input, textarea, select") || target.isContentEditable);
  }
  useEffect(() => {
    const viewport = viewportRef.current; if (!viewport) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault(); onZoomChange(wheelWorkflowZoom(zoom, event.deltaY, true));
    };
    viewport.addEventListener("wheel", wheel, { passive: false });
    return () => viewport.removeEventListener("wheel", wheel);
  }, [zoom, onZoomChange]);

  const targetSection = deleteTarget ? sections[deleteTarget] : undefined;
  const descendantCount = deleteTarget ? Math.max(0, (mainStoryDeletionIds({ sections }, deleteTarget)?.size ?? 1) - 1) : 0;
  const rowCount = Math.max(GRID_TRAILING_ROWS, getHighestOccupiedRow(storyFlows) + trailingRows);
  return <section className="main-story" aria-labelledby="main-story-heading">
    <div className="workflow-heading"><p className="muted">Visual workflow</p><h2 id="main-story-heading">Story Flows</h2>
      <p>Drag sections within or between flows. The primary flow is marked Main Story.</p>
      <div className="actions"><button ref={editIdeaButton} type="button" className="text-button" onClick={onEditIdea}>Edit story idea</button>
        <button type="button" className="secondary" onClick={() => void createFlow()}>+ New flow</button></div></div>
    {linkSource && <div className="link-mode" role="status">Select a section or flow to link to.
      <button type="button" className="text-button" onClick={() => setLinkSource(null)}>Cancel</button></div>}
    <div className="workflow-zoom-toolbar" role="toolbar" aria-label="Workflow zoom controls">
      <button type="button" aria-label="Zoom out" onClick={() => onZoomChange(changeWorkflowZoom(zoom, -1))}>−</button>
      <output aria-live="polite">{zoom}%</output>
      <button type="button" aria-label="Zoom in" onClick={() => onZoomChange(changeWorkflowZoom(zoom, 1))}>+</button>
      <button type="button" aria-label="Fit workflow to width" onClick={fitToWidth}>Fit</button>
      <button type="button" aria-label="Reset zoom to 100%" onClick={() => onZoomChange(DEFAULT_WORKFLOW_ZOOM)}>100%</button>
    </div>
    <div className="workflow-viewport" ref={viewportRef} tabIndex={0} aria-label="Story workflow canvas"
      onKeyDown={event => { if (typingTarget(event.target)) return; const next = keyboardWorkflowZoom(zoom, event.key, event.ctrlKey || event.metaKey);
        if (next !== zoom) { event.preventDefault(); onZoomChange(next); } }}>
    <div className="workflow-canvas" ref={canvasRef} style={{ zoom: `${zoom}%` }}>
      <svg className="story-link-overlay" aria-hidden="true"><defs><marker id="story-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" /></marker></defs>
        {connectors.map(({ kind, ...line }) => <line key={line.id} {...line} className={kind} markerEnd="url(#story-arrow)" />)}</svg>
      <div className="story-grid" ref={lanesRef} style={{ gridTemplateColumns: `3rem repeat(${flows.length}, 34rem)` }}>
        <div className="grid-corner" />
        {flows.map(flow => <button type="button" key={flow.id} className={`flow-header${flow.id === storyFlows.primaryFlowId ? " primary" : ""}`}
          data-flow-id={flow.id} onClick={linkSource ? () => void createLink({ type: "flow", flowId: flow.id }) : undefined}>
          <span>{flow.title}</span>{flow.id === storyFlows.primaryFlowId && <small>Primary</small>}</button>)}
        {Array.from({ length: rowCount }, (_, index) => index + 1).map(row => <Fragment key={`row:${row}`}>
          <div className="story-row-number">{row}</div>
          {flows.map(flow => {
            const id = flow.placements.find(value => value.row === row)?.sectionId;
            return <GridCell key={`${flow.id}:${row}`} flowId={flow.id} row={row} occupied={Boolean(id)}>{id && <div className="story-flow-item" data-section-id={id}>
          <StorySectionNode key={`${id}:${flow.id}:${row}`} id={id} flowId={flow.id} projectId={project.id} initialDetails={sections[id].details} disabled={saving}
            initialTitle={sections[id].title} expanded={expanded.has(id)} row={row}
            onExpanded={updated => { commit(updated); setExpanded(current => { const next = new Set(current); next.delete(id); return next; }); }}
            characters={project.characters} places={project.places} onAcceptContextSuggestion={onAcceptContextSuggestion}
            characterIds={sections[id].characterIds} placeIds={sections[id].placeIds} onSelectContext={onSelectContext}
            onAssociate={(type, entityId) => void associate(id, { type, id: entityId })} flows={flows}
            onMoveToGrid={(flowId, targetRow) => void moveSection(id, flowId, targetRow)} onMoveToNewFlow={() => void moveToNewFlow(id)}
            linking={Boolean(linkSource)} onRequestLink={() => setLinkSource(id)} onSelectLinkTarget={() => void createLink({ type: "section", sectionId: id })}
            modelRegistry={modelRegistry} geminiModel={geminiModel} onGeminiModelChange={onGeminiModelChange}
            openaiModel={openaiModel} onOpenaiModelChange={onOpenaiModelChange} onRequestDelete={opener => requestDelete(id, opener)}
            onMove={direction => void moveSection(id, flow.id, Math.max(1, row + direction))}
            onToggle={() => setExpanded(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} />
        </div>}</GridCell>;
          })}
        </Fragment>)}</div>
    </div></div>
    <div className="workflow-status"><p role="status" className={error ? "error" : "muted"}>{saving ? "Saving…" : error || "Saved"}</p></div>
    {Object.values(storyFlows.links).length > 0 && <div className="story-links-list"><h3>Story links</h3>{Object.values(storyFlows.links).map(link =>
      <div key={link.id}><span>{sections[link.sourceSectionId]?.title} → {link.target.type === "section" ? sections[link.target.sectionId]?.title : storyFlows.flows[link.target.flowId]?.title}</span>
        <button type="button" className="text-button danger-text" onClick={() => void mutate(`/api/projects/${project.id}/story-links/${link.id}`, undefined, "DELETE")}>Remove link</button></div>)}</div>}
    <dialog ref={deleteDialog} className="delete-dialog" aria-labelledby="delete-section-title" onCancel={event => { event.preventDefault(); if (!deleting) closeDelete(); }}>
      <h2 id="delete-section-title">Delete story section?</h2>{targetSection && <><p className="delete-series-name">“{targetSection.title || "Untitled story section"}”</p><p>This section will be removed from its story flow.</p>
        {descendantCount > 0 && <p><strong>This section also contains {descendantCount} child {descendantCount === 1 ? "section" : "sections"}.</strong><br />Deleting it will permanently remove {descendantCount === 1 ? "that section" : "those sections"} as well.</p>}</>}
      {deleteError && <p className="error" role="alert">{deleteError}</p>}<div className="actions"><button type="button" className="secondary" disabled={deleting} onClick={closeDelete}>Cancel</button>
        <button type="button" className="danger" disabled={deleting} onClick={() => void confirmDelete()}>{deleting ? "Deleting…" : "Delete section"}</button></div>
    </dialog>
  </section>;
}

function GridCell({ flowId, row, occupied, children }: {
  flowId: string; row: number; occupied: boolean; children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `grid:${flowId}:${row}`, data: { type: "grid-cell", flowId, row } });
  return <div ref={setNodeRef} className={`story-grid-cell${occupied ? " occupied" : ""}${isOver ? " is-over" : ""}`}>{children}</div>;
}
