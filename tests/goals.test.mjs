import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { longestCadenceRun } from "../src/domain/goals.mjs";
import { openDatabase } from "../server/database.mjs";
import { createStore } from "../server/store.mjs";
import { executeTool } from "../server/tools.mjs";
test("cadence duration splits at pauses, gaps, missing and equal-to-threshold samples", () => {
  const r = [0, 5, 10, 15, 20, 40, 45].map((elapsed_s) => ({
    elapsed_s,
    cadence_raw: 35,
  }));
  assert.equal(longestCadenceRun(r, [], 30).value_s, 20);
  assert.equal(longestCadenceRun(r, [{ start: 8, end: 11 }], 30).value_s, 5);
  assert.equal(longestCadenceRun(r, [], 35).value_s, 0);
  assert.equal(longestCadenceRun([], [], 30).value_s, null);
  r[2].cadence_raw = null;
  assert.equal(longestCadenceRun(r, [], 30).value_s, 5);
});
test("goals persist with SI targets and tenant-scoped edits/deletion", () => {
  const dir = mkdtempSync(join(tmpdir(), "suppy-goals-")),
    path = join(dir, "test.sqlite");
  let db = openDatabase(path);
  try {
    db.createTenant("a");
    db.createTenant("b");
    let a = createStore({ database: db, tenantId: "a" }),
      b = createStore({ database: db, tenantId: "b" });
    const args = {
      metric: "best_1200",
      target_si: 2.2352,
      cadence_threshold_spm: null,
    };
    const g = executeTool(a, "upsert_goal", args).structuredContent;
    assert.equal(a.dashboard().goals[0].target_si, 2.2352);
    assert.deepEqual(b.dashboard().goals, []);
    assert.throws(() => executeTool(b, "delete_goal", { goal_id: g.id }));
    assert.throws(() =>
      executeTool(b, "upsert_goal", { ...args, goal_id: g.id }),
    );
    assert.throws(() =>
      executeTool(a, "upsert_goal", { ...args, metric: "cadence_duration" }),
    );
    assert.throws(() => executeTool(a, "upsert_goal", args));
    db.close();
    db = openDatabase(path);
    a = createStore({ database: db, tenantId: "a" });
    assert.equal(a.dashboard().goals[0].id, g.id);
    executeTool(a, "delete_goal", { goal_id: g.id });
    assert.deepEqual(a.dashboard().goals, []);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
