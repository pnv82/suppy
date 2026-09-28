export function track({
  seconds = 3600,
  step = 5,
  zig = 0,
  lateSpeed = 2,
  lateHr = 140,
  lateCadence = 30,
} = {}) {
  return Array.from({ length: Math.floor(seconds / step) + 1 }, (_, i) => {
    const t = i * step,
      late = t >= (seconds * 2) / 3;
    const distance =
      2 * Math.min(t, (seconds * 2) / 3) +
      lateSpeed * Math.max(0, t - (seconds * 2) / 3);
    return {
      elapsed_s: t,
      distance_m: distance,
      speed_mps: late ? lateSpeed : 2,
      heart_rate_bpm: late ? lateHr : 140,
      cadence_raw: late ? lateCadence : 30,
      latitude_deg: 32.7 + distance / 111195,
      longitude_deg: -117.2 + (zig * Math.sin((t * Math.PI) / 30)) / 93700,
      source_record_index: i,
    };
  });
}
