# Suppy Architecture: Division of Responsibilities Between Code and LLM

## Core principle

Suppy code is the source of truth for training data. The LLM is the reasoning layer above it.

**Suppy code owns deterministic work:** ingestion, normalization, persistence, validation, telemetry slicing, calculations, derived metrics, geographic identification, external-data enrichment, and retrieval of structured evidence.

**The LLM owns non-deterministic work:** interpretation, hypothesis generation, deciding what evidence to investigate, combining telemetry with user observations and domain knowledge, explaining results, and recommending actions.

A result should generally move into Suppy code when it must be:

- reproducible;
- comparable across sessions;
- independently testable;
- available outside the current LLM conversation;
- calculated objectively from structured data.

A result should generally remain in the LLM when its value comes from:

- context;
- judgment;
- ambiguity resolution;
- domain reasoning;
- conversation;
- weighing multiple plausible explanations.

The LLM should not act as Suppy's database or primary numerical computation engine. Conversely, Suppy should avoid encoding complex coaching judgments that are better handled through contextual reasoning.

The preferred interaction model is:

**User question → LLM determines required evidence → Suppy retrieves/calculates structured evidence → LLM interprets it → Suppy stores only validated structured facts or explicitly scoped analyses.**

---

## 1. Responsibilities of Suppy code

Suppy should own anything where the same input should produce the same answer regardless of which LLM or conversation is used.

### Raw session data

Suppy should import and preserve:

- timestamps;
- GPS track;
- distance;
- speed;
- heart rate;
- cadence;
- stroke count;
- pauses;
- elapsed and active time;
- device-provided session metrics;
- original source references.

### Normalization

Suppy should normalize:

- timestamps;
- time zones;
- units;
- missing values;
- invalid samples;
- pauses;
- sensor gaps;
- data-quality flags.

### Derived metrics

Suppy should calculate deterministic metrics such as:

- average and median speed;
- average and median heart rate;
- maximum heart rate;
- cadence;
- distance per stroke;
- splits;
- best 5-minute performance;
- best 10-minute performance;
- best 20-minute performance;
- segment statistics;
- outbound versus return performance;
- speed/cadence relationships;
- heading variability;
- other reusable derived metrics.

Example:

```json
{
  "duration_s": 1200,
  "start_s": 368,
  "end_s": 1568,
  "avg_speed_mph": 4.65,
  "avg_hr_bpm": 151,
  "cadence_spm": 34.2,
  "valid_data_pct": 99.1
}
```

The LLM should not independently recompute such values from raw telemetry when Suppy can provide them deterministically.

### External factual context

Suppy should also own structured enrichment that may be needed repeatedly, including:

- weather;
- wind speed and direction;
- tide;
- swell;
- wave period;
- water temperature;
- other environmental measurements.

These should preferably be associated with the session once and retained rather than fetched independently by the LLM on every analysis.

### Persistent state

Suppy should persist structured facts such as:

- session annotations;
- falls;
- interruptions;
- equipment used;
- board;
- paddle;
- paddle length;
- fin;
- training goal;
- session-specific conditions;
- user-confirmed launch location.

---

## 2. Responsibilities of the LLM

The LLM should own reasoning where multiple interpretations may be valid.

For example, Suppy may provide:

```text
Outbound:
speed = 4.42 mph
cadence = 33.1 spm
HR = 146 bpm

Return:
speed = 3.98 mph
cadence = 33.0 spm
HR = 150 bpm

Wind:
5.8 mph NE

Route:
approximately reversed direction
```

The LLM can then reason that the speed difference is likely influenced strongly by environmental conditions because cadence stayed nearly unchanged while route direction changed relative to the wind.

That interpretation should not be hard-coded into Suppy unless it later becomes a well-defined and repeatedly useful analytical rule.

The LLM should handle:

- explanations;
- cause hypotheses;
- ranking plausible explanations;
- identifying likely limiting factors;
- interpreting user observations;
- deciding which metrics matter for the question;
- comparing telemetry with technique observations;
- generating training recommendations;
- asking useful follow-up questions;
- translating data into actionable coaching.

---

## 3. Rule for deciding where new functionality belongs

A feature should generally belong in **Suppy code** if:

1. It must be reproducible.
2. It must be compared across sessions.
3. It operates over large amounts of telemetry.
4. It should exist independently of ChatGPT.
5. There is an objectively correct calculation.
6. It needs regression testing.
7. It should be available through dashboards or APIs.

Examples:

- best 20-minute speed;
- average cadence over a segment;
- relative wind angle;
- launch-point identification;
- heading variance;
- number of pauses;
- distance per stroke.

A feature should generally remain in the **LLM** if:

1. Multiple interpretations are reasonable.
2. User context changes the answer.
3. Domain knowledge is required.
4. Evidence needs to be weighed rather than simply calculated.
5. The result is explanatory or advisory.
6. The user may naturally want to challenge or refine the conclusion.

Examples:

- why tracking deteriorated;
- whether fatigue or chop was the likely limiter;
- whether a paddle-length change helped;
- what to train next;
- whether a speed decline looks technical, environmental, or physiological.

---

## 4. Suppy should provide evidence, not conclusions

The preferred architecture is:

```text
Raw telemetry
    ↓
Deterministic processing
    ↓
Structured measurements and features
    ↓
LLM interpretation
```

Suppy should avoid collapsing complex evidence into opaque coaching scores unless those scores have a strong and validated definition.

For example, instead of only returning:

```text
efficiency_score = 82
```

Suppy should preferably expose the underlying evidence:

```text
speed = 4.48 mph
cadence = 34.2 spm
distance_per_stroke = 3.31 m
HR = 151 bpm
```

The LLM can then interpret those measurements.

---

## 5. The LLM should decide what evidence to investigate

Suppy does not need to compute every conceivable analytical metric for every question.

The LLM should act as the analysis planner.

For example:

### Question

> Why did my tracking become worse?

The LLM may request:

- stroke-side switching frequency;
- heading variability;
- GPS path deviation;
- cadence;
- speed;
- route direction;
- wind-relative angle;
- annotations;
- specific telemetry intervals.

### Question

> Was my aerobic efficiency better than last week?

The LLM may instead request:

- matched-speed or matched-HR segments;
- heart rate;
- speed;
- cadence;
- duration;
- environmental conditions;
- comparable session intervals.

Therefore:

**The LLM decides what evidence is relevant. Suppy retrieves and calculates that evidence accurately.**

---

## 6. Analysis API

`prepare_analysis_context()` or its successor should be treated as a major architectural interface.

Rather than simply exposing a generic telemetry sample, it should progressively support structured analytical requests.

Example:

```yaml
session_id: 24495535896

interval:
  start_s: 1800
  end_s: 3600

requested_features:
  - speed
  - heart_rate
  - cadence
  - distance_per_stroke
  - heading_variability
  - relative_wind_angle

include:
  - annotations
  - equipment
  - environmental_context
```

For comparison analysis:

```yaml
comparison:
  - session_id: A
    start_s: 1200
    end_s: 2400

  - session_id: B
    start_s: 1500
    end_s: 2700

features:
  - speed
  - heart_rate
  - cadence
  - distance_per_stroke
  - relative_wind_angle
```

Suppy should return bounded, analysis-ready evidence rather than forcing the LLM to process an entire raw FIT stream.

---

## 7. Writes and data mutation

The LLM should not have unrestricted ability to modify Suppy's state.

The preferred pattern is:

**User statement → LLM interpretation → structured proposal → Suppy validation → persistence**

Example user statement:

> My back started hurting roughly halfway through when I entered the chop.

The LLM may convert this to:

```json
{
  "kind": "note",
  "start_s": 2600,
  "timing": "approximate",
  "note": "Lower-back discomfort began after entering choppier water."
}
```

Suppy should then validate:

- that the session exists;
- that the timestamp is within the session;
- that the object matches the schema;
- that the annotation type is valid.

The LLM determines semantic meaning. Suppy enforces structure and integrity.

---

## 8. Measurements, observations, and hypotheses must remain separate

Suppy should explicitly distinguish at least three categories.

### Measurement

An objective value derived from telemetry or external data.

```text
cadence = 34.1 spm
```

### User observation

Something reported by the user.

```text
Back pain started around minute 45.
```

### LLM hypothesis

An interpretation based on available evidence.

```text
Higher stabilization demand in chop may have contributed to the back discomfort.
```

These should not be stored as equivalent facts.

A possible model is:

```yaml
measurement:
  source: telemetry

annotation:
  source: user

analysis:
  source: llm
  model: ...
  timestamp: ...
  evidence_refs: [...]
  confidence: ...
```

This is important because an LLM hypothesis may later prove incorrect while the underlying measurements and user observations remain valid.

---

## 9. Persistence of LLM analysis

Most LLM reasoning should not automatically become permanent user state.

For example:

> Stability appears to be the primary limiter.

That may be true for one session but false several weeks later.

If useful, store it as a session-scoped analysis:

```yaml
session_id: 24495535896

analysis:
  hypothesis: "Stability was likely the primary limiter in this session."
  evidence_refs:
    - ...
  confidence: medium
```

Do not automatically convert temporary coaching conclusions into long-term profile facts.

---

## 10. Session identity and naming

Session identity and human-readable naming should be treated separately.

### Canonical identity

Suppy owns the canonical identity:

```yaml
session_id: 24495535896
```

This identifier should not depend on location naming, LLM interpretation, or user-facing titles.

### Geographic fields

Suppy should store geography as structured data:

```yaml
launch_point: "Bonita Cove"
area: "Mission Bay"
city: "San Diego"
```

The **specific launch point** should be preferred over broad geographic labels.

For example, `Mission Bay` is too imprecise to be the primary session name when the actual launch point can be identified.

### Launch-point identification

Suppy should derive the launch point from the first reliable GPS coordinates.

Preferred hierarchy:

1. User-confirmed launch-point name.
2. Previously known Suppy launch-point mapping.
3. Nearest known launch point within a defined radius.
4. Specific reverse-geocoded landmark.
5. General area such as `Mission Bay`.
6. Raw coordinates as a last-resort fallback.

Example:

```text
GPS start point
    ↓
known launch database
    ↓
Bonita Cove
```

If the user manually corrects a location, Suppy should remember that mapping for future sessions.

Example:

```yaml
location_mapping:
  center:
    lat: 32.XXXX
    lon: -117.XXXX
  radius_m: 100
  launch_point: "Bonita Cove"
  source: user_confirmed
```

Future sessions starting within that area can then be named consistently.

### Session display name

A deterministic fallback can be generated by Suppy:

```text
Bonita Cove — Sep 25, 2026
```

The LLM may optionally generate a more descriptive session title:

```text
Bonita Cove — Intervals + Buddy Race
```

or:

```text
La Jolla Shores — Open-Ocean Practice
```

Recommended precedence:

1. User-defined title.
2. LLM-generated descriptive title.
3. Suppy deterministic fallback.

A user-defined title should never be overwritten automatically.

The LLM should also avoid putting uncertain diagnoses into session titles.

Prefer:

```text
Bonita Cove — Chop / Tracking Practice
```

over:

```text
Bonita Cove — Bad Tracking Technique
```

The first describes the session. The second embeds an unverified conclusion.

### Naming principle

**Suppy owns session identity and geographic naming. The LLM may add semantic description.**

---

## 11. Recommended session schema

A practical session model could include:

```yaml
session_id: "24495535896"

date: "2026-09-25"
start_time: "07:54"

geography:
  launch_point: "Liberty Station"
  area: "San Diego Bay"
  city: "San Diego"
  start_lat: ...
  start_lon: ...
  launch_name_source: "known_location"

naming:
  default_name: "Liberty Station — Sep 25, 2026"
  display_name: "Liberty Station — Wind-Affected Out-and-Back"
  display_name_source: "llm"

equipment:
  board: ...
  paddle: ...
  paddle_length: ...
  fin: ...

metrics:
  distance_mi: 6.02
  elapsed_min: 86.1
  avg_speed_mph: 4.20
  avg_hr_bpm: 142
  cadence_spm: 33

annotations:
  - ...

environment:
  wind_speed_mph: 5.75
  wind_from_deg: 35

analyses:
  - ...
```

---

## 12. Suggested system layers

A useful conceptual architecture is:

```text
        ChatGPT / LLM
   reasoning + coaching layer
              │
              ▼
      Analysis API / Tools
              │
              ▼
      Derived Metrics Layer
              │
              ▼
     Canonical Session Model
              │
              ▼
FIT / GPS / Weather / External Data
```

The LLM should normally interact with the analysis and structured-data layers rather than directly processing raw source files.

---

## 13. Development strategy

Analytical ideas should usually begin in the LLM.

Examples:

- speed at a given cadence;
- cadence-adjusted speed;
- performance by wind-relative direction;
- tracking degradation under chop;
- matched-effort comparisons between sessions.

If an analysis becomes:

- frequently used;
- clearly defined;
- objectively calculable;
- useful across sessions;
- worth displaying in the product;

then it should be promoted into Suppy code as a first-class metric or analytical function.

Therefore the development rule is:

**Prototype analytical ideas in the LLM. Promote them into Suppy once they become useful, well-defined, and repeatedly used.**

This avoids both architectural extremes:

- an oversized backend filled with brittle coaching rules;
- an LLM-only system with inconsistent calculations and weak reproducibility.

---

## Summary

The division of responsibility should be:

**Suppy code**
- stores facts;
- identifies sessions and locations;
- performs deterministic calculations;
- validates data;
- retrieves bounded evidence;
- guarantees reproducibility.

**LLM**
- determines what to investigate;
- interprets evidence;
- combines telemetry with user context and domain knowledge;
- generates hypotheses;
- explains findings;
- recommends actions.

In short:

**Suppy owns facts and structure. The LLM owns meaning.**