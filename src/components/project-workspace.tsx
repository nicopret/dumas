"use client";

import { useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type CollisionDetection, type Modifier } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { DumasProject, StoryContextEntity } from "@/lib/projects/project-types";
import type { AiModelRegistry } from "@/lib/ai/model-registry";
import { persistedStoryContextSelection, type StoryContextKind, type StoryContextSelection, type StoryContextSuggestion } from "@/lib/projects/story-context-state";
import { MainStoryWorkflow } from "./snowflake/main-story-workflow";
import { StoryContextPane } from "./story-context/story-context-pane";
import { StoryIdeaEditor } from "./story-idea-editor";
import { needsIdeaOnboarding } from "@/lib/projects/idea-editor-state";
import { compensateDragTransform, DEFAULT_WORKFLOW_ZOOM } from "@/lib/projects/workflow-zoom";

const storyCanvasCollisionDetection: CollisionDetection = args => {
  const type = args.active.data.current?.type;
  const targetType = type === "story-section" ? "grid-cell"
    : type === "character" || type === "place" ? "story-card" : undefined;
  if (!targetType) return closestCenter(args);
  return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter(container =>
    container.data.current?.type === targetType) });
};

export function ProjectWorkspace({ initialProject, modelRegistry }: { initialProject: DumasProject; modelRegistry: AiModelRegistry }) {
  const [project, setProject] = useState(initialProject);
  const [selection, setSelection] = useState<StoryContextSelection | null>(null);
  const [error, setError] = useState("");
  const [geminiModel, setGeminiModel] = useState(modelRegistry.gemini.defaultModel);
  const [openaiModel, setOpenaiModel] = useState(modelRegistry.openai.defaultModel);
  const [editingIdea, setEditingIdea] = useState(() => needsIdeaOnboarding(initialProject));
  const [workflowZoom, setWorkflowZoom] = useState(DEFAULT_WORKFLOW_ZOOM);
  const [storyContextCollapsed, setStoryContextCollapsed] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  async function accept(kind: StoryContextKind, suggestion: StoryContextSuggestion) {
    setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/story-context/${kind}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(suggestion),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Unable to save this Story Context item.");
      setProject(body.project as DumasProject);
      setSelection(persistedStoryContextSelection(kind, body.entity as StoryContextEntity));
      return { entity: body.entity as StoryContextEntity, duplicate: Boolean(body.duplicate) };
    } catch (cause) {
      setError(cause instanceof Error && cause.message !== "Failed to fetch" ? cause.message
        : "Unable to save this Story Context item. Check your connection and try again.");
      throw cause;
    }
  }

  if (editingIdea) return <StoryIdeaEditor project={project} onboarding={needsIdeaOnboarding(project)}
    onSaved={updated => { setProject(updated); setEditingIdea(false); }}
    onCancel={needsIdeaOnboarding(project) ? undefined : () => setEditingIdea(false)} />;

  const compensateSectionDrag: Modifier = ({ active, transform }) =>
    active?.data.current?.type === "story-section" ? compensateDragTransform(transform, workflowZoom) : transform;

  return <DndContext sensors={sensors} collisionDetection={storyCanvasCollisionDetection} modifiers={[compensateSectionDrag]}><div className={`project-workspace${storyContextCollapsed ? " story-context-collapsed" : ""}`}>
    <div className="workflow-pane"><MainStoryWorkflow project={project}
      onProjectChange={setProject} onAcceptContextSuggestion={accept} modelRegistry={modelRegistry}
      onSelectContext={(kind, entity) => setSelection(persistedStoryContextSelection(kind, entity))}
      onEditIdea={() => setEditingIdea(true)}
      zoom={workflowZoom} onZoomChange={setWorkflowZoom}
      geminiModel={geminiModel} onGeminiModelChange={setGeminiModel}
      openaiModel={openaiModel} onOpenaiModelChange={setOpenaiModel} /></div>
    <StoryContextPane characters={project.characters} places={project.places}
      selection={selection} error={error} onSelect={setSelection}
      collapsed={storyContextCollapsed} onCollapsedChange={setStoryContextCollapsed} />
  </div></DndContext>;
}
