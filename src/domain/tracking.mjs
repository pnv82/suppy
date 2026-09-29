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
export const TRACKING_METHOD = "TCS_v1";
export const TRACKING_POLICY = Object.freeze({
  local_radius_s: 3,
  reference_radius_s: 15,
  evaluation_step_s: 1,
  gap_limit_s: 15,
  minimum_gps_samples: 3,
  minimum_covered_s: 60,
  minimum_coverage_pct: 20,
  full_support_s: 300,
  full_support_distance_m: 500,
  minimum_speed_mps: 1,
  maximum_speed_mps: 8,
  turn_change_deg: 25,
  maximum_reported_accuracy_m: 20,
  oscillation_excursion_deg: 3,
  oscillation_smoothing_radius_s: 2,
  oscillation_persistence_s: 2,
});
export const TRACKING_COMPONENTS = Object.freeze([
  Object.freeze({
    key: "median_course_deviation_deg",
    label: "Median course deviation",
    unit: "°",
    good: 3,
    poor: 12,
    weight: 0.35,
  }),
  Object.freeze({
    key: "p90_course_deviation_deg",
    label: "P90 course deviation",
    unit: "°",
    good: 6,
    poor: 20,
    weight: 0.3,
  }),
  Object.freeze({
    key: "corridor_p95_m",
    label: "95% lateral corridor",
    unit: "m",
    good: 1,
    poor: 4,
    weight: 0.25,
  }),
  Object.freeze({
    key: "oscillation_cycles_per_min",
    label: "Oscillation frequency",
    unit: "cycles/min",
    good: 2,
    poor: 6,
    weight: 0.1,
  }),
]);
export function scoreTrackingComponents(metrics) {
  const components = TRACKING_COMPONENTS.map((c) => {
    const value = metrics[c.key];
    return {
      ...c,
      value: finite(value) && value >= 0 ? value : null,
      score:
        finite(value) && value >= 0
          ? Math.max(
              0,
              Math.min(100, (100 * (c.poor - value)) / (c.poor - c.good)),
            )
          : null,
    };
  });
  return {
    components,
    score: components.every((c) => c.score != null)
      ? components.reduce((sum, c) => sum + c.weight * c.score, 0)
      : null,
  };
}
function gpsRuns(records, pauses, policy) {
  const runs = [];
  let run = [];
  for (const p of records) {
    const last = run.at(-1);
    const valid =
      finite(p.elapsed_s) &&
      hasGps(p) &&
      (!finite(p.gps_accuracy_m) ||
        (p.gps_accuracy_m >= 0 &&
          p.gps_accuracy_m <= policy.maximum_reported_accuracy_m)) &&
      !pauses.some((g) => p.elapsed_s > g.start && p.elapsed_s < g.end);
    const dt = last ? p.elapsed_s - last.elapsed_s : 0;
    const broken =
      !valid ||
      (last &&
        (dt <= 0 ||
          dt > policy.gap_limit_s ||
          overlaps(last.elapsed_s, p.elapsed_s, pauses) ||
          geoDistance(last, p) / dt > policy.maximum_speed_mps));
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
  if (!a || !b) return null;
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
function countCycles(samples, policy) {
  let sign = 0,
    candidate = 0,
    candidateSeconds = 0,
    crossings = 0;
  for (let i = 0; i < samples.length; i++) {
    const center = samples[i],
      neighbours = [];
    for (
      let j = i;
      j >= 0 &&
      center.time - samples[j].time <= policy.oscillation_smoothing_radius_s;
      j--
    )
      neighbours.push(samples[j]);
    for (
      let j = i + 1;
      j < samples.length &&
      samples[j].time - center.time <= policy.oscillation_smoothing_radius_s;
      j++
    )
      neighbours.push(samples[j]);
    const angle =
      (Math.atan2(
        neighbours.reduce(
          (n, p) => n + p.seconds * Math.sin((p.error * Math.PI) / 180),
          0,
        ),
        neighbours.reduce(
          (n, p) => n + p.seconds * Math.cos((p.error * Math.PI) / 180),
          0,
        ),
      ) *
        180) /
      Math.PI;
    const next =
      Math.abs(angle) >= policy.oscillation_excursion_deg
        ? Math.sign(angle)
        : 0;
    if (!next || next === sign) {
      candidate = 0;
      candidateSeconds = 0;
      continue;
    }
    if (next !== candidate) {
      candidate = next;
      candidateSeconds = 0;
    }
    candidateSeconds += center.seconds;
    if (candidateSeconds >= policy.oscillation_persistence_s) {
      if (sign) crossings++;
      sign = next;
      candidate = 0;
      candidateSeconds = 0;
    }
  }
  return Math.floor(crossings / 2);
}
// All four components share eligible time support. See tracking-control-score.md.
export function trackingEvidence(
  records,
  pauses,
  start,
  end,
  { annotations = [], policy: overrides = {} } = {},
) {
  const policy = { ...TRACKING_POLICY, ...overrides };
  if (
    !Object.values(policy).every((n) => finite(n) && n > 0) ||
    policy.local_radius_s >= policy.reference_radius_s ||
    policy.minimum_speed_mps >= policy.maximum_speed_mps ||
    policy.minimum_coverage_pct > 100
  )
    throw new Error("Invalid tracking policy.");
  const requested = Math.max(0, end - start),
    excluded = {},
    errors = [],
    offsets = [],
    segments = [];
  const reported = annotations
    .filter((a) => ["fall", "interruption"].includes(a.kind))
    .filter((a) => finite(a.start_s) && finite(a.end_s) && a.end_s >= a.start_s)
    .map((a) => ({ start: a.start_s, end: a.end_s }));
  const source = intervalRecords(records, start, end),
    radius = policy.reference_radius_s;
  let covered = 0,
    distance = 0,
    cycles = 0,
    maxGap = 0,
    unknownAccuracy = false,
    worstAccuracy = 0;
  const reject = (reason, seconds) => {
    excluded[reason] = (excluded[reason] || 0) + seconds;
  };
  for (const run of gpsRuns(source, pauses, policy)) {
    const first = Math.max(start, run[0].elapsed_s) + radius;
    const last = Math.min(end, run.at(-1).elapsed_s) - radius;
    let section = [];
    const finish = () => {
      if (!section.length) return;
      const a = section[0].start,
        b = section.at(-1).end;
      const left = Math.max(0, lowerBound(run, a - radius) - 1);
      const right = Math.min(run.length - 1, lowerBound(run, b + radius));
      const supported = run.slice(left, right + 1);
      for (let i = 0; i < supported.length; i++) {
        if (i)
          maxGap = Math.max(
            maxGap,
            supported[i].elapsed_s - supported[i - 1].elapsed_s,
          );
        if (!finite(supported[i].gps_accuracy_m)) unknownAccuracy = true;
        else
          worstAccuracy = Math.max(worstAccuracy, supported[i].gps_accuracy_m);
      }
      const count = countCycles(section, policy);
      cycles += count;
      const sourceStart = run[left].source_record_index,
        sourceEnd = run[right].source_record_index;
      segments.push({
        start_s: a,
        end_s: b,
        resolved_cycles: count,
        source_record_range:
          finite(sourceStart) && finite(sourceEnd)
            ? [sourceStart, sourceEnd + 1]
            : null,
      });
      section = [];
    };
    for (let a = first; a < last; a += policy.evaluation_step_s) {
      const b = Math.min(a + policy.evaluation_step_s, last),
        seconds = b - a,
        t = (a + b) / 2;
      let reason = null;
      if (reported.some((g) => a - radius <= g.end && b + radius >= g.start))
        reason = "reported_interruption";
      const supporting =
        lowerBound(run, t + radius) - lowerBound(run, t - radius) + 1;
      if (!reason && supporting < policy.minimum_gps_samples)
        reason = "sparse_gps";
      const left = pointAt(run, t - radius),
        right = pointAt(run, t + radius),
        center = pointAt(run, t);
      const nearLeft = pointAt(run, t - policy.local_radius_s),
        nearRight = pointAt(run, t + policy.local_radius_s);
      const reference = geoBearing(left, right),
        actual = geoBearing(nearLeft, nearRight);
      const before = geoBearing(left, center),
        after = geoBearing(center, right);
      const speed =
        geoDistance(nearLeft, nearRight) / (2 * policy.local_radius_s);
      if (!reason && speed < policy.minimum_speed_mps) reason = "low_speed";
      if (!reason && [reference, actual, before, after].some((v) => v == null))
        reason = "insufficient_displacement";
      if (!reason && speed > policy.maximum_speed_mps)
        reason = "invalid_displacement";
      if (
        !reason &&
        Math.abs(angleDifference(after, before)) > policy.turn_change_deg
      )
        reason = "turn";
      if (reason) {
        reject(reason, seconds);
        finish();
        continue;
      }
      const error = angleDifference(actual, reference);
      const crossTrack =
        6371008.8 *
        Math.asin(
          Math.max(
            -1,
            Math.min(
              1,
              Math.sin(geoDistance(left, center) / 6371008.8) *
                Math.sin((angleDifference(before, reference) * Math.PI) / 180),
            ),
          ),
        );
      errors.push({ value: Math.abs(error), seconds });
      offsets.push({ value: crossTrack, seconds });
      section.push({ start: a, end: b, time: t, seconds, error });
      covered += seconds;
      distance += geoDistance(pointAt(run, a), pointAt(run, b));
    }
    finish();
  }
  const coverage = requested > 0 ? (covered / requested) * 100 : null;
  const metrics = {
    median_course_deviation_deg: weightedQuantile(errors, 0.5),
    p90_course_deviation_deg: weightedQuantile(errors, 0.9),
    corridor_p95_m: offsets.length
      ? weightedQuantile(offsets, 0.975) - weightedQuantile(offsets, 0.025)
      : null,
    oscillation_cycles_per_min: covered ? (cycles * 60) / covered : null,
  };
  const normalized = scoreTrackingComponents(metrics);
  const available =
    covered >= policy.minimum_covered_s &&
    coverage >= policy.minimum_coverage_pct &&
    normalized.score != null;
  const fullSupport =
    covered >= policy.full_support_s &&
    distance >= policy.full_support_distance_m;
  const confidence = !available
    ? "INVALID"
    : !fullSupport || coverage < 60 || maxGap > 10
      ? "LOW"
      : !unknownAccuracy && worstAccuracy <= 10 && maxGap <= 5 && coverage >= 80
        ? "HIGH"
        : "MEDIUM";
  return {
    method: TRACKING_METHOD,
    score_version: TRACKING_METHOD,
    source: "derived",
    status: available ? "available" : "unavailable",
    score: available ? normalized.score : null,
    unit: "0–100",
    ...metrics,
    components: normalized.components,
    confidence,
    interval: { start_s: start, end_s: end },
    policy,
    covered_s: covered,
    requested_s: requested,
    coverage_pct: coverage,
    valid_distance_m: covered ? distance : null,
    excluded_s: Math.max(0, requested - covered),
    excluded_reasons: excluded,
    resolved_cycles: covered ? cycles : null,
    maximum_sample_gap_s: covered ? maxGap : null,
    gps_accuracy_reported: covered ? !unknownAccuracy : null,
    segments,
    reason: available
      ? null
      : "TCS needs at least 60 supported seconds and 20% interval coverage after excluding turns, low speed and GPS gaps.",
  };
}
