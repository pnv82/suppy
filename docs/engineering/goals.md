# Goals configuration

Goals exposes eleven existing and user-approved goal types directly in ordered Active/Inactive sections. Each compact row shows its measurement scope, current best and target. Click a row to edit; its action menu offers activation/deactivation, source-session navigation and, for turns/footwork, Record practice. Reorder reveals up/down controls temporarily. Target forms, source dates and calculation details are disclosed in a modal; no persistent explanations, inputs or save buttons fill the list.

Each row also has an info hint explaining the calculation in plain language, including relevant recording gaps, missing data and reported results. Click, tap or keyboard-activate the info button to read it; Escape, Tab, another hint or clicking outside dismisses it. Hints stay within the viewport, add no row height, and are hidden during Reorder. The edit dialog reuses the same wording, with endurance duration reflecting the selected draft value. Calculation and ranking methods are unchanged.

## Configuration and ownership

Unconfigured entries have stable `catalog:<metric>` IDs, `active:false` and null target/reference inputs. Reading does not seed SQLite or invent targets. Existing saved IDs, targets and order are retained. Catalog metrics are `max_speed`, `average_speed`, `best_300`, `best_600`, `best_1200`, `cadence_duration`, `endurance`, `stroke_effectiveness`, `effort_economy`, `tracking_control`, and `turns_footwork`.

`upsert_goal` edits an explicit target, or null to clear it. `window_s` is 1800 or 3600 for endurance (default measurement duration: 1800); `cadence_spm` is a nullable comparison cadence for stroke effectiveness; `pace_mps` is a nullable comparison pace for effort economy. These are comparison settings, not inferred physiological thresholds. The separate `cadence_threshold_spm` retains its strict-above meaning for cadence duration. Targets are m/s for speed, seconds for cadence duration, bpm for economy, score points for TCS, and percent for turns. Economy uses an at-most comparator; all others use at-least. Saves preserve activation, order and reported practice results.

`reorder_goals({active_ids,inactive_ids})` must contain every current catalog ID exactly once. Membership, uniqueness and completeness are checked against the trusted tenant, then both buckets commit atomically. Moving appends to the destination; up/down reorders inside the bucket. Focus follows the moved row. Inactive or unset targets are absent from Home goal trends. Settings survive restart.

## Evidence

Current best searches all of the tenant's session history. Each result preserves its source session ID, date, launch title, units and method. Missing evidence is null; measured zero remains zero. Historical source summaries never fill missing calculated results. There is no automatic achievement or condition-normalized fitness claim. Conditions, equipment, intentional maneuvers and sensors remain confounders.

| Metric | Result and eligibility |
|---|---|
| Original speed/cadence goals | Same source selectors and exact 5/10/20-minute windows as Home. Cadence efforts split at pauses, missing endpoints, equality and gaps over 15 seconds. |
| Longer endurance | Fastest exact continuous 1800- or 3600-second distance/time window, using the existing elapsed-continuous policy. Boundaries are clipped to reported elapsed duration; pauses, invalid distance and gaps split runs. No GPS requirement for a numeric result. |
| Stroke effectiveness | Fastest sampled 300-second block with mean recorded cadence within ±3 spm of the configured cadence, cadence SD ≤5 spm and 100% joint distance/cadence support. Speed and estimated metres/stroke use the same supported edges. This does not measure paddle force or certify technique. |
| Effort economy | Lowest mean HR in a sampled 300-second block at speed within ±3% of the configured pace. Distance-speed SD ≤max(0.1 m/s, 7% of mean); HR SD ≤5 bpm; 100% joint HR/distance support. Skip the first 180 elapsed seconds and exclude sessions with suspect/unreliable/invalid HR. No inferred HR zones. |
| Tracking control | Highest supported whole-session TCS across eligible GPS sections. Uses the current TCS method and eligibility without changing calibration; retains coverage and eligible seconds. |
| Turns and footwork | Athlete-reported success percentage of the weaker direction: 100 × min(left successes/attempts, right successes/attempts). Both directions require at least one attempted turn. No sensor-derived turn, success or fall counts. |

Stroke/economy candidate starts use a 30-second grid plus eligible run boundaries. For very long sessions the grid expands to bound the search; the result states its step. The result is the best evaluated block, not the exact optimum over every possible start. Missing required channels remain invalid rows that split runs; samples are never removed to bridge gaps. Pauses and reported falls/interruptions break support. Calculation uses full records server-side before model sampling, and the tenant/session analysis cache includes configuration and method. Results enter dashboard and model context as `goalMetrics[goal_id]` with value, bounds, matched measurements, coverage and source ranges where applicable. New metrics have individual compatible Home trends; their target lines never attach to another scope.

## Reported practice

`set_goal_practice({goal_id,session_id,result})` accepts left/right successful and attempted counts (integers, attempts 1–1000, successes 0–attempts), or null to clear. The goal must be turns/footwork, and the related session must resolve inside the same trusted tenant. One editable result per goal/session is stored in the goal's SQLite JSON with athlete-reported source and UTC save time. It is never inferred from FIT data. Best-result selection only considers sessions still in the tenant's history. Editing a target retains the practice history. Mutations advance interpretation revisions.

The five new goal categories are authorized by the 2026-09-30 user request. New target values remain unset until entered. Original FIT/ZIP files and SQLite schema are unchanged. Pending scientific calibration remains in `todo.md`.
