"use client";

import { useState } from "react";
import type { AiModelRegistry } from "@/lib/ai/model-registry";
import type { DumasProject } from "@/lib/projects/project-types";
import { ProjectWorkspace } from "./project-workspace";
import { StoryIdeaEditor } from "./story-idea-editor";

export function ProjectOnboarding({ initialProject, modelRegistry }: {
  initialProject: DumasProject;
  modelRegistry: AiModelRegistry;
}) {
  const [project, setProject] = useState(initialProject);
  if (project.series.idea.trim()) {
    return <ProjectWorkspace initialProject={project} modelRegistry={modelRegistry} />;
  }
  return <StoryIdeaEditor project={project} onboarding onSaved={setProject} />;
}
