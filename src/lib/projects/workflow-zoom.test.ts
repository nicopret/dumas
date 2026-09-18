import { test } from "node:test";
import assert from "node:assert/strict";
import { changeWorkflowZoom, clampWorkflowZoom, compensateDragTransform, DEFAULT_WORKFLOW_ZOOM,
  fitWorkflowZoom, keyboardWorkflowZoom, wheelWorkflowZoom } from "./workflow-zoom.ts";

test("workflow zoom defaults, steps, resets, and clamps from 25% through 150%", () => {
  assert.equal(DEFAULT_WORKFLOW_ZOOM, 100);
  assert.equal(changeWorkflowZoom(100, 1), 110);
  assert.equal(changeWorkflowZoom(100, -1), 90);
  assert.equal(clampWorkflowZoom(-500), 25);
  assert.equal(clampWorkflowZoom(500), 150);
  assert.equal(keyboardWorkflowZoom(75, "0", true), 100);
});

test("Fit uses current width and remains within the supported range", () => {
  assert.equal(fitWorkflowZoom(1100, 2200), 50);
  assert.equal(fitWorkflowZoom(100, 2000), 25);
  assert.equal(fitWorkflowZoom(2000, 500), 150);
  assert.equal(fitWorkflowZoom(0, 500), 100);
});

test("Ctrl or Cmd wheel changes workflow zoom while ordinary wheel leaves it alone", () => {
  assert.equal(wheelWorkflowZoom(100, -10, true), 110);
  assert.equal(wheelWorkflowZoom(100, 10, true), 90);
  assert.equal(wheelWorkflowZoom(100, -10, false), 100);
  assert.equal(keyboardWorkflowZoom(75, "+", true), 85);
  assert.equal(keyboardWorkflowZoom(75, "-", false), 75);
});

test("section drag transforms preserve pointer distance at every required zoom", () => {
  for (const zoom of [50, 75, 100, 125, 150]) {
    const adjusted = compensateDragTransform({ x: 120, y: 80, scaleX: 1, scaleY: 1 }, zoom);
    assert.equal(Math.round(adjusted.x * zoom / 100), 120);
    assert.equal(Math.round(adjusted.y * zoom / 100), 80);
    assert.equal(adjusted.scaleX, 1);
  }
});

test("zoom calculations are UI-only and cannot alter project data or persisted links", () => {
  const project = { updatedAt: "2020-01-01T00:00:00.000Z", storyFlows: { links: { link: {
    sourceSectionId: "a", target: { type: "section", sectionId: "b" },
  } } } };
  const before = structuredClone(project);
  let zoom = DEFAULT_WORKFLOW_ZOOM;
  zoom = changeWorkflowZoom(zoom, -1); zoom = fitWorkflowZoom(800, 1600);
  assert.equal(zoom, 50);
  assert.deepEqual(project, before);
  assert.ok(project.storyFlows.links.link);
});
