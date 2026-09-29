import { finite, geoDistance, overlaps } from "./telemetry.mjs";

export const EVENT_METHOD = "selective_movement_v2";
export const EVENT_POLICY = Object.freeze({
  entry_speed_mps: 0.5,
  exit_speed_mps: 0.7,
  minimum_duration_s: 5,
  minimum_edges: 2,
  gap_limit_s: 15,
  prior_speed_mps: 1.2,
  minimum_speed_drop_mps: 1,
  temperature_drop_c: 2,
  temperature_window_s: 90,
  temperature_hold_s: 5,
  annotation_tolerance_s: 15,
  low_speed_event_minimum_s: 20,
  movement_context_s: 30,
});
export function movementEvidence(records, pauses, elapsed, annotations = []) {
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
  const falls = fallCandidates(records, pauses, events, annotations, elapsed);
  const slowEvents = events
    .filter((low) => {
      if (
        low.end_s - low.start_s < EVENT_POLICY.low_speed_event_minimum_s ||
        falls.some(
          (fall) => fall.start_s <= low.end_s && fall.end_s >= low.start_s,
        )
      )
        return false;
      // Show sustained slowdowns during an outing, not launch/finish standing.
      const first = records.findIndex((r) => r.elapsed_s === low.start_s);
      const last = records.findIndex((r) => r.elapsed_s === low.end_s);
      const movingNearby = (index, direction) => {
        let previous = records[index];
        for (
          let j = index + direction;
          j >= 0 && j < records.length;
          j += direction
        ) {
          const r = records[j];
          if (
            Math.abs(r.elapsed_s - records[index].elapsed_s) >
              EVENT_POLICY.movement_context_s ||
            Math.abs(r.elapsed_s - previous.elapsed_s) >
              EVENT_POLICY.gap_limit_s ||
            !finite(r.speed_mps) ||
            r.elapsed_s > elapsed ||
            overlaps(
              Math.min(previous.elapsed_s, r.elapsed_s),
              Math.max(previous.elapsed_s, r.elapsed_s),
              pauses,
            )
          )
            return false;
          if (r.speed_mps >= EVENT_POLICY.prior_speed_mps) return true;
          previous = r;
        }
        return false;
      };
      return movingNearby(first, -1) && movingNearby(last, 1);
    })
    .map((low) => ({
      ...low,
      annotation_ids: relatedAnnotations(low.start_s, low.end_s, annotations),
    }));
  return {
    method: EVENT_METHOD,
    source: "derived",
    policy: EVENT_POLICY,
    events: [...falls, ...slowEvents].sort((a, b) => a.start_s - b.start_s),
    low_speed_intervals: events,
    supported_moving_s: moving,
    supported_low_speed_s: low,
    explicit_paused_s: paused,
    unknown_s: Math.max(0, elapsed - supported - paused),
    limitations: [
      "Possible falls require abrupt supported speed loss and sustained cooling; thresholds are provisional, not calibrated probabilities.",
      "Low-speed events require 20 supported seconds with nearby movement before and after; low speed alone does not identify a cause.",
      "Watch temperature is not ambient or water temperature. Splashing or deliberate immersion can resemble a fall; brief or thermally neutral falls can be missed.",
      "Missing cadence is never treated as stopped paddling; ground movement can include drift.",
    ],
  };
}

function relatedAnnotations(start, end, annotations) {
  return annotations
    .filter(
      (a) =>
        ["fall", "interruption"].includes(a.kind) &&
        a.start_s <= end + EVENT_POLICY.annotation_tolerance_s &&
        a.end_s >= start - EVENT_POLICY.annotation_tolerance_s,
    )
    .map((a) => a.id);
}

export function detectedEventLabel(event) {
  return event.type === "possible_fall" ? "Possible fall" : "Low-speed period";
}

export function detectedEventDescription(event) {
  return event.type === "possible_fall"
    ? `${(event.evidence.temperature_drop_c * 1.8).toFixed(1)}°F (${event.evidence.temperature_drop_c}°C) cooling and abrupt slowdown; unconfirmed`
    : "Sustained low speed with movement before and after; cause unknown";
}

function fallCandidates(records, pauses, lows, annotations, elapsed) {
  const result = [];
  for (const low of lows) {
    const onset = records.findIndex((r) => r.elapsed_s === low.start_s);
    const before = records[onset - 1],
      stopped = records[onset];
    if (
      !before ||
      !stopped ||
      low.end_s > elapsed ||
      stopped.elapsed_s - before.elapsed_s > EVENT_POLICY.gap_limit_s ||
      !finite(before.speed_mps) ||
      before.speed_mps < EVENT_POLICY.prior_speed_mps ||
      before.speed_mps - stopped.speed_mps <
        EVENT_POLICY.minimum_speed_drop_mps ||
      !finite(before.temperature_c) ||
      overlaps(before.elapsed_s, stopped.elapsed_s, pauses)
    )
      continue;

    // Temperature can lag the motion change. Require continuous sensor support
    // and two cooled observations separated by >=5 seconds, never across a pause.
    let firstCool = null,
      last = before,
      match = null;
    let maximumGap = stopped.elapsed_s - before.elapsed_s;
    for (let j = onset; j < records.length; j++) {
      const r = records[j];
      if (
        r.elapsed_s >
        Math.min(elapsed, low.start_s + EVENT_POLICY.temperature_window_s)
      )
        break;
      const dt = r.elapsed_s - last.elapsed_s;
      if (
        !(dt > 0 && dt <= EVENT_POLICY.gap_limit_s) ||
        !finite(r.temperature_c) ||
        overlaps(last.elapsed_s, r.elapsed_s, pauses)
      )
        break;
      maximumGap = Math.max(maximumGap, dt);
      if (
        before.temperature_c - r.temperature_c >=
        EVENT_POLICY.temperature_drop_c
      ) {
        firstCool ??= { record: r, index: j };
        if (
          r.elapsed_s - firstCool.record.elapsed_s >=
          EVENT_POLICY.temperature_hold_s
        ) {
          match = { record: r, index: j };
          break;
        }
      } else firstCool = null;
      last = r;
    }
    if (!match) continue;
    result.push({
      type: "possible_fall",
      source: "derived",
      status: "candidate",
      start_s: before.elapsed_s,
      end_s: low.end_s,
      onset_bracket_s: [before.elapsed_s, stopped.elapsed_s],
      boundary_uncertainty_s: Math.max(low.boundary_uncertainty_s, maximumGap),
      annotation_ids: relatedAnnotations(
        before.elapsed_s,
        low.end_s,
        annotations,
      ),
      evidence: {
        prior_speed_mps: before.speed_mps,
        stopped_speed_mps: stopped.speed_mps,
        supported_low_speed_s: low.end_s - low.start_s,
        temperature_before_c: before.temperature_c,
        temperature_after_c: match.record.temperature_c,
        temperature_drop_c: before.temperature_c - match.record.temperature_c,
        temperature_change_bracket_s: [
          records[firstCool.index - 1].elapsed_s,
          firstCool.record.elapsed_s,
        ],
        temperature_confirmed_s: match.record.elapsed_s,
        cadence_zero_observed: low.cadence_zero_observed,
        source_record_range: [
          records[onset - 1].source_record_index ?? onset - 1,
          (records[match.index].source_record_index ?? match.index) + 1,
        ],
      },
    });
  }
  return result;
}
