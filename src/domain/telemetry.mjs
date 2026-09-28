// Shared, source-preserving helpers. All intervals use elapsed seconds.
export const finite = (value) => Number.isFinite(value);
export function lowerBound(records, time) {
  let lo = 0,
    hi = records.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (records[mid].elapsed_s < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function intervalRecords(records, start, end) {
  return records.slice(
    Math.max(0, lowerBound(records, start) - 1),
    lowerBound(records, end) + 1,
  );
}

export function angleDifference(a, b) {
  return ((((a - b + 540) % 360) + 360) % 360) - 180;
}

export function hasGps(p) {
  return (
    p &&
    finite(p.latitude_deg) &&
    Math.abs(p.latitude_deg) <= 90 &&
    finite(p.longitude_deg) &&
    Math.abs(p.longitude_deg) <= 180
  );
}

export function geoDistance(a, b) {
  if (!hasGps(a) || !hasGps(b)) return null;
  const rad = Math.PI / 180;
  const lat = (b.latitude_deg - a.latitude_deg) * rad;
  const lon = angleDifference(b.longitude_deg, a.longitude_deg) * rad;
  const h =
    Math.sin(lat / 2) ** 2 +
    Math.cos(a.latitude_deg * rad) *
      Math.cos(b.latitude_deg * rad) *
      Math.sin(lon / 2) ** 2;
  return (
    6371008.8 *
    2 *
    Math.atan2(Math.sqrt(Math.max(0, h)), Math.sqrt(Math.max(0, 1 - h)))
  );
}

export function geoBearing(a, b) {
  if (!hasGps(a) || !hasGps(b) || geoDistance(a, b) < 0.01) return null;
  const rad = Math.PI / 180;
  const x = a.latitude_deg * rad,
    y = b.latitude_deg * rad;
  const d = angleDifference(b.longitude_deg, a.longitude_deg) * rad;
  return (
    (Math.atan2(
      Math.sin(d) * Math.cos(y),
      Math.cos(x) * Math.sin(y) - Math.sin(x) * Math.cos(y) * Math.cos(d),
    ) /
      rad +
      360) %
    360
  );
}

export function weightedQuantile(values, quantile) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a.value - b.value);
  const threshold = sorted.reduce((n, v) => n + v.seconds, 0) * quantile;
  let sum = 0;
  for (const v of sorted) {
    sum += v.seconds;
    if (sum >= threshold) return v.value;
  }
  return sorted.at(-1).value;
}

export function overlaps(start, end, intervals) {
  return intervals.some((p) => start < p.end && end > p.start);
}
