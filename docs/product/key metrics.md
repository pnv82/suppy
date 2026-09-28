# SUP FIT Import and Derived Metrics Specification

## 1. Purpose

Suppy should treat a Garmin FIT activity file as the canonical high-resolution source for SUP session analysis.

The importer must preserve raw FIT data rather than only extracting Garmin-style summary metrics. Derived metrics should be calculated separately so algorithms can evolve without re-importing the original activity.

The initial implementation should prioritize:

- GPS position and course
- speed
- distance
- heart rate
- stroke cadence
- timer/start/stop events
- lap/session boundaries
- environmental fields when available

The most important derived features are:

1. tracking / zig-zag analysis
2. fatigue / efficiency drift
3. interruption / stop / probable-fall detection
4. stroke efficiency
5. effort-normalized speed
6. interval segmentation

---

# 2. Data Model

## 2.1 Raw activity

```text
Activity
  id
  source
  sport
  sub_sport
  start_time
  end_time
  elapsed_time
  timer_time
  total_distance
  raw_fit_file_reference
  device_info[]
  laps[]
  events[]
  records[]
```

Do not discard unknown FIT fields.

Preserve either:

- the original FIT file, or
- a normalized representation of all decoded fields

Prefer preserving the original FIT file permanently.

---

## 2.2 Raw record

Each FIT `record` message should be normalized into approximately:

```text
Record
  timestamp

  position_lat
  position_long

  distance
  speed
  enhanced_speed

  heart_rate
  cadence

  altitude
  enhanced_altitude

  temperature

  gps_accuracy

  raw_fields {}
```

Use `enhanced_speed` instead of `speed` when both are available and Garmin FIT semantics indicate it is the higher-resolution equivalent.

Missing values must remain `null`; do not synthesize values during import.

---

## 2.3 Event data

Preserve all FIT event messages.

Relevant fields include:

```text
Event
  timestamp
  event
  event_type
  event_group
  data
  data16
  raw_fields {}
```

Particularly important events:

- timer start
- timer stop
- timer stop_all
- lap
- session
- activity
- auto-pause related events if present

Do not infer interruption state from GPS until explicit timer events have been processed.

---

# 3. Preprocessing

Derived metrics should operate on a cleaned analysis stream, while raw data remains untouched.

## 3.1 Sort

Sort records by timestamp ascending.

Reject exact duplicate timestamps only in the derived analysis stream.

Do not delete them from raw storage.

---

## 3.2 Time delta

For each pair of adjacent records:

```text
dt = timestamp[i] - timestamp[i-1]
```

Typical values:

- 1 second: normal recording
- 2–10 seconds: Smart Recording or missing samples
- large gaps: pause, sensor outage, activity interruption

Do not assume 1 Hz sampling.

All calculations must use actual `dt`.

---

## 3.3 Position delta

Calculate geodesic distance:

```text
gps_delta_m =
  haversine(
    lat[i-1],
    lon[i-1],
    lat[i],
    lon[i]
  )
```

Do not derive primary session distance solely by summing raw GPS deltas if the FIT `distance` field is reliable.

Use GPS deltas mainly for:

- course
- tracking analysis
- stop detection
- anomaly detection

---

## 3.4 Speed source priority

Recommended priority:

1. FIT `enhanced_speed`
2. FIT `speed`
3. derived GPS speed

```text
gps_speed = gps_delta_m / dt
```

Use GPS-derived speed only as fallback or validation.

---

## 3.5 Basic GPS filtering

Mark a GPS sample unreliable when one or more apply:

```text
gps_accuracy > configured_threshold
impossible speed jump
impossible acceleration
position jumps while recorded speed remains near zero
large displacement across an unusually long recording gap
```

Recommended initial thresholds for SUP:

```text
maximum plausible speed:
  15 km/h / 9.3 mph for normal analysis

hard reject threshold:
  25 km/h / 15.5 mph

maximum plausible acceleration:
  2.5 m/s²
```

These should be configurable.

Prefer marking a sample as low-confidence rather than permanently deleting it.

---

# 4. Core Derived Record Fields

For every valid analysis sample derive:

```text
DerivedRecord
  timestamp

  dt

  speed_mps
  speed_smoothed_mps

  heart_rate
  heart_rate_smoothed

  stroke_rate_spm
  stroke_rate_smoothed

  gps_delta_m

  course_deg
  course_smoothed_deg

  acceleration_mps2

  moving
  timer_running

  distance_per_stroke_m

  tracking_deviation_deg

  analysis_confidence
```

---

# 5. Smoothing

GPS course and instantaneous speed are noisy.

Never use unsmoothed per-sample course directly for tracking analysis.

Recommended initial smoothing windows:

```text
speed:
  3–5 seconds

course:
  use displacement across approximately 5–10 seconds

cadence:
  3–5 seconds

heart rate:
  5 seconds
```

Prefer time-based rolling windows rather than fixed sample counts.

Example:

```text
course at t =
  bearing(
    position at approximately t - 5 s,
    position at approximately t + 5 s
  )
```

This substantially reduces GPS jitter.

---

# 6. Stroke Metrics

## 6.1 Stroke rate

Garmin cadence for paddle sports should be treated as stroke rate only after validating the device/activity format.

Store:

```text
stroke_rate_spm
```

Never assume cadence is valid while:

- stationary
- timer stopped
- Garmin reports zero or null
- speed is essentially zero

---

## 6.2 Distance per stroke

For valid moving samples:

```text
distance_per_stroke_m =
    speed_mps * 60
    /
    stroke_rate_spm
```

Example:

```text
speed = 2.2 m/s
stroke rate = 40 spm

DPS = 3.3 m/stroke
```

Require:

```text
stroke_rate >= 10 spm
speed >= 0.5 m/s
```

Otherwise return `null`.

Do not calculate DPS across interruptions or turns.

---

# 7. Tracking / Zig-Zag Analysis

## 7.1 Objective

Tracking analysis estimates how efficiently the board progresses along its intended local direction instead of wasting distance through repeated left-right course changes.

This is not true board yaw.

GPS measures:

```text
course over ground
```

not:

```text
board heading
```

Therefore wind, current, surf, turns and route geometry must be separated from actual paddling zig-zag.

---

# 7.2 Main problem

A naive implementation such as:

```text
difference between consecutive GPS bearings
```

will mostly measure GPS noise.

Another naive implementation such as:

```text
straight-line distance / traveled distance
```

fails badly on legitimate curved routes.

Tracking must therefore be calculated relative to a **local route direction**.

---

# 7.3 Local intended direction

For each point define a longer-window reference direction.

Recommended initial implementation:

```text
reference_window = 30 seconds
```

Calculate:

```text
reference_course(t) =
    bearing(
      position at t - 15 s,
      position at t + 15 s
    )
```

This represents the approximate intended route direction.

Then calculate a shorter-window actual course:

```text
actual_course(t) =
    bearing(
      position at t - 3 s,
      position at t + 3 s
    )
```

Then:

```text
course_error(t) =
  smallest_angle_difference(
    actual_course,
    reference_course
  )
```

Range:

```text
-180° ... +180°
```

Positive and negative signs represent opposite sides of the route axis.

---

# 7.4 Exclusions

Do not score tracking during:

- speed < 1.0 m/s
- timer stopped
- detected interruption
- turns
- launch/landing
- probable fall
- very tight route geometry
- periods with invalid GPS

---

# 7.5 Turn detection

A legitimate turn must not be counted as poor tracking.

Detect a turn when the longer-window course itself changes substantially.

Example rule:

```text
abs(
  reference_course(t + 10s)
  -
  reference_course(t - 10s)
) > 20°
```

or:

```text
reference_course angular velocity
> 1.5°/s
for several seconds
```

Mark these segments:

```text
segment_type = TURN
```

Exclude them from tracking score.

Thresholds should be configurable.

---

# 7.6 Tracking error metrics

For valid straight paddling segments calculate:

```text
mean_absolute_course_error_deg
median_absolute_course_error_deg
p90_absolute_course_error_deg
course_error_stddev_deg
```

Example:

```text
median error: 4.8°
P90 error: 11.2°
```

These metrics are directly interpretable and should always be retained even if a simplified user-facing score is added.

---

# 7.7 Zig-zag oscillation

Poor tracking often appears as repeated alternation:

```text
left
right
left
right
```

Detect sign changes in smoothed `course_error`.

Only count a sign change if the excursion exceeded a minimum magnitude.

Example:

```text
minimum excursion = 3°
```

Algorithm:

```text
if previous meaningful error > +3°
and current meaningful error < -3°:
    oscillation += 1

if previous meaningful error < -3°
and current meaningful error > +3°:
    oscillation += 1
```

Calculate:

```text
zigzag_cycles_per_minute
median_zigzag_amplitude_deg
p90_zigzag_amplitude_deg
```

One full cycle should ideally mean:

```text
left -> right -> left
```

rather than counting every zero crossing as a complete cycle.

---

# 7.8 Path efficiency

Within a locally straight segment calculate:

```text
actual_distance =
  sum traveled distance

forward_progress =
  projection of each displacement
  onto reference course axis
```

For each small displacement:

```text
forward_component =
  gps_delta_m * cos(course_error)
```

Then:

```text
tracking_efficiency =
    sum(forward_component)
    /
    sum(gps_delta_m)
```

Range:

```text
0 ... 1
```

User-facing:

```text
tracking_efficiency_pct =
  tracking_efficiency * 100
```

Example:

```text
actual distance = 1000 m
effective forward progress = 972 m

tracking efficiency = 97.2%
```

---

# 7.9 Lateral waste

Also calculate:

```text
lateral_component =
  abs(
    gps_delta_m * sin(course_error)
  )
```

Then:

```text
lateral_distance_m =
  sum(lateral_component)

lateral_distance_per_km =
  lateral_distance_m /
  actual_distance_km
```

Example:

```text
38 m lateral movement / km
```

This can be easier to understand than an abstract score.

---

# 7.10 Proposed user-facing Tracking Score

Do not make the score the canonical metric.

Store the underlying components.

Possible normalized score:

```text
tracking_score = 100 * tracking_efficiency
```

Example:

```text
98.4 = very straight
95.2 = noticeable inefficiency
90.0 = substantial course waste
```

However, the product should preferably expose:

```text
Tracking efficiency: 97.4%
Median course error: 5.2°
Zig-zag amplitude: 8.1°
Oscillation frequency: 3.4 cycles/min
```

instead of hiding everything behind one number.

---

# 7.11 Paddle-side inference: future feature

Repeated directional oscillation may eventually allow approximate paddle-side change detection.

For example:

```text
several strokes
course drifts right

side switch

course begins drifting left
```

Do not implement this in v1.

GPS sampling and cadence alone may not support reliable stroke-side classification.

---

# 8. Fatigue / Efficiency Drift

## 8.1 Objective

Fatigue analysis should detect performance deterioration during the session while separating fatigue from changes in:

- effort
- wind
- current
- chop
- direction
- intentional recovery paddling
- intervals

The key question is not:

```text
Did speed decline?
```

It is:

```text
Did performance decline at comparable effort?
```

---

# 8.2 Required signals

Primary:

```text
speed
heart_rate
stroke_rate
distance_per_stroke
```

Optional later:

```text
wind
current
wave/chop classification
route direction
```

---

# 8.3 Do not compare entire session halves blindly

This is invalid for interval workouts.

Example:

```text
first half = warmup + hard intervals
second half = recovery + easy paddle
```

A simple first-half / second-half comparison would falsely report fatigue.

Fatigue analysis should operate on comparable effort segments.

---

# 8.4 Stable-effort window detection

Divide activity into rolling windows.

Recommended:

```text
window = 3 minutes
step = 30 seconds
```

A window is eligible if:

```text
moving >= 90% of window
no interruptions
no major turns
no probable falls

heart_rate_variability small enough
OR
stroke_rate_variability small enough
```

Possible initial stability limits:

```text
HR SD < 5 bpm
stroke-rate SD < 5 spm
```

These should be configurable.

---

# 8.5 Effort bins

Group stable windows by approximate effort.

Suggested HR bins:

```text
<120
120–129
130–139
140–149
150–159
160+
```

or preferably relative zones when athlete thresholds are known.

Stroke-rate bins can also be used:

```text
30–34
35–39
40–44
45–49
50+
```

The best comparison uses windows where both HR and stroke rate are reasonably similar.

---

# 8.6 Comparable-window matching

For an early window and later window to be comparable:

```text
abs(HR difference) <= 5 bpm

AND

abs(stroke rate difference) <= 3 spm
```

Optional future constraints:

```text
similar direction
similar wind angle
similar environmental conditions
```

---

# 8.7 Fatigue metrics

For matched windows calculate:

### Speed drift

```text
speed_drift_pct =
    (late_speed - early_speed)
    /
    early_speed
    * 100
```

Negative = deterioration.

---

### Distance-per-stroke drift

```text
dps_drift_pct =
    (late_DPS - early_DPS)
    /
    early_DPS
    * 100
```

This is highly relevant for technique deterioration.

---

### Stroke-rate compensation

If:

```text
speed decreases
stroke rate increases
```

the paddler is working harder mechanically for less board speed.

Calculate:

```text
stroke_rate_drift_pct
```

---

### Heart-rate drift

For approximately constant speed:

```text
HR_drift =
  late_HR - early_HR
```

This captures cardiovascular drift.

---

# 8.8 Efficiency indices

Store several simple indices instead of prematurely choosing one universal score.

### Speed per heart beat

```text
speed_hr_efficiency =
  speed_mps / HR
```

Useful longitudinally, but HR response lag must be respected.

---

### Speed per stroke rate

```text
speed_cadence_efficiency =
  speed_mps / stroke_rate_spm
```

Equivalent conceptually to DPS.

---

### Combined effort efficiency

Optional:

```text
efficiency_index =
  speed_mps /
  (heart_rate * stroke_rate)
```

Do not expose this as an athlete-facing metric until validated.

---

# 8.9 Session fatigue summary

Example:

```text
Fatigue analysis

Comparable effort:
  early: HR 146, 42 spm
  late:  HR 147, 43 spm

Speed:
  2.31 -> 2.18 m/s
  -5.6%

Distance/stroke:
  3.30 -> 3.04 m
  -7.9%

Interpretation:
  moderate late-session efficiency loss
```

---

# 8.10 Regression-based fatigue model

Preferred future implementation.

Instead of pairwise matching, predict expected speed from effort:

```text
speed =
  f(
    heart_rate,
    stroke_rate,
    direction,
    environment
  )
```

Calculate:

```text
performance_residual =
  actual_speed - predicted_speed
```

Then detect whether residuals systematically decline with elapsed exercise time.

Example:

```text
first 20 min residual: +0.05 m/s
last 20 min residual:  -0.08 m/s
```

This is a much stronger fatigue detector once sufficient historical data exists.

Do not implement this before the simpler window method works reliably.

---

# 9. Interruption Detection

## 9.1 Objective

Suppy must distinguish:

1. normal paddling
2. Garmin timer pause
3. stationary rest
4. low-speed maneuver
5. external interruption
6. probable fall/remount
7. GPS failure

This matters because interruptions otherwise corrupt:

- average speed
- cadence
- DPS
- fatigue metrics
- tracking metrics
- interval detection

---

# 9.2 Detection priority

Use signals in this order:

```text
1. explicit FIT timer events
2. speed
3. distance progression
4. cadence
5. GPS movement
6. heart rate
```

Explicit FIT timer state always has precedence.

---

# 9.3 Explicit pause

When FIT reports timer stop:

```text
state = PAUSED_EXPLICIT
```

until timer start.

Do not run other paddling-analysis algorithms during this interval.

---

# 9.4 Stationary interruption

Candidate interruption:

```text
speed < 0.5 m/s
for >= 5 seconds
```

and:

```text
stroke_rate == 0 or null
```

and:

```text
GPS displacement small
```

Classify as:

```text
STOPPED
```

if duration >= configured threshold.

Recommended default:

```text
5 seconds
```

---

# 9.5 Short paddling gap

Avoid calling every stroke break an interruption.

Example:

```text
cadence = 0
speed = 1.8 m/s
duration = 3 seconds
```

The board may simply be gliding.

Therefore cadence zero alone is insufficient.

---

# 9.6 Maneuver detection

A low-speed period may be intentional turning.

Possible classification:

```text
speed < 1.2 m/s
AND
course changes > 30°
AND
duration < 20 seconds
```

Then:

```text
state = MANEUVER
```

Do not classify as interruption.

---

# 9.7 Probable external interruption

Example scenario:

```text
speed drops to near zero
cadence becomes zero
position remains nearly stationary
HR remains elevated
timer continues running
duration 10–120 seconds
then paddling resumes
```

Classify:

```text
INTERRUPTION_UNSPECIFIED
```

Examples:

- lifeguard conversation
- waiting for another paddler
- equipment adjustment
- traffic / boat avoidance

Do not claim a semantic cause unless user provides annotation.

---

# 9.8 Probable fall detection

A fall is not explicitly encoded in a normal Garmin FIT activity.

Only infer a probable fall.

Useful pattern:

```text
before:
  normal paddling

transition:
  sudden speed loss

during:
  speed near zero
  cadence zero
  timer running

after:
  short irregular movement
  then paddling resumes
```

Optional clues:

```text
HR stays high or increases
GPS position wanders locally
recovery takes several seconds
```

Initial rule:

```text
speed_before >= 1.5 m/s

speed falls below 0.5 m/s
within <= 5 seconds

cadence becomes 0/null

timer remains active

stationary duration:
  3–30 seconds

followed by:
  speed >= 1.0 m/s
  and cadence resumes
```

Classify:

```text
PROBABLE_FALL
```

with confidence, not certainty.

---

# 9.9 Fall confidence

Example scoring:

```text
+2 sudden speed drop
+2 cadence stops
+1 HR remains elevated
+1 timer remains running
+1 short stationary period
+1 rapid return to paddling
```

Possible output:

```text
0–2:
  ordinary stop

3–4:
  possible fall

5+:
  probable fall
```

The exact scoring requires validation against annotated sessions.

---

# 9.10 Long stationary event

Example:

```text
speed < 0.3 m/s
duration > 2 minutes
```

Classify:

```text
LONG_STOP
```

This is unlikely to be a normal fall/remount.

---

# 9.11 GPS outage

Do not mistake missing GPS for stopping.

Possible GPS outage:

```text
GPS displacement = zero or invalid
BUT

recorded speed > 1 m/s
OR
cadence > 20 spm
```

Classify:

```text
GPS_DEGRADED
```

Do not feed this interval into tracking metrics.

---

# 9.12 Interruption output

Store:

```text
Interruption
  start_time
  end_time
  duration_s

  type

  confidence

  entry_speed
  exit_speed

  HR_before
  HR_during
  HR_after

  cadence_before
  cadence_during
  cadence_after
```

Types:

```text
PAUSED_EXPLICIT
STOPPED
MANEUVER
INTERRUPTION_UNSPECIFIED
PROBABLE_FALL
LONG_STOP
GPS_DEGRADED
```

---

# 10. Moving Time

Do not blindly trust one definition.

Store separately:

```text
elapsed_time
FIT_timer_time
Suppy_moving_time
```

Suppy moving state:

```text
moving =
  timer_running
  AND
  not interruption
  AND
  (
    speed >= 0.5 m/s
    OR cadence >= 10 spm
  )
```

Thresholds should be configurable.

---

# 11. Interval Detection

Automatic interval detection is secondary to explicit laps.

Priority:

```text
manual lap
structured workout interval
detected effort interval
```

Detected effort may use:

```text
speed
cadence
heart rate
```

Simple v1:

```text
hard interval candidate:

stroke rate >= personal session P70
AND
speed >= session P70
for >= 30 seconds
```

Recovery:

```text
cadence and speed fall below corresponding thresholds
```

Do not use global fixed numbers for all athletes.

---

# 12. Segment Classification

Every part of the session should eventually belong to one of:

```text
PADDLING_STEADY
PADDLING_HARD
PADDLING_EASY

TURN
MANEUVER

PAUSED_EXPLICIT
INTERRUPTION
PROBABLE_FALL
LONG_STOP

GPS_DEGRADED
UNKNOWN
```

Derived metrics should declare which segment classes they accept.

Example:

```text
tracking analysis:
  PADDLING_STEADY
  PADDLING_HARD
  PADDLING_EASY

fatigue analysis:
  stable PADDLING segments only

DPS:
  paddling segments only
```

---

# 13. Session-Level Metrics

Store at least:

```text
distance

elapsed_time
timer_time
moving_time

avg_speed
moving_avg_speed
max_speed

avg_HR
max_HR

avg_stroke_rate
max_stroke_rate

avg_distance_per_stroke

speed_variability
cadence_variability

tracking_efficiency_pct
median_course_error_deg
p90_course_error_deg
zigzag_cycles_per_min
zigzag_amplitude_deg
lateral_distance_per_km

speed_drift_pct
DPS_drift_pct
HR_drift
cadence_drift_pct

pause_count
interruption_count
probable_fall_count
interruption_duration

GPS_quality_score
```

---

# 14. Historical Comparison

For progress tracking compare sessions at comparable effort.

High-value long-term metrics:

```text
speed @ HR 130
speed @ HR 140
speed @ HR 150

speed @ 35 spm
speed @ 40 spm
speed @ 45 spm
speed @ 50 spm

DPS @ 40 spm
DPS @ 45 spm

tracking efficiency

median course error

fatigue DPS drift
fatigue speed drift
```

Do not rely heavily on:

```text
whole-session average speed
whole-session average HR
```

because environmental conditions and workout structure strongly influence them.

---

# 15. Environmental Normalization — Future

To make historical comparison substantially stronger, enrich sessions with:

```text
wind speed
wind direction

current estimate
wave height
wave period
wave direction

air temperature
water temperature
```

Then calculate:

```text
relative wind angle =
  difference between course and wind direction

relative swell angle =
  difference between course and swell direction
```

This enables comparisons such as:

```text
speed at HR 145
with 5–8 kt side wind

vs

speed at HR 145
with 5–8 kt headwind
```

Without this, Suppy must explicitly warn that speed-based comparisons may be environmentally biased.

---

# 16. Analysis Confidence

Every derived metric should support confidence.

Example:

```text
HIGH
MEDIUM
LOW
INVALID
```

Factors reducing confidence:

```text
poor GPS

large recording gaps

short analysis duration

missing cadence

missing HR

many turns

many interruptions

environmental variation
```

Example output:

```text
Tracking efficiency: 97.1%
Confidence: HIGH

Fatigue score: moderate efficiency loss
Confidence: MEDIUM
Reason: later segment entered more exposed water
```

This is preferable to presenting false precision.

---

# 17. Recommended Implementation Order

## Phase 1 — Import

Implement:

```text
FIT decode
raw record persistence
event persistence
lap persistence
device metadata
```

Validate against several Garmin SUP sessions.

---

## Phase 2 — Core analysis stream

Implement:

```text
timestamps
speed
GPS displacement
course
cadence
heart rate

smoothing
moving state
basic GPS quality
```

---

## Phase 3 — Interruptions

Implement before advanced metrics:

```text
explicit pause
stationary stop
maneuver
unknown interruption
probable fall
GPS degradation
```

Because bad interruption classification contaminates nearly every other metric.

---

## Phase 4 — Stroke efficiency

Implement:

```text
DPS
speed at cadence
speed at HR
cadence stability
speed stability
```

---

## Phase 5 — Tracking

Implement:

```text
local reference course
actual short-window course
course error
turn exclusion

tracking efficiency
lateral distance
zig-zag amplitude
zig-zag frequency
```

Validate visually against plotted GPS tracks.

---

## Phase 6 — Fatigue

Implement:

```text
stable-window detection
effort binning
comparable-window matching

speed drift
DPS drift
cadence drift
HR drift
```

---

# 18. Critical Validation Requirement

Before relying on any derived algorithm, create a debugging visualization capable of plotting:

```text
map:
  route
  reference course
  detected turns
  interruptions
  probable falls

timeline:
  speed
  HR
  cadence
  DPS
  tracking error
```

Overlay detected events.

An algorithm such as fall detection or tracking analysis must not be tuned only by numerical summaries.

Its output should be visually inspectable against actual session behavior.

---

# 19. Design Principle

Suppy should keep the following layers separate:

```text
RAW DATA
    ↓
NORMALIZED SENSOR DATA
    ↓
SEGMENT CLASSIFICATION
    ↓
DERIVED METRICS
    ↓
TRAINING INTERPRETATION
```

Do not mix interpretations into the raw metric layer.

Example:

```text
RAW:
speed = 2.15 m/s

DERIVED:
DPS = 3.02 m
tracking efficiency = 94.8%

INTERPRETATION:
efficiency declined late in session
```

This separation is important because interpretation logic will change much faster than FIT decoding or metric definitions.

---

# 20. Initial Success Criteria

The first useful Suppy FIT analyzer should be able to take one Garmin SUP FIT activity and reliably produce:

```text
1. Clean route
2. Moving time
3. Interruption timeline
4. Probable falls
5. Speed timeline
6. HR timeline
7. Stroke-rate timeline
8. Distance-per-stroke timeline
9. Tracking efficiency
10. Zig-zag metrics
11. Comparable-effort fatigue drift
12. Automatically identified hard/easy segments
```

If those are reliable, Suppy will already provide substantially more useful SUP analysis than Garmin Connect's standard session report.