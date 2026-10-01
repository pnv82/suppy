// Synthetic reproduction only. No database, private telemetry or network access.
// Run: node scripts/review-dps-outliers.mjs
import assert from "node:assert/strict";
import {
  intervalStrokeDistance,
  strokeDistanceTimeline,
} from "../src/domain/analysis.mjs";

function example(name, speed, cadence) {
  const records = Array.from({ length: 31 }, (_, t) => ({
    elapsed_s: t,
    distance_m: t * speed,
    speed_mps: speed,
    cadence_raw: cadence(t),
    source_record_index: t,
  }));
  const evidence = intervalStrokeDistance(records, [], 0, 30);
  const displayed = strokeDistanceTimeline(records, []).at(-1).value_m;
  return {
    name,
    distance_m: evidence.distance_m,
    estimated_strokes: evidence.estimated_strokes,
    coverage_pct: evidence.coverage_pct,
    current_display_m: displayed,
    candidate_min_3_strokes_m:
      evidence.estimated_strokes >= 3 ? displayed : null,
  };
}
const results = [
  example("Steady recorded paddling", 2, () => 30),
  example("29 seconds of zero cadence, then one second at 18 spm", 0.5, (t) =>
    t < 29 ? 0 : 18,
  ),
  example("Zero recorded cadence throughout", 0.5, () => 0),
  example("Missing cadence throughout", 0.5, () => null),
  example("Continuous but very low recorded cadence", 0.5, () => 1),
];
assert.equal(results[0].current_display_m, 4);
assert.equal(results[1].current_display_m, 50);
assert.equal(results[1].coverage_pct, 100);
assert.equal(results[1].candidate_min_3_strokes_m, null);
assert.equal(results[2].current_display_m, null);
assert.equal(results[3].current_display_m, null);
assert.ok(Math.abs(results[4].current_display_m - 30) < 1e-10);
console.table(results);
