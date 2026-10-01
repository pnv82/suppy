import { metricView } from "./metric-view.mjs";

export const GOAL_METRICS = {
  max_speed: "Maximum speed",
  best_300: "Best 5-minute speed",
  best_600: "Best 10-minute speed",
  best_1200: "Best 20-minute speed",
  average_speed: "Average speed",
  cadence_duration: "Longest time above cadence",
  endurance: "Longer endurance",
  stroke_effectiveness: "Stroke effectiveness",
  effort_economy: "Effort economy",
  tracking_control: "Tracking control",
  turns_footwork: "Turns and footwork",
};

export const EXTENDED_GOALS = [
  "endurance",
  "stroke_effectiveness",
  "effort_economy",
  "tracking_control",
  "turns_footwork",
];
export const goalUnit = (g) =>
  g.metric === "cadence_duration"
    ? "min"
    : g.metric === "effort_economy"
      ? "bpm"
      : g.metric === "tracking_control"
        ? "/100"
        : g.metric === "turns_footwork"
          ? "%"
          : "mph";
export const goalFactor = (g) =>
  g.metric === "cadence_duration"
    ? 60
    : ["effort_economy", "tracking_control", "turns_footwork"].includes(
          g.metric,
        )
      ? 1
      : 0.44704;
export const goalValue = (g, v) => (v == null ? null : v / goalFactor(g));
export const goalLowerIsBetter = (g) => g.metric === "effort_economy";
export function goalAchieved(goal, best) {
  if (
    !Number.isFinite(goal.target_si) ||
    goal.target_si <= 0 ||
    !Number.isFinite(best?.value_si)
  )
    return false;
  return goalLowerIsBetter(goal)
    ? best.value_si <= goal.target_si
    : best.value_si >= goal.target_si;
}

// A trophy describes the displayed value in this session, never a different
// interval or the athlete's all-time best. Conditional goals need their own
// matched evidence, so ordinary HR, cadence and DPS values cannot earn them.
export function sessionGoalAchievements(session, goals = [], selected = null) {
  const view = metricView(session, selected);
  const reached = (metric, value) =>
    goals.find(
      (g) =>
        g.active !== false &&
        g.metric === metric &&
        goalAchieved(g, { value_si: value }),
    ) ?? null;
  const speedMetric =
    selected == null
      ? "average_speed"
      : !view.window?.id && [300, 600, 1200].includes(selected)
        ? `best_${selected}`
        : null;
  return {
    speed: reached(speedMetric, view.speed),
    maxSpeed: reached("max_speed", session.statistics?.speed_mps?.max),
    tracking:
      selected == null ? reached("tracking_control", view.tracking) : null,
  };
}

export function goalScope(g) {
  if (g.metric === "endurance")
    return `${(g.window_s ?? 1800) / 60} min continuous`;
  if (g.metric === "stroke_effectiveness")
    return g.cadence_spm == null
      ? "Choose a cadence"
      : `20 min at ${g.cadence_spm} ±3 spm`;
  if (g.metric === "effort_economy")
    return g.pace_mps == null
      ? "Choose a pace"
      : `5 min at ${(g.pace_mps / 0.44704).toFixed(2)} mph`;
  if (g.metric === "tracking_control") return "Eligible session sections";
  if (g.metric === "turns_footwork") return "Both directions · reported";
  if (g.metric === "cadence_duration")
    return g.cadence_threshold_spm == null
      ? "Choose a threshold"
      : `Above ${g.cadence_threshold_spm} spm`;
  return g.metric.startsWith("best_")
    ? `${Number(g.metric.slice(5)) / 60} min continuous`
    : "Whole session";
}

// Unconfigured catalog entries are available settings, never invented targets.
export function configuredGoals(saved = []) {
  const goals = saved.map((g, i) => ({
    active: true,
    position: i,
    window_s: 1800,
    cadence_spm: null,
    pace_mps: null,
    ...g,
  }));
  for (const [position, metric] of Object.keys(GOAL_METRICS).entries()) {
    if (!goals.some((g) => g.metric === metric))
      goals.push({
        id: `catalog:${metric}`,
        metric,
        target_si: null,
        cadence_threshold_spm: null,
        active: false,
        position,
        window_s: 1800,
        cadence_spm: null,
        pace_mps: null,
      });
  }
  return goals.sort((a, b) => a.position - b.position);
}

export function bestGoalResult(sessions, goal) {
  if (goal.metric === "cadence_duration" && goal.cadence_threshold_spm == null)
    return null;
  let best = null;
  for (const session of sessions) {
    let value, source;
    if (EXTENDED_GOALS.includes(goal.metric)) {
      value = session.goalMetrics?.[goal.id]?.value_si;
      source = session.goalMetrics?.[goal.id]?.source;
    } else if (goal.metric === "cadence_duration") {
      value = session.goalMetrics?.[goal.id]?.value_s;
      source = "Calculated continuous cadence duration";
    } else if (goal.metric === "max_speed") {
      value = session.statistics?.speed_mps?.max;
      source =
        session.statistics?.speed_mps?.max_source === "fit_session"
          ? "FIT session maximum"
          : "Recorded sample maximum";
    } else {
      const duration = goal.metric.startsWith("best_")
        ? Number(goal.metric.slice(5))
        : null;
      value = metricView(session, duration).speed;
      source = duration
        ? `Calculated continuous ${duration / 60}-minute speed`
        : "Calculated session average (supported data)";
    }
    if (
      Number.isFinite(value) &&
      (!best ||
        (goalLowerIsBetter(goal)
          ? value < best.value_si
          : value > best.value_si))
    )
      best = {
        value_si: value,
        session_id: session.id,
        name: session.title || session.location,
        date: session.date,
        source,
        evidence: session.goalMetrics?.[goal.id] ?? null,
      };
  }
  return best;
}

export function longestCadenceRun(records, pauses, threshold) {
  let covered_s = 0,
    longest = 0,
    run = 0,
    start = null,
    bestStart = null,
    bestEnd = null;
  for (let i = 1; i < records.length; i++) {
    const a = records[i - 1],
      b = records[i],
      dt = b.elapsed_s - a.elapsed_s;
    const supported =
      Number.isFinite(a.elapsed_s) &&
      Number.isFinite(b.elapsed_s) &&
      dt > 0 &&
      dt <= 15 &&
      Number.isFinite(a.cadence_raw) &&
      a.cadence_raw >= 0 &&
      Number.isFinite(b.cadence_raw) &&
      b.cadence_raw >= 0 &&
      !pauses.some((p) => a.elapsed_s < p.end && b.elapsed_s > p.start);
    if (supported) covered_s += dt;
    if (
      !supported ||
      a.cadence_raw <= threshold ||
      b.cadence_raw <= threshold
    ) {
      run = 0;
      start = null;
      continue;
    }
    start ??= a.elapsed_s;
    run += dt;
    if (run > longest) {
      longest = run;
      bestStart = start;
      bestEnd = b.elapsed_s;
    }
  }
  return {
    value_s: covered_s > 0 ? longest : null,
    start_s: bestStart,
    end_s: bestEnd,
    covered_s,
    threshold_spm: threshold,
    method: "continuous_both_endpoints_above_cadence_v1",
  };
}
