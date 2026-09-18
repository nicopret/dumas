import { test } from "node:test";
import assert from "node:assert/strict";
import { existingExpansionMappings, persistentExpansionHeading } from "./expansion-associations.ts";

test("accepted and existing refs map to permanent IDs across heading subsets", () => {
  const existingCharacter = "550e8400-e29b-41d4-a716-446655440000";
  const acceptedCharacter = "550e8400-e29b-41d4-a716-446655440001";
  const acceptedPlace = "550e8400-e29b-41d4-a716-446655440002";
  const mappings = existingExpansionMappings(
    { [existingCharacter]: { id: existingCharacter, name: "Sarah", description: "Novelist" } }, {},
    [{ ref: "character-1", name: "Sarah", description: "Novelist", existingId: existingCharacter },
      { ref: "character-2", name: "Harris", description: "Detective", existingId: null },
      { ref: "character-3", name: "Witness", description: "Unaccepted", existingId: null }],
    [{ ref: "place-1", name: "Hotel", description: "Crime scene", existingId: null }]);
  mappings.characters["character-2"] = acceptedCharacter;
  mappings.places["place-1"] = acceptedPlace;
  const first = persistentExpansionHeading({ id: "heading-1", title: "Discovery",
    characterRefs: ["character-1", "character-2", "character-3", "character-2"], placeRefs: ["place-1", "place-1"] }, mappings);
  const second = persistentExpansionHeading({ id: "heading-2", title: "Interview",
    characterRefs: ["character-1"], placeRefs: [] }, mappings);
  assert.deepEqual(first, { title: "Discovery", characterIds: [existingCharacter, acceptedCharacter], placeIds: [acceptedPlace] });
  assert.deepEqual(second, { title: "Interview", characterIds: [existingCharacter], placeIds: [] });
  assert.doesNotMatch(JSON.stringify([first, second]), /character-1|character-2|character-3|place-1/);
});

test("parent associations are not copied when refs are absent", () => {
  assert.deepEqual(persistentExpansionHeading({ id: "heading", title: "Beat", characterRefs: [], placeRefs: [] },
    { characters: {}, places: {} }), { title: "Beat", characterIds: [], placeIds: [] });
});
