import {
  angleDifference,
  finite,
  geoBearing,
  geoDistance,
  hasGps,
  intervalRecords,
  lowerBound,
  overlaps,
  weightedQuantile,
} from "./telemetry.mjs";

export const TRACKING_METHOD = "local_path_straightness_v1";
export const TRACKING_POLICY = Object.freeze({
  section_s: 60,
  minimum_section_s: 30,
  sample_step_s: 10,
  smoothing_radius_s: 5,
  gap_limit_s: 15,
  minimum_samples_per_section: 7,
  minimum_covered_s: 60,
  minimum_coverage_pct: 20,
  minimum_speed_mps: 1,
  maximum_speed_mps: 8,
  turn_change_deg: 25,
  maximum_local_deviation_deg: 60,
  maximum_reported_accuracy_m: 20,
  oscillation_excursion_deg: 3,
});

function gpsRuns(records, pauses) {
  const runs = [];
  let run = [];
  for (const p of records) {
    const last = run.at(-1);
    const valid =
      finite(p.elapsed_s) &&
      hasGps(p) &&
      (!finite(p.gps_accuracy_m) ||
        p.gps_accuracy_m <= TRACKING_POLICY.maximum_reported_accuracy_m) &&
      !pauses.some((g) => p.elapsed_s > g.start && p.elapsed_s < g.end);
    const dt = last ? p.elapsed_s - last.elapsed_s : 0;
    const broken =
      !valid ||
      (last &&
        (dt <= 0 ||
          dt > TRACKING_POLICY.gap_limit_s ||
          overlaps(last.elapsed_s, p.elapsed_s, pauses) ||
          geoDistance(last, p) / dt > TRACKING_POLICY.maximum_speed_mps));
    if (broken && run.length) {
      runs.push(run);
      run = [];
    }
    if (valid) run.push(p);
  }
  if (run.length) runs.push(run);
  return runs;
}

function pointAt(run, t) {
  const i = lowerBound(run, t);
  if (run[i]?.elapsed_s === t) return run[i];
  const a = run[i - 1],
    b = run[i];
  if (!a || !b || b.elapsed_s - a.elapsed_s > TRACKING_POLICY.gap_limit_s)
    return null;
  const f = (t - a.elapsed_s) / (b.elapsed_s - a.elapsed_s);
  return {
    elapsed_s: t,
    latitude_deg: a.latitude_deg + f * (b.latitude_deg - a.latitude_deg),
    longitude_deg:
      ((a.longitude_deg +
        f * angleDifference(b.longitude_deg, a.longitude_deg) +
        540) %
        360) -
      180,
  };
}

function smoothedPoint(run, t) {
  const r = TRACKING_POLICY.smoothing_radius_s;
  const a = pointAt(run, t - r),
    b = pointAt(run, t),
    c = pointAt(run, t + r);
  if (!a || !b || !c) return null;
  return {
    elapsed_s: t,
    latitude_deg: (a.latitude_deg + 2 * b.latitude_deg + c.latitude_deg) / 4,
    longitude_deg:
      ((b.longitude_deg +
        (angleDifference(a.longitude_deg, b.longitude_deg) +
          angleDifference(c.longitude_deg, b.longitude_deg)) /
          4 +
        540) %
        360) -
      180,
  };
}

// Experimental geometry, never board yaw, energy efficiency or a technique diagnosis.
// Every accepted section uses one fixed axis and the SAME smoothed displacements
// for both path length and deviations. The chord/path ratio is bounded by geometry.
export function trackingEvidence(records, pauses, start, end) {
  const policy = TRACKING_POLICY;
  const requested = Math.max(0, end - start);
  const segments = [],
    errors = [],
    excluded = {};
  let path = 0,
    forward = 0,
    lateral = 0,
    covered = 0,
    cycles = 0;
  const reject = (reason, seconds) => {
    excluded[reason] = (excluded[reason] || 0) + seconds;
  };
  const source = intervalRecords(records, start, end);
  for (const run of gpsRuns(source, pauses)) {
    const first = Math.max(start, run[0].elapsed_s) + policy.smoothing_radius_s;
    const last =
      Math.min(end, run.at(-1).elapsed_s) - policy.smoothing_radius_s;
    for (
      let a = first;
      a + policy.minimum_section_s <= last;
      a += policy.section_s
    ) {
      const b = Math.min(a + policy.section_s, last),
        duration = b - a;
      const sampleCount =
        lowerBound(run, b + policy.smoothing_radius_s) -
        lowerBound(run, a - policy.smoothing_radius_s) +
        1;
      if (sampleCount < policy.minimum_samples_per_section) {
        reject("sparse_gps", duration);
        continue;
      }
      const points = [];
      for (let t = a; t < b; t += policy.sample_step_s)
        points.push(smoothedPoint(run, t));
      points.push(smoothedPoint(run, b));
      if (points.some((p) => !p)) {
        reject("unsupported_gps", duration);
        continue;
      }
      const mid = smoothedPoint(run, (a + b) / 2);
      const direction = geoBearing(points[0], points.at(-1));
      const before = geoBearing(points[0], mid),
        after = geoBearing(mid, points.at(-1));
      if (direction == null || before == null || after == null) {
        reject("insufficient_displacement", duration);
        continue;
      }
      if (Math.abs(angleDifference(after, before)) > policy.turn_change_deg) {
        reject("turn", duration);
        continue;
      }
      const steps = points.slice(1).map((p, i) => ({
        distance: geoDistance(points[i], p),
        direction: geoBearing(points[i], p),
        seconds: p.elapsed_s - points[i].elapsed_s,
      }));
      const length = steps.reduce((sum, p) => sum + p.distance, 0);
      if (length / duration < policy.minimum_speed_mps) {
        reject("low_speed", duration);
        continue;
      }
      if (
        steps.some(
          (p) =>
            p.direction == null ||
            p.distance / p.seconds > policy.maximum_speed_mps,
        )
      ) {
        reject("invalid_displacement", duration);
        continue;
      }
      const deviations = steps.map((p) => ({
        ...p,
        error: angleDifference(p.direction, direction),
      }));
      if (
        deviations.some(
          (p) => Math.abs(p.error) > policy.maximum_local_deviation_deg,
        )
      ) {
        reject("turn_or_reversal", duration);
        continue;
      }
      const chord = geoDistance(points[0], points.at(-1));
      let crossings = 0,
        sign = 0;
      for (const step of deviations) {
        errors.push({ value: Math.abs(step.error), seconds: step.seconds });
        lateral +=
          step.distance * Math.abs(Math.sin((step.error * Math.PI) / 180));
        if (Math.abs(step.error) >= policy.oscillation_excursion_deg) {
          const next = Math.sign(step.error);
          if (sign && sign !== next) crossings++;
          sign = next;
        }
      }
      cycles += Math.floor(crossings / 2); // Never join cycles across independent section axes.
      covered += duration;
      path += length;
      forward += chord;
      const sourceStart =
        run[Math.max(0, lowerBound(run, a - policy.smoothing_radius_s) - 1)]
          .source_record_index;
      const sourceEnd =
        run[
          Math.min(
            run.length - 1,
            lowerBound(run, b + policy.smoothing_radius_s),
          )
        ].source_record_index;
      segments.push({
        start_s: a,
        end_s: b,
        score: Math.min(100, (100 * chord) / length),
        path_distance_m: length,
        chord_distance_m: chord,
        source_record_range:
          finite(sourceStart) && finite(sourceEnd)
            ? [sourceStart, sourceEnd + 1]
            : null,
      });
    }
  }
  const coverage = requested > 0 ? (100 * covered) / requested : null;
  const available =
    covered >= policy.minimum_covered_s &&
    coverage >= policy.minimum_coverage_pct &&
    path > 0;
  return {
    method: TRACKING_METHOD,
    source: "derived",
    status: available ? "experimental" : "unavailable",
    score: available
      ? Math.max(0, Math.min(100, (100 * forward) / path))
      : null,
    unit: "0–100",
    interval: { start_s: start, end_s: end },
    policy,
    covered_s: covered,
    requested_s: requested,
    coverage_pct: coverage,
    excluded_s: Math.max(0, requested - covered),
    excluded_reasons: excluded,
    eligible_sections: segments.length,
    path_distance_m: path || null,
    chord_distance_m: path ? forward : null,
    median_course_error_deg: errors.length
      ? weightedQuantile(errors, 0.5)
      : null,
    p90_course_error_deg: errors.length ? weightedQuantile(errors, 0.9) : null,
    zigzag_cycles_per_min: covered ? cycles / (covered / 60) : null,
    resolved_cycles: covered ? cycles : null,
    lateral_motion_m_per_km: path ? (1000 * lateral) / path : null,
    segments,
    reason: available
      ? null
      : "Requires at least 60 eligible seconds and 20% interval coverage, with supported GPS and no major turns.",
    limitations: [
      "Experimental GPS path straightness: higher means straighter eligible local sections, not better technique or lower energy cost.",
      "Five-second smoothing and ten-second geometry steps suppress fine changes; GPS noise and conditions can affect the result.",
      "Turns, low speed, sparse GPS and unsupported boundaries are excluded. Compare coverage alongside the score.",
      ...(source.some((p) => hasGps(p) && !finite(p.gps_accuracy_m))
        ? ["GPS accuracy is not reported for some or all source points."]
        : []),
    ],
  };
}
