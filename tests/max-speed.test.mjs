import test from "node:test";
import assert from "node:assert/strict";
import { maximumSpeed10s } from "../src/domain/max-speed.mjs";
import { sessionStatistics } from "../src/domain/metrics.mjs";
import { intervalStatistics } from "../src/domain/analysis.mjs";
import { bestGoalResult } from "../src/domain/goals.mjs";
import { testStore } from "./fixtures.mjs";
const points = (pairs) =>
  pairs.map(([elapsed_s, speed_mps], i) => ({
    elapsed_s,
    speed_mps,
    source_record_index: i,
  }));

test("10-second maximum attenuates isolated accepted spikes and retains original device peak", () => {
  const records = points(
    Array.from({ length: 31 }, (_, i) => [i, i === 15 ? 6 : 2]),
  );
  const before = structuredClone(records);
  const s = sessionStatistics(records, [], { enhanced_max_speed: 5.9 });
  assert.equal(s.speed_mps.max, 2.4);
  assert.equal(s.speed_mps.recorded_max, 6);
  assert.equal(s.speed_mps.raw_summary_max_mps, 5.9);
  assert.equal(s.speed_mps.max_10s.start_s, 6);
  assert.deepEqual(s.speed_mps.max_10s.source_record_range, [6, 17]);
  assert.deepEqual(records, before);
});

test("irregular samples use elapsed weighting and both shifted and unshifted boundaries", () => {
  const r = points([
    [0, 1],
    [2, 4],
    [8, 2],
    [13, 1],
    [20, 1],
  ]);
  const best = maximumSpeed10s(r);
  assert.equal(best.value_mps, 3.2); // 6 seconds at 4 plus 4 at 2
  assert.equal(best.start_s, 2);
  assert.equal(best.end_s, 12);
  const shifted = maximumSpeed10s(
    points([
      [0, 1],
      [6, 4],
      [13, 0],
      [20, 0],
    ]),
  );
  assert.equal(shifted.start_s, 3);
  assert.equal(shifted.value_mps, 3.1);
  assert.equal(maximumSpeed10s(r, [], 3, 12).value_mps, null);
  assert.equal(maximumSpeed10s(r, [], 2, 12).value_mps, 3.2);
});

test("pauses, missing/rejected endpoints, unordered times and long gaps split support", () => {
  const base = points([
    [0, 2],
    [5, 2],
    [10, 2],
    [15, 2],
  ]);
  assert.equal(maximumSpeed10s(base, [{ start: 7, end: 8 }]).value_mps, null);
  for (const value of [null, NaN, -1, 6.001]) {
    const r = structuredClone(base);
    r[1].speed_mps = value;
    assert.equal(maximumSpeed10s(r).value_mps, null);
  }
  for (const r of [
    [
      [0, 2],
      [16, 2],
    ],
    [
      [0, 2],
      [5, 2],
      [5, 2],
      [10, 2],
    ],
    [
      [0, 2],
      [5, 2],
      [4, 2],
      [9, 2],
    ],
  ])
    assert.equal(maximumSpeed10s(points(r)).value_mps, null);
  assert.equal(
    maximumSpeed10s(
      points([
        [0, 0],
        [10, 0],
      ]),
    ).value_mps,
    0,
  );
  assert.equal(
    maximumSpeed10s(
      points([
        [0, 2],
        [15, 2],
      ]),
    ).value_mps,
    2,
  );
  assert.equal(
    sessionStatistics([], [], { enhanced_max_speed: 4 }).speed_mps.max,
    null,
  );
  assert.equal(
    maximumSpeed10s(
      points([
        [0, 2],
        [9.999, 2],
      ]),
    ).value_mps,
    null,
  );
  assert.equal(
    sessionStatistics(
      points([
        [0, 2],
        [5, 2],
        [10, 6],
        [15, 6],
      ]),
      [],
      { total_elapsed_time: 10 },
    ).speed_mps.max,
    2,
  );
});

test("dashboard, goal results and exact model evidence share the new method, including null support", (t) => {
  const store = testStore(t),
    s = store.dashboard().sessions[0];
  const context = store.context(s.id);
  assert.equal(s.statistics.speed_mps.max, 2);
  assert.equal(context.statistics.speed_mps.max, 2);
  assert.equal(context.deterministic.summary.speed_mps.max, 2);
  const goal = bestGoalResult([s], { metric: "max_speed" });
  assert.equal(goal.value_si, 2);
  assert.equal(goal.evidence.method, "continuous_10s_speed_v1");
  const interval = intervalStatistics(s.records, [], 0, 9);
  assert.equal(interval.speed_mps.max, null);
  assert.equal(interval.speed_mps.recorded_max, 2);
  assert.equal(
    store.dashboard().sessions.at(-1).statistics.speed_mps.max,
    null,
  );
});
