// Pure weather evidence rules. No provider, persistence or upload dependencies.
export const WEATHER_POLICY = {
  method: "nearest_station_observation_v1",
  max_age_s: 3600,
  station_radius_m: 50000,
  candidate_limit: 3,
};
export const weatherFields = [
  "wind_speed_mps",
  "wind_from_deg",
  "gust_mps",
  "temperature_c",
  "relative_humidity_pct",
];
export function distanceMetres(a, b) {
  const rad = Math.PI / 180,
    lat = (b.latitude - a.latitude) * rad,
    lon = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(lat / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(lon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function weatherInput(session) {
  const start = Date.parse(session.startUtc),
    duration = session.elapsed == null ? null : session.elapsed * 60;
  const point = session.records.find(
    (p) =>
      Number.isFinite(p.latitude_deg) &&
      Math.abs(p.latitude_deg) <= 90 &&
      Number.isFinite(p.longitude_deg) &&
      Math.abs(p.longitude_deg) <= 180,
  );
  if (!point)
    throw new Error(
      "Weather needs recorded GPS coordinates. This session has no usable location.",
    );
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > 604800
  )
    throw new Error(
      "Weather needs a UTC start time and an elapsed duration of up to seven days.",
    );
  return {
    latitude: point.latitude_deg,
    longitude: point.longitude_deg,
    start_utc: new Date(start).toISOString(),
    end_utc: new Date(start + duration * 1000).toISOString(),
  };
}
export function observationAt(data, timestamp) {
  const t = typeof timestamp === "number" ? timestamp : Date.parse(timestamp);
  let best = null,
    age = Infinity;
  for (const o of data?.observations || []) {
    const delta = Math.abs(Date.parse(o.observed_at_utc) - t) / 1000;
    if (
      delta <= WEATHER_POLICY.max_age_s &&
      (delta < age ||
        (delta === age && o.observed_at_utc < best.observed_at_utc))
    ) {
      best = o;
      age = delta;
    }
  }
  return best ? { ...best, age_s: age } : null;
}
export function summarizeWeather(observations, startUtc, endUtc) {
  const start = Date.parse(startUtc),
    end = Date.parse(endUtc),
    total = (end - start) / 1000;
  const sorted = [...observations].sort((a, b) =>
    a.observed_at_utc.localeCompare(b.observed_at_utc),
  );
  const sums = Object.fromEntries(
    weatherFields.map((k) => [k, { value: 0, covered_s: 0 }]),
  );
  let x = 0,
    y = 0,
    vectorWeight = 0;
  for (let i = 0; i < sorted.length; i++) {
    const o = sorted[i],
      t = Date.parse(o.observed_at_utc);
    const left = Math.max(
      start,
      t - 3600000,
      i ? (Date.parse(sorted[i - 1].observed_at_utc) + t) / 2 : -Infinity,
    );
    const right = Math.min(
      end,
      t + 3600000,
      i < sorted.length - 1
        ? (Date.parse(sorted[i + 1].observed_at_utc) + t) / 2
        : Infinity,
    );
    const seconds = Math.max(0, (right - left) / 1000);
    if (!seconds) continue;
    for (const key of weatherFields)
      if (Number.isFinite(o[key])) {
        sums[key].value += o[key] * seconds;
        sums[key].covered_s += seconds;
      }
    if (o.wind_speed_mps > 0 && Number.isFinite(o.wind_from_deg)) {
      const weight = seconds * o.wind_speed_mps;
      x += Math.cos((o.wind_from_deg * Math.PI) / 180) * weight;
      y += Math.sin((o.wind_from_deg * Math.PI) / 180) * weight;
      vectorWeight += weight;
    }
  }
  for (const entry of Object.values(sums)) {
    entry.value = entry.covered_s ? entry.value / entry.covered_s : null;
    entry.coverage_pct = total > 0 ? (entry.covered_s / total) * 100 : 0;
  }
  sums.wind_from_deg.value =
    vectorWeight && Math.hypot(x, y) / vectorWeight >= 0.1
      ? ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
      : null;
  return {
    ...sums,
    method: "nearest_observation_time_weighted_v1",
    direction_method: "speed_weighted_circular_mean_v1",
    interval: { start_utc: startUtc, end_utc: endUtc },
  };
}
export function presentWeather(session) {
  const data = session.weather?.data;
  const summary = data?.summary;
  const presented = data
    ? {
        ...session,
        legacyWeather: {
          wind: session.wind,
          windFrom: session.windFrom,
          station: session.station,
          weatherQuality: session.weatherQuality,
        },
        wind:
          summary.wind_speed_mps.value == null
            ? null
            : summary.wind_speed_mps.value / 0.44704,
        windFrom: summary.wind_from_deg.value,
        station: data.station.id,
        weatherQuality: `Observed station context · ${Math.round(summary.wind_speed_mps.coverage_pct)}% wind coverage`,
      }
    : { ...session };
  if (session.windAdjustment) {
    presented.legacyWeather ??= {
      wind: session.wind,
      windFrom: session.windFrom,
      station: session.station,
      weatherQuality: session.weatherQuality,
    };
    presented.wind =
      session.windAdjustment.wind_speed_mps == null
        ? null
        : session.windAdjustment.wind_speed_mps / 0.44704;
    presented.windFrom = session.windAdjustment.wind_from_deg;
    presented.windSource = "athlete_reported";
    presented.weatherQuality = "Athlete-reported on-water wind · whole session";
  }
  return presented;
}
