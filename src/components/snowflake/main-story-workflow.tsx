"use client";

import { useState } from "react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { DumasProject, MainStorySectionId } from "@/lib/projects/project-types";
import { StorySectionNode } from "./story-section-node";

export function MainStoryWorkflow({ project }: { project: DumasProject }) {
  const [order, setOrder] = useState(project.series.mainStory.order);
  const [expanded, setExpanded] = useState<Set<MainStorySectionId>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function saveOrder(next: MainStorySectionId[]) {
    setOrder(next);
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/main-story`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: next }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Unable to save Main Story order. Please try again.");
      }
      const result: DumasProject = await response.json();
      setOrder(result.series.mainStory.order);
    } catch (cause) {
      setError(cause instanceof Error && cause.message !== "Failed to fetch"
        ? cause.message : "Unable to save Main Story order. Check your connection and try again.");
    } finally { setSaving(false); }
  }

  function move(id: MainStorySectionId, direction: -1 | 1) {
    const index = order.indexOf(id);
    const destination = index + direction;
    if (saving || destination < 0 || destination >= order.length) return;
    void saveOrder(arrayMove(order, index, destination));
  }

  function dragEnded(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id || saving) return;
    const from = order.indexOf(event.active.id as MainStorySectionId);
    const to = order.indexOf(event.over.id as MainStorySectionId);
    if (from >= 0 && to >= 0) void saveOrder(arrayMove(order, from, to));
  }

  return <section className="main-story" aria-labelledby="main-story-heading">
    <div className="workflow-heading"><p className="muted">Visual workflow</p><h2 id="main-story-heading">Main Story</h2>
      <p>Drag sections into story order, or use the accessible move controls.</p></div>
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnded}>
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <div className="story-flow">
          {order.map((id, index) => <div className="story-flow-item" key={id}>
            <StorySectionNode id={id} projectId={project.id}
              initialDetails={project.series.mainStory.sections[id].details} disabled={saving}
              initialTitle={project.series.summary[id]}
              expanded={expanded.has(id)} first={index === 0} last={index === order.length - 1}
              onMove={direction => move(id, direction)} onToggle={() => setExpanded(current => {
                const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next;
              })} />
            {index < order.length - 1 && <div className="story-connector" aria-hidden="true"><span>↓</span></div>}
          </div>)}
        </div>
      </SortableContext>
    </DndContext>
    <div className="workflow-status">
      <p role="status" aria-live="polite" className={error ? "error" : "muted"}>{saving ? "Saving order…" : error || "Order saved"}</p>
      {error && <button type="button" className="secondary" disabled={saving} onClick={() => void saveOrder(order)}>Retry save</button>}
    </div>
  </section>;
}
