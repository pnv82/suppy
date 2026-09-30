import test from "node:test";
import assert from "node:assert/strict";
import { extendedGoalEvidence } from "../src/domain/goal-evidence.mjs";
import { configuredGoals, bestGoalResult } from "../src/domain/goals.mjs";
import { track } from "./metric-fixtures.mjs";
import { testStore } from "./fixtures.mjs";
import { executeTool } from "../server/tools.mjs";
import { openDatabase } from "../server/database.mjs";
import { createStore } from "../server/store.mjs";
const session = (seconds = 3600) => ({
  id: "s",
  elapsed: seconds / 60,
  records: track({ seconds }),
  pauses: [],
  annotations: [],
});
const goal = (metric, fields = {}) => ({
  ...configuredGoals().find((g) => g.metric === metric),
  ...fields,
});

test("endurance uses exact duration, never bridges pauses, missing distance or shorter sessions", () => {
  const s = session();
  assert.equal(extendedGoalEvidence(s, goal("endurance")).value_si, 2);
  assert.equal(
    extendedGoalEvidence(s, goal("endurance", { window_s: 3600 })).end_s,
    3600,
  );
  assert.equal(
    extendedGoalEvidence(
      { ...s, elapsed: 59 },
      goal("endurance", { window_s: 3600 }),
    ).value_si,
    null,
  );
  assert.equal(
    extendedGoalEvidence(
      { ...s, pauses: [{ start: 1799, end: 1801 }] },
      goal("endurance"),
    ).value_si,
    null,
  );
  s.records[360].distance_m = null;
  assert.equal(extendedGoalEvidence(s, goal("endurance")).value_si, null);
});

test("stroke effectiveness matches cadence over fully supported steady five-minute blocks", () => {
  const s = session(900),
    g = goal("stroke_effectiveness", { cadence_spm: 30 });
  const result = extendedGoalEvidence(s, g);
  assert.equal(result.value_si, 2);
  assert.equal(result.end_s - result.start_s, 300);
  assert.equal(result.dps_m, 4);
  assert.equal(result.coverage_pct, 100);
  assert.equal(
    extendedGoalEvidence(s, goal("stroke_effectiveness")).value_si,
    null,
  );
  assert.equal(
    extendedGoalEvidence(s, { ...g, cadence_spm: 40 }).value_si,
    null,
  );
  s.records.forEach((r, i) => {
    if (i % 20 === 0) r.cadence_raw = null;
  });
  assert.equal(extendedGoalEvidence(s, g).value_si, null);
});

test("effort economy ranks lower HR only at the configured steady pace with trustworthy joint support", () => {
  const s = session(900),
    g = goal("effort_economy", { pace_mps: 2 });
  const result = extendedGoalEvidence(s, g);
  assert.equal(result.value_si, 140);
  assert.equal(result.start_s, 180);
  assert.equal(extendedGoalEvidence(s, { ...g, pace_mps: 3 }).value_si, null);
  assert.equal(
    extendedGoalEvidence({ ...s, hrQuality: "Suspect early HR" }, g).value_si,
    null,
  );
  const sessions = [
    { ...s, goalMetrics: { [g.id]: result } },
    {
      ...s,
      id: "better",
      goalMetrics: { [g.id]: { ...result, value_si: 130 } },
    },
  ];
  assert.equal(bestGoalResult(sessions, g).session_id, "better");
  s.records.forEach((r, i) => {
    if (i % 25 === 0) r.heart_rate_bpm = null;
  });
  assert.equal(extendedGoalEvidence(s, g).value_si, null);
});

test("five-minute blocks cannot bridge reported interruptions or pauses", () => {
  const s = session(600),
    g = goal("stroke_effectiveness", { cadence_spm: 30 });
  assert.equal(
    extendedGoalEvidence({ ...s, pauses: [{ start: 299, end: 301 }] }, g)
      .value_si,
    null,
  );
  assert.equal(
    extendedGoalEvidence(
      { ...s, annotations: [{ kind: "fall", start_s: 300, end_s: 300 }] },
      g,
    ).value_si,
    2,
  );
  assert.equal(
    extendedGoalEvidence(
      {
        ...s,
        annotations: [{ kind: "interruption", start_s: 299, end_s: 301 }],
      },
      g,
    ).value_si,
    null,
  );
});

test("tracking retains supported zero and turns need reported attempts in both directions", () => {
  assert.equal(
    extendedGoalEvidence(
      {
        ...session(),
        deterministic: {
          summary: { tracking: { score: 0, covered_s: 600, coverage_pct: 50 } },
        },
      },
      goal("tracking_control"),
    ).value_si,
    0,
  );
  assert.equal(
    extendedGoalEvidence(session(), goal("turns_footwork")).value_si,
    null,
  );
  const result = extendedGoalEvidence(
    session(),
    goal("turns_footwork", {
      practice_results: [
        {
          session_id: "s",
          left_successes: 8,
          left_attempts: 10,
          right_successes: 3,
          right_attempts: 5,
        },
      ],
    }),
  );
  assert.equal(result.value_si, 60);
  assert.equal(result.source, "Athlete-reported practice");
});

test("new goal settings and practice are tenant scoped, validated, preserved on edits and removable", (t) => {
  const store = testStore(t),
    id = store.dashboard().sessions[0].id;
  const g = goal("turns_footwork");
  const result = {
    left_successes: 8,
    left_attempts: 10,
    right_successes: 3,
    right_attempts: 5,
  };
  const args = { goal_id: g.id, session_id: id, result };
  executeTool(store, "set_goal_practice", args);
  executeTool(store, "upsert_goal", {
    goal_id: g.id,
    metric: g.metric,
    target_si: 80,
    cadence_threshold_spm: null,
    active: true,
  });
  assert.equal(
    store.dashboard().goals.find((x) => x.id === g.id).practice_results[0]
      .left_successes,
    8,
  );
  assert.equal(store.context(id).goalMetrics[g.id].value_si, 60);
  assert.throws(() =>
    executeTool(store, "set_goal_practice", { ...args, session_id: "foreign" }),
  );
  assert.throws(() =>
    executeTool(store, "set_goal_practice", {
      ...args,
      result: { ...result, left_successes: 11 },
    }),
  );
  assert.throws(() =>
    executeTool(store, "set_goal_practice", {
      ...args,
      result: { ...result, right_attempts: 0 },
    }),
  );
  const db = openDatabase(":memory:");
  t.after(() => db.close());
  db.createTenant("other");
  const other = createStore({ database: db, tenantId: "other" });
  assert.throws(() => executeTool(other, "set_goal_practice", args));
  executeTool(store, "set_goal_practice", { ...args, result: null });
  assert.equal(store.context(id).goalMetrics[g.id].value_si, null);
  executeTool(store, "upsert_goal", {
    goal_id: "catalog:effort_economy",
    metric: "effort_economy",
    target_si: 135,
    cadence_threshold_spm: null,
    pace_mps: 2,
  });
  assert.equal(
    store.context(id).goalMetrics["catalog:effort_economy"].value_si,
    140,
  );
  assert.throws(() =>
    executeTool(store, "upsert_goal", {
      goal_id: g.id,
      metric: g.metric,
      target_si: 101,
      cadence_threshold_spm: null,
    }),
  );
});
