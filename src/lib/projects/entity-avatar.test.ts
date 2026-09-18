import { test } from "node:test";
import assert from "node:assert/strict";
import { entityInitials, usableEntityImage, visibleEntityAvatars, workflowEntityAvatarLayout } from "./entity-avatar.ts";
import type { StoryContextEntity } from "./project-types.ts";

const entity = (index: number, name = `Entity ${index}`): StoryContextEntity => ({ id: String(index), name, description: "Description" });

test("avatar initials cover character, place, single-word, and blank names", () => {
  assert.equal(entityInitials("Sarah Mercer"), "SM");
  assert.equal(entityInitials("Art Gallery"), "AG");
  assert.equal(entityInitials("Harris"), "HA");
  assert.equal(entityInitials("Q"), "Q");
  assert.equal(entityInitials("   "), "?");
});

test("usable images display until an image error requests initials fallback", () => {
  assert.equal(usableEntityImage(" https://example.test/avatar.jpg "), "https://example.test/avatar.jpg");
  assert.equal(usableEntityImage("https://example.test/avatar.jpg", true), null);
  assert.equal(usableEntityImage(" "), null);
});

test("workflow avatar layout keeps characters before places and conditionally separates groups", () => {
  const character = entity(1, "Sarah Mercer"); const place = entity(2, "Art Gallery");
  assert.deepEqual(workflowEntityAvatarLayout([character], [place]), {
    characters: { visible: [character], overflow: 0 }, places: { visible: [place], overflow: 0 }, showSeparator: true,
  });
  assert.equal(workflowEntityAvatarLayout([character], []).showSeparator, false);
  assert.equal(workflowEntityAvatarLayout([], [place]).showSeparator, false);
  assert.deepEqual(workflowEntityAvatarLayout([], []), {
    characters: { visible: [], overflow: 0 }, places: { visible: [], overflow: 0 }, showSeparator: false,
  });
});

test("each type shows at most five direct avatars and reports overflow", () => {
  const result = visibleEntityAvatars(Array.from({ length: 8 }, (_, index) => entity(index)));
  assert.equal(result.visible.length, 5);
  assert.equal(result.overflow, 3);
});
