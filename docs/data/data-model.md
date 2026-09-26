# Canonical data model — draft 0.1.0

Use small typed objects at the UI boundary, independent of sheet column order and FIT field encoding. Raw source values remain available in the adapters. The machine-readable external-analysis envelope is [analysis.schema.json](../../schemas/analysis.schema.json); this document also specifies the display entities that are not yet implemented.

## Conventions

IDs are strings. Domain distances are metres, speeds m/s, durations seconds, temperature °C, wind bearing degrees clockwise from true north. Use UTC ISO-8601 timestamps and an IANA display timezone. Initial presentation uses mph, miles, °F and minutes to match the source Sheet. `null` means unavailable; `0` means a measured/entered zero. Preserve the difference between missing direction and 0° north.

Each imported/derived claim has source reference(s), method if calculated, and a status. Keep conflicts visible; do not silently overwrite a reviewed analysis with a new file.

| Entity | Required identity and fields | Optional/nullable fields |
|---|---|---|
| Session | session_id, local_date, timezone, source_refs | start_time_utc, elapsed_duration_s, active_duration_s, distance_m, summary speed/HR/cadence, location, type, gear, notes, quality |
| Board (prototype) | id, name (trimmed, 1–100 characters) | Session assignment by nullable boardId; one nullable defaultBoardId in preferences |
| TrackPoint | session_id, timestamp_utc, elapsed_s | lat/lon, distance_m, speed_mps, heart_rate_bpm, cadence_raw; per-channel availability |
| TimerEvent | session_id, timestamp_utc, event_type, source_ref | trigger; do not infer the reason for a stop |
| BestWindow | session_id, duration_s, status, basis, source_refs, mean_speed_mps | start_elapsed_s/end_elapsed_s absent as null for unlocated legacy values; reason |
| ConditionObservation | observation_id, session_id, source_ref, quality, kind | observed_at_utc, interval bounds, wind_mps, wind_from_deg, air_temperature_c, station, raw text, distance from route |
| SessionEvent | event_id, session_id, kind, source_refs, timing_quality | elapsed interval, note; zero-length interval denotes a point event |
| TechniqueIssue | stable id, phase, label, evidence requirement, cue, confounders, references | illustrative drill and applicability notes |
| TechniqueObservation | observation_id, session_id, issue_id, status, evidence_refs, note | elapsed interval, video timestamp, reviewer |
| Goal | goal_id, metric_key, target_value, unit, comparator, scope | window_duration_s, baseline, deadline, conditions, user note |
| AnalysisRun | analysis_id, session_id, schema_version, generated_at_utc, analyst, source_refs, status | model/tool version, input hashes, limitations; contains windows, conditions, technique and notes |

## Evidence and status

- `measured`: recorded by a device; may still have sensor-quality limitations.
- `derived`: reproducible calculation; include method/version and source input.
- `athlete_reported`: direct self-report, not sensor inference.
- `hypothesis`: interpretation to investigate, not confirmation.
- `observed`: a described action seen in a cited video or by a coach; not proof of causality.

Analysis status is `provisional` or `reviewed`; these are workflow states, not scientific certainty. Each technique observation has its own evidence status. A reviewed analysis can still contain a hypothesis.

## Time and join rules

`elapsed_s = timestamp_utc - session.start_time_utc`, without deleting pauses. Active time comes from timer events/FIT summary; store separately. Source sheet times are minute-level local strings; use FIT start time where present and retain sheet originals. Date/time must agree within their documented precision before matching files automatically. Filename ID is a join hint, not sufficient proof for an unrelated upload. Never guess a timezone from longitude.

Coordinates from FIT semicircles convert as `degrees = semicircles × 180 / 2^31`. GeoJSON coordinates, when introduced, are `[longitude, latitude]`. Reject invalid ranges; do not replace missing points with `(0,0)`.

## Goals and technique

Scope goals to `session`, `best_window`, or `selected_interval`. A 5 mph 20-minute goal does not become achieved because a 5-minute section exceeded 5 mph. Cadence and HR targets are unset without athlete/coach input. Support `at_least`, `at_most`, and (later) bounded ranges; more cadence is not inherently better.

Issue IDs come from `data/reference/technique-issues.json`. Do not use free-form LLM issue names as new dictionary entries. A session may have no observations. Never assign a fault just because it exists in the dictionary.

## Board state in the current prototype

The REST/MCP dashboard adds `boards: [{id, name, sessionCount}]` and `defaultBoardId`. Each session has nullable `boardId`; model-visible session context resolves it to `board: {id, name, source: "athlete_reported"}` or `null`. No supplied source identifies a board, so all initial assignments are null and the board list starts empty.

Board names are unique ignoring case. Renaming preserves the board ID and advances revisions of assigned sessions so subsequent analysis receives the updated name. Assignment changes also advance the session revision. Deleting an assigned board is rejected; deleting an unused default clears the default. A default is a shortcut for explicit assignment, never evidence that a historical session used that board. Board state shares the existing temporary server lifetime. Arbitrary new-session import and automatic default preselection for that future flow remain deferred.

## Session detail edits

`update_session_details` takes `session_id` (string), `name` (trimmed, 1–100 characters) and nullable `board_id`. It validates both edits before applying either, then increments the session revision once if anything changed. Name edits set `titleSource` to `athlete_reported`; initial titles use `source_location`. The original `location`, source references and session ID remain unchanged. The dashboard and analysis context include the edited title and its provenance. Changes remain in server memory only.
