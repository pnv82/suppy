import test from "node:test";
import assert from "node:assert/strict";
import { goalDropOrder } from "../src/domain/goal-order.mjs";

const goals = [
  { id: "a", active: true },
  { id: "b", active: true },
  { id: "c", active: true },
  { id: "d", active: false },
  { id: "e", active: false },
];
test("drops reorder in both directions and append without losing or duplicating IDs", () => {
  assert.deepEqual(goalDropOrder(goals, "a", true, "c"), {
    active_ids: ["b", "a", "c"],
    inactive_ids: ["d", "e"],
  });
  assert.deepEqual(goalDropOrder(goals, "c", true, "a"), {
    active_ids: ["c", "a", "b"],
    inactive_ids: ["d", "e"],
  });
  assert.deepEqual(goalDropOrder(goals, "a", true), {
    active_ids: ["b", "c", "a"],
    inactive_ids: ["d", "e"],
  });
  assert.deepEqual(goalDropOrder(goals, "e", false, "d"), {
    active_ids: ["a", "b", "c"],
    inactive_ids: ["e", "d"],
  });
});
test("drops insert across buckets, including an empty destination and the last source goal", () => {
  assert.deepEqual(goalDropOrder(goals, "a", false, "e"), {
    active_ids: ["b", "c"],
    inactive_ids: ["d", "a", "e"],
  });
  assert.deepEqual(goalDropOrder(goals, "e", true, "b"), {
    active_ids: ["a", "e", "b", "c"],
    inactive_ids: ["d"],
  });
  assert.deepEqual(
    goalDropOrder([{ id: "only", active: false }], "only", true),
    { active_ids: ["only"], inactive_ids: [] },
  );
  assert.deepEqual(
    goals.map((goal) => goal.id),
    ["a", "b", "c", "d", "e"],
  );
});
test("unchanged and stale drop targets do not produce writes", () => {
  for (const args of [
    ["a", true, "b"],
    ["c", true, null],
    ["a", true, "a"],
    ["missing", true, null],
    ["a", true, "d"],
    ["a", null, null],
  ])
    assert.equal(goalDropOrder(goals, ...args), null);
});
