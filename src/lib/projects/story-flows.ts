import type { MainStorySectionId, StoryFlow, StoryFlows, StoryLinkTarget, StoryPlacement } from "./project-types.ts";

export const PRIMARY_FLOW_ID = "main";
export const MIGRATION_ROW_SPACING = 2;
export const GRID_TRAILING_ROWS = 10;

export function placementsFromOrder(sectionIds: MainStorySectionId[]): StoryPlacement[] {
  return sectionIds.map((sectionId, index) => ({ sectionId, row: index * MIGRATION_ROW_SPACING + 1 }));
}

export function emptyStoryFlows(sectionIds: MainStorySectionId[] = []): StoryFlows {
  return { primaryFlowId: PRIMARY_FLOW_ID, flows: { [PRIMARY_FLOW_ID]: {
    id: PRIMARY_FLOW_ID, title: "Main Story", placements: placementsFromOrder(sectionIds),
  } }, links: {} };
}

export function getFlowPlacementsSorted(flow: StoryFlow): StoryPlacement[] {
  return [...flow.placements].sort((a, b) => a.row - b.row || a.sectionId.localeCompare(b.sectionId));
}

export function allFlowSectionIds(storyFlows: StoryFlows): string[] {
  return Object.values(storyFlows.flows).flatMap(flow => flow.placements.map(placement => placement.sectionId));
}

export function sectionFlow(storyFlows: StoryFlows, sectionId: string): StoryFlow | undefined {
  return Object.values(storyFlows.flows).find(flow => flow.placements.some(placement => placement.sectionId === sectionId));
}

export function getSectionPlacement(storyFlows: StoryFlows, sectionId: string): { flow: StoryFlow; placement: StoryPlacement } | undefined {
  const flow = sectionFlow(storyFlows, sectionId);
  const placement = flow?.placements.find(value => value.sectionId === sectionId);
  return flow && placement ? { flow, placement } : undefined;
}

export function getHighestOccupiedRow(storyFlows: StoryFlows): number {
  return Math.max(0, ...Object.values(storyFlows.flows).flatMap(flow => flow.placements.map(placement => placement.row)));
}

export function isStoryFlows(value: unknown, sections: Record<string, unknown>): value is StoryFlows {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoryFlows>;
  if (typeof candidate.primaryFlowId !== "string" || !candidate.flows || typeof candidate.flows !== "object" ||
      !candidate.links || typeof candidate.links !== "object" || !candidate.flows[candidate.primaryFlowId]) return false;
  const flows = Object.entries(candidate.flows);
  if (!flows.every(([id, flow]) => flow?.id === id && typeof flow.title === "string" && Boolean(flow.title.trim()) &&
      Array.isArray(flow.placements) && new Set(flow.placements.map(value => value?.sectionId)).size === flow.placements.length &&
      new Set(flow.placements.map(value => value?.row)).size === flow.placements.length && flow.placements.every(value =>
        value && typeof value.sectionId === "string" && value.sectionId in sections && Number.isInteger(value.row) && value.row > 0))) return false;
  const assigned = flows.flatMap(([, flow]) => flow.placements.map(value => value.sectionId));
  if (new Set(assigned).size !== assigned.length) return false;
  return Object.entries(candidate.links).every(([id, link]) => link?.id === id && link.sourceSectionId in sections &&
    (link.target?.type === "section" ? link.target.sectionId in sections : link.target?.type === "flow" && link.target.flowId in candidate.flows!));
}

export function migrateOrderedStoryFlows(value: unknown, sections: Record<string, unknown>): StoryFlows | null {
  if (!value || typeof value !== "object") return null;
  const source = value as { primaryFlowId?: unknown; flows?: Record<string, { id?: unknown; title?: unknown; sectionIds?: unknown }>; links?: unknown };
  if (typeof source.primaryFlowId !== "string" || !source.flows || !source.flows[source.primaryFlowId] || !source.links || typeof source.links !== "object") return null;
  const entries = Object.entries(source.flows);
  if (!entries.every(([id, flow]) => flow?.id === id && typeof flow.title === "string" && Boolean(flow.title.trim()) &&
      Array.isArray(flow.sectionIds) && flow.sectionIds.every(sectionId => typeof sectionId === "string" && sectionId in sections))) return null;
  const assigned = entries.flatMap(([, flow]) => flow.sectionIds as string[]);
  if (new Set(assigned).size !== assigned.length) return null;
  const migrated = { primaryFlowId: source.primaryFlowId, flows: Object.fromEntries(entries.map(([id, flow]) => [id, {
    id, title: flow.title as string, placements: placementsFromOrder(flow.sectionIds as string[]),
  }])), links: source.links };
  return isStoryFlows(migrated, sections) ? migrated : null;
}

export function movePlacement(storyFlows: StoryFlows, sectionId: string, targetFlowId: string, targetRow: number): StoryFlows | null {
  if (!storyFlows.flows[targetFlowId] || !Number.isInteger(targetRow) || targetRow < 1) return null;
  const flows = Object.fromEntries(Object.entries(storyFlows.flows).map(([id, flow]) => [id, {
    ...flow, placements: flow.placements.filter(value => value.sectionId !== sectionId).map(value => ({ ...value })),
  }]));
  const target = flows[targetFlowId];
  const byRow = new Map(target.placements.map(value => [value.row, value]));
  let row = targetRow;
  while (byRow.has(row)) row += 1;
  for (let occupiedRow = row - 1; occupiedRow >= targetRow; occupiedRow -= 1) {
    const occupant = byRow.get(occupiedRow)!;
    byRow.delete(occupiedRow); occupant.row = occupiedRow + 1; byRow.set(occupiedRow + 1, occupant);
  }
  target.placements.push({ sectionId, row: targetRow });
  target.placements = getFlowPlacementsSorted(target);
  return { ...storyFlows, flows };
}

export function hasDuplicateStoryLink(storyFlows: StoryFlows, sourceSectionId: string, target: StoryLinkTarget): boolean {
  return Object.values(storyFlows.links).some(link => link.sourceSectionId === sourceSectionId && link.target.type === target.type &&
    (target.type === "section" ? link.target.type === "section" && link.target.sectionId === target.sectionId
      : link.target.type === "flow" && link.target.flowId === target.flowId));
}
