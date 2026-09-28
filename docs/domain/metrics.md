# Metric definitions and analysis policy

This is the **v1 deterministic app calculation policy**, not a claim that existing historical values were calculated this way. App code supplies numerical evidence; the LLM interprets it. See [import and evidence methods](../engineering/fit-import.md) and [responsibility boundary](../product/llm%20vs%20app.md).

## Basic measurements

Speed is speed over ground, not speed through water. Keep FIT summary averages, imported historical averages and recomputed values distinct. Active duration is timer-running time; elapsed duration includes pauses. Display both where different. HR and cadence averages must identify their included interval and weighting; use time weighting for irregular records, not arithmetic mean of samples.

Preserve Garmin's field semantics until verified for the device/activity profile. The current export calls cadence `cadence_raw` deliberately; do not present cadence-derived counts as measured strokes or use a guessed cycle multiplier. The requested interval estimate below explicitly treats recorded SUP cadence as strokes/minute. The user requested distance per stroke in the summary: the prototype now shows a labelled watch estimate using explicit SUP session distance and total-stroke fields, as defined below. GPS-derived distance per stroke is condition-sensitive, not a direct measure of paddle force or biomechanical efficiency.

## Best continuous 5, 10 and 20 minutes

Policy key: `elapsed_continuous_v1`. Durations: 300, 600, 1200 s.

1. Use elapsed timestamps and monotonic cumulative distance. Flag resets, duplicate/non-increasing times, impossible coordinates and unvalidated spikes before calculating.
2. Split eligible runs at timer pauses, missing distance, and telemetry gaps greater than **15 s**. This threshold is an explicit prototype policy for these irregular samples, not a Garmin guarantee; include it in the analysis method and reconsider against other recording modes.
3. Evaluate continuous windows fully inside an eligible run. For piecewise-linear cumulative distance, evaluate candidate starts at record times and at record times minus the window duration, including eligible-run endpoints. Interpolate boundary distance only between valid bracketing points at most 15 s apart. Do not extrapolate.
4. Rank by `(distance(end) − distance(start)) / duration`. Denominator includes all time inside the window. Recorded stationary portions are retained. Do not remove interruptions selectively to inflate a best effort.
5. Return the highest mean speed and exact elapsed start/end. Ties within numeric tolerance choose the earliest start; document precision. Windows of different durations may overlap.
6. If no full eligible window exists, return `unavailable` with a reason. If only a legacy speed exists, return `value_only` with null boundaries and `legacy_unspecified` basis.

Do not substitute rolling mean of instantaneous speeds or an arbitrary number of samples for a timed-distance window. Lap intervals are not automatically best-window intervals. Additional 12/30/60-minute historical metrics may be shown as source values, while 5/10/20 minutes remain the core UI.

## Wind and conditions

Store wind as a meteorological **from** direction. A visual airflow arrow points toward `(from + 180) mod 360`; label the from direction explicitly. Bearing 0° is north, not missing. A stationary point has no reliable course-over-ground direction.

If course and wind are available, an optional descriptive component is `wind_speed × cos(course − wind_from)` (degrees converted to radians): positive is headwind, negative tailwind. It describes alignment only; it is not a speed correction. Crosswind, current, waves, shelter and drafting remain confounders.

Prototype weather coverage policy: nearest timestamped observation within 60 minutes, labelled with observation age, station and quality; ties use the earlier observation. This is a display policy, not proof of local conditions. Do not extend daily summaries into timed wind, linearly average bearings around north, or infer wind from speed asymmetry. Unknown remains unknown.

## Targets and comparisons

The historical 5 mph reference is 2.2352 m/s (8.04672 km/h). Duration and conditions must accompany a scored goal. Show raw performance beside context; do not assert condition-normalized progress or physiological thresholds from these four sessions.

## Source references

- Garmin [Activity files](https://developer.garmin.com/fit/articles/file-types/activity.html): message structure and irregular record sampling.
- Garmin [FIT protocol](https://developer.garmin.com/fit/protocol/): decoding belongs in the official SDK/adapter boundary.
- Wind conventions are explicit product data definitions here; historical bearings must retain their source provenance.

## Current local display implementation

`src/domain/metrics.mjs` implements continuous-window calculations with an 8 m/s distance-jump guard. Historical display estimates required GPS. New imports and `src/domain/analysis.mjs` calculate distance-based windows independently of GPS, with `source: derived`, `method: elapsed_continuous_v1` and the existing `local_estimate` review status. Each window includes channel-weighted interval statistics or an unavailable reason. Map overlays preserve GPS gaps. Neither path certifies GPS accuracy, performs wind correction or overwrites historical summaries. Exact interval evidence is computed before telemetry downsampling; the detailed weighting/coverage contract is in [fit-import.md](../engineering/fit-import.md).

The map wind legend uses a time-weighted station summary when retrieved evidence exists, otherwise the unchanged historical summary. The weather panel follows the performance cursor with the nearest timestamped observation and its age. Scalar means cover supported elapsed time, including pauses; direction uses a speed-weighted circular mean and remains null when the resultant ratio is below 0.1. Each channel has its own coverage. See [weather.md](../engineering/weather.md). No wind effect or on-water condition is inferred.

Travel arrows use GPS points in timestamp order within each valid best window. At spaced elapsed positions, calculate the initial geographic bearing to the interpolated position up to 10 seconds later. Both points must lie inside one continuous eligible run; omit displacement below 5 m and do not cross missing GPS, pauses or gaps. This is local course over ground, not board heading or wind direction. Pixel spacing reduces overlapping arrow markers and zoom can reveal more; selection shows only the selected window's arrows above the other lines. The 10-second / 5-m policy is a display heuristic, not validated heading analysis.

## Session summary and chart references

- **Duration display:** round to the nearest whole minute and format as hours/minutes (86.1 min → 1 hr 26 min). Preserve original numeric durations. The summary remains active time; the timeline remains elapsed time. Show a secondary elapsed duration in the summary when the two differ by more than one second. Timeline coordinates and annotation inputs retain elapsed minutes/seconds.
- **Maximum speed / HR:** use `enhanced_max_speed` and `max_heart_rate` from the FIT session summary when valid. Fall back to the highest valid recorded value, then to the stored maximum HR for HR when only a summary is available. Missing speed is unavailable, never inferred from an average. FIT session maxima can exceed peaks in irregularly sampled records. No spike correction is implied.
- **Median speed / HR:** `time_weighted_step_lower_v1` takes the lower weighted 50th percentile. Each sample is held to the next sample for weighting only when both values and elapsed timestamps are valid, the interval is positive and at most 15 seconds, and it does not overlap a recorded timer pause. Missing endpoints, longer gaps and non-increasing times contribute no duration. No extrapolation before/after records. Speed zero is valid; HR must be positive. No supported duration yields `null`. Return `covered_s` and the method with the result; this is a display estimate, not a reviewed physiological statistic.
- **Chart rendering:** speed and HR show numeric median/max legends plus dashed median and dotted maximum horizontal lines. These remain whole-session references when a best interval is selected. Extend the axis to contain the reference values. Retain the session's HR quality warning; suspect samples are not silently discarded.
- **Distance per stroke:** only for `stand_up_paddleboarding`, use `total_distance / total_strokes` from the same decoded FIT session. Distance must be finite and nonnegative; stroke count must be a positive integer. Never substitute `total_cycles` or average cadence when the explicit stroke field is absent. Keep meters/stroke internally and display feet/stroke with “est.” to match the app's imperial defaults. Store both input totals, source and `watch_estimate` status. Missing totals yield `null`. This includes ground distance during glide and environmental assistance; the count has not been checked against video/manual counting.

The REST/MCP session DTO exposes these under `statistics.speed_mps`, `statistics.heart_rate_bpm`, and `statistics.distance_per_stroke`. Values remain separate from stored summary averages; the external reviewed-analysis schema is unchanged.

Garmin defines average distance per stroke for paddle sports as distance traveled per stroke in its [data-field reference](https://www8.garmin.com/manuals-apac/webhelp/forerunner570/EN-SG/GUID-F5495143-1A21-4197-83B4-B8B2DD3A7F72-1054.html). Our ratio is a transparent local estimate from the supplied totals, not a claim that the watch uses this exact internal calculation.

Home maximum-speed summaries and trends use `statistics.speed_mps.max`, converted to mph; no new maximum calculation or spike filtering is introduced. Interval tiles use the interval cadence mean/coverage policy. Missing interval distance per stroke is lazily calculated with the cadence-integral method below. Never substitute the session-wide ratio.

## Lazy interval stroke-distance estimate

`matched_distance_cadence_integral_v1` divides ground distance by estimated strokes over identical supported record edges. Cadence is explicitly assumed to be strokes/minute with no multiplier; it is not a validated interval stroke count. Each eligible edge has valid nonnegative cumulative distance and cadence at both endpoints, strictly increasing elapsed time, at most 15 seconds between records, no overlapping timer pause, no distance reset and no distance-implied speed above 8 m/s. Clip each edge to the interval: distance is linearly interpolated, while cadence is held from the left record and integrated as `cadence * covered_seconds / 60`. Sum matched distance and estimated strokes, then divide. Do not divide independently covered channel averages.

Zero cadence contributes distance/time but no strokes (gliding); an all-zero count is unavailable. Zero distance with positive strokes yields zero. Missing channels, no coverage, empty/point intervals remain null. Partial coverage returns an estimate of the covered part, with `covered_s`, `coverage_pct`, distance and estimated strokes. Feet/stroke is marked `est.` in interval tiles, with coverage and assumptions in accessible detail text. This does not change whole-session explicit FIT-total estimates.

Opening session review calculates missing/legacy-null interval evidence only for that view; React memoization reuses it while telemetry, pauses and windows remain unchanged. Existing numeric values and current-method unavailable results are retained. Reloading can recalculate cheaply; viewing does not rewrite SQLite or raw uploads. New imports persist this evidence automatically. Session/analysis context lazily upgrades legacy cached evidence with the same method before returning it to the external LLM.
