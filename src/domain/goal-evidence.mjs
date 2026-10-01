import { bestWindows, validRuns } from "./metrics.mjs";
import { intervalStatistics } from "./analysis.mjs";
import { intervalRecords } from "./telemetry.mjs";
import { EXTENDED_GOALS } from "./goals.mjs";

export const GOAL_METHOD = "goal_evidence_v3";
const ECONOMY_START_S = 20 * 60;
const unavailable = (reason) => ({
  value_si: null,
  reason,
  method: GOAL_METHOD,
  source: "derived",
});

export function extendedGoalEvidence(session, goal) {
  if (!EXTENDED_GOALS.includes(goal.metric)) return null;
  if (goal.metric === "turns_footwork") {
    const result = goal.practice_results?.find(
      (r) => r.session_id === session.id,
    );
    return result
      ? {
          ...result,
          value_si:
            100 *
            Math.min(
              result.left_successes / result.left_attempts,
              result.right_successes / result.right_attempts,
            ),
          source: "Athlete-reported practice",
          method: "weaker_direction_success_rate_v1",
        }
      : unavailable("No practice result recorded for this session.");
  }
  if (goal.metric === "tracking_control") {
    const tracking = session.deterministic?.summary?.tracking;
    return tracking?.score != null
      ? {
          value_si: tracking.score,
          source: "Calculated Tracking Control Score",
          method: tracking.method ?? "TCS_v1",
          coverage_pct: tracking.coverage_pct,
          eligible_s: tracking.covered_s,
        }
      : unavailable("Not enough eligible GPS support.");
  }
  const elapsed = Number.isFinite(session.elapsed)
    ? session.elapsed * 60
    : null;
  if (elapsed == null)
    return unavailable("Session elapsed duration is unavailable.");
  if (goal.metric === "endurance") {
    const window = bestWindows(
      session.records,
      session.pauses,
      false,
      elapsed,
      [goal.window_s ?? 1800],
    )[0];
    const support =
      window.start == null
        ? []
        : intervalRecords(session.records, window.start, window.end);
    const first = support[0]?.source_record_index,
      last = support.at(-1)?.source_record_index;
    return window.start == null
      ? unavailable("No continuous effort of this duration.")
      : {
          value_si: window.speed_mps,
          start_s: window.start,
          end_s: window.end,
          duration_s: window.duration,
          source: "Calculated continuous endurance speed",
          method: "elapsed_continuous_v1",
          coverage_pct: 100,
          source_record_range:
            Number.isFinite(first) && Number.isFinite(last)
              ? [first, last + 1]
              : null,
        };
  }
  const economy = goal.metric === "effort_economy";
  const duration = economy ? 300 : 1200;
  if (economy && goal.pace_mps == null)
    return unavailable("Choose a comparison pace.");
  if (!economy && goal.cadence_spm == null)
    return unavailable("Choose a comparison cadence.");
  if (economy && /suspect|unreliable|invalid/i.test(session.hrQuality || ""))
    return unavailable("Session heart rate is flagged as unreliable.");
  if (economy && elapsed < ECONOMY_START_S + duration)
    return unavailable(
      "Need a full five-minute stretch after the first 20 minutes.",
    );
  // Missing samples stay in the sequence as invalid distance, so they break runs.
  const key = economy ? "heart_rate_bpm" : "cadence_raw";
  const records = session.records.map((r) => ({
    ...r,
    distance_m: Number.isFinite(r[key]) && r[key] > 0 ? r.distance_m : null,
  }));
  const exclusions = [
    ...session.pauses,
    ...(session.annotations || [])
      .filter((a) => ["fall", "interruption"].includes(a.kind))
      .map((a) => ({
        start: a.start_s,
        end: Math.max(a.end_s, a.start_s + 1),
      })),
  ];
  let best = null;
  const step = Math.max(30, Math.ceil(elapsed / 1200 / 30) * 30);
  // At least a 30-second grid, plus run boundaries. This is a best sampled block,
  // not a claim to the exact optimum of every possible continuous window.
  for (const run of validRuns(records, exclusions, false)) {
    const min = Math.max(run[0].elapsed_s, economy ? ECONOMY_START_S : 0);
    const max = Math.min(run.at(-1).elapsed_s, elapsed) - duration;
    if (max < min) continue;
    const starts = new Set([min, max]);
    for (let t = Math.ceil(min / step) * step; t <= max; t += step)
      starts.add(t);
    for (const start of [...starts].sort((a, b) => a - b)) {
      const e = intervalStatistics(run, [], start, start + duration, {
        tracking: false,
      });
      const speed = e.distance.mean_speed_mps;
      if (e.distance.covered_s < duration - 1e-6) continue;
      if (economy) {
        if (
          e.joint_hr_distance.coverage_pct < 100 - 1e-6 ||
          Math.abs(speed - goal.pace_mps) > goal.pace_mps * 0.03 ||
          e.distance.standard_deviation > Math.max(0.1, speed * 0.07) ||
          e.heart_rate_bpm.standard_deviation > 5
        )
          continue;
      } else if (
        e.speed_cadence.coverage_pct < 100 - 1e-6 ||
        Math.abs(e.speed_cadence.cadence_spm - goal.cadence_spm) > 3 ||
        e.cadence_raw.standard_deviation > 5
      )
        continue;
      const value = economy ? e.heart_rate_bpm.mean : e.speed_cadence.speed_mps;
      if (!best || (economy ? value < best.value_si : value > best.value_si))
        best = {
          value_si: value,
          source: economy
            ? "Calculated HR at matched pace"
            : "Calculated speed at matched cadence",
          method: GOAL_METHOD,
          grid_step_s: step,
          start_s: start,
          end_s: start + duration,
          coverage_pct: 100,
          speed_mps: speed,
          cadence_spm: e.speed_cadence.cadence_spm,
          dps_m: e.distance_per_stroke.value_m,
          heart_rate_bpm: e.heart_rate_bpm.mean,
          source_record_range: e.source_record_range,
        };
    }
  }
  return (
    best ??
    unavailable(
      `No supported steady ${duration / 60}-minute block matches these settings.`,
    )
  );
}
