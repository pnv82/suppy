// Provisional flat-water recorded-speed ceiling; retain raw source values.
// This is not a physiological limit or a validated detector of every GPS spike.
export const SPEED_LIMIT_MPS = 6;
export const SPEED_QUALITY_METHOD = "speed_sanity_v1";
export const usableSpeed = (value) =>
  Number.isFinite(value) && value >= 0 && value <= SPEED_LIMIT_MPS
    ? value
    : null;
export function speedQuality(records, start = -Infinity, end = Infinity) {
  const rejected = records.filter(
    (r) =>
      r.elapsed_s >= start &&
      r.elapsed_s <= end &&
      Number.isFinite(r.speed_mps) &&
      usableSpeed(r.speed_mps) === null,
  );
  return {
    method: SPEED_QUALITY_METHOD,
    limit_mps: SPEED_LIMIT_MPS,
    excluded_sample_count: rejected.length,
    raw_max_mps: records.reduce(
      (max, r) =>
        r.elapsed_s >= start &&
        r.elapsed_s <= end &&
        Number.isFinite(r.speed_mps)
          ? Math.max(max ?? r.speed_mps, r.speed_mps)
          : max,
      null,
    ),
    policy:
      "Exclude recorded speeds outside 0–6 m/s from speed statistics and charts; preserve source values. No clipping or gap interpolation. Smaller artifacts can remain; legitimate fast surfing/current-assisted travel can be excluded.",
  };
}
