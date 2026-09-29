import { usableSpeed, speedQuality } from "./speed-quality.mjs";
export const WINDOW_COLORS = {
  300: "#c9790b",
  600: "#7952c7",
  1200: "#008b98",
};
export const mph = (value) => (value == null ? null : value / 0.44704);
export const feet = (value) => (value == null ? null : value / 0.3048);
export function durationLabel(minutes) {
  if (!Number.isFinite(minutes) || minutes < 0) return "—";
  const rounded = Math.round(minutes);
  return rounded < 60
    ? `${rounded} min`
    : `${Math.floor(rounded / 60)} hr ${rounded % 60} min`;
}

// Hold each recorded value until the next valid sample, never across a pause/gap.
export function telemetryStats(records, key, pauses = []) {
  const valid = (value) =>
    Number.isFinite(value) &&
    (key !== "speed_mps" || usableSpeed(value) !== null) &&
    (key === "heart_rate_bpm" ? value > 0 : value >= 0);
  const values = records.map((p) => p[key]).filter(valid);
  const weighted = [];
  for (let i = 0; i < records.length - 1; i++) {
    const a = records[i],
      b = records[i + 1];
    const seconds = b.elapsed_s - a.elapsed_s;
    if (
      Number.isFinite(a.elapsed_s) &&
      Number.isFinite(b.elapsed_s) &&
      seconds > 0 &&
      seconds <= 15 &&
      valid(a[key]) &&
      valid(b[key]) &&
      !pauses.some((p) => a.elapsed_s < p.end && b.elapsed_s > p.start)
    )
      weighted.push({ value: a[key], seconds });
  }
  weighted.sort((a, b) => a.value - b.value);
  const covered_s = weighted.reduce((sum, p) => sum + p.seconds, 0);
  let median = null,
    cumulative = 0;
  for (const p of weighted) {
    cumulative += p.seconds;
    if (cumulative >= covered_s / 2) {
      median = p.value;
      break;
    }
  }
  return {
    median,
    max: values.length
      ? values.reduce((max, value) => Math.max(max, value))
      : null,
    covered_s,
    median_method: "time_weighted_step_lower_v1",
    max_source: values.length ? "fit_records" : null,
  };
}

export function sessionStatistics(
  records,
  pauses,
  fit = null,
  summaryMaxHr = null,
) {
  const speed = telemetryStats(records, "speed_mps", pauses);
  speed.quality = speedQuality(records);
  speed.raw_summary_max_mps = Number.isFinite(fit?.enhanced_max_speed)
    ? fit.enhanced_max_speed
    : null;
  speed.summary_max_excluded =
    speed.raw_summary_max_mps !== null &&
    usableSpeed(speed.raw_summary_max_mps) === null;
  if (speed.quality.excluded_sample_count || speed.summary_max_excluded)
    speed.max_source = speed.max === null ? null : "filtered_fit_records";
  const hr = telemetryStats(records, "heart_rate_bpm", pauses);
  if (usableSpeed(fit?.enhanced_max_speed) !== null) {
    speed.max = fit.enhanced_max_speed;
    speed.max_source = "fit_session";
  }
  if (Number.isFinite(fit?.max_heart_rate) && fit.max_heart_rate > 0) {
    hr.max = fit.max_heart_rate;
    hr.max_source = "fit_session";
  } else if (
    hr.max == null &&
    Number.isFinite(summaryMaxHr) &&
    summaryMaxHr > 0
  ) {
    hr.max = summaryMaxHr;
    hr.max_source = "stored_summary";
  }
  const hasStrokes =
    fit?.sport === "stand_up_paddleboarding" &&
    Number.isFinite(fit.total_distance) &&
    fit.total_distance >= 0 &&
    Number.isInteger(fit.total_strokes) &&
    fit.total_strokes > 0;
  return {
    speed_mps: speed,
    heart_rate_bpm: hr,
    distance_per_stroke: {
      value_m: hasStrokes ? fit.total_distance / fit.total_strokes : null,
      distance_m: hasStrokes ? fit.total_distance : null,
      strokes: hasStrokes ? fit.total_strokes : null,
      source: hasStrokes
        ? "fit_session.total_distance / fit_session.total_strokes"
        : null,
      status: hasStrokes ? "watch_estimate" : "unavailable",
    },
  };
}
export const timeLabel = (seconds) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
export const numeric = (value) =>
  value == null || value === ""
    ? null
    : Number.isFinite(Number(value))
      ? Number(value)
      : null;
export const latestSessions = (sessions, count = 10) =>
  [...sessions]
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .slice(0, count);

export function timerPauses(events, startUtc, end) {
  let stopped = null;
  const intervals = [];
  for (const event of events
    .filter((e) => e.event === "timer")
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
    const t = (Date.parse(event.timestamp) - Date.parse(startUtc)) / 1000;
    if (event.event_type.startsWith("stop")) stopped ??= Math.max(0, t);
    else if (event.event_type === "start" && stopped != null) {
      if (t > stopped)
        intervals.push({ start: stopped, end: Math.min(t, end) });
      stopped = null;
    }
  }
  if (stopped != null && stopped < end) intervals.push({ start: stopped, end });
  return intervals;
}

export function validRuns(
  records,
  pauses = [],
  gps = false,
  requireDistance = true,
) {
  const runs = [];
  let run = [];
  for (const p of records) {
    const prev = run.at(-1);
    const valid =
      Number.isFinite(p.elapsed_s) &&
      (!requireDistance ||
        (Number.isFinite(p.distance_m) && p.distance_m >= 0)) &&
      (!gps ||
        (Number.isFinite(p.latitude_deg) &&
          Math.abs(p.latitude_deg) <= 90 &&
          Number.isFinite(p.longitude_deg) &&
          Math.abs(p.longitude_deg) <= 180));
    const crossingPause =
      prev &&
      pauses.some((g) => prev.elapsed_s < g.end && p.elapsed_s > g.start);
    const broken =
      !valid ||
      (prev &&
        (p.elapsed_s <= prev.elapsed_s ||
          p.elapsed_s - prev.elapsed_s > 15 ||
          (Number.isFinite(p.distance_m) &&
            Number.isFinite(prev.distance_m) &&
            (p.distance_m < prev.distance_m ||
              (p.distance_m - prev.distance_m) /
                (p.elapsed_s - prev.elapsed_s) >
                8)) ||
          crossingPause));
    if (broken && run.length) {
      runs.push(run);
      run = [];
    }
    if (
      valid &&
      !pauses.some((g) => p.elapsed_s > g.start && p.elapsed_s < g.end)
    )
      run.push(p);
  }
  if (run.length) runs.push(run);
  return runs;
}

export function interpolate(records, t) {
  if (
    !records.length ||
    t < records[0].elapsed_s ||
    t > records.at(-1).elapsed_s
  )
    return null;
  let low = 0,
    high = records.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (records[mid].elapsed_s <= t) low = mid;
    else high = mid - 1;
  }
  const a = records[low];
  if (a.elapsed_s === t) return a;
  const b = records[low + 1];
  if (!b || b.elapsed_s - a.elapsed_s > 15) return null;
  const ratio = (t - a.elapsed_s) / (b.elapsed_s - a.elapsed_s);
  const out = { ...a, elapsed_s: t };
  for (const key of [
    "distance_m",
    "latitude_deg",
    "longitude_deg",
    "speed_mps",
    "heart_rate_bpm",
    "cadence_raw",
  ])
    out[key] =
      a[key] == null || b[key] == null
        ? null
        : a[key] + ratio * (b[key] - a[key]);
  return out;
}

// Small deterministic display estimate. No coaching inference or LLM calls.
export function bestWindows(
  records,
  pauses = [],
  requireGps = true,
  elapsed = Infinity,
) {
  const runs = validRuns(records, pauses, requireGps);
  return [300, 600, 1200].map((duration) => {
    let best = null;
    for (const run of runs) {
      const min = run[0].elapsed_s,
        max = Math.min(run.at(-1).elapsed_s, elapsed) - duration;
      if (max < min) continue;
      const candidates = [
        ...new Set([
          min,
          max,
          ...run.flatMap((p) => [p.elapsed_s, p.elapsed_s - duration]),
        ]),
      ]
        .filter((t) => t >= min && t <= max)
        .sort((a, b) => a - b);
      for (const start of candidates) {
        const a = interpolate(run, start),
          b = interpolate(run, start + duration);
        const speed = (b.distance_m - a.distance_m) / duration;
        if (!best || speed > best.speed_mps + 1e-9)
          best = {
            duration,
            start,
            end: start + duration,
            speed_mps: speed,
            status: "local_estimate",
          };
      }
    }
    return (
      best || {
        duration,
        status: "unavailable",
        start: null,
        end: null,
        speed_mps: null,
      }
    );
  });
}

export function segmentPoints(records, start, end) {
  const a = interpolate(records, start),
    b = interpolate(records, end);
  return [
    a,
    ...records.filter((p) => p.elapsed_s > start && p.elapsed_s < end),
    b,
  ].filter(
    (p) =>
      p && Number.isFinite(p.latitude_deg) && Number.isFinite(p.longitude_deg),
  );
}

// Course over ground over the next 10 seconds; omit stationary/unsupported geometry.
export function segmentDirections(
  records,
  window,
  pauses = [],
  fractions = [0.2, 0.4, 0.6, 0.8],
) {
  if (
    !Number.isFinite(window?.start) ||
    !Number.isFinite(window?.end) ||
    window.end <= window.start
  )
    return [];
  const run = validRuns(records, pauses, true, false).find(
    (r) => r[0].elapsed_s <= window.start && r.at(-1).elapsed_s >= window.end,
  );
  if (!run) return [];
  const rad = Math.PI / 180;
  return fractions.flatMap((fraction) => {
    if (!Number.isFinite(fraction) || fraction < 0 || fraction >= 1) return [];
    const t = window.start + fraction * (window.end - window.start);
    const a = interpolate(run, t),
      b = interpolate(run, Math.min(t + 10, window.end));
    if (!a || !b) return [];
    const lat1 = a.latitude_deg * rad,
      lat2 = b.latitude_deg * rad;
    const lon = (b.longitude_deg - a.longitude_deg) * rad;
    const displacement =
      6371000 * Math.hypot(lat2 - lat1, lon * Math.cos((lat1 + lat2) / 2));
    if (displacement < 5) return [];
    const y = Math.sin(lon) * Math.cos(lat2);
    const x =
      Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon);
    return [
      {
        latitude_deg: a.latitude_deg,
        longitude_deg: a.longitude_deg,
        elapsed_s: t,
        bearing_deg: (Math.atan2(y, x) / rad + 360) % 360,
      },
    ];
  });
}

export function chartRows(records) {
  const out = [];
  records.forEach((r, i) => {
    if (i && r.elapsed_s - records[i - 1].elapsed_s > 15)
      out.push({
        t: (r.elapsed_s + records[i - 1].elapsed_s) / 120,
        speed: null,
        hr: null,
        cadence: null,
      });
    out.push({
      t: r.elapsed_s / 60,
      speed: mph(usableSpeed(r.speed_mps)),
      hr: r.heart_rate_bpm,
      cadence: r.cadence_raw,
    });
  });
  return out;
}
