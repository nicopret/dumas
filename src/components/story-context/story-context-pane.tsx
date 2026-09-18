"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { StoryContextCollection } from "@/lib/projects/project-types";
import { visibleStoryContextGroups, type StoryContextKind, type StoryContextSelection } from "@/lib/projects/story-context-state";
import { EntityAvatar } from "@/components/entity-avatar";

export function StoryContextPane({ characters, places, selection, error, onSelect, collapsed, onCollapsedChange }: {
  characters: StoryContextCollection;
  places: StoryContextCollection;
  selection: StoryContextSelection | null;
  error: string;
  onSelect: (selection: StoryContextSelection) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}) {
  const selectedId = selection && "id" in selection.item ? selection.item.id : null;
  const group = (kind: StoryContextKind, title: string, collection: StoryContextCollection) =>
    <section className="context-group">{!collapsed && <h3>{title}</h3>}
      <ul className="context-list">
        {Object.values(collection).map(item => <DraggableContextEntity key={item.id} kind={kind} item={item}
          selected={selection?.kind === kind && selectedId === item.id} collapsed={collapsed} onSelect={() => {
            onSelect({ kind, item, suggested: false });
            if (collapsed) onCollapsedChange(false);
          }} />)}
      </ul>
    </section>;

  const groups = visibleStoryContextGroups(characters, places);
  const hasCharacters = groups.includes("characters");
  const hasPlaces = groups.includes("places");
  return <aside className={`story-context-pane${collapsed ? " collapsed" : ""}`} aria-label="Story Context">
    <div className="story-context-header">
      {!collapsed && <h2>Story Context</h2>}
      <button type="button" className="story-context-toggle"
        aria-label={`${collapsed ? "Expand" : "Collapse"} Story Context`}
        title={`${collapsed ? "Expand" : "Collapse"} Story Context`}
        onClick={() => onCollapsedChange(!collapsed)}>
        <span aria-hidden="true">{collapsed ? "‹" : "›"}</span>
      </button>
    </div>
    {!collapsed && !hasCharacters && !hasPlaces && <p className="muted">No story context added yet.</p>}
    {hasCharacters && group("characters", "Characters", characters)}
    {hasPlaces && group("places", "Places", places)}
    {!collapsed && error && <p className="error" role="alert">{error}</p>}
    {!collapsed && selection && <section className="context-detail"><p className="muted">Selected item detail</p>
      <h3>{selection.item.name}</h3><p>{selection.item.description}</p>
    </section>}
  </aside>;
}

function DraggableContextEntity({ kind, item, selected, collapsed, onSelect }: {
  kind: StoryContextKind; item: StoryContextCollection[string]; selected: boolean; collapsed: boolean; onSelect: () => void;
}) {
  const type = kind === "characters" ? "character" : "place";
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `context:${type}:${item.id}`, data: { type, id: item.id },
  });
  const dragProps = collapsed ? { ...attributes, ...listeners } : {};
  return <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform) }} className={isDragging ? "is-dragging" : ""}>
    <button type="button" className={selected ? "selected" : ""} onClick={() => { if (!isDragging) onSelect(); }}
      title={collapsed ? item.name : undefined} aria-label={collapsed ? `${type === "character" ? "Character" : "Place"}: ${item.name}` : undefined}
      {...dragProps}>
      <EntityAvatar name={item.name} imageUrl={item.imageUrl} kind={type} size="medium" />{!collapsed && <span>{item.name}</span>}
    </button>
    {!collapsed && <button type="button" className="context-drag-handle" aria-label={`Drag ${item.name} to a story section`}
      {...attributes} {...listeners}><span aria-hidden="true">⋮⋮</span></button>
    }
  </li>;
}
