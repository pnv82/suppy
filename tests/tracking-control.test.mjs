import test from "node:test";
import assert from "node:assert/strict";
import {
  trackingEvidence,
  scoreTrackingComponents,
  TRACKING_COMPONENTS,
} from "../src/domain/tracking.mjs";
import { trackingBand } from "../src/domain/tracking-score.mjs";
import { track } from "./metric-fixtures.mjs";
import {
  intervalStatistics,
  ensureIntervalStatistics,
  ANALYSIS_METHOD,
} from "../src/domain/analysis.mjs";

test("TCS reproduces the supplied weighted example and all anchor endpoints", () => {
  const result = scoreTrackingComponents({
    median_course_deviation_deg: 5.2,
    p90_course_deviation_deg: 9.4,
    corridor_p95_m: 1.8,
    oscillation_cycles_per_min: 3.1,
  });
  assert.ok(Math.abs(result.score - 74.7420634920635) < 1e-10);
  for (const [anchor, expected] of [
    ["good", 100],
    ["poor", 0],
  ]) {
    const values = Object.fromEntries(
      TRACKING_COMPONENTS.map((c) => [c.key, c[anchor]]),
    );
    assert.equal(scoreTrackingComponents(values).score, expected);
  }
  const values = Object.fromEntries(TRACKING_COMPONENTS.map((c) => [c.key, 0]));
  assert.equal(scoreTrackingComponents(values).score, 100);
  for (const c of TRACKING_COMPONENTS) {
    assert.equal(
      scoreTrackingComponents({ ...values, [c.key]: null }).score,
      null,
    );
    assert.equal(
      scoreTrackingComponents({ ...values, [c.key]: NaN }).score,
      null,
    );
    assert.equal(
      scoreTrackingComponents({ ...values, [c.key]: -1 }).score,
      null,
    );
    assert.ok(
      Math.abs(
        scoreTrackingComponents({ ...values, [c.key]: c.poor * 2 }).score -
          (100 - c.weight * 100),
      ) < 1e-10,
    );
  }
});

test("TCS colors cover every boundary, displayed rounding and missing values", () => {
  for (const [value, key] of [
    [0, "poor"],
    [59.9, "poor"],
    [60, "unstable"],
    [69.9, "unstable"],
    [70, "moderate"],
    [79.9, "moderate"],
    [80, "strong"],
    [89.9, "strong"],
    [90, "excellent"],
    [100, "excellent"],
    [79.99, "strong"],
  ])
    assert.equal(trackingBand(value).key, key);
  for (const value of [null, undefined, NaN, Infinity, -1, 101])
    assert.equal(trackingBand(value).key, "unavailable");
});

test("confidence reflects available duration, distance, recording support and accuracy", () => {
  const records = track({ seconds: 600 });
  assert.equal(trackingEvidence(records, [], 0, 600).confidence, "MEDIUM");
  assert.equal(
    trackingEvidence(
      records.map((p) => ({ ...p, gps_accuracy_m: 3 })),
      [],
      0,
      600,
    ).confidence,
    "HIGH",
  );
  const short = trackingEvidence(records, [], 0, 120);
  assert.equal(short.score, 100);
  assert.equal(short.confidence, "LOW");
  assert.equal(trackingEvidence(records, [], 0, 55).confidence, "INVALID");
  assert.equal(
    trackingEvidence(
      records.map((p) => ({ ...p, gps_accuracy_m: 30 })),
      [],
      0,
      600,
    ).score,
    null,
  );
  assert.equal(
    trackingEvidence(records, [{ start: 10, end: 590 }], 0, 600).score,
    null,
  );
});

test("reported falls and interruptions exclude reference support without excluding untimed hypotheses", () => {
  const records = track({ seconds: 600, zig: 6 });
  const annotations = [
    { kind: "fall", start_s: 250, end_s: 270 },
    { kind: "interruption", start_s: 450, end_s: 450 },
    { kind: "note", start_s: 100, end_s: 150 },
  ];
  const result = trackingEvidence(records, [], 0, 600, { annotations });
  assert.ok(result.excluded_reasons.reported_interruption >= 80);
  assert.ok(result.segments.every((s) => !(s.start_s < 285 && s.end_s > 235)));
  assert.ok(result.segments.every((s) => !(s.start_s < 465 && s.end_s > 435)));
  assert.deepEqual(
    intervalStatistics(records, [], 0, 600, { annotations }).tracking,
    result,
  );
  const noteOnly = trackingEvidence(records, [], 0, 600, {
    annotations: [annotations[2]],
  });
  assert.deepEqual(noteOnly, trackingEvidence(records, [], 0, 600));
});

test("cycle counting preserves complete cycles across minute boundaries and never joins separate runs", () => {
  const records = track({ seconds: 600, step: 1, zig: 6 });
  const uninterrupted = trackingEvidence(records, [], 0, 600);
  assert.equal(uninterrupted.resolved_cycles, 9);
  const paused = trackingEvidence(records, [{ start: 280, end: 320 }], 0, 600);
  const before = trackingEvidence(records, [], 0, 280),
    after = trackingEvidence(records, [], 320, 600);
  assert.equal(
    paused.resolved_cycles,
    before.resolved_cycles + after.resolved_cycles,
  );
  assert.ok(paused.segments.every((s) => s.end_s <= 265 || s.start_s >= 335));
});

test("TCS is mirrored-course invariant and its source is never mutated", () => {
  const records = track({ seconds: 600, zig: 6 }),
    original = structuredClone(records);
  const positive = trackingEvidence(records, [], 0.5, 599.5);
  const mirrored = trackingEvidence(
    records.map((p) => ({ ...p, longitude_deg: -234.4 - p.longitude_deg })),
    [],
    0.5,
    599.5,
  );
  assert.ok(Math.abs(positive.score - mirrored.score) < 1e-5);
  assert.ok(Math.abs(positive.corridor_p95_m - mirrored.corridor_p95_m) < 1e-5);
  assert.deepEqual(records, original);
});

test("a changed method replaces old path scores instead of mixing them into comparisons", () => {
  const records = track({ seconds: 600, zig: 6 });
  const previous = { method: "sup_deterministic_v2", zigzag: { score: 99 } };
  const result = ensureIntervalStatistics(records, [], 0, 600, previous);
  assert.equal(result.method, ANALYSIS_METHOD);
  assert.equal(result.tracking.score_version, "TCS_v1");
  assert.equal(result.zigzag, undefined);
  assert.ok(result.tracking.score < 90);
});
