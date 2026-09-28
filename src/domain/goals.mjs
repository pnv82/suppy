export const GOAL_METRICS = {
  max_speed: "Maximum speed",
  best_300: "Best 5-minute speed",
  best_600: "Best 10-minute speed",
  best_1200: "Best 20-minute speed",
  average_speed: "Average speed",
  cadence_duration: "Longest time above cadence",
};
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
