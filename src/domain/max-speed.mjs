import { usableSpeed, SPEED_QUALITY_METHOD } from "./speed-quality.mjs";

export const MAX_SPEED_METHOD = "continuous_10s_speed_v1";

// Exact sliding integral of left-held recorded speed. A maximum occurs when
// either boundary meets a sample boundary; examine both sets, not a time grid.
export function maximumSpeed10s(
  records,
  pauses = [],
  start = 0,
  end = Infinity,
) {
  const duration = 10;
  const runs = [];
  let run = [];
  for (let i = 0; i < records.length - 1; i++) {
    const a = records[i],
      b = records[i + 1];
    const dt = b.elapsed_s - a.elapsed_s;
    const left = Math.max(start, a.elapsed_s),
      right = Math.min(end, b.elapsed_s);
    const valid =
      Number.isFinite(a.elapsed_s) &&
      Number.isFinite(b.elapsed_s) &&
      dt > 0 &&
      dt <= 15 &&
      usableSpeed(a.speed_mps) !== null &&
      usableSpeed(b.speed_mps) !== null &&
      !pauses.some((p) => a.elapsed_s < p.end && b.elapsed_s > p.start) &&
      right > left;
    if (!valid || (run.length && run.at(-1).end !== left)) {
      if (run.length) runs.push(run);
      run = [];
    }
    if (valid)
      run.push({ start: left, end: right, speed: a.speed_mps, index: i });
  }
  if (run.length) runs.push(run);
  let best = null;
  for (const edges of runs) {
    const first = edges[0].start,
      last = edges.at(-1).end;
    if (last - first < duration) continue;
    const times = [first, ...edges.map((e) => e.end)];
    const integrals = [0];
    for (const e of edges)
      integrals.push(integrals.at(-1) + e.speed * (e.end - e.start));
    const at = (t) => {
      let lo = 0,
        hi = edges.length - 1;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (times[mid] <= t) lo = mid;
        else hi = mid - 1;
      }
      return {
        value: integrals[lo] + (t - times[lo]) * edges[lo].speed,
        edge: lo,
      };
    };
    const starts = [...new Set(times.flatMap((t) => [t, t - duration]))]
      .filter((t) => t >= first && t + duration <= last)
      .sort((a, b) => a - b);
    for (const t of starts) {
      const a = at(t),
        b = at(t + duration);
      const speed = (b.value - a.value) / duration;
      if (best && speed <= best.value_mps + 1e-9) continue;
      // At an exact right boundary only the preceding edge contributes.
      const rightEdge = times[b.edge] === t + duration ? b.edge - 1 : b.edge;
      const sourceStart = records[edges[a.edge].index].source_record_index;
      const sourceEnd = records[edges[rightEdge].index + 1].source_record_index;
      best = {
        value_mps: speed,
        start_s: t,
        end_s: t + duration,
        source_record_range:
          Number.isInteger(sourceStart) && Number.isInteger(sourceEnd)
            ? [sourceStart, sourceEnd + 1]
            : null,
      };
    }
  }
  return {
    method: MAX_SPEED_METHOD,
    source: "derived",
    duration_s: duration,
    value_mps: null,
    start_s: null,
    end_s: null,
    source_record_range: null,
    ...best,
    covered_s: best ? duration : 0,
    coverage_pct: best ? 100 : null,
    reason: best
      ? null
      : "No continuous 10-second window with complete supported speed coverage.",
    policy: {
      weighting: "left_held_elapsed_time",
      minimum_coverage_pct: 100,
      gap_limit_s: 15,
      quality_method: SPEED_QUALITY_METHOD,
      tie_tolerance_mps: 1e-9,
    },
  };
}
