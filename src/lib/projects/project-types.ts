export interface FiveSentenceSummary {
  setup: string;
  disaster1: string;
  disaster2: string;
  disaster3: string;
  resolution: string;
}

export type LegacyMainStorySectionId = keyof FiveSentenceSummary;
export type MainStorySectionId = string;

export interface MainStorySection {
  id: string;
  title: string;
  details: string;
  parentId?: string;
  childIds?: string[];
  characterIds: string[];
  placeIds: string[];
}

export interface MainStoryWorkflow {
  sections: Record<MainStorySectionId, MainStorySection>;
}

export interface StoryPlacement { sectionId: MainStorySectionId; row: number }
export interface StoryFlow { id: string; title: string; placements: StoryPlacement[] }
export type StoryLinkTarget = { type: "section"; sectionId: MainStorySectionId } | { type: "flow"; flowId: string };
export interface StoryLink { id: string; sourceSectionId: MainStorySectionId; target: StoryLinkTarget }
export interface StoryFlows {
  primaryFlowId: string;
  flows: Record<string, StoryFlow>;
  links: Record<string, StoryLink>;
}

export interface StoryContextEntity {
  id: string;
  name: string;
  description: string;
  imageUrl?: string | null;
}

export type StoryContextCollection = Record<string, StoryContextEntity>;

export interface DumasProject {
  schemaVersion: 4;
  id: string;
  series: { title: string; idea: string; premise: string; summary: FiveSentenceSummary;
    mainStory: MainStoryWorkflow; storyFlows: StoryFlows };
  characters: StoryContextCollection;
  places: StoryContextCollection;
  createdAt: string;
  updatedAt: string;
}

export function emptySummary(): FiveSentenceSummary {
  return { setup: "", disaster1: "", disaster2: "", disaster3: "", resolution: "" };
}
export interface ProjectSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}
