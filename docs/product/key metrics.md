# SUP metrics: revised product and analysis plan

Status: **implementation authorized and delivered for core metrics, conservative events, descriptive drift and experimental zig-zag**. Updated 2026-09-27, America/Los_Angeles. Synthetic validation establishes implementation behavior; independent on-water validation remains future work.

This plan extends the existing local React/SQLite/MCP app. Numerical analysis belongs in app code; explanations, fatigue hypotheses and coaching belong in the external LLM, following [LLM versus app responsibilities](llm%20vs%20app.md).

The active sequence is in [Part I](#part-i-active-plan). Experimental and suspended proposals are retained in [Part II](#part-ii-suspended-research-and-future-work), with references from [todo.md](../../todo.md). Their presence here does not authorize implementation. The companion [UI design plan](../design/metrics-ui-plan.md) describes placement and interactions; the user selected option 2’s interval inspector with option 1’s chart highlight, plus a cleaner best-20-minute session list. Option 3’s replacement table was rejected.

## Development policy: backward compatibility is not required

The user explicitly permits dropping old app data to accelerate development. Future metric/schema work may reset SQLite state, discard old calculated results, remove legacy adapters and adopt a single current contract. Do not spend this stage building old-schema migrations, dual writes, parallel legacy DTOs or historical metric compatibility.

This permits resets when needed; this implementation did not need a database reset. Original ZIP/FIT uploads remain immutable source material. If the only original bytes are inside a database to be reset, preserve and verify those bytes and checksums outside that database first. Re-importing source files is an acceptable development workflow. Old app records and caches need not survive the reset.

Method versions, input provenance and tenant boundaries remain required: they explain results and prevent stale or cross-tenant evidence; they do not require old-format support. Existing runtime documentation describes the current app until implementation replaces it.

# Part I: Active plan

## 1. Product priorities

The first improvement should help an athlete inspect a sustained effort and answer:

1. What speed did I sustain, and at what recorded cadence?
2. How much ground distance did I cover per estimated stroke?
3. How much of that interval supports the calculation?
4. What pauses, low-speed periods or sensor gaps qualify the evidence?
5. Later, how did measured performance change between sufficiently comparable windows?

Primary display: **speed at recorded cadence**, for example `5.0 mph @ 40 spm`. Supporting display: **estimated ground distance per stroke**, for example `3.35 m/stroke · est.`. These are illustrative values, not a benchmark or an ideal cadence. Neither directly measures paddle force, mechanical work, energy expenditure or biomechanical efficiency.

Retain distance, elapsed/active time, maximum/average/median speed, HR and 5/10/20-minute windows. No universal efficiency or fatigue score is included. The user explicitly promoted an experimental GPS straightness score, with coverage and underlying deviation metrics, for both whole sessions and intervals.

## 2. Start from the implemented foundation

Read [FIT import](../engineering/fit-import.md), [metrics](../domain/metrics.md), [data audit](../data/data-audit.md) and [storage](../engineering/storage.md) before implementation.

| Capability | Current foundation | Planned change |
|---|---|---|
| FIT import | Official SDK, integrity checks, SUP validation, preview/save, immutable bytes/checksums | Expose only additional fields needed by the metrics |
| Telemetry/timers | SI channels, UTC timestamps, source record indexes, explicit pauses | Channel-specific quality and support information |
| Best continuous windows | Exact 300/600/1200-second elapsed windows and boundary evidence | Preserve definition; improve evidence presentation |
| Interval statistics | Time-weighted speed/HR/cadence, coverage, matched-distance/cadence DPS | Refine the shared evidence contract |
| Session DPS | Estimate from explicit SUP distance and total-stroke fields | Retain distinct session scope; investigate cadence semantics |
| Weather/annotations | Separate station retrieval and timestamped athlete notes | Reuse as context without inferring local conditions or causes |
| Latest-10 comparison | Descriptive chronological trends | Supported metric choices, without a normalized fitness score |

The sample audit describes three detailed tracks with irregular sampling. Two sessions without timer pauses have gaps reaching 11–12 seconds; another has a roughly 160-second pause gap. Two sessions have a historical `Suspect early` HR warning without exact boundaries. These are limitations to test, not labels to tune against blindly. Summary-only sessions remain a required product state.

## 3. Source data and normalization

### 3.1 Source retention and useful fields

Retain original ZIP/FIT bytes, checksums, filename/archive-member provenance, decoder version and source references. Original bytes preserve unknown/vendor fields; a second permanent copy of every decoded object is unnecessary.

Use tenant-scoped string session identity. Names refer to the confirmed launch point and never change identity. Domain units remain SI; timestamps remain UTC with explicit display timezone. Missing values remain `null`.

Inspect and expose when useful and present:

- Session identity, sport/sub-sport, start/end, elapsed/timer duration, total distance and explicit SUP total strokes.
- Record timestamps, coordinates, cumulative distance, speed/enhanced speed, HR, cadence, fractional cadence and GPS accuracy metadata.
- Timer/other event messages, event type/group/data and source indexes; lap boundaries, lap trigger and workout-step relationship.
- Device/sensor information sufficient to explain cadence/HR provenance and recording mode where supplied. Absence stays unknown; omit unnecessary serial numbers from model context.
- Temperature, altitude, cycle-length and other richer fields remain available in the source. Watch temperature is not automatically ambient weather; cycle length is not validated stroke efficiency.

Use Garmin profile scaling/subfields and validate device/activity cadence semantics. Do not invent a stroke/cycle multiplier. Preserve fractional cadence inputs and document whether/how the decoder combines them; avoid double-counting an already expanded field.

### 3.2 Ordering, gaps and speed sources

Keep the existing strict import policy for missing, duplicate, decreasing and out-of-session record timestamps. Do not silently sort or discard records. A source-preserving repair mode is suspended in Part II. Backward-compatibility freedom does not justify ambiguous timestamps.

Use actual positive timestamp differences, never sample count as duration. Time-based smoothing stays inside supported runs; no bridging pauses/unsupported sensor gaps or endpoint extrapolation. Display smoothing and numerical calculations must be distinguishable.

Prefer valid FIT enhanced speed, then valid FIT speed. GPS-derived speed is a separately labelled fallback with its own support/quality; never silently mix it into a device-recorded channel. Prefer reliable cumulative FIT distance for distance metrics. Geodesic GPS displacement supports geometry/anomaly inspection, not replacement of session distance by default.

## 4. Shared evidence and eligibility contract

Every derived metric or detected interval carries:

- Metric key, value or null, unit, source/evidence status and explicit interval/scope.
- Method/version, decoder/input reference or hash, parameters and computation time.
- Covered seconds, requested seconds, coverage percentage and included source ranges.
- Excluded duration/reasons, missing-channel reasons and boundary uncertainty when applicable.
- Context revision or equivalent dependency key when annotations/equipment/conditions affect matching or eligibility.

Compute from full stored records before map simplification or model-visible downsampling. UI and REST/MCP use the same deterministic evidence. Recompute or discard stale results when inputs/methods change; old-cache compatibility is unnecessary.

| Separate concept | Meaning | Example |
|---|---|---|
| Data quality | Whether channels support the calculation | 94% matched coverage; HR warning |
| Comparison quality | Whether intervals meet matching rules | Same board/direction; current unknown |
| Interpretation confidence | Strength of an explanation | External LLM fatigue hypothesis |

Do not collapse these into one HIGH/MEDIUM/LOW label. A derived classification is not an athlete report, a heuristic score is not a calibrated probability, and unavailable is not zero.

Channel validity is independent. Missing GPS can invalidate course analysis while leaving recorded HR/cadence useful. Sensor disagreement is a quality flag, not proof that one channel is correct.

The existing 15-second gap/interpolation policy and 8 m/s distance-jump guard are explicit prototype policies, not accuracy guarantees. Retain their documented behavior until a tested replacement is chosen. Metrics needing finer resolution require stricter eligibility. The original proposed universal 15 km/h warning, 25 km/h rejection and 2.5 m/s² acceleration thresholds are suspended hypotheses, not new active limits.

## 5. Speed, cadence and stroke-distance evidence

### 5.1 Paired speed and cadence

For a selected best window, expose speed and cadence with scope/coverage. Best-window speed remains distance change divided by elapsed duration; do not substitute a mean of instantaneous speed samples.

Partial cadence coverage must not imply that full-window speed was achieved at a cadence observed only briefly. The proposed initial gate for a prominent paired value is at least 90% matched coverage, subject to validation. Below that, keep best speed visible and show cadence as insufficient coverage. Detailed evidence may retain a qualified partial estimate.

For arbitrary interval relationship analysis, calculate distance-based speed and time-weighted cadence over identical supported edges. Return covered duration; do not pair independently covered averages without qualification.

### 5.2 Estimated distance per stroke

For interval totals:

```text
estimated_strokes = sum(cadence_spm * supported_seconds / 60)
DPS_m_per_stroke = matched_distance_m / estimated_strokes
```

Use identical eligible edges for distance and cadence, clipped to interval boundaries. The current method holds left cadence across each edge and linearly interpolates cumulative distance. Return its method/assumptions. Do not average instantaneous DPS ratios to obtain an aggregate.

Measured zero cadence is meaningful: supported glide distance contributes distance but no strokes. All-zero estimated strokes yield null; zero distance with positive strokes can yield zero. Missing cadence contributes no matched support and never means zero strokes.

Session DPS from explicit SUP distance/total-stroke fields remains distinguishable from cadence-integral interval DPS. These are different scopes/input sources, not legacy compatibility formats. Neither becomes a validated stroke counter without independent counting.

For the DPS timeline, propose a time-based rolling matched-distance/cadence estimate with visible window length/coverage in details. Select its window from sampling and validation evidence, not assumed 1 Hz recording. Break the curve at unsupported spans and label it estimated. The point expression `60 * speed_mps / cadence_spm` may be a diagnostic when supported, but is not the aggregate definition.

A turn-excluded or steady-paddling-only DPS is a separate estimand requiring its own eligibility and name. It is suspended; do not silently apply it to ordinary interval DPS.

### 5.3 Units and meaning

Display speed in mph and DPS in metres/stroke, as requested. Retain miles and Fahrenheit elsewhere. Offer alternate speed/distance/temperature units and feet/stroke through keyboard-focusable, tappable metric details as well as hover. Cadence remains spm and HR bpm.

Use `Speed at recorded cadence` and `Estimated ground distance per stroke`. More cadence is not inherently better. Higher DPS can reflect glide, current or wind rather than improved technique.

## 6. Conservative interruption and movement evidence

### 6.1 Independent dimensions

Represent these separately, allowing overlap:

- Timer: explicit running/stopped or unresolved. Process events first and preserve summary/event mismatch handling.
- Movement: supported movement, supported low-speed/stationary candidate, maneuver candidate or unknown.
- Channel quality: supported/degraded/missing per channel, independently of movement.
- Athlete annotations: reported fall/interruption/condition with stated timing confidence, separately from detections.

An athlete may paddle while GPS is degraded. Do not force these facts into competing values of a single state field.

### 6.2 Initial candidates

A low-speed candidate may use speed below 0.5 m/s for at least five supported seconds, with compatible distance/position evidence. These are provisional validation parameters, not established SUP limits. Require enough independent observations to support duration; a five-second data gap does not prove a five-second stop.

Measured zero cadence can corroborate an event. Missing cadence cannot. Cadence alone cannot prove a stop or classify a fall. A documented reduced-evidence method or unavailable result is required when channels are missing.

Use distinct entry/exit criteria and minimum supported duration to avoid rapid toggling. Transitions lie between observations; retain time brackets/boundary uncertainty. Missing GPS with other active telemetry indicates disagreement/degradation, not a proven physical stop.

Label observed evidence, such as `Low-speed period`; do not infer lifeguard conversations, equipment adjustments or falls. Athlete annotations may supply a cause. A detection and annotation can refer to one event without double-counting.

### 6.3 Time and performance denominators

Keep elapsed time, FIT timer time and any future movement estimate distinct. Report supported moving/stopped/unknown durations; unknown must not silently count as stopped. Cadence can indicate paddling without ground progress; ground movement can include drift. Define the duration before naming it moving time.

Preserve best-window policy: timer pauses and invalid runs break eligibility; recorded stationary portions within a valid window count in the elapsed denominator. Never remove inferred interruptions, turns or falls to inflate a best effort. Filtered segment evidence is a separately scoped calculation.

## 7. Matched-window performance drift

This follows core metric/quality work. App code reports changes under matching rules; it does not diagnose fatigue or technique deterioration.

### 7.1 Candidates and support

Start validation with 180-second windows evaluated every 30 seconds using actual timestamps. Proposed eligibility: at least 90% joint support for required channels, stable required channels, no explicit pause, unresolved interruption, major direction change or relevant quality warning. Validate and version these parameters.

For the HR-and-cadence mode, both must be usable and stable: replace the original OR rule with AND. HR standard deviation/trend here concern recorded bpm, not beat-to-beat HRV. The initial SD limits of 5 bpm and 5 spm remain hypotheses requiring sensitivity tests, not physiological thresholds.

Exclude known warmup/recovery/transitions when supported by workout context, annotations or a validated settling rule. Do not invent an early-HR interval from a session-level warning. Unresolved HR quality blocks an unqualified HR-matched summary; retain measurements and warnings for inspection.

### 7.2 Separate comparison modes

| Mode | Match on | Measure |
|---|---|---|
| Speed at similar recorded HR/cadence | HR/cadence, initially within 5 bpm and 3 spm | Speed and DPS change |
| HR at similar speed | Speed and comparable direction/context | HR difference |
| Cadence at similar speed | Speed and comparable direction/context | Cadence and DPS change |

Do not tightly match the variable whose change is being measured. Set and validate relative speed tolerances for the latter modes before release; never invent them at runtime. Require stability/support in each mode's relevant channels and disclose missing optional context.

A strong comparison needs comparable route direction and the same known board. Expose station/athlete conditions, observation age and support. Unknown current/chop/local wind remain limitations; nearby-station weather does not normalize speed. Insufficient context permits descriptive inspection but not an unqualified comparable-effort conclusion.

### 7.3 Selection and aggregation

Choose early/late regions before inspecting outcome changes; an initial candidate is the first and last thirds of session elapsed time, subject to eligibility. Reject overlapping pairs and do not reuse covered time across accepted pairs. A 30-second step does not create independent three-minute observations.

Match deterministically by matching-channel/context differences with earliest-time tie-breaking. Do not select the greatest decline. Report exact windows, unique supported minutes, independent-pair count and rejection reasons. Release validation must set minimum unique duration/pair count; insufficient support returns unavailable. One pair may be shown descriptively without a session-level drift claim.

```text
speed_change_pct   = 100 * (late_speed - early_speed) / early_speed
DPS_change_pct     = 100 * (late_DPS - early_DPS) / early_DPS
HR_change_bpm      = late_HR - early_HR
cadence_change_pct = 100 * (late_cadence - early_cadence) / early_cadence
```

Unsupported/zero-denominator percentage changes return null. Lower speed means lower measured ground speed, not automatically deterioration. Higher cadence at lower speed does not establish greater mechanical work.

Define robust aggregation and show spread across independent pairs. Do not claim a population confidence interval from a few correlated windows. Matched-cadence speed and DPS changes are mathematically related, not independent confirmation.

## 8. UI integration and evidence retrieval

See [metrics UI design plan](../design/metrics-ui-plan.md). Extend the existing light map-led review:

- Interval headline: speed at cadence; supporting value: estimated metres/stroke. Selection highlights the same exact interval.
- Keep whole-session and selected-interval evidence visibly distinct.
- Show DPS through a metric switch in existing chart space; no fourth permanently stacked chart is approved here.
- Put coverage, alternate units/method and unavailable reasons in accessible details. Essential estimate/partial/unavailable qualifiers remain visible without hover.
- Descriptive drift opens an overlay with independent matched windows, exact bounds, neutral changes and context limitations.
- Weather stays inside the map's click/keyboard-open popover.
- Experimental zig-zag is included for whole sessions, selected intervals and latest-10 tracking, with coverage and deviation details. Automatic fall labels and hard/easy classifications remain deferred.

Home retains automatic latest-10 descriptive trends, defaulting to best-20-minute evidence with an explicit whole-session switch. Speed/cadence, DPS, HR and zig-zag expose support, equipment/context and method through accessible details. Missing best-20 evidence never falls back to a whole-session value. A whole-session pair is not a standardized benchmark. Broad normalized historical comparison is suspended.

Return bounded exact evidence through existing analysis-context tools. The external LLM interprets it; no in-app model, automatic analysis writes or coaching diagnosis is added.

## 8.1 Experimental zig-zag promotion

**Superseded on 2026-09-29:** the user authorized the supplied four-component TCS, its 35/30/25/10 weights, initial anchors and score colors. Implementation details and remaining validation limits are in [Tracking Control Score](../engineering/tracking-control-score.md). The following describes the earlier path-ratio implementation, not the current score. Experimental wording is kept in documentation, not repeated across the UI.

User decision: implement a 0–100 experimental local GPS path-straightness score now, with whole-session and exact-interval scope, eligible coverage, median/P90 angular deviation, resolved oscillations and lateral motion. Higher means straighter eligible recorded path, not better technique or lower energy use. No quality bands or paddle-side inference.

The implemented method uses non-overlapping 60-second local sections, 5-second smoothing, 10-second geometry steps and a fixed chord axis per section. Score is 100 × summed chord distance / summed smoothed path distance. Exclude pauses, unsupported GPS, reported accuracy over 20 m, insufficient displacement, speed below 1 m/s, implausible movement and major turns. Require 60 eligible seconds and 20% coverage. These are versioned experimental parameters, not validated SUP thresholds. See [implemented methods](../engineering/performance-metrics.md) for exact rules, dependencies and validation limits. S1 retains the unpromoted research alternatives and independent field-validation work.

## 9. Validation and release gates

Build inspection alongside numerical work. Use existing map/charts or development-only overlays to inspect raw/processed channels, exclusions and boundaries; do not add permanent debugging sections.

| Area | Required validation |
|---|---|
| Time/coverage | Irregular sampling, clipped boundaries, missing endpoints, pauses, timer mismatch/gaps; no extrapolation or stitching |
| Cadence/DPS | Fractional/profile semantics, independent counted intervals, glide/zeros, disjoint support and ratio-of-totals checks |
| Events | Known synthetic transitions and independently annotated sessions; false positives, missed events, boundary error and missing sensors |
| Drift | No-change controls, known changes, direction/HR problems, independent matching and sensitivity to parameters |
| Storage/evidence | Tenant-scoped dependencies, reproducibility, raw integrity, reset/re-import and stale results |
| UI when implemented | Desktop/narrow/keyboard/touch, partial/missing sensors, summary-only state, synchronized selection and unchanged persistent vertical footprint |

Synthetic truth checks behavior; independently annotated held-out sessions assess validity. A map drawn from the same GPS is not ground truth for tracking accuracy. Three historical tracks with untimed event counts cannot validate fall precision or tracking scores.

Set error/false-positive targets, acceptance tolerances and minimum support before tuning/release. These remain explicit open validation decisions until evidence justifies them. Tests use synthetic fixtures and isolated databases, never production/private files.

## 10. Delivery sequence and initial success criteria

| Stage | Deliverable | Exit condition |
|---|---|---|
| A: foundation audit | Needed FIT fields, cadence semantics, sampling, shared contract; reset/re-import if simpler | Required channels and uncertainty documented; no compatibility work |
| B: core experience | Paired interval speed/cadence, matched DPS, units/coverage and chart switching | Calculations validated; chosen UI passes desktop/narrow/keyboard checks |
| C: conservative events | Pauses, supported low-speed candidates, independent movement/quality | Boundaries/missing-data behavior validated without cause claims |
| D: descriptive drift | Separate modes, independent pairs, exact evidence/limitations | Matching/support thresholds validated; insufficient evidence unavailable |
| E: research decision | Assess Part II proposals individually | Independent evidence and user selection justify bounded promotion |

Stages A–D and the bounded zig-zag promotion are implemented together under the user’s overnight authorization. Independent field validation, fall detection, hard/easy segmentation and physiological diagnosis are not implied by successful synthetic checks.

# Part II: Suspended research and future work

These sections retain the original advanced topics with review corrections. They are **not release requirements or implementation instructions for the active stages**. Future work must identify its question, data, validation and promotion decision. See [future-work references](../../todo.md#suspended-metrics-research).

## S1. Local course variability, tracking and zig-zag

**Partly promoted:** the bounded local path-straightness experiment in §8.1 is active by explicit user request. The alternatives below, quality bands, paddle-side inference and claims of validated tracking accuracy remain suspended. GPS measures course over ground, not board heading or intended line. Current sampling has not been shown to resolve the proposed oscillations. Wind/current/chop, deliberate steering and geometry remain confounders.

Retain the two-scale experiment:

```text
reference_course(t) = bearing(position(t - 15s), position(t + 15s))
local_course(t)     = bearing(position(t - 3s), position(t + 3s))
course_error(t)     = circular_difference(local_course, reference_course)
```

Call the reference an estimated local route direction. The 30-second/six-second windows are experimental. Require independent positions and adequate displacement relative to uncertainty; interpolation creates no new directional information. Never cross pauses or unsupported GPS gaps. Angular averaging/differences must be circular, including turn detection around north.

Candidate exclusions: pauses, invalid GPS, inadequate displacement, supported low-speed periods, turns, launch/landing and tight geometry. Do not depend on an unvalidated fall detector. Proposed turn rules (20-degree reference change over 20 seconds or 1.5 degrees/second for several seconds) need validation and edge buffers covering smoothing support.

Possible descriptive outputs: supported duration/distance, time-weighted median/P90 absolute course deviation, suitable circular dispersion, complete cycles/minute and excursion amplitude. Define one-sided versus peak-to-peak amplitude. Require hysteresis/minimum duration; left-right-left is one full cycle. The original sign-change counter counts half-cycles; its three-degree threshold is unvalidated.

Calculate displacement, direction and reference over consistent support. Do not multiply one-record raw GPS distance by an angle from a different multi-record smoothing window.

```text
projection_ratio = sum(delta_distance * cos(course_error_radians))
                   / sum(delta_distance)
lateral_motion_m = sum(abs(delta_distance * sin(course_error_radians)))
```

With a positive denominator, the ratio can range from -1 to 1. A forward-only 0–1 interpretation requires explicit eligibility, not silent clipping. A changing reference gives local alignment, not net progress toward a fixed destination. Zero distance yields unavailable. Lateral motion is not extra path length or recoverable wasted distance.

Do not ship the old 98.4/95.2/90.0 quality bands or present the promoted experimental score as calibrated accuracy. The bounded score’s single decimal is display precision, not an accuracy guarantee. Paddle-side inference remains a separate study requiring independent stroke-side labels and appropriate sensor resolution.

**Promotion gate:** identifiable signal across irregular sampling/noise/curvature using synthetic truth and independent reference observations; held-out error/sensitivity and minimum resolvable angle/event. Agreement with the same watch track is insufficient.

## S2. Fall/remount and semantic interruption classification

**Why suspended:** sudden speed loss, zero cadence, running timer and elevated HR can describe an ordinary intentional stop. Existing historical event counts lack precise labels.

Retain the research pattern: previously moving, supported rapid decline, short low-speed interval, then resumed paddling. Original illustrative thresholds: entry at least 1.5 m/s; below 0.5 m/s within five seconds; 3–30-second stationary interval; resumed speed at least 1.0 m/s. They are unvalidated and may be unresolvable with Smart Recording. Null cadence cannot satisfy zero cadence. Duration alone cannot prove or exclude a fall.

Drop the original +2/+1 points-to-probable-fall mapping as a probability claim. Until calibrated, expose neutral evidence; athlete reports or external interpretation can supply hypotheses. Keep candidates separate from athlete-reported falls and omit a probable-fall count from core summaries.

**Promotion gate:** independently timed falls/rests/maneuvers/interruptions, held-out false alarms per hour, precision/recall, boundary error and missing-channel behavior. State whether confidence is calibrated or heuristic.

## S3. Automatic effort intervals and exhaustive segment labels

**Why suspended:** session P70 speed/cadence can label an easy outing hard; conditions affect speed independently of effort.

Preserve explicit laps, lap trigger and workout-step metadata first. Manual/automatic laps establish boundaries, not necessarily effort. Workout metadata can supply intended steps; measured performance stays separate. Inferred intervals never silently replace supplied boundaries.

Retain `cadence >= session P70 AND speed >= session P70 for >=30s` only as a research baseline. A future method needs baseline/recovery contrast, hysteresis, support and independent labels. No invented HR zones or ideal cadence.

Do not implement one exclusive list mixing PADDLING_HARD, TURN, PAUSED, PROBABLE_FALL and GPS_DEGRADED. Timer, geometry/movement, quality and effort hypotheses can overlap.

**Promotion gate:** no forced hard intervals in held-out easy sessions; measured false positives/boundary errors in interval sessions; turns/missing sensors do not manufacture intensity.

## S4. Environmental normalization and historical benchmarks

**Why suspended:** station weather is not on-water wind; current, waves, shelter and drafting are not reliably measured. Similar HR/cadence does not establish equal effort/resistance.

Retain future contextual inputs: wind speed/from direction, current estimates with provenance, wave height/period/direction, air/water temperature and board/setup. Use circular angles and explicit from/toward conventions. Descriptive wind alignment is not a speed correction.

Future benchmarks may show speed near specified HR/cadence bands or DPS near a cadence band. Expose actual bands/tolerances, unique support, equipment and conditions. No extrapolated values without observations; arbitrary HR bands are not physiological zones. Active latest-10 trends remain descriptive.

**Promotion gate:** sufficient supported comparisons/context and independent model evaluation before adjusted speed, causal fitness change or normalized scores. New current/wave services need explicit scope. Existing station retrieval remains a separate post-import service.

## S5. Physiological fatigue models and composite indices

**Why suspended:** recorded HR/cadence/speed alone cannot identify fatigue, mechanical work or technique failure. More history alone does not resolve confounding.

Retain regression as an experiment: predict ground speed using HR/cadence and available direction/environment; examine residuals against elapsed exercise time. Evaluate out of sample, handle correlated windows/equipment/session changes and test confounded/no-fatigue controls. Declining residuals remain descriptive without independent fatigue evidence.

`speed / cadence` is DPS divided by 60 with stated units, so adds no independent efficiency signal. `speed / HR` is a descriptive ratio with HR-response limitations, not automatically aerobic efficiency. Drop `speed / (HR * cadence)` from delivery unless future validation establishes a useful advantage over components.

**Promotion gate:** simpler matched-window evidence works, sufficient independent data exists, and a specified model demonstrates held-out validity. Coaching remains external.

## S6. Alternative estimands, generic thresholds and repair mode

- **Steady-paddling-only DPS:** separately define/name restricted eligibility and support, validate it, and never silently change ordinary interval/glide DPS.
- **Universal GPS score/hard SUP limits:** original speed/acceleration cutoffs lack validation across modes/conditions. Prefer per-channel reasons and preserve raw values; evaluate replacement policies against independently known examples.
- **Timestamp repair:** preserve source sequence/indexes, define duplicate/conflict and event ordering rules, emit a repair report, test reproducibility. Keep strict rejection until explicitly selected.
- **Permanent chart additions:** a fourth stacked DPS chart or persistent analysis panel needs a separate vertical-space decision. Active design uses existing space and disclosure.

## S7. Research promotion record

For any suspended item, record the user question, method/parameters, inputs, independent reference, dataset split, minimum support, error/false-positive targets, confounders, unavailable behavior and UI footprint. Promote only that bounded feature after review. Unvalidated hypotheses must not become default filters contaminating other metrics.

## References and related decisions

- [Garmin Activity files](https://developer.garmin.com/fit/articles/file-types/activity.html): sampling, events, laps and workout relationships.
- [Official Garmin JavaScript SDK](https://github.com/garmin/fit-javascript-sdk): scaling, expansion and unknown fields.
- [Metric policy](../domain/metrics.md), [import/evidence contract](../engineering/fit-import.md), [data model](../data/data-model.md), [sample audit](../data/data-audit.md).
- [UI design plan](../design/metrics-ui-plan.md), [UX brief](../design/ux-brief.md), [deferred work](../../todo.md), [feature decisions](proposals.md).
