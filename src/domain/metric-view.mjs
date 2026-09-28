// Shared display selection: never substitute a session value for a missing best effort.
export function metricView(session, duration = null) {
  const window =
    duration == null
      ? null
      : session.windows?.find((w) => w.duration === duration);
  const evidence =
    duration == null ? session.deterministic?.summary : window?.statistics;
  const pair = evidence?.speed_cadence;
  const paired = pair?.coverage_pct >= 90;
  return {
    evidence,
    window,
    paired,
    speed:
      duration == null
        ? (pair?.speed_mps ?? evidence?.distance?.mean_speed_mps ?? null)
        : (window?.speed_mps ?? null),
    cadence: paired ? pair.cadence_spm : null,
    dps: evidence?.distance_per_stroke?.value_m ?? null,
    coverage: pair?.coverage_pct ?? null,
    hr: evidence?.heart_rate_bpm?.mean ?? null,
    zigzag: evidence?.zigzag?.score ?? null,
  };
}
