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
    distance_per_stroke: intervalStrokeDistance(records, pauses, start, end),
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

export const INTERVAL_STROKE_METHOD = "matched_distance_cadence_integral_v1";

// Cadence is interpreted as strokes/minute for this labelled SUP estimate.
// Distance and cadence must cover the SAME edges, including clipped boundaries.
export function intervalStrokeDistance(records, pauses, start, end) {
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start
  )
    throw new Error("Invalid analysis interval.");
  let distance_m = 0,
    estimated_strokes = 0,
    covered_s = 0;
  for (const run of validRuns(records, pauses, false)) {
    for (let i = 0; i < run.length - 1; i++) {
      const a = run[i],
        b = run[i + 1];
      if (
        ![a.cadence_raw, b.cadence_raw].every(
          (v) => Number.isFinite(v) && v >= 0,
        )
      )
        continue;
      const seconds = Math.min(end, b.elapsed_s) - Math.max(start, a.elapsed_s);
      if (seconds <= 0) continue;
      distance_m +=
        ((b.distance_m - a.distance_m) * seconds) / (b.elapsed_s - a.elapsed_s);
      estimated_strokes += (a.cadence_raw * seconds) / 60;
      covered_s += seconds;
    }
  }
  return {
    value_m: estimated_strokes > 0 ? distance_m / estimated_strokes : null,
    method: INTERVAL_STROKE_METHOD,
    source: "derived",
    status: "cadence_estimate",
    distance_m: covered_s ? distance_m : null,
    estimated_strokes: covered_s ? estimated_strokes : null,
    covered_s,
    coverage_pct: end > start ? (100 * covered_s) / (end - start) : null,
    reason: !covered_s
      ? "No overlapping valid distance and cadence data."
      : estimated_strokes <= 0
        ? "No positive cadence over the covered interval."
        : null,
    assumption:
      "Raw SUP cadence is treated as strokes/minute without a cycle multiplier. This is an estimate, not a measured stroke count or biomechanical efficiency.",
  };
}

// Lazy upgrade of old persisted evidence: preserve present values and other metrics.
// A current-method null is a calculated missing-data result, not a stale cache.
export function ensureIntervalStatistics(
  records,
  pauses,
  start,
  end,
  existing,
) {
  if (start == null || end == null) return existing ?? null;
  if (!existing) return intervalStatistics(records, pauses, start, end);
  const stroke = existing.distance_per_stroke;
  if (
    Number.isFinite(stroke?.value_m) ||
    stroke?.method === INTERVAL_STROKE_METHOD
  )
    return existing;
  return {
    ...existing,
    distance_per_stroke: intervalStrokeDistance(records, pauses, start, end),
  };
}

export function ensureWindowStatistics(windows, records, pauses) {
  return windows.map((w) => ({
    ...w,
    statistics: ensureIntervalStatistics(
      records,
      pauses,
      w.start,
      w.end,
      w.statistics,
    ),
  }));
}
