import { intervalStatistics } from "./analysis.mjs";
import { interpolate, timeLabel, WINDOW_COLORS } from "./metrics.mjs";

export const intervalKey = (interval) => interval.id ?? interval.duration;
export const reviewIntervals = (session) => [
  ...(session.windows || []),
  ...(session.customIntervals || []),
];
export const intervalColor = (interval) =>
  interval.id ? "#9a5d24" : WINDOW_COLORS[interval.duration];
export const intervalTitle = (interval) =>
  !interval
    ? "Unavailable interval"
    : interval.id === "manual"
      ? "Selected interval"
      : interval.id
        ? `Custom ${timeLabel(interval.start)}–${timeLabel(interval.end)}`
        : `Best ${interval.duration / 60} min`;

export function pointInRuns(runs, elapsed) {
  const run = runs.find(
    (points) =>
      elapsed >= points[0].elapsed_s && elapsed <= points.at(-1).elapsed_s,
  );
  return run ? interpolate(run, elapsed) : null;
}

export function customIntervalEvidence(interval, records, pauses) {
  const statistics = intervalStatistics(
    records,
    pauses,
    interval.start,
    interval.end,
  );
  return {
    ...interval,
    duration: interval.end - interval.start,
    speed_mps:
      statistics.speed_cadence.speed_mps ?? statistics.distance.mean_speed_mps,
    statistics,
  };
}
