import test from "node:test";
import assert from "node:assert/strict";
import {
  intervalStrokeDistance,
  ensureIntervalStatistics,
  INTERVAL_STROKE_METHOD,
} from "../src/domain/analysis.mjs";
import { testStore } from "./fixtures.mjs";
import { executeTool } from "../server/tools.mjs";
const points = (times, cadences = times.map(() => 30)) =>
  times.map((t, i) => ({
    elapsed_s: t,
    distance_m: t * 2,
    cadence_raw: cadences[i],
  }));

test("interval stroke estimate clips edges and integrates irregular cadence over matching distance", () => {
  const result = intervalStrokeDistance(
    points([0, 2, 10, 15], [30, 60, 30, 30]),
    [],
    1,
    12,
  );
  assert.equal(result.distance_m, 22);
  assert.equal(result.estimated_strokes, 9.5);
  assert.equal(result.value_m, 22 / 9.5);
  assert.equal(result.coverage_pct, 100);
  assert.equal(result.method, INTERVAL_STROKE_METHOD);
  assert.equal(result.status, "cadence_estimate");
});
test("stroke estimate excludes gaps, pauses, resets and spikes without mismatching coverage", () => {
  const records = points([0, 5, 10, 40, 45]);
  const result = intervalStrokeDistance(records, [{ start: 6, end: 8 }], 0, 45);
  assert.equal(result.covered_s, 10);
  assert.equal(result.distance_m, 20);
  assert.equal(result.estimated_strokes, 5);
  assert.equal(result.value_m, 4);
  for (const distance of [-1, 1000]) {
    const changed = points([0, 5, 10]);
    changed[1].distance_m = distance;
    assert.equal(intervalStrokeDistance(changed, [], 0, 10).value_m, null);
  }
  const missing = points([0, 5, 10, 15], [30, 30, null, 30]);
  assert.equal(intervalStrokeDistance(missing, [], 0, 15).covered_s, 5);
  assert.equal(intervalStrokeDistance(missing, [], 0, 15).value_m, 4);
});
test("zero and absent sensor data stay unavailable while stationary distance is valid zero", () => {
  assert.equal(intervalStrokeDistance([], [], 0, 300).value_m, null);
  assert.equal(
    intervalStrokeDistance(points([0, 5], [0, 0]), [], 0, 5).value_m,
    null,
  );
  assert.equal(
    intervalStrokeDistance(points([0, 5], [null, null]), [], 0, 5).value_m,
    null,
  );
  assert.equal(intervalStrokeDistance(points([0, 5]), [], 3, 3).value_m, null);
  assert.equal(
    intervalStrokeDistance(
      points([0, 5]).map((p) => ({ ...p, distance_m: 0 })),
      [],
      0,
      5,
    ).value_m,
    0,
  );
  assert.throws(() => intervalStrokeDistance([], [], 5, 2));
});
test("current evidence replaces stale calculations and reuses current unavailable results", () => {
  const old = {
    cadence_raw: { mean: 30 },
    distance_per_stroke: { value_m: null, reason: "Legacy placeholder" },
  };
  const upgraded = ensureIntervalStatistics(points([0, 5, 10]), [], 0, 10, old);
  assert.equal(upgraded.distance_per_stroke.value_m, 4);
  assert.equal(upgraded.cadence_raw.mean, old.cadence_raw.mean);
  assert.notEqual(upgraded.cadence_raw, old.cadence_raw);
  assert.equal(old.distance_per_stroke.value_m, null);
  assert.equal(ensureIntervalStatistics([], [], 0, 10, upgraded), upgraded);
  const unavailable = ensureIntervalStatistics([], [], 0, 10, old);
  assert.equal(
    ensureIntervalStatistics([], [], 0, 10, unavailable),
    unavailable,
  );
});
test("old stored sessions expose lazy interval estimates in UI context and exact analysis without rewriting history", (t) => {
  const store = testStore(t);
  const session = store.dashboard().sessions[0];
  const before = structuredClone(store.get(session.id));
  const context = store.context(session.id);
  assert.ok(
    Math.abs(context.windows[0].statistics.distance_per_stroke.value_m - 3.75) <
      1e-9,
  );
  const result = executeTool(store, "prepare_analysis_context", {
    session_id: session.id,
    question: "Review",
    start_s: 0,
    end_s: 300,
  });
  assert.ok(
    Math.abs(
      result.structuredContent.evidence.distance_per_stroke.value_m - 3.75,
    ) < 1e-9,
  );
  assert.deepEqual(store.get(session.id), before);
});
