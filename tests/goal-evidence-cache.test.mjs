import test from "node:test";
import assert from "node:assert/strict";
import { resolveGoalEvidence } from "../server/goal-evidence-cache.mjs";
import { openDatabase } from "../server/database.mjs";
import { createStore } from "../server/store.mjs";
import { fixtureState } from "./fixtures.mjs";
import { track } from "./metric-fixtures.mjs";

const goal = { id: "economy", metric: "effort_economy", pace_mps: 2 };

test("lazy goal evidence fills absent, partial and stale entries without rerunning complete results", () => {
  const cache = new Map();
  let calls = 0;
  const calculate = () => {
    calls++;
    return { value_si: 140, method: "test", source: "derived" };
  };
  const read = (goals = [goal], hash = "track-v1") =>
    resolveGoalEvidence(cache, {}, goals, hash, calculate);
  assert.equal(calls, 0);
  assert.equal(read().economy.value_si, 140);
  read();
  assert.equal(calls, 1);
  // A missing field is not confused with a calculated unavailable result.
  cache.get(goal.id).result = { method: "test" };
  read();
  assert.equal(calls, 2);
  cache.get(goal.id).result = { method: "test", value_si: null };
  read();
  assert.equal(calls, 3);
  cache.get(goal.id).signature = "obsolete-method-signature";
  read();
  assert.equal(calls, 4);
  read([goal], "track-v2");
  assert.equal(calls, 5);
  read([{ ...goal, pace_mps: 2.2 }], "track-v2");
  assert.equal(calls, 6);
  cache.delete(goal.id);
  read();
  assert.equal(calls, 7);
});

test("unavailable evidence is cached until inputs change; failed calculations can retry", () => {
  const cache = new Map();
  let calls = 0;
  const calculate = (session) => {
    calls++;
    if (session.fail) throw new Error("Calculation failed");
    return session.supported
      ? { value_si: 140, method: "test" }
      : { value_si: null, reason: "Missing heart rate.", method: "test" };
  };
  resolveGoalEvidence(cache, {}, [goal], "missing-hr", calculate);
  resolveGoalEvidence(cache, {}, [goal], "missing-hr", calculate);
  assert.equal(calls, 1);
  assert.throws(
    () =>
      resolveGoalEvidence(cache, { fail: true }, [goal], "new-hr", calculate),
    /Calculation failed/,
  );
  const recovered = resolveGoalEvidence(
    cache,
    { supported: true },
    [goal],
    "new-hr",
    calculate,
  );
  assert.equal(recovered.economy.value_si, 140);
  assert.equal(calls, 3);
});

test("dashboard reads rebuild absent/stale persisted economy evidence from full telemetry without changing facts", (t) => {
  const database = openDatabase(":memory:");
  t.after(() => database.close());
  for (const tenant of ["supported", "missing-hr"]) {
    const state = fixtureState();
    state.sessions = state.sessions.slice(0, 2).map((s, index) => ({
      ...s,
      elapsed: 30,
      active: 30,
      records: track({ seconds: 1800 }).map((r) => ({
        ...r,
        temperature_c: null,
        heart_rate_bpm: tenant === "supported" ? 140 : null,
      })),
      ...(index
        ? {
            goalMetrics: {
              "catalog:effort_economy": { value_si: 1, method: "obsolete" },
            },
          }
        : {}),
    }));
    database.createTenant(tenant);
    database.importState(tenant, state);
    const store = createStore({
      database,
      tenantId: tenant,
      launchLookup: null,
    });
    store.upsertGoal({
      ...goal,
      goal_id: "catalog:effort_economy",
      target_si: 150,
      cadence_threshold_spm: null,
      active: true,
    });
    const currentGoal = store
      .dashboard()
      .goals.find((g) => g.metric === "effort_economy");
    const snapshots = state.sessions.map((s) => store.get(s.id));
    const first = store.context(state.sessions[0].id).goalMetrics[
      currentGoal.id
    ];
    const secondStore = createStore({
      database,
      tenantId: tenant,
      launchLookup: null,
    });
    const results = secondStore.dashboard().sessions;
    for (const row of results) {
      assert.equal(
        row.goalMetrics[currentGoal.id].value_si,
        tenant === "supported" ? 140 : null,
      );
      if (tenant === "supported") {
        assert.equal(row.goalMetrics[currentGoal.id].start_s, 1200);
        assert.equal(row.goalMetrics[currentGoal.id].end_s, 1500);
      } else assert.ok(row.goalMetrics[currentGoal.id].reason);
    }
    assert.strictEqual(
      results.find((s) => s.id === state.sessions[0].id).goalMetrics[
        currentGoal.id
      ],
      first,
    );
    assert.deepEqual(
      state.sessions.map((s) => store.get(s.id)),
      snapshots,
    );
    const changed = store.get(state.sessions[0].id);
    changed.records = changed.records.map((r) => ({
      ...r,
      heart_rate_bpm: 130,
    }));
    // A recovered channel invalidates the input hash even without a revision bump.
    database.forTenant(tenant).save(changed);
    assert.equal(
      secondStore.context(changed.id).goalMetrics[currentGoal.id].value_si,
      130,
    );
  }
});
