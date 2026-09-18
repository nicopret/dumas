import { test } from "node:test";
import assert from "node:assert/strict";
import { hasSectionAssociation, requestSectionAssociation } from "./section-associations.ts";
import type { DumasProject } from "./project-types.ts";
import { emptyStoryFlows } from "./story-flows.ts";

const characterId = "550e8400-e29b-41d4-a716-446655440000";
const placeId = "550e8400-e29b-41d4-a716-446655440001";
const sectionId = "550e8400-e29b-41d4-a716-446655440002";
const projectId = "550e8400-e29b-41d4-a716-446655440003";
function project(): DumasProject {
  return { schemaVersion: 4, id: projectId, series: { title: "Story", idea: "Idea", premise: "", summary: {
    setup: "", disaster1: "", disaster2: "", disaster3: "", resolution: "",
  }, mainStory: { sections: { [sectionId]: { id: sectionId, title: "Beat", details: "", characterIds: [], placeIds: [] } } },
    storyFlows: emptyStoryFlows([sectionId]) },
  characters: { [characterId]: { id: characterId, name: "Sarah", description: "Novelist" } },
  places: { [placeId]: { id: placeId, name: "Hotel", description: "Scene" } },
  createdAt: "2020-01-01T00:00:00.000Z", updatedAt: "2020-01-01T00:00:00.000Z" };
}

test("drag and keyboard association requests use the same endpoint and returned state", async () => {
  const updated = project(); updated.series.mainStory.sections[sectionId].characterIds = [characterId];
  let requestBody = "";
  const result = await requestSectionAssociation(projectId, sectionId, { type: "character", id: characterId }, async (url, init) => {
    assert.equal(url, `/api/projects/${projectId}/main-story/${sectionId}/associations`);
    requestBody = String(init?.body);
    return new Response(JSON.stringify(updated), { status: 200 });
  });
  assert.deepEqual(JSON.parse(requestBody), { type: "character", entityId: characterId });
  assert.equal(hasSectionAssociation(result, sectionId, "character", characterId), true);
  assert.equal(hasSectionAssociation(result, sectionId, "place", placeId), false);
});

test("failed persistence rejects without mutating current workflow state", async () => {
  const current = project();
  await assert.rejects(requestSectionAssociation(projectId, sectionId, { type: "place", id: placeId }, async () =>
    new Response(JSON.stringify({ error: "Unable to save" }), { status: 500 })));
  assert.deepEqual(current.series.mainStory.sections[sectionId].placeIds, []);
});
