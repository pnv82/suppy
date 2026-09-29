import test from "node:test";
import assert from "node:assert/strict";
import { movementEvidence } from "../src/domain/events.mjs";

// Synthetic immersion: a sharp stop with two supported low-speed edges,
// cooling that lags the speed change, and nonzero watch cadence throughout.
export function immersionRecords() {
  return Array.from({ length: 25 }, (_, i) => {
    const t = i * 5;
    return {
      elapsed_s: t,
      timestamp_utc: new Date(Date.UTC(2026, 0, 1) + t * 1000).toISOString(),
      speed_mps: t >= 40 && t <= 60 ? 0 : 2,
      distance_m: t < 40 ? t * 2 : t <= 60 ? 80 : 80 + (t - 60) * 2,
      latitude_deg: null,
      longitude_deg: null,
      cadence_raw: 40,
      temperature_c: t < 50 ? 27 : 25,
      source_record_index: i,
    };
  });
}
test("abrupt corroborated stop and cooling produce one candidate with timing and source evidence", () => {
  const m = movementEvidence(immersionRecords(), [], 120);
  assert.equal(m.events.length, 1);
  const e = m.events[0];
  assert.equal(e.type, "possible_fall");
  assert.equal(e.status, "candidate");
  assert.deepEqual(e.onset_bracket_s, [35, 40]);
  assert.equal(e.evidence.temperature_drop_c, 2);
  assert.equal(e.evidence.cadence_zero_observed, false);
  assert.deepEqual(e.evidence.source_record_range, [7, 12]);
});
test("ordinary stops and missing temperature stay low-speed; cooling while moving and timer pauses are not falls", () => {
  const r = immersionRecords();
  for (const points of [
    r.map((p) => ({ ...p, temperature_c: 27 })),
    r.map((p) => ({ ...p, temperature_c: null })),
    r.map((p) => ({ ...p, speed_mps: 2, distance_m: p.elapsed_s * 2 })),
    r.map((p) => ({ ...p, speed_mps: 0, distance_m: 0 })),
    r.map((p) => ({ ...p, distance_m: p.elapsed_s * 2 })),
    r.map((p) => ({ ...p, temperature_c: p.elapsed_s === 50 ? 25 : 27 })),
  ])
    assert.equal(
      movementEvidence(points, [], 120).events.some(
        (e) => e.type === "possible_fall",
      ),
      false,
    );
  assert.equal(
    movementEvidence(
      r.map((p) => ({ ...p, temperature_c: null })),
      [],
      120,
    ).events[0].type,
    "low_speed",
  );
  const paused = movementEvidence(r, [{ start: 35, end: 65 }], 120);
  assert.deepEqual(paused.events, []);
  assert.equal(paused.explicit_paused_s, 30);
});
test("missing observations, unsupported gaps and pauses cannot bridge motion to cooling", () => {
  const r = immersionRecords();
  const lateCooling = r.map((p) => ({
    ...p,
    temperature_c: p.elapsed_s < 80 ? 27 : 25,
  }));
  assert.equal(movementEvidence(lateCooling, [], 120).events.length, 1);
  assert.deepEqual(
    movementEvidence(
      lateCooling.filter((p) => p.elapsed_s < 65 || p.elapsed_s > 85),
      [],
      120,
    ).events,
    [],
  );
  assert.equal(
    movementEvidence(lateCooling, [{ start: 65, end: 70 }], 120).events.some(
      (e) => e.type === "possible_fall",
    ),
    false,
  );
  assert.equal(
    movementEvidence(
      lateCooling.map((p) => ({
        ...p,
        temperature_c: p.elapsed_s === 70 ? null : p.temperature_c,
      })),
      [],
      120,
    ).events.some((e) => e.type === "possible_fall"),
    false,
  );
  assert.deepEqual(movementEvidence(r, [], 45).events, []);
});
test("short fluctuations and launch/finish stops are hidden, sustained internal slowdowns remain", () => {
  const normal = immersionRecords().map((p) => ({ ...p, temperature_c: null }));
  assert.equal(movementEvidence(normal, [], 120).events.length, 1);
  const short = normal.map((p) => ({
    ...p,
    speed_mps: p.elapsed_s === 60 ? 2 : p.speed_mps,
  }));
  assert.equal(movementEvidence(short, [], 120).events.length, 0);
  assert.equal(
    movementEvidence(
      normal.filter((p) => p.elapsed_s >= 40),
      [],
      120,
    ).events.length,
    0,
  );
  assert.equal(
    movementEvidence(
      normal.filter((p) => p.elapsed_s <= 60),
      [],
      60,
    ).events.length,
    0,
  );
});
test("athlete annotations are linked without promoting the heuristic to confirmation", () => {
  const annotations = [
    { id: "reported", kind: "fall", start_s: 34, end_s: 34 },
  ];
  const m = movementEvidence(immersionRecords(), [], 120, annotations);
  assert.deepEqual(m.events[0].annotation_ids, ["reported"]);
  assert.equal(m.events[0].status, "candidate");
  assert.equal(annotations[0].start_s, 34);
});
