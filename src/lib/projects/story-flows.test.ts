import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { parseProject } from "./project-repository.ts";
import { emptyStoryFlows, getFlowPlacementsSorted, getHighestOccupiedRow, hasDuplicateStoryLink,
  isStoryFlows, movePlacement, sectionFlow } from "./story-flows.ts";

test("schema v3 ordered flows migrate to spaced grid rows without changing UUIDs", () => {
  const id = randomUUID(); const a = randomUUID(); const b = randomUUID();
  const sections = Object.fromEntries([a, b].map(sectionId => [sectionId, {
    id: sectionId, title: sectionId, details: "Detail", characterIds: [], placeIds: [],
  }]));
  const raw = JSON.stringify({ schemaVersion: 3, id, series: { title: "Legacy", idea: "Idea", premise: "", summary: {
    setup: "", disaster1: "", disaster2: "", disaster3: "", resolution: "",
  }, mainStory: { sections }, storyFlows: { primaryFlowId: "main", flows: {
    main: { id: "main", title: "Main Story", sectionIds: [a, b] },
  }, links: {} } }, characters: {}, places: {}, createdAt: "2020-01-01T00:00:00.000Z", updatedAt: "2020-01-01T00:00:00.000Z" });
  const project = parseProject(raw, id);
  assert.equal(project.schemaVersion, 4);
  assert.deepEqual(project.series.storyFlows.flows.main.placements, [{ sectionId: a, row: 1 }, { sectionId: b, row: 3 }]);
  assert.deepEqual(Object.keys(project.series.mainStory.sections), [a, b]);
});

test("placements move vertically and horizontally without compacting gaps", () => {
  const a = randomUUID(); const b = randomUUID(); const targetId = randomUUID();
  const flows = emptyStoryFlows([a, b]); flows.flows[targetId] = { id: targetId, title: "Investigation", placements: [] };
  const vertical = movePlacement(flows, b, "main", 9)!;
  assert.deepEqual(vertical.flows.main.placements, [{ sectionId: a, row: 1 }, { sectionId: b, row: 9 }]);
  const horizontal = movePlacement(vertical, b, targetId, 1)!;
  assert.deepEqual(horizontal.flows.main.placements, [{ sectionId: a, row: 1 }]);
  assert.deepEqual(horizontal.flows[targetId].placements, [{ sectionId: b, row: 1 }]);
  assert.equal(sectionFlow(horizontal, b)?.id, targetId);
  assert.equal(getHighestOccupiedRow(horizontal), 1);
});

test("the same row is allowed across flows and collisions shift only a contiguous run", () => {
  const a = randomUUID(); const b = randomUUID(); const c = randomUUID(); const targetId = randomUUID();
  const flows = emptyStoryFlows([a, b]);
  flows.flows.main.placements = [{ sectionId: a, row: 3 }, { sectionId: b, row: 4 }];
  flows.flows[targetId] = { id: targetId, title: "Thread", placements: [{ sectionId: c, row: 3 }] };
  const moved = movePlacement(flows, c, "main", 3)!;
  assert.deepEqual(getFlowPlacementsSorted(moved.flows.main), [
    { sectionId: c, row: 3 }, { sectionId: a, row: 4 }, { sectionId: b, row: 5 },
  ]);
  assert.equal(isStoryFlows(moved, { [a]: {}, [b]: {}, [c]: {} }), true);
});

test("story links survive placement moves", () => {
  const source = randomUUID(); const target = randomUUID(); const flowId = randomUUID();
  const flows = emptyStoryFlows([source, target]); flows.flows[flowId] = { id: flowId, title: "Thread", placements: [] };
  const linkId = randomUUID(); flows.links[linkId] = { id: linkId, sourceSectionId: source, target: { type: "section", sectionId: target } };
  const moved = movePlacement(flows, target, flowId, 12)!;
  assert.deepEqual(moved.links, flows.links);
  assert.equal(hasDuplicateStoryLink(moved, source, { type: "section", sectionId: target }), true);
});
