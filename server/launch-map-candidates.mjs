import { distanceMetres } from "../src/domain/weather.mjs";

// Pure interpretation of supplied map data; this module never contacts a provider.
const validPoint = (p) =>
  p &&
  Number.isFinite(p.lat) &&
  Math.abs(p.lat) <= 90 &&
  Number.isFinite(p.lon) &&
  Math.abs(p.lon) <= 180;
const coord = (p) => ({ latitude: p.lat, longitude: p.lon });

function outlineDistance(start, points) {
  const scale = Math.cos((start.latitude * Math.PI) / 180);
  const xy = (p) => [
    (p.lon - start.longitude) * 111195 * scale,
    (p.lat - start.latitude) * 111195,
  ];
  let best = Infinity;
  for (let i = 0; i < points.length; i++) {
    if (!validPoint(points[i])) continue;
    best = Math.min(best, distanceMetres(start, coord(points[i])));
    if (!i || !validPoint(points[i - 1])) continue;
    const a = xy(points[i - 1]),
      b = xy(points[i]);
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      length = dx * dx + dy * dy;
    const t = length
      ? Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / length))
      : 0;
    best = Math.min(best, Math.hypot(a[0] + t * dx, a[1] + t * dy));
  }
  return best;
}

export function mappedLaunchCandidates(payload, start, retrievedAt) {
  if (
    !Array.isArray(payload?.elements) ||
    payload.remark ||
    payload.elements.length >= 500
  )
    throw new Error("Incomplete geographic response");
  return payload.elements
    .flatMap((element) => {
      const tags = element.tags ?? {},
        rawName = tags["name:en"] ?? tags.name;
      if (typeof rawName !== "string") return [];
      const name = rawName.trim();
      if (
        !name ||
        name.length > 100 ||
        /[\u0000-\u001f]/.test(name) ||
        !["node", "way", "relation"].includes(element.type) ||
        !Number.isSafeInteger(element.id) ||
        element.id <= 0
      )
        return [];
      const launch =
        tags.waterway === "slipway" ||
        ["put_in", "egress"].includes(tags.canoe);
      const cove = tags.natural === "bay" && /\bcove\b/i.test(name);
      const shore = ["beach", "cape"].includes(tags.natural) || cove;
      const park = tags.leisure === "park",
        marina = tags.leisure === "marina";
      if (
        (!launch && !shore && !park && !marina) ||
        (/\bbay\b/i.test(name) &&
          !/\bcove|beach|launch|ramp|slipway\b/i.test(name))
      )
        return [];
      const lines =
        element.type === "node"
          ? [[element]]
          : Array.isArray(element.geometry)
            ? [element.geometry]
            : (Array.isArray(element.members) ? element.members : [])
                .filter((m) => m.type === "way" && Array.isArray(m.geometry))
                .map((m) => m.geometry);
      const distance = Math.min(
        ...lines.map((line) => outlineDistance(start, line)),
      );
      if (!Number.isFinite(distance) || distance > (park || marina ? 150 : 750))
        return [];
      return [
        {
          name,
          distance_m: Math.round(distance),
          source: "openstreetmap",
          source_ref: `osm:${element.type}:${element.id}`,
          source_url: `https://www.openstreetmap.org/${element.type}/${element.id}`,
          retrieved_at_utc: retrievedAt,
          kind: launch
            ? "launch"
            : cove
              ? "cove"
              : (tags.natural ?? tags.leisure),
          distance_method: "nearest_mapped_point_or_outline",
          status: "unconfirmed",
        },
      ];
    })
    .sort(
      (a, b) =>
        a.distance_m +
          (["park", "marina"].includes(a.kind) ? 100 : 0) -
          (b.distance_m + (["park", "marina"].includes(b.kind) ? 100 : 0)) ||
        a.source_ref.localeCompare(b.source_ref),
    );
}
