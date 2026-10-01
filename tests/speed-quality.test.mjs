import test from "node:test";
import assert from "node:assert/strict";
import { chartRows, sessionStatistics } from "../src/domain/metrics.mjs";
import { intervalStatistics } from "../src/domain/analysis.mjs";
import { usableSpeed } from "../src/domain/speed-quality.mjs";
import { fixtureState } from "./fixtures.mjs";
import { openDatabase } from "../server/database.mjs";
import { createStore } from "../server/store.mjs";
import { executeTool } from "../server/tools.mjs";

test("18 mph spike is excluded without clipping, stitching gaps or modifying source records", () => {
  const records = Array.from({ length: 7 }, (_, i) => ({
    elapsed_s: i * 5,
    speed_mps: i === 3 ? 18 * 0.44704 : 2,
    heart_rate_bpm: 140,
    cadence_raw: 30,
    distance_m: i * 10,
  }));
  const before = structuredClone(records);
  const evidence = intervalStatistics(records, [], 0, 30);
  assert.equal(evidence.speed_mps.mean, 2);
  assert.equal(evidence.speed_mps.max, 2);
  assert.equal(evidence.speed_mps.covered_s, 20);
  assert.equal(evidence.speed_mps.quality.excluded_sample_count, 1);
  assert.equal(evidence.heart_rate_bpm.covered_s, 30);
  assert.equal(chartRows(records)[3].speed, null);
  assert.deepEqual(records, before);
  const stats = sessionStatistics(records, [], {
    enhanced_max_speed: 18 * 0.44704,
  }).speed_mps;
  assert.equal(stats.max, 2);
  assert.equal(stats.max_source, "continuous_10s_speed_v1");
  assert.equal(stats.raw_summary_max_mps, 18 * 0.44704);
  assert.equal(stats.summary_max_excluded, true);
  assert.equal(
    sessionStatistics([], [], { enhanced_max_speed: 9 }).speed_mps.max,
    null,
  );
  assert.equal(usableSpeed(0), 0);
  assert.equal(usableSpeed(6), 6);
  assert.equal(usableSpeed(6.001), null);
  assert.equal(usableSpeed(null), null);
});

test("existing stored FIT maximum is filtered consistently in dashboard and MCP without rewriting source", (t) => {
  const database = openDatabase(":memory:");
  t.after(() => database.close());
  database.createTenant("test");
  const state = fixtureState(),
    s = state.sessions[0];
  s.statistics.speed_mps.max = 18 * 0.44704;
  s.statistics.speed_mps.max_source = "fit_session";
  delete s.statistics.speed_mps.raw_summary_max_mps;
  s.records[30].speed_mps = 18 * 0.44704;
  for (const r of s.records) r.temperature_c = null;
  database.importState("test", state);
  const store = createStore({ database, tenantId: "test", launchLookup: null });
  const displayed = store.dashboard().sessions[0];
  assert.equal(displayed.statistics.speed_mps.max, 2);
  assert.equal(
    displayed.statistics.speed_mps.raw_summary_max_mps,
    18 * 0.44704,
  );
  assert.equal(store.get(s.id).statistics.speed_mps.max, 18 * 0.44704);
  assert.equal(store.get(s.id).records[30].speed_mps, 18 * 0.44704);
  const result = executeTool(store, "prepare_analysis_context", {
    session_id: s.id,
    question: "Review",
  }).structuredContent;
  assert.equal(result.evidence.speed_mps.max, 2);
  assert.equal(result.session.statistics.speed_mps.max, 2);
  assert.equal(result.evidence.speed_mps.quality.excluded_sample_count, 1);
});
