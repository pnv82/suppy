import { bestWindows, interpolate, validRuns } from "./metrics.mjs";

export const ANALYSIS_METHOD = "sup_deterministic_v1";
export const POLICY = Object.freeze({
  gap_limit_s: 15,
  distance_speed_limit_mps: 8,
  tie_tolerance_mps: 1e-9,
});

// Hold the left sample to the next timestamp. Clip weighting, never invent
// boundary observations or extrapolate through missing data, gaps or pauses.
export function intervalStatistics(records, pauses, start, end) {
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start
  )
    throw new Error("Invalid analysis interval.");
  const channels = {};
  for (const key of ["speed_mps", "heart_rate_bpm", "cadence_raw"]) {
    const valid = (v) =>
      Number.isFinite(v) && (key === "heart_rate_bpm" ? v > 0 : v >= 0);
    const samples = [];
    for (let i = 0; i < records.length - 1; i++) {
      const a = records[i],
        b = records[i + 1];
      const dt = b.elapsed_s - a.elapsed_s;
      if (
        !Number.isFinite(a.elapsed_s) ||
        !Number.isFinite(b.elapsed_s) ||
        dt <= 0 ||
        dt > POLICY.gap_limit_s ||
        !valid(a[key]) ||
        !valid(b[key]) ||
        pauses.some((p) => a.elapsed_s < p.end && b.elapsed_s > p.start)
      )
        continue;
      const seconds = Math.min(end, b.elapsed_s) - Math.max(start, a.elapsed_s);
      if (seconds > 0) samples.push({ value: a[key], seconds });
    }
    const covered_s = samples.reduce((n, s) => n + s.seconds, 0);
    const mean = covered_s
      ? samples.reduce((n, s) => n + s.value * s.seconds, 0) / covered_s
      : null;
    samples.sort((a, b) => a.value - b.value);
    let weight = 0,
      median = null;
    for (const s of samples) {
      weight += s.seconds;
      if (weight >= covered_s / 2) {
        median = s.value;
        break;
      }
    }
    const values = records
      .filter(
        (p) =>
          p.elapsed_s >= start &&
          p.elapsed_s <= end &&
          !pauses.some((g) => p.elapsed_s > g.start && p.elapsed_s < g.end),
      )
      .map((p) => p[key])
      .filter(valid);
    channels[key] = {
      mean,
      median,
      max: values.length ? values.reduce((a, b) => Math.max(a, b)) : null,
      covered_s,
      coverage_pct: end > start ? (100 * covered_s) / (end - start) : null,
      mean_method: "time_weighted_step_v1",
      median_method: "time_weighted_step_lower_v1",
      max_source: "recorded_samples",
    };
  }
  let distance = 0,
    covered = 0;
  for (const run of validRuns(records, pauses, false)) {
    const a = Math.max(start, run[0].elapsed_s),
      b = Math.min(end, run.at(-1).elapsed_s);
    if (b <= a) continue;
    distance += interpolate(run, b).distance_m - interpolate(run, a).distance_m;
    covered += b - a;
  }
  return {
    method: ANALYSIS_METHOD,
    source: "derived",
    units: {
      speed_mps: "m/s",
      heart_rate_bpm: "bpm",
      cadence_raw: "raw FIT cadence",
      distance: "m",
      time: "s",
    },
    interval: { start_s: start, end_s: end },
    policy: POLICY,
    ...channels,
    distance: {
      value_m: covered ? distance : null,
      covered_s: covered,
      mean_speed_mps: covered ? distance / covered : null,
      method: "sum_of_eligible_distance_segments_v1",
    },
    distance_per_stroke: {
      value_m: null,
      reason:
        "No validated interval stroke count; raw cadence is not converted to strokes.",
    },
  };
}

export function analyzeTelemetry(records, pauses, elapsed, sourceRef = null) {
  const windows = bestWindows(records, pauses, false).map((w) => ({
    ...w,
    method: "elapsed_continuous_v1",
    source: "derived",
    source_ref: sourceRef,
    reason:
      w.start === null
        ? `No continuous ${w.duration}-second run with valid distance, gaps ≤15 s and no timer pause.`
        : null,
    statistics:
      w.start === null
        ? null
        : intervalStatistics(records, pauses, w.start, w.end),
  }));
  return {
    method: ANALYSIS_METHOD,
    source: "derived",
    source_ref: sourceRef,
    policy: POLICY,
    summary: intervalStatistics(records, pauses, 0, elapsed),
    windows,
  };
}
