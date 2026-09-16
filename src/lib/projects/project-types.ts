export interface FiveSentenceSummary {
  setup: string;
  disaster1: string;
  disaster2: string;
  disaster3: string;
  resolution: string;
}

export type MainStorySectionId = keyof FiveSentenceSummary;

export interface MainStoryWorkflow {
  order: MainStorySectionId[];
  sections: Record<MainStorySectionId, { details: string }>;
}

export interface DumasProject {
  schemaVersion: 1;
  id: string;
  series: { title: string; premise: string; summary: FiveSentenceSummary; mainStory: MainStoryWorkflow };
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
