import { finite, geoDistance, overlaps } from "./telemetry.mjs";

export const EVENT_METHOD = "supported_movement_v1";
export const EVENT_POLICY = Object.freeze({
  entry_speed_mps: 0.5,
  exit_speed_mps: 0.7,
  minimum_duration_s: 5,
  minimum_edges: 2,
  gap_limit_s: 15,
});
export function movementEvidence(records, pauses, elapsed) {
  const events = [];
  let candidate = null,
    moving = 0,
    low = 0,
    supported = 0;
  const flush = () => {
    if (
      candidate &&
      candidate.end_s - candidate.start_s >= EVENT_POLICY.minimum_duration_s &&
      candidate.edges >= EVENT_POLICY.minimum_edges
    ) {
      const { edges, ...event } = candidate;
      events.push(event);
    }
    candidate = null;
  };
  for (let i = 1; i < records.length; i++) {
    const a = records[i - 1],
      b = records[i],
      dt = b.elapsed_s - a.elapsed_s;
    if (
      !(dt > 0 && dt <= 15) ||
      overlaps(a.elapsed_s, b.elapsed_s, pauses) ||
      ![a.speed_mps, b.speed_mps].every((v) => finite(v) && v >= 0)
    ) {
      flush();
      continue;
    }
    const distanceSpeed =
      [a.distance_m, b.distance_m].every(finite) && b.distance_m >= a.distance_m
        ? (b.distance_m - a.distance_m) / dt
        : null;
    const gpsSpeed = geoDistance(a, b) == null ? null : geoDistance(a, b) / dt;
    const supporting = [distanceSpeed, gpsSpeed].filter(finite);
    const compatible =
      supporting.length > 0 && supporting.every((v) => v < 0.7);
    const threshold = candidate
      ? EVENT_POLICY.exit_speed_mps
      : EVENT_POLICY.entry_speed_mps;
    if (a.speed_mps < threshold && b.speed_mps < threshold && compatible) {
      low += dt;
      supported += dt;
      if (!candidate || candidate.end_s !== a.elapsed_s) {
        flush();
        candidate = {
          type: "low_speed",
          source: "derived",
          status: "candidate",
          start_s: a.elapsed_s,
          end_s: b.elapsed_s,
          edges: 1,
          boundary_uncertainty_s: dt,
          cadence_zero_observed: a.cadence_raw === 0 && b.cadence_raw === 0,
        };
      } else {
        candidate.end_s = b.elapsed_s;
        candidate.edges++;
        candidate.boundary_uncertainty_s = Math.max(
          candidate.boundary_uncertainty_s,
          dt,
        );
        candidate.cadence_zero_observed ||=
          a.cadence_raw === 0 && b.cadence_raw === 0;
      }
    } else {
      flush();
      if (a.speed_mps >= 0.5 && b.speed_mps >= 0.5) {
        moving += dt;
        supported += dt;
      }
    }
  }
  flush();
  const explicit = pauses
    .filter((p) => !p.reason)
    .map((p) => ({
      type: "timer_pause",
      source: "fit_timer",
      status: "recorded",
      start_s: p.start,
      end_s: p.end,
    }));
  const paused = explicit.reduce((n, p) => n + p.end_s - p.start_s, 0);
  return {
    method: EVENT_METHOD,
    source: "derived",
    policy: EVENT_POLICY,
    events: [...explicit, ...events].sort((a, b) => a.start_s - b.start_s),
    supported_moving_s: moving,
    supported_low_speed_s: low,
    explicit_paused_s: paused,
    unknown_s: Math.max(0, elapsed - supported - paused),
    limitations: [
      "Low speed describes recorded ground movement, not an interruption cause or fall.",
      "Missing cadence is never treated as stopped paddling; ground movement can include drift.",
    ],
  };
}
