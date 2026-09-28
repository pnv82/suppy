import { distanceMetres } from "../src/domain/weather.mjs";
const coordinate = (p) => ({
  latitude: p.latitude_deg,
  longitude: p.longitude_deg,
});
const valid = (p) =>
  p &&
  Number.isFinite(p.latitude_deg) &&
  Math.abs(p.latitude_deg) <= 90 &&
  Number.isFinite(p.longitude_deg) &&
  Math.abs(p.longitude_deg) <= 180 &&
  (p.gps_accuracy_m == null || p.gps_accuracy_m <= 20);
export function launchPoint(session) {
  for (let i = 0; i < session.records.length - 1; i++) {
    const a = session.records[i],
      b = session.records[i + 1],
      dt = b.elapsed_s - a.elapsed_s;
    if (a.elapsed_s > 120) return null;
    if (
      a.elapsed_s >= 0 &&
      valid(a) &&
      valid(b) &&
      dt > 0 &&
      dt <= 15 &&
      !session.pauses.some(
        (p) => a.elapsed_s < p.end && b.elapsed_s > p.start,
      ) &&
      distanceMetres(coordinate(a), coordinate(b)) / dt <= 8
    )
      return coordinate(a);
  }
  return null;
}
export function launchSuggestions(session, sessions, places = [], online = []) {
  const start = launchPoint(session);
  if (!start)
    return {
      candidates: [],
      reason:
        "No supported GPS start in the first two minutes. Enter a confirmed launch name manually.",
    };
  const known = sessions
    .filter(
      (s) =>
        s.id !== session.id &&
        s.titleSource === "athlete_reported" &&
        !(
          /\bbay\b/i.test(s.title) &&
          !/\bcove|beach|launch|shore|ramp|slipway\b/i.test(s.title)
        ),
    )
    .flatMap((s) => {
      const point = launchPoint(s);
      if (!point) return [];
      const distance = distanceMetres(start, point);
      return distance <= 100
        ? [
            {
              name: s.title,
              distance_m: Math.round(distance),
              source: "previous_athlete_confirmation",
              source_ref: `session:${s.id}`,
              status: "unconfirmed",
            },
          ]
        : [];
    });
  const mapped = places.flatMap((p) => {
    if (
      !p.name ||
      p.name.length > 100 ||
      /\bbay\b/i.test(p.name) ||
      !Number.isFinite(p.latitude) ||
      !Number.isFinite(p.longitude) ||
      !/^MB-\d+$/.test(p.id)
    )
      return [];
    const distance = distanceMetres(start, p);
    return distance <= 750
      ? [
          {
            name: p.name,
            distance_m: Math.round(distance),
            source: "historical_city_beach_reference",
            source_ref: `catalog:${p.id}`,
            status: "unconfirmed",
          },
        ]
      : [];
  });
  const candidates = [
    ...known.sort((a, b) => a.distance_m - b.distance_m),
    ...online,
    ...mapped.sort((a, b) => a.distance_m - b.distance_m),
  ]
    .filter((c, i, all) => all.findIndex((x) => x.name === c.name) === i)
    .slice(0, 5);
  return {
    candidates,
    reason: candidates.length
      ? null
      : "No specific nearby launch found. Keep the source name or enter a confirmed launch.",
  };
}
