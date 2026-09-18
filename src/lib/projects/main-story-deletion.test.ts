import { test } from "node:test";
import assert from "node:assert/strict";
import { deleteFromMainStory, mainStoryDeletionIds, requestMainStorySectionDeletion } from "./main-story-deletion.ts";
import type { MainStoryWorkflow } from "./project-types.ts";

function workflow(): MainStoryWorkflow {
  return { sections: {
    a: { id: "a", title: "A", details: "A details", characterIds: [], placeIds: [] },
    parent: { id: "parent", title: "Parent", details: "Parent details", childIds: ["child", "sibling"], characterIds: [], placeIds: [] },
    child: { id: "child", title: "Child", details: "Child details", parentId: "parent", childIds: ["grandchild"], characterIds: [], placeIds: [] },
    grandchild: { id: "grandchild", title: "Grandchild", details: "Grandchild details", parentId: "child", characterIds: [], placeIds: [] },
    sibling: { id: "sibling", title: "Sibling", details: "Sibling details", parentId: "parent", characterIds: [], placeIds: [] },
    b: { id: "b", title: "B", details: "B details", characterIds: [], placeIds: [] },
    last: { id: "last", title: "Last", details: "Last details", characterIds: [], placeIds: [] },
  } };
}

test("deletion plan includes the selected section and every descendant", () => {
  assert.deepEqual([...mainStoryDeletionIds(workflow(), "child")!], ["child", "grandchild"]);
});

test("deleting a child preserves surrounding order and cleans its parent's child IDs", () => {
  const original = workflow();
  const result = deleteFromMainStory(original, "child")!;
  assert.equal(result.sections.child, undefined);
  assert.equal(result.sections.grandchild, undefined);
  assert.deepEqual(result.sections.parent.childIds, ["sibling"]);
  assert.deepEqual(result.sections.a, original.sections.a);
  assert.deepEqual(result.sections.b, original.sections.b);
  assert.deepEqual(result.sections.sibling, original.sections.sibling);
});

test("deleting the final section produces a valid empty workflow without placeholders", () => {
  const result = deleteFromMainStory({ sections: {
    only: { id: "only", title: "Only", details: "Details", characterIds: [], placeIds: [] },
  } }, "only");
  assert.deepEqual(result, { sections: {} });
});

test("confirmed deletion uses DELETE and a failed request leaves workflow state unchanged", async () => {
  const original = workflow();
  let method = "";
  await requestMainStorySectionDeletion("project", "child", async (_input, init) => {
    method = String(init?.method); return new Response(null, { status: 204 });
  });
  assert.equal(method, "DELETE");
  await assert.rejects(requestMainStorySectionDeletion("project", "child", async () =>
    Response.json({ error: "Unable to delete this story section. Please try again." }, { status: 500 })));
  assert.deepEqual(workflow(), original);
});
