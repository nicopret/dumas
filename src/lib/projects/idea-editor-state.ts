import type { DumasProject } from "./project-types.ts";

export function needsIdeaOnboarding(project: DumasProject): boolean {
  return !project.series.idea.trim() && Object.values(project.series.storyFlows.flows).every(flow => flow.placements.length === 0);
}

export function countWords(value: string): number {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/u).length : 0;
}
