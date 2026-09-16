"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { MainStorySectionId } from "@/lib/projects/project-types";
import { SectionDetailEditor } from "./section-detail-editor";

interface StorySectionNodeProps {
  id: MainStorySectionId;
  projectId: string;
  initialDetails: string;
  initialTitle: string;
  expanded: boolean;
  disabled: boolean;
  first: boolean;
  last: boolean;
  onToggle: () => void;
  onMove: (direction: -1 | 1) => void;
}

export function StorySectionNode(props: StorySectionNodeProps) {
  const [title, setTitle] = useState(props.initialTitle);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.id, disabled: props.disabled });
  const visibleTitle = title || "Untitled story section";
  return <article ref={setNodeRef} className={`story-node${isDragging ? " is-dragging" : ""}`}
    style={{ transform: CSS.Transform.toString(transform), transition }}>
    <div className="story-node-header">
      <button type="button" className="story-node-title" onClick={props.onToggle}
        aria-expanded={props.expanded} aria-controls={`story-details-${props.id}`}>
        <span>{visibleTitle}</span><span aria-hidden="true">{props.expanded ? "−" : "+"}</span>
      </button>
      <button type="button" className="drag-handle" disabled={props.disabled}
        aria-label={`Drag ${visibleTitle}`} {...attributes} {...listeners}>⋮⋮</button>
    </div>
    <div id={`story-details-${props.id}`} className="story-details" hidden={!props.expanded}>
      <SectionDetailEditor projectId={props.projectId} sectionId={props.id} initialTitle={props.initialTitle}
        initialDetails={props.initialDetails} onSavedTitle={setTitle} />
    </div>
    <div className="story-node-controls" aria-label={`Reorder ${visibleTitle}`}>
      <button type="button" className="text-button" disabled={props.disabled || props.first} onClick={() => props.onMove(-1)}>Move up</button>
      <button type="button" className="text-button" disabled={props.disabled || props.last} onClick={() => props.onMove(1)}>Move down</button>
    </div>
  </article>;
}
