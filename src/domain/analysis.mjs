import { bestWindows, interpolate, validRuns } from "./metrics.mjs";
import { intervalRecords } from "./telemetry.mjs";
import { trackingEvidence } from "./tracking.mjs";
import { movementEvidence } from "./events.mjs";
import { matchedWindowDrift } from "./drift.mjs";

export const ANALYSIS_METHOD = "sup_deterministic_v3";
export const POLICY = Object.freeze({
  gap_limit_s: 15,
  distance_speed_limit_mps: 8,
  tie_tolerance_mps: 1e-9,
});

// Hold the left sample to the next timestamp. Clip weighting, never invent
// boundary observations or extrapolate through missing data, gaps or pauses.
export function intervalStatistics(
  records,
  pauses,
  start,
  end,
  { tracking = true, annotations = [] } = {},
) {
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start
  )
    throw new Error("Invalid analysis interval.");
  records = intervalRecords(records, start, end);
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
      standard_deviation: covered_s
        ? Math.sqrt(
            samples.reduce((n, s) => n + s.seconds * (s.value - mean) ** 2, 0) /
              covered_s,
          )
        : null,
      median,
      max: values.length ? values.reduce((a, b) => Math.max(a, b)) : null,
      covered_s,
      excluded_s: Math.max(0, end - start - covered_s),
      reason: covered_s
        ? null
        : "No supported consecutive samples for this channel.",
      coverage_pct: end > start ? (100 * covered_s) / (end - start) : null,
      mean_method: "time_weighted_step_v1",
      median_method: "time_weighted_step_lower_v1",
      max_source: "recorded_samples",
    };
  }
  let distance = 0,
    covered = 0,
    squaredSpeedSeconds = 0;
  for (const run of validRuns(records, pauses, false)) {
    const a = Math.max(start, run[0].elapsed_s),
      b = Math.min(end, run.at(-1).elapsed_s);
    if (b <= a) continue;
    distance += interpolate(run, b).distance_m - interpolate(run, a).distance_m;
    covered += b - a;
    for (let i = 1; i < run.length; i++) {
      const left = run[i - 1],
        right = run[i];
      const seconds = Math.max(
        0,
        Math.min(end, right.elapsed_s) - Math.max(start, left.elapsed_s),
      );
      squaredSpeedSeconds +=
        seconds *
        ((right.distance_m - left.distance_m) /
          (right.elapsed_s - left.elapsed_s)) **
          2;
    }
  }
  const stroke = intervalStrokeDistance(records, pauses, start, end);
  const paused_s = pauses.reduce(
    (n, p) => n + Math.max(0, Math.min(end, p.end) - Math.max(start, p.start)),
    0,
  );
  const active_s = Math.max(0, end - start - paused_s);
  const requiredRecords = records.map((p) => ({
    ...p,
    cadence_raw:
      Number.isFinite(p.heart_rate_bpm) && p.heart_rate_bpm > 0
        ? p.cadence_raw
        : null,
  }));
  const joint = intervalStrokeDistance(requiredRecords, pauses, start, end);
  const hrDistance = intervalStrokeDistance(
    records.map((p) => ({
      ...p,
      cadence_raw:
        Number.isFinite(p.heart_rate_bpm) && p.heart_rate_bpm > 0 ? 1 : null,
    })),
    pauses,
    start,
    end,
  );
  const firstIndex = records[0]?.source_record_index,
    lastIndex = records.at(-1)?.source_record_index;
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
    source_record_range:
      Number.isFinite(firstIndex) && Number.isFinite(lastIndex)
        ? [firstIndex, lastIndex + 1]
        : null,
    joint_hr_cadence_distance: {
      covered_s: joint.covered_s,
      coverage_pct:
        end > start ? (100 * joint.covered_s) / (end - start) : null,
    },
    joint_hr_distance: {
      covered_s: hrDistance.covered_s,
      coverage_pct:
        end > start ? (100 * hrDistance.covered_s) / (end - start) : null,
    },
    policy: POLICY,
    ...channels,
    distance: {
      value_m: covered ? distance : null,
      covered_s: covered,
      mean_speed_mps: covered ? distance / covered : null,
      standard_deviation: covered
        ? Math.sqrt(
            Math.max(
              0,
              squaredSpeedSeconds / covered - (distance / covered) ** 2,
            ),
          )
        : null,
      method: "sum_of_eligible_distance_segments_v1",
    },
    distance_per_stroke: stroke,
    speed_cadence: {
      speed_mps: stroke.covered_s ? stroke.distance_m / stroke.covered_s : null,
      cadence_spm: stroke.covered_s
        ? (stroke.estimated_strokes * 60) / stroke.covered_s
        : null,
      covered_s: stroke.covered_s,
      requested_s: end - start,
      timer_eligible_s: active_s,
      coverage_pct: active_s > 0 ? (100 * stroke.covered_s) / active_s : null,
      elapsed_coverage_pct: stroke.coverage_pct,
      method: "matched_distance_cadence_v1",
      source: "derived",
      reason: stroke.covered_s
        ? null
        : "No matched distance and cadence support.",
    },
    ...(tracking
      ? {
          tracking: trackingEvidence(records, pauses, start, end, {
            annotations,
          }),
        }
      : {}),
  };
}

export function analyzeTelemetry(
  records,
  pauses,
  elapsed,
  sourceRef = null,
  context = {},
) {
  const windows = bestWindows(records, pauses, false, elapsed).map((w) => ({
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
        : intervalStatistics(records, pauses, w.start, w.end, {
            annotations: context.annotations,
          }),
  }));
  const movement = movementEvidence(records, pauses, elapsed);
  return {
    method: ANALYSIS_METHOD,
    computed_at_utc: new Date().toISOString(),
    source: "derived",
    source_ref: sourceRef,
    policy: POLICY,
    summary: intervalStatistics(records, pauses, 0, elapsed, {
      annotations: context.annotations,
    }),
    windows,
    movement,
    drift: matchedWindowDrift(
      records,
      pauses,
      elapsed,
      context,
      (start, end) =>
        intervalStatistics(records, pauses, start, end, { tracking: false }),
      movement,
    ),
    dps_timeline: strokeDistanceTimeline(records, pauses),
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

// One current contract. Old calculations are discarded, not maintained in parallel.
export function ensureIntervalStatistics(
  records,
  pauses,
  start,
  end,
  existing,
  annotations = [],
) {
  if (start == null || end == null) return existing ?? null;
  if (!existing)
    return intervalStatistics(records, pauses, start, end, { annotations });
  if (existing.method === ANALYSIS_METHOD) return existing;
  return intervalStatistics(records, pauses, start, end, { annotations });
}

export function ensureWindowStatistics(
  windows,
  records,
  pauses,
  annotations = [],
) {
  return windows.map((w) => ({
    ...w,
    statistics: ensureIntervalStatistics(
      records,
      pauses,
      w.start,
      w.end,
      w.statistics,
      annotations,
    ),
  }));
}

export function strokeDistanceTimeline(records, pauses, window_s = 30) {
  return records.map((p, i) => {
    const start = p.elapsed_s - window_s;
    const previous = records[i - 1];
    const endpointSupported =
      previous &&
      [previous, p].every(
        (r) =>
          Number.isFinite(r.cadence_raw) &&
          r.cadence_raw >= 0 &&
          Number.isFinite(r.distance_m),
      ) &&
      p.elapsed_s > previous.elapsed_s &&
      p.elapsed_s - previous.elapsed_s <= 15 &&
      p.distance_m >= previous.distance_m &&
      (p.distance_m - previous.distance_m) /
        (p.elapsed_s - previous.elapsed_s) <=
        8;
    if (
      !endpointSupported ||
      start < (records[0]?.elapsed_s ?? 0) ||
      pauses.some((g) => p.elapsed_s >= g.start && p.elapsed_s <= g.end)
    )
      return {
        elapsed_s: p.elapsed_s,
        value_m: null,
        coverage_pct: 0,
        window_s,
      };
    const evidence = intervalStrokeDistance(
      intervalRecords(records, start, p.elapsed_s),
      pauses,
      start,
      p.elapsed_s,
    );
    return {
      elapsed_s: p.elapsed_s,
      value_m: evidence.coverage_pct >= 90 ? evidence.value_m : null,
      coverage_pct: evidence.coverage_pct,
      window_s,
    };
  });
}
