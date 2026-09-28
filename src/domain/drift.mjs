import {
  angleDifference,
  finite,
  geoBearing,
  geoDistance,
  hasGps,
  intervalRecords,
  overlaps,
} from "./telemetry.mjs";

export const DRIFT_METHOD = "independent_matched_windows_v1";
export const DRIFT_POLICY = Object.freeze({
  window_s: 180,
  step_s: 30,
  settling_s: 180,
  minimum_coverage_pct: 90,
  hr_sd_bpm: 5,
  cadence_sd_spm: 5,
  hr_tolerance_bpm: 5,
  cadence_tolerance_spm: 3,
  speed_tolerance_fraction: 0.03,
  direction_tolerance_deg: 20,
  maximum_candidate_windows: 1200,
  minimum_pairs_for_summary: 2,
});

const median = (values) => {
  const a = values.filter(finite).sort((x, y) => x - y);
  return a.length
    ? (a[Math.floor((a.length - 1) / 2)] + a[Math.floor(a.length / 2)]) / 2
    : null;
};
const pct = (a, b) =>
  finite(a) && finite(b) && a > 0 ? (100 * (b - a)) / a : null;
const summaryOf = (stats, start, end, bearing) => ({
  start_s: start,
  end_s: end,
  speed_mps: stats.distance.mean_speed_mps,
  cadence_spm: stats.cadence_raw.mean,
  heart_rate_bpm: stats.heart_rate_bpm.mean,
  distance_per_stroke_m: stats.distance_per_stroke.value_m,
  speed_sd: stats.distance.standard_deviation,
  cadence_sd: stats.cadence_raw.standard_deviation,
  hr_sd: stats.heart_rate_bpm.standard_deviation,
  speed_coverage_pct: (100 * stats.distance.covered_s) / (end - start),
  cadence_coverage_pct: stats.cadence_raw.coverage_pct,
  hr_coverage_pct: stats.heart_rate_bpm.coverage_pct,
  joint_coverage_pct: stats.speed_cadence?.coverage_pct,
  joint_hr_coverage_pct: stats.joint_hr_cadence_distance.coverage_pct,
  hr_distance_coverage_pct: stats.joint_hr_distance.coverage_pct,
  bearing_deg: bearing,
  supported_s: stats.distance.covered_s,
});

// Descriptive within-session matching. It does not estimate a physiological cause.
export function matchedWindowDrift(
  records,
  pauses,
  elapsed,
  context,
  statisticsFor,
  movement,
) {
  const policy = DRIFT_POLICY;
  const modes = ["speed_at_effort", "hr_at_speed", "cadence_at_speed"];
  const step = Math.max(
    policy.step_s,
    Math.ceil(elapsed / policy.maximum_candidate_windows / policy.step_s) *
      policy.step_s,
  );
  const annotations = (context.annotations || [])
    .filter((a) => ["interruption", "fall"].includes(a.kind))
    .map((a) => ({
      start: a.start_s,
      end: a.end_s === a.start_s ? a.start_s + 1 : a.end_s,
    }));
  const exclusions = [
    ...pauses,
    ...annotations,
    ...movement.events
      .filter((e) => e.type === "low_speed")
      .map((e) => ({ start: e.start_s, end: e.end_s })),
  ];
  const early = [],
    late = [];
  let rejected = 0;
  for (
    let start = policy.settling_s;
    start + policy.window_s <= elapsed;
    start += step
  ) {
    const end = start + policy.window_s;
    const group =
      end <= elapsed / 3 ? early : start >= (elapsed * 2) / 3 ? late : null;
    if (!group) continue;
    if (overlaps(start, end, exclusions)) {
      rejected++;
      continue;
    }
    const slice = intervalRecords(records, start, end);
    const usableGps = (p) =>
      hasGps(p) && (!finite(p.gps_accuracy_m) || p.gps_accuracy_m <= 20);
    const gps = slice.filter(
      (p) => p.elapsed_s >= start && p.elapsed_s <= end && usableGps(p),
    );
    let gpsSeconds = 0;
    for (let i = 1; i < slice.length; i++) {
      const a = slice[i - 1],
        b = slice[i],
        dt = b.elapsed_s - a.elapsed_s;
      if (
        usableGps(a) &&
        usableGps(b) &&
        dt > 0 &&
        dt <= 15 &&
        geoDistance(a, b) / dt <= 8
      )
        gpsSeconds += Math.max(
          0,
          Math.min(end, b.elapsed_s) - Math.max(start, a.elapsed_s),
        );
    }
    if (gps.length < 3 || gpsSeconds < policy.window_s * 0.9) {
      rejected++;
      continue;
    }
    const first = gps[0],
      last = gps.at(-1),
      mid = gps[Math.floor(gps.length / 2)];
    const a = geoBearing(first, mid),
      b = geoBearing(mid, last),
      heading = geoBearing(first, last);
    if (
      a == null ||
      b == null ||
      heading == null ||
      Math.abs(angleDifference(a, b)) > policy.direction_tolerance_deg
    ) {
      rejected++;
      continue;
    }
    const stats = statisticsFor(start, end);
    const win = summaryOf(stats, start, end, heading);
    if (
      !(win.speed_mps >= 0.5) ||
      win.speed_coverage_pct < policy.minimum_coverage_pct
    ) {
      rejected++;
      continue;
    }
    group.push(win);
  }
  const hrWarning = /suspect|unreliable|invalid/i.test(context.hrQuality || "");
  const limitations = [
    "Matching recorded signals does not establish equal effort or a fatigue diagnosis.",
    "Current, chop, drafting and local wind are not normalized; station observations do not prove conditions were equivalent.",
    ...(context.boardId ? [] : ["Board not recorded."]),
    ...(hrWarning
      ? ["HR quality is flagged; HR-dependent comparisons are unavailable."]
      : []),
  ];
  const results = {};
  for (const mode of modes) {
    const stable = (w) => {
      const cadenceOK =
        w.cadence_coverage_pct >= 90 &&
        finite(w.cadence_sd) &&
        w.cadence_sd <= policy.cadence_sd_spm;
      const hrOK =
        !hrWarning &&
        w.hr_coverage_pct >= 90 &&
        finite(w.hr_sd) &&
        w.hr_sd <= policy.hr_sd_bpm;
      const speedOK =
        finite(w.speed_sd) && w.speed_sd <= Math.max(0.1, w.speed_mps * 0.07);
      if (mode === "speed_at_effort")
        return hrOK && cadenceOK && w.joint_hr_coverage_pct >= 90;
      return (
        speedOK &&
        (mode === "hr_at_speed"
          ? hrOK && w.hr_distance_coverage_pct >= 90
          : cadenceOK && w.joint_coverage_pct >= 90)
      );
    };
    const candidates = [];
    for (const a of early.filter(stable))
      for (const b of late.filter(stable)) {
        if (
          Math.abs(angleDifference(a.bearing_deg, b.bearing_deg)) >
          policy.direction_tolerance_deg
        )
          continue;
        const hrDifference = Math.abs(a.heart_rate_bpm - b.heart_rate_bpm);
        const cadenceDifference = Math.abs(a.cadence_spm - b.cadence_spm);
        const speedDifference =
          Math.abs(a.speed_mps - b.speed_mps) /
          Math.max(a.speed_mps, b.speed_mps);
        if (
          mode === "speed_at_effort"
            ? hrDifference > 5 || cadenceDifference > 3
            : speedDifference > policy.speed_tolerance_fraction
        )
          continue;
        candidates.push({
          early: a,
          late: b,
          match_error:
            mode === "speed_at_effort"
              ? hrDifference / 5 + cadenceDifference / 3
              : speedDifference / policy.speed_tolerance_fraction,
        });
      }
    candidates.sort(
      (a, b) =>
        a.match_error - b.match_error ||
        a.early.start_s - b.early.start_s ||
        a.late.start_s - b.late.start_s,
    );
    const used = [],
      pairs = [];
    for (const pair of candidates) {
      if (
        [pair.early, pair.late].some((w) => overlaps(w.start_s, w.end_s, used))
      )
        continue;
      for (const w of [pair.early, pair.late])
        used.push({ start: w.start_s, end: w.end_s });
      const a = pair.early,
        b = pair.late;
      const changes = {
        speed_pct: pct(a.speed_mps, b.speed_mps),
        cadence_pct: pct(a.cadence_spm, b.cadence_spm),
        dps_pct: pct(a.distance_per_stroke_m, b.distance_per_stroke_m),
        hr_bpm:
          finite(a.heart_rate_bpm) && finite(b.heart_rate_bpm)
            ? b.heart_rate_bpm - a.heart_rate_bpm
            : null,
      };
      pairs.push({ ...pair, changes });
    }
    const mainKey =
      mode === "speed_at_effort"
        ? "speed_pct"
        : mode === "hr_at_speed"
          ? "hr_bpm"
          : "cadence_pct";
    const values = pairs.map((p) => p.changes[mainKey]).filter(finite);
    results[mode] = {
      status:
        pairs.length >= policy.minimum_pairs_for_summary
          ? "descriptive"
          : pairs.length
            ? "single_pair"
            : "unavailable",
      pair_count: pairs.length,
      unique_supported_s: pairs.reduce(
        (n, p) => n + p.early.supported_s + p.late.supported_s,
        0,
      ),
      change:
        pairs.length >= policy.minimum_pairs_for_summary
          ? median(values)
          : null,
      unit: mode === "hr_at_speed" ? "bpm" : "%",
      range: values.length ? [Math.min(...values), Math.max(...values)] : null,
      pairs,
      reason: pairs.length
        ? null
        : hrWarning && mode !== "cadence_at_speed"
          ? "HR quality warning prevents this comparison."
          : "No independent early/late windows meet coverage, stability, direction and matching rules.",
    };
  }
  return {
    method: DRIFT_METHOD,
    source: "derived",
    status: "descriptive_only",
    policy: { ...policy, search_step_s: step },
    early_candidate_count: early.length,
    late_candidate_count: late.length,
    rejected_candidates: rejected,
    comparison_quality: "conditions_not_normalized",
    limitations,
    modes: results,
  };
}
