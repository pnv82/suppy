import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  longestCadenceRun,
  configuredGoals,
  bestGoalResult,
  goalAchieved,
} from "../src/domain/goals.mjs";
import { openDatabase } from "../server/database.mjs";
import { createStore } from "../server/store.mjs";
import { executeTool } from "../server/tools.mjs";
test("achievement compares exact results, respects lower HR targets and excludes missing values", () => {
  const speed = { metric: "max_speed", target_si: 3, active: true };
  assert.equal(goalAchieved(speed, { value_si: 3 }), true);
  assert.equal(goalAchieved(speed, { value_si: 4 }), true);
  assert.equal(goalAchieved(speed, { value_si: 2.9999 }), false);
  assert.equal(
    goalAchieved({ ...speed, active: false }, { value_si: 3 }),
    true,
  );
  const economy = { metric: "effort_economy", target_si: 140 };
  assert.equal(goalAchieved(economy, { value_si: 135 }), true);
  assert.equal(goalAchieved(economy, { value_si: 140 }), true);
  assert.equal(goalAchieved(economy, { value_si: 141 }), false);
  for (const result of [
    null,
    {},
    { value_si: null },
    { value_si: NaN },
    { value_si: Infinity },
  ])
    assert.equal(goalAchieved(speed, result), false);
  for (const target_si of [null, undefined, 0, NaN, Infinity])
    assert.equal(goalAchieved({ ...speed, target_si }, { value_si: 4 }), false);
});
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
    assert.equal(
      a.dashboard().goals.find((goal) => goal.id === g.id).target_si,
      2.2352,
    );
    assert.equal(b.dashboard().goals.length, 11);
    assert.ok(
      b
        .dashboard()
        .goals.every((goal) => !goal.active && goal.target_si === null),
    );
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
    assert.equal(a.dashboard().goals.find((goal) => goal.id === g.id).id, g.id);
    executeTool(a, "delete_goal", { goal_id: g.id });
    assert.ok(
      a
        .dashboard()
        .goals.every((goal) => !goal.active && goal.target_si === null),
    );
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("catalog configuration, bucket order and targets persist atomically and stay tenant scoped", () => {
  const dir = mkdtempSync(join(tmpdir(), "suppy-goal-config-"));
  const path = join(dir, "test.sqlite");
  let db = openDatabase(path);
  try {
    db.createTenant("a");
    db.createTenant("b");
    let a = createStore({ database: db, tenantId: "a" });
    const b = createStore({ database: db, tenantId: "b" });
    const initial = a.dashboard().goals;
    const id = "catalog:best_1200";
    executeTool(a, "upsert_goal", {
      goal_id: id,
      metric: "best_1200",
      target_si: 2.2352,
      cadence_threshold_spm: null,
    });
    assert.equal(a.dashboard().goals.find((g) => g.id === id).active, false);
    const inactive_ids = initial
      .filter((g) => g.id !== id)
      .map((g) => g.id)
      .reverse();
    executeTool(a, "reorder_goals", { active_ids: [id], inactive_ids });
    const saved = a.dashboard().goals;
    assert.deepEqual(
      saved.map((g) => g.id),
      [id, ...inactive_ids],
    );
    assert.equal(saved[0].active, true);
    assert.equal(saved[0].target_si, 2.2352);
    assert.deepEqual(b.dashboard().goals, initial);
    for (const args of [
      { active_ids: [id, id], inactive_ids },
      { active_ids: [id], inactive_ids: inactive_ids.slice(1) },
      { active_ids: ["foreign-id"], inactive_ids },
    ])
      assert.throws(
        () => executeTool(a, "reorder_goals", args),
        /exactly once/,
      );
    assert.deepEqual(a.dashboard().goals, saved);
    assert.throws(
      () =>
        executeTool(a, "upsert_goal", {
          goal_id: id,
          metric: "average_speed",
          target_si: 2,
          cadence_threshold_spm: null,
        }),
      /cannot change/,
    );
    db.close();
    db = openDatabase(path);
    a = createStore({ database: db, tenantId: "a" });
    assert.deepEqual(a.dashboard().goals, saved);
    executeTool(a, "reorder_goals", {
      active_ids: [],
      inactive_ids: saved.map((g) => g.id),
    });
    assert.equal(
      a.dashboard().goals.find((goal) => goal.id === id).target_si,
      2.2352,
    );
    executeTool(a, "upsert_goal", {
      goal_id: id,
      metric: "best_1200",
      target_si: null,
      cadence_threshold_spm: null,
    });
    assert.equal(a.dashboard().goals[0].target_si, null);
    executeTool(a, "upsert_goal", {
      goal_id: "catalog:cadence_duration",
      metric: "cadence_duration",
      target_si: null,
      cadence_threshold_spm: 30,
    });
    assert.equal(
      a.dashboard().goals.find((g) => g.metric === "cadence_duration")
        .cadence_threshold_spm,
      30,
    );
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("best results support expanded history, retain zero, and never substitute historical or mismatched windows", () => {
  const goals = configuredGoals();
  const byMetric = (metric) => goals.find((g) => g.metric === metric);
  const sessions = Array.from({ length: 12 }, (_, i) => ({
    id: String(i),
    title: `Launch ${i}`,
    date: "2026-09-25",
    records: [],
    statistics: { speed_mps: { max: i, max_source: "fit_session" } },
    windows: [
      { duration: 300, speed_mps: 2 },
      { duration: 1200, speed_mps: i === 11 ? 3 : null },
    ],
    deterministic: { summary: { distance: { mean_speed_mps: 1 } } },
    goalMetrics: { "catalog:cadence_duration": { value_s: 0 } },
    best20: 99,
  }));
  assert.equal(
    bestGoalResult(sessions, byMetric("max_speed"), 12).session_id,
    "11",
  );
  assert.equal(bestGoalResult(sessions, byMetric("best_1200"), 12).value_si, 3);
  assert.equal(
    bestGoalResult(sessions.slice(0, 11), byMetric("best_1200")),
    null,
  );
  assert.equal(bestGoalResult(sessions, byMetric("best_600")), null);
  assert.equal(bestGoalResult(sessions, byMetric("average_speed")).value_si, 1);
  assert.equal(bestGoalResult(sessions, byMetric("cadence_duration")), null);
  assert.equal(
    bestGoalResult(sessions, {
      ...byMetric("cadence_duration"),
      cadence_threshold_spm: 30,
    }).value_si,
    0,
  );
  assert.equal(bestGoalResult([], byMetric("max_speed")), null);
});

test("editing a previously unset catalog goal preserves the default order", () => {
  const initial = configuredGoals();
  const saved = {
    ...initial.find((g) => g.metric === "endurance"),
    target_si: 2,
  };
  assert.deepEqual(
    configuredGoals([saved]).map((g) => g.id),
    initial.map((g) => g.id),
  );
});
