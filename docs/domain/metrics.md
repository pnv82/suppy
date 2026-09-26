# Metric definitions and analysis policy

This is the proposed **v1 policy for future external analysis**, not a claim that existing sheet values were calculated this way.

## Basic measurements

Speed is speed over ground, not speed through water. Keep FIT summary averages, sheet averages and recomputed values distinct. Active duration is timer-running time; elapsed duration includes pauses. Display both where different. HR and cadence averages must identify their included interval and weighting; use time weighting for irregular records, not arithmetic mean of samples.

Preserve Garmin's field semantics until verified for the device/activity profile. The current export calls cadence `cadence_raw` deliberately; fractional cadence and total strokes need investigation before reporting distance per stroke. GPS-derived distance per stroke is condition-sensitive, not a direct measure of paddle force or biomechanical efficiency.

## Best continuous 5, 10 and 20 minutes

Policy key: `elapsed_continuous_v1`. Durations: 300, 600, 1200 s.

1. Use elapsed timestamps and monotonic cumulative distance. Flag resets, duplicate/non-increasing times, impossible coordinates and unvalidated spikes before calculating.
2. Split eligible runs at timer pauses, missing distance, and telemetry gaps greater than **15 s**. This threshold is an explicit prototype policy for these irregular samples, not a Garmin guarantee; include it in the analysis method and reconsider against other recording modes.
3. Evaluate continuous windows fully inside an eligible run. For piecewise-linear cumulative distance, evaluate candidate starts at record times and at record times minus the window duration, including eligible-run endpoints. Interpolate boundary distance only between valid bracketing points at most 15 s apart. Do not extrapolate.
4. Rank by `(distance(end) − distance(start)) / duration`. Denominator includes all time inside the window. Recorded stationary portions are retained. Do not remove interruptions selectively to inflate a best effort.
5. Return the highest mean speed and exact elapsed start/end. Ties within numeric tolerance choose the earliest start; document precision. Windows of different durations may overlap.
6. If no full eligible window exists, return `unavailable` with a reason. If only a legacy speed exists, return `value_only` with null boundaries and `legacy_unspecified` basis.

Do not substitute rolling mean of instantaneous speeds or an arbitrary number of samples for a timed-distance window. Lap intervals are not automatically best-window intervals. Additional 12/30/60-minute sheet metrics may be shown as source values, while 5/10/20 minutes remain the core UI.

## Wind and conditions

Store wind as a meteorological **from** direction. A visual airflow arrow points toward `(from + 180) mod 360`; label the from direction explicitly. Bearing 0° is north, not missing. A stationary point has no reliable course-over-ground direction.

If course and wind are available, an optional descriptive component is `wind_speed × cos(course − wind_from)` (degrees converted to radians): positive is headwind, negative tailwind. It describes alignment only; it is not a speed correction. Crosswind, current, waves, shelter and drafting remain confounders.

Prototype weather coverage policy: nearest timestamped observation within 60 minutes, labelled with observation age, station and quality; ties use the earlier observation. This is a display policy, not proof of local conditions. Do not extend daily summaries into timed wind, linearly average bearings around north, or infer wind from speed asymmetry. Unknown remains unknown.

## Targets and comparisons

The sheet's 5 mph reference is 2.2352 m/s (8.04672 km/h). Duration and conditions must accompany a scored goal. Show raw performance beside context; do not assert condition-normalized progress or physiological thresholds from these four sessions.

## Source references

- Garmin [Activity files](https://developer.garmin.com/fit/articles/file-types/activity.html): message structure and irregular record sampling.
- Garmin [FIT protocol](https://developer.garmin.com/fit/protocol/): decoding belongs in the official SDK/adapter boundary.
- Wind conventions are explicit product data definitions here; existing sheet bearings must retain their source provenance.

## Current local display implementation

`src/domain/metrics.mjs` implements a limited version of the continuous-window policy to locate real 5/10/20-minute sections for the initial UI. It also requires usable coordinates, uses an 8 m/s distance-jump guard, and labels every result `local_estimate`. It does not certify GPS accuracy, perform wind correction, or overwrite the Sheet. More complete validation remains in root `todo.md`.

The map's current wind legend uses the session-level Sheet summary. The nearest-observation coverage policy above is a future display rule; timestamped station changes are not yet drawn on the timeline.
