import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeTelemetry,
  intervalStatistics,
  strokeDistanceTimeline,
} from "../src/domain/analysis.mjs";
import { trackingEvidence } from "../src/domain/tracking.mjs";
import { movementEvidence } from "../src/domain/events.mjs";
import { angleDifference } from "../src/domain/telemetry.mjs";

import { track } from "./metric-fixtures.mjs";
import { testStore } from "./fixtures.mjs";
import { executeTool } from "../server/tools.mjs";
import { metricView } from "../src/domain/metric-view.mjs";
test("matched metrics share support, preserve zeros and use timer-eligible coverage", () => {
  const records = track({ seconds: 120 });
  const stats = intervalStatistics(records, [{ start: 30, end: 60 }], 0, 120);
  assert.equal(stats.speed_cadence.speed_mps, 2);
  assert.equal(stats.speed_cadence.cadence_spm, 30);
  assert.equal(stats.speed_cadence.coverage_pct, 100);
  assert.equal(stats.speed_cadence.elapsed_coverage_pct, 75);
  assert.equal(stats.distance_per_stroke.value_m, 4);
  const missing = records.map((p) => ({
    ...p,
    cadence_raw: p.elapsed_s < 60 ? null : 0,
  }));
  const partial = intervalStatistics(missing, [], 0, 120);
  assert.equal(partial.speed_cadence.coverage_pct, 50);
  assert.equal(partial.speed_cadence.cadence_spm, 0);
  assert.equal(partial.distance_per_stroke.value_m, null);
});
test("TCS distinguishes straight and oscillating GPS with all four components", () => {
  const straight = trackingEvidence(track(), [], 0, 3600);
  const zig = trackingEvidence(track({ zig: 6 }), [], 0, 3600);
  assert.ok(straight.score > 99.99);
  assert.ok(zig.score < 80 && zig.score > 0);
  assert.ok(zig.p90_course_deviation_deg > 5);
  // A 6 m sine amplitude over a 60 s cycle spans approximately 12 m
  // relative to the centered 30 s chord at its extremes.
  assert.ok(zig.corridor_p95_m > 11.7 && zig.corridor_p95_m < 12.2);
  assert.equal(zig.components.length, 4);
  assert.ok(zig.resolved_cycles > 0);
  assert.ok(zig.coverage_pct > 95);
  assert.deepEqual(zig.segments[0].source_record_range, [0, 721]);
  assert.equal(zig.resolved_cycles, 59);
  const interval = trackingEvidence(track({ zig: 6 }), [], 600.5, 1200.5);
  assert.ok(interval.score >= 0 && interval.score <= 100);
  assert.ok(
    interval.segments.every((s) => s.start_s >= 600.5 && s.end_s <= 1200.5),
  );
});
test("tracking does not join pauses/gaps or invent support, and sampling sensitivity is bounded", () => {
  const a = trackingEvidence(track({ zig: 6, step: 1 }), [], 0, 3600);
  const b = trackingEvidence(track({ zig: 6, step: 5 }), [], 0, 3600);
  assert.ok(Math.abs(a.score - b.score) < 1);
  assert.equal(a.resolved_cycles, b.resolved_cycles);
  const records = track({ seconds: 300 }).filter(
    (p) => p.elapsed_s < 100 || p.elapsed_s > 180,
  );
  const result = trackingEvidence(records, [{ start: 220, end: 250 }], 0, 300);
  assert.ok(result.coverage_pct < 65);
  assert.ok(result.segments.every((s) => !(s.start_s < 180 && s.end_s > 100)));
  assert.equal(trackingEvidence(track({ seconds: 55 }), [], 0, 55).score, null);
  assert.equal(
    trackingEvidence(
      track().map((p) => ({ ...p, latitude_deg: null })),
      [],
      0,
      3600,
    ).score,
    null,
  );
  assert.equal(
    trackingEvidence(
      track().map((p) => ({ ...p, gps_accuracy_m: 50 })),
      [],
      0,
      3600,
    ).score,
    null,
  );
  assert.equal(angleDifference(1, 359), 2);
  const dateline = track().map((p) => ({
    ...p,
    latitude_deg: 0,
    longitude_deg: ((179.99 + p.distance_m / 111195 + 180) % 360) - 180,
  }));
  assert.ok(trackingEvidence(dateline, [], 0, 3600).score > 99.99);
});
test("large turning arcs are excluded from straightness", () => {
  const records = track({ seconds: 300 }).map((p) => ({
    ...p,
    latitude_deg: 32.7 + (40 * Math.sin(p.elapsed_s / 20)) / 111195,
    longitude_deg: -117.2 + (40 * Math.cos(p.elapsed_s / 20)) / 93700,
  }));
  const result = trackingEvidence(records, [], 0, 300);
  assert.equal(result.score, null);
  assert.ok(result.excluded_reasons.turn > 0);
});
test("low-speed evidence requires corroboration and multiple edges, keeps unknown separate", () => {
  const records = track({ seconds: 60 }).map((p) => ({
    ...p,
    speed_mps: 0,
    distance_m: 0,
    latitude_deg: 32.7,
    cadence_raw: null,
  }));
  const result = movementEvidence(records, [], 60);
  assert.equal(result.events.length, 0);
  assert.equal(result.low_speed_intervals.length, 1);
  assert.equal(result.low_speed_intervals[0].cadence_zero_observed, false);
  assert.equal(result.supported_low_speed_s, 60);
  assert.equal(movementEvidence(records.slice(0, 2), [], 5).events.length, 0);
  assert.equal(
    movementEvidence(
      track({ seconds: 60 }).map((p) => ({ ...p, speed_mps: 0 })),
      [],
      60,
    ).events.length,
    0,
  );
  assert.equal(
    movementEvidence(
      [],
      [{ start: 0, end: 60, reason: "unresolved_timer_boundaries" }],
      60,
    ).unknown_s,
    60,
  );
  assert.equal(
    movementEvidence(
      records.map((p) => ({ ...p, speed_mps: null })),
      [],
      60,
    ).unknown_s,
    60,
  );
});
test("drift reports planted changes with disjoint pairs and does not match away the outcome", () => {
  const speed = analyzeTelemetry(track({ lateSpeed: 1.8 }), [], 3600).drift
    .modes.speed_at_effort;
  assert.equal(speed.status, "descriptive");
  assert.ok(Math.abs(speed.change + 10) < 1e-8);
  const used = speed.pairs
    .flatMap((p) => [p.early, p.late])
    .sort((a, b) => a.start_s - b.start_s);
  assert.ok(used.every((w, i) => !i || w.start_s >= used[i - 1].end_s));
  const hr = analyzeTelemetry(track({ lateHr: 155 }), [], 3600).drift.modes
    .hr_at_speed;
  assert.equal(hr.change, 15);
  const cadence = analyzeTelemetry(track({ lateCadence: 36 }), [], 3600).drift
    .modes.cadence_at_speed;
  assert.equal(cadence.change, 20);
  const baseline = analyzeTelemetry(track(), [], 3600).drift.modes;
  assert.equal(baseline.speed_at_effort.change, 0);
});
test("drift refuses missing HR, flagged HR, short sessions, opposite directions and reported interruptions", () => {
  const records = track();
  assert.equal(
    analyzeTelemetry(records, [], 3600, null, { hrQuality: "Suspect early" })
      .drift.modes.speed_at_effort.change,
    null,
  );
  assert.equal(
    analyzeTelemetry(
      records.map((p) => ({ ...p, heart_rate_bpm: null })),
      [],
      3600,
    ).drift.modes.hr_at_speed.change,
    null,
  );
  assert.equal(
    analyzeTelemetry(track({ seconds: 600 }), [], 600).drift.modes
      .speed_at_effort.change,
    null,
  );
  const reversed = records.map((p) =>
    p.elapsed_s < 2400
      ? p
      : { ...p, latitude_deg: 32.7 + (9600 - p.distance_m) / 111195 },
  );
  assert.equal(
    analyzeTelemetry(reversed, [], 3600).drift.modes.speed_at_effort.change,
    null,
  );
  const blocked = analyzeTelemetry(records, [], 3600, null, {
    annotations: [{ kind: "interruption", start_s: 0, end_s: 1200 }],
  });
  assert.equal(blocked.drift.modes.speed_at_effort.pair_count, 0);
});
test("DPS timeline is a 30 second aggregate and stays broken inside pauses and after gaps", () => {
  const rows = strokeDistanceTimeline(track({ seconds: 120 }), [
    { start: 45, end: 75 },
  ]);
  assert.equal(rows.find((p) => p.elapsed_s === 30).value_m, 4);
  assert.equal(rows.find((p) => p.elapsed_s === 60).value_m, null);
  assert.equal(rows.find((p) => p.elapsed_s === 80).value_m, null);
  assert.equal(rows.find((p) => p.elapsed_s === 110).value_m, 4);
  const missingPoint = track({ seconds: 120, step: 1 }).map((p) => ({
    ...p,
    cadence_raw: p.elapsed_s === 60 ? null : p.cadence_raw,
  }));
  assert.equal(
    strokeDistanceTimeline(missingPoint, []).find((p) => p.elapsed_s === 60)
      .value_m,
    null,
  );
});

test("UI and bounded exact MCP evidence agree, and context edits invalidate calculations", (t) => {
  const store = testStore(t),
    session = store.dashboard().sessions[0];
  const best = session.windows.find((w) => w.duration === 1200);
  const result = executeTool(store, "prepare_analysis_context", {
    session_id: session.id,
    question: "Inspect metrics",
    start_s: best.start,
    end_s: best.end,
  }).structuredContent;
  assert.equal(result.evidence.tracking.score, best.statistics.tracking.score);
  assert.equal(
    result.evidence.distance_per_stroke.value_m,
    metricView(session, 1200).dps,
  );
  assert.equal(result.evidence.tracking.segments, undefined);
  assert.equal(result.session.deterministic.dps_timeline, undefined);
  assert.ok(result.telemetry.length <= 120);
  assert.ok(Number.isFinite(Date.parse(session.deterministic.computed_at_utc)));
  const hash = session.deterministic.input_hash;
  store.addAnnotation({
    session_id: session.id,
    start_s: 180,
    end_s: 700,
    kind: "interruption",
    note: "Synthetic exclusion",
    timing: "exact",
  });
  const changed = store.context(session.id).deterministic;
  assert.notEqual(changed.input_hash, hash);
  assert.equal(changed.context_revision, 1);
  assert.equal(changed.drift.modes.speed_at_effort.pair_count, 0);
  const summary = store.dashboard().sessions.at(-1);
  assert.equal(metricView(summary, 1200).speed, null);
  assert.equal(metricView(summary, 1200).cadence, null);
  assert.equal(metricView(summary, 1200).tracking, null);
});

test("low-speed hysteresis tolerates small threshold jitter without interpreting missing cadence", () => {
  const records = track({ seconds: 30 }).map((p) => ({
    ...p,
    speed_mps: p.elapsed_s >= 10 && p.elapsed_s <= 20 ? 0.6 : 0.3,
    distance_m: 0,
    latitude_deg: 32.7,
    cadence_raw: null,
  }));
  const result = movementEvidence(records, [], 30);
  assert.equal(result.events.length, 0);
  assert.equal(result.low_speed_intervals.length, 1);
  assert.equal(result.low_speed_intervals[0].end_s, 30);
});

test("drift modes retain independent optional channels and require joint support", () => {
  const noCadence = track({ lateHr: 155 }).map((p) => ({
    ...p,
    cadence_raw: null,
    speed_mps: null,
  }));
  assert.equal(
    analyzeTelemetry(noCadence, [], 3600).drift.modes.hr_at_speed.change,
    15,
  );
  assert.equal(
    analyzeTelemetry(noCadence, [], 3600).drift.modes.speed_at_effort.change,
    null,
  );
  const disjoint = track({ seconds: 180, step: 1 }).map((p) => ({
    ...p,
    cadence_raw: p.elapsed_s < 12 ? null : 30,
    heart_rate_bpm: p.elapsed_s > 165 ? null : 140,
  }));
  const stats = intervalStatistics(disjoint, [], 0, 180);
  assert.ok(
    stats.cadence_raw.coverage_pct >= 90 &&
      stats.heart_rate_bpm.coverage_pct >= 90,
  );
  assert.ok(stats.joint_hr_cadence_distance.coverage_pct < 90);
});

test("irregular recording preserves broad oscillation evidence without implying fine resolution", () => {
  const dense = track({ step: 1, zig: 6 }),
    times = new Set([0]);
  let t = 0,
    i = 0;
  while (t < 3600) {
    t = Math.min(3600, t + [5, 7, 11, 3][i++ % 4]);
    times.add(t);
  }
  const irregular = trackingEvidence(
    dense.filter((p) => times.has(p.elapsed_s)),
    [],
    0,
    3600,
  );
  const baseline = trackingEvidence(dense, [], 0, 3600);
  assert.ok(
    irregular.score != null && Math.abs(irregular.score - baseline.score) < 1,
  );
  assert.ok(irregular.p90_course_deviation_deg > 5);
  assert.equal(
    trackingEvidence(
      dense.map((p) => ({ ...p, latitude_deg: 32.7, longitude_deg: -117.2 })),
      [],
      0,
      3600,
    ).score,
    null,
  );
});
