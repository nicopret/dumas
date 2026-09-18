"use client";

import { useCallback, useState } from "react";
import { useDndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { DumasProject, MainStorySectionId, StoryContextCollection, StoryContextEntity, StoryFlow } from "@/lib/projects/project-types";
import type { StoryContextKind, StoryContextSuggestion } from "@/lib/projects/story-context-state";
import { isSectionIncomplete } from "@/lib/projects/rewrite-editor-state";
import { SectionDetailEditor } from "./section-detail-editor";
import type { AiModelRegistry } from "@/lib/ai/model-registry";
import type { SectionEntityType } from "@/lib/projects/section-associations";
import { EntityAvatar } from "@/components/entity-avatar";
import { visibleEntityAvatars, workflowEntityAvatarLayout } from "@/lib/projects/entity-avatar";

interface StorySectionNodeProps {
  id: MainStorySectionId;
  flowId: string;
  projectId: string;
  initialDetails: string;
  initialTitle: string;
  expanded: boolean;
  disabled: boolean;
  row: number;
  onToggle: () => void;
  onMove: (direction: -1 | 1) => void;
  onRequestDelete: (opener: HTMLButtonElement) => void;
  onExpanded: (project: DumasProject) => void;
  characters: StoryContextCollection;
  places: StoryContextCollection;
  onAcceptContextSuggestion: (kind: StoryContextKind, suggestion: StoryContextSuggestion) => Promise<{ entity: StoryContextEntity; duplicate: boolean }>;
  characterIds: string[];
  placeIds: string[];
  onSelectContext: (kind: StoryContextKind, entity: StoryContextEntity) => void;
  onAssociate: (type: SectionEntityType, entityId: string) => void;
  flows: StoryFlow[];
  onMoveToGrid: (flowId: string, row: number) => void;
  onMoveToNewFlow: () => void;
  linking: boolean;
  onRequestLink: () => void;
  onSelectLinkTarget: () => void;
  modelRegistry: AiModelRegistry;
  geminiModel: string; onGeminiModelChange: (model: string) => void;
  openaiModel: string; onOpenaiModelChange: (model: string) => void;
}

export function StorySectionNode(props: StorySectionNodeProps) {
  const [title, setTitle] = useState(props.initialTitle);
  const [details, setDetails] = useState(props.initialDetails);
  const [characterChoice, setCharacterChoice] = useState("");
  const [placeChoice, setPlaceChoice] = useState("");
  const [moveFlow, setMoveFlow] = useState(props.flowId);
  const [moveRow, setMoveRow] = useState(String(props.row));
  const { active } = useDndContext();
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: `section:${props.id}`, disabled: props.disabled, data: { type: "story-section", sectionId: props.id, flowId: props.flowId },
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `section-drop:${props.id}`,
    data: { type: "story-card", sectionId: props.id, flowId: props.flowId, row: props.row } });
  const setNodeRef = useCallback((node: HTMLElement | null) => { setDragRef(node); setDropRef(node); }, [setDragRef, setDropRef]);
  const visibleTitle = title || "Untitled story section";
  const entityIsOver = isOver && (active?.data.current?.type === "character" || active?.data.current?.type === "place");
  const associatedCharacters = props.characterIds.flatMap(id => props.characters[id] ? [props.characters[id]] : []);
  const associatedPlaces = props.placeIds.flatMap(id => props.places[id] ? [props.places[id]] : []);
  const avatarLayout = workflowEntityAvatarLayout(associatedCharacters, associatedPlaces);
  return <article ref={setNodeRef} className={`story-node${isDragging ? " is-dragging" : ""}${entityIsOver ? " association-drop-target" : ""}`}
    style={{ transform: CSS.Transform.toString(transform) }}>
    <div className="story-node-header">
      <button type="button" className="story-node-title" onClick={props.linking ? props.onSelectLinkTarget : props.onToggle}
        aria-expanded={props.expanded} aria-controls={`story-details-${props.id}`}>
        <span className="story-title-text">{isSectionIncomplete(details) && <span className="incomplete-indicator"
          role="img" aria-label="Section detail incomplete" title="Section detail incomplete">!</span>}{visibleTitle}</span>
      </button>
      {(associatedCharacters.length > 0 || associatedPlaces.length > 0) && <div className="header-entity-avatars">
        <HeaderAvatarGroup kind="character" entities={associatedCharacters} onSelect={entity => props.onSelectContext("characters", entity)} />
        {avatarLayout.showSeparator && <span className="avatar-separator" aria-hidden="true">|</span>}
        <HeaderAvatarGroup kind="place" entities={associatedPlaces} onSelect={entity => props.onSelectContext("places", entity)} />
      </div>}
      <button type="button" className="node-toggle" onClick={props.onToggle} aria-label={`${props.expanded ? "Collapse" : "Expand"} ${visibleTitle}`}
        aria-expanded={props.expanded} aria-controls={`story-details-${props.id}`}><span aria-hidden="true">{props.expanded ? "−" : "+"}</span></button>
      <button type="button" className="drag-handle" disabled={props.disabled}
        aria-label={`Drag ${visibleTitle}`} {...attributes} {...listeners}>⋮⋮</button>
      <button type="button" className="node-delete" disabled={props.disabled}
        aria-label={`Delete ${visibleTitle}`} onClick={event => props.onRequestDelete(event.currentTarget)}>Delete</button>
    </div>
    <div id={`story-details-${props.id}`} className="story-details" hidden={!props.expanded}>
      <div className="association-selectors" aria-label="Add Story Context association">
        <label>Add character <select value={characterChoice} onChange={event => { const id = event.target.value; setCharacterChoice("");
          if (id) props.onAssociate("character", id); }}><option value="">Select…</option>
          {Object.values(props.characters).filter(entity => !props.characterIds.includes(entity.id)).map(entity =>
            <option value={entity.id} key={entity.id}>{entity.name}</option>)}</select></label>
        <label>Add place <select value={placeChoice} onChange={event => { const id = event.target.value; setPlaceChoice("");
          if (id) props.onAssociate("place", id); }}><option value="">Select…</option>
          {Object.values(props.places).filter(entity => !props.placeIds.includes(entity.id)).map(entity =>
            <option value={entity.id} key={entity.id}>{entity.name}</option>)}</select></label>
      </div>
      <div className="flow-section-actions"><label>Flow <select value={moveFlow} onChange={event => setMoveFlow(event.target.value)}>
        {props.flows.map(flow => <option value={flow.id} key={flow.id}>{flow.title}</option>)}</select></label>
        <label>Position <input type="number" min="1" step="1" value={moveRow} onChange={event => setMoveRow(event.target.value)} /></label>
        <button type="button" className="secondary" disabled={!/^\d+$/.test(moveRow) || Number(moveRow) < 1}
          onClick={() => props.onMoveToGrid(moveFlow, Number(moveRow))}>Move</button>
        <button type="button" className="secondary" onClick={props.onMoveToNewFlow}>Move to new flow</button></div>
      <SectionDetailEditor projectId={props.projectId} sectionId={props.id} initialTitle={props.initialTitle}
        initialDetails={props.initialDetails} onSavedTitle={setTitle} onDetailsChange={setDetails}
        onExpanded={props.onExpanded} characters={props.characters} places={props.places}
        modelRegistry={props.modelRegistry} geminiModel={props.geminiModel} onGeminiModelChange={props.onGeminiModelChange}
        openaiModel={props.openaiModel} onOpenaiModelChange={props.onOpenaiModelChange}
        onAcceptContextSuggestion={props.onAcceptContextSuggestion} onSelectContext={props.onSelectContext} />
    </div>
    <div className="story-node-controls" aria-label={`Reorder ${visibleTitle}`}>
      <button type="button" className="text-button" onClick={props.onRequestLink}>Link</button>
      <button type="button" className="text-button" disabled={props.disabled || props.row === 1} onClick={() => props.onMove(-1)}>Move up one row</button>
      <button type="button" className="text-button" disabled={props.disabled} onClick={() => props.onMove(1)}>Move down one row</button>
    </div>
  </article>;
}

function HeaderAvatarGroup({ kind, entities, onSelect }: {
  kind: "character" | "place"; entities: StoryContextEntity[]; onSelect: (entity: StoryContextEntity) => void;
}) {
  const { visible, overflow } = visibleEntityAvatars(entities);
  return <div className="header-avatar-group">{visible.map(entity => <button type="button" className="header-avatar-button" key={entity.id}
    title={entity.name} aria-label={`${kind === "character" ? "Character" : "Place"}: ${entity.name}`}
    onClick={event => { event.stopPropagation(); onSelect(entity); }}>
    <EntityAvatar name={entity.name} imageUrl={entity.imageUrl} kind={kind} size="small" />
  </button>)}{overflow > 0 && <span className="entity-avatar small overflow" role="img"
    title={`${overflow} additional ${kind}${overflow === 1 ? "" : "s"}`}
    aria-label={`${overflow} additional ${kind}${overflow === 1 ? "" : "s"}`}>+{overflow}</span>}</div>;
}
