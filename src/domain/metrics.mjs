export const WINDOW_COLORS = {
  300: "#c9790b",
  600: "#7952c7",
  1200: "#008b98",
};
export const mph = (value) => (value == null ? null : value / 0.44704);
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
    if (event.event_type.startsWith("stop")) stopped = t;
    else if (event.event_type === "start" && stopped != null) {
      if (t > stopped)
        intervals.push({ start: stopped, end: Math.min(t, end) });
      stopped = null;
    }
  }
  if (stopped != null && stopped < end) intervals.push({ start: stopped, end });
  return intervals;
}

export function validRuns(records, pauses = [], gps = false) {
  const runs = [];
  let run = [];
  for (const p of records) {
    const prev = run.at(-1);
    const valid =
      Number.isFinite(p.elapsed_s) &&
      Number.isFinite(p.distance_m) &&
      (!gps ||
        (Number.isFinite(p.latitude_deg) && Number.isFinite(p.longitude_deg)));
    const crossingPause =
      prev &&
      pauses.some((g) => prev.elapsed_s < g.end && p.elapsed_s > g.start);
    const broken =
      !valid ||
      (prev &&
        (p.elapsed_s <= prev.elapsed_s ||
          p.elapsed_s - prev.elapsed_s > 15 ||
          p.distance_m < prev.distance_m ||
          (p.distance_m - prev.distance_m) / (p.elapsed_s - prev.elapsed_s) >
            8 ||
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
export function bestWindows(records, pauses = []) {
  const runs = validRuns(records, pauses, true);
  return [300, 600, 1200].map((duration) => {
    let best = null;
    for (const run of runs) {
      const min = run[0].elapsed_s,
        max = run.at(-1).elapsed_s - duration;
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
      speed: mph(r.speed_mps),
      hr: r.heart_rate_bpm,
      cadence: r.cadence_raw,
    });
  });
  return out;
}
