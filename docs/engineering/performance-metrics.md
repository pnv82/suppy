# Performance metrics: current implementation

Implemented under the 2026-09-27 user authorization, including experimental zig-zag and descriptive drift. This contract supersedes the earlier planning-only restrictions for those bounded features. Broader suspended work remains in [Part II](../product/key%20metrics.md#part-ii-suspended-research-and-future-work) and [todo.md](../../todo.md).

## Inputs, freshness and source boundaries

`src/domain/analysis.mjs` owns `sup_deterministic_v2`, using full stored records before chart rendering or model-visible sampling. Current calculated evidence replaces stale methods; no compatibility adapter or data migration was added. No existing database or source upload needed deletion. Original FIT/ZIP bytes and hashes are unchanged.

The store attaches a SHA-256 dependency key over method, elapsed duration, full records, pauses, board identity, HR quality, annotations, source reference and session revision. Cache entries are scoped by database object and trusted tenant identity, limited to 30 sessions per tenant. Each analysis includes computation UTC time, source reference, method/policy and context revision. Editing relevant context produces fresh evidence. Committed source records remain immutable. Computation time can change after reopening; numerical results and dependency hashes remain reproducible.

`deterministic.summary` and each `windows[].statistics` share the interval contract. Interval records retain bracketing samples needed for clipping, source index ranges use zero-based half-open bounds, and unavailable source indexes stay null. A range is the enclosing source slice, not proof that every enclosed point qualified. Zig-zag section ranges include their smoothing support.

Channel statistics retain time-weighted mean/median, standard deviation, recorded maximum, covered/excluded seconds, coverage and unavailable reason. Speed, HR, cadence, distance and GPS eligibility are independent. The existing strict timestamp, 15-second gap, 8 m/s distance-jump and elapsed best-window rules remain. Pauses/gaps are never stitched. No fall detector or implicit hard/easy classification is used.

## Cadence and FIT field audit

The pinned official SDK (`@garmin/fitsdk@21.217.0`) performs FIT field scaling and sport-specific expansion. Import retains `cadence_raw`, separately scaled `cadence_fractional_raw`, `cadence_256_raw` and `gps_accuracy_m`; raw laps, device-info and file-ID messages join private import provenance. Missing fields stay null/empty. Device serial numbers are not copied into model context.

Synthetic encoder/decoder checks verify fractional inputs are retained exactly without accidental addition or double scaling. Calculations deliberately continue using the existing `cadence_raw` field: no stroke/cycle multiplier and no guessed recombination of fractional fields. This is an explicitly labelled cadence-based estimate, pending independent device/activity counting. Profile metadata and original bytes permit future reprocessing. This implementation does not claim a new audit of the user's private activity files or independent cadence validation.

## Paired speed/cadence and DPS

Matched distance/cadence edges require finite nonnegative values at both ends, increasing time, at most 15 seconds between records, no timer-pause overlap, monotonic distance and distance-implied speed at most 8 m/s. Clip to requested bounds. Distance interpolates linearly; left cadence is held over each edge.

- Paired speed = matched distance / matched seconds.
- Paired cadence = integrated estimated strokes × 60 / matched seconds.
- DPS = matched distance / integrated estimated strokes.
- Zero cadence contributes glide distance but no strokes; an all-zero count returns null. Missing cadence contributes neither distance nor duration to matched support.
- Best-window headlines retain exact whole-window distance / elapsed duration. Cadence is paired prominently only at **90% matched coverage**. Below that, speed stays visible, cadence is unavailable, and partial DPS is qualified.
- Whole-session coverage uses requested duration less timer-pause duration; elapsed coverage is also returned. Best windows have no pauses. Coverage does not certify sensor accuracy.
- Session FIT-total DPS remains a separate device-total estimate in details. Historical summaries remain explicitly identified source values.

The third chart switches cadence/DPS in place. DPS uses trailing **30-second** matched aggregates and requires **90% coverage**, plus a supported current edge. No endpoint extrapolation, interpolation across pauses or bridging gaps over 15 seconds. Missing current cadence and points inside timer pauses render null. This smoothing window is a provisional display policy, not a physiological scale. Display defaults: mph, m/stroke, spm, bpm; details also show km/h, m/s and ft/stroke.

## Conservative movement evidence

`supported_movement_v1` keeps recorded timer pauses, derived low-speed candidates and athlete annotations separate. Low-speed entry requires both edge speeds below **0.5 m/s**, corroborated by available cumulative-distance/GPS displacement speeds below **0.7 m/s**; if both are available they must agree. Exit threshold is **0.7 m/s** to reduce toggling. A candidate needs at least **5 seconds and two supported edges**. Missing cadence never means zero; observed zero can corroborate an event.

Each candidate includes elapsed bounds and maximum contributing sample gap as boundary uncertainty. This describes supported low ground speed, not its cause or precise transition time. Timer, supported moving/low-speed, and unknown durations remain separate; unresolved timer boundaries count as unknown. Short supported low-speed edges can contribute duration without meeting the event minimum. Ground movement can include drift. Best effort calculations do not remove inferred low-speed periods.

## Experimental zig-zag

`local_path_straightness_v1` is a local GPS geometry descriptor. Higher means straighter eligible recorded sections. It is not board yaw, a technique grade, mechanical efficiency, energy loss, intended-route adherence or a calibrated accuracy score.

1. Split at invalid GPS, pauses, non-increasing timestamps, gaps over **15 seconds**, or displacement speed over **8 m/s**. Reported accuracy over **20 m** excludes a point; missing accuracy remains an explicit limitation.
2. Trim **5 seconds** inside each supported run/request boundary. Construct non-overlapping **60-second** sections, accepting a final section only when at least **30 seconds**. Require at least **7 raw supporting samples**.
3. Smooth each evaluation position with weights ¼, ½, ¼ at `t−5`, `t`, `t+5`. Interpolate only within supported runs. Evaluate geometry every **10 seconds**, including the section end. Longitude interpolation and angle differences wrap across north/the dateline.
4. Use one fixed start-to-end chord direction per section. Reject missing displacement, average smoothed speed below **1 m/s**, impossible steps, first-half versus second-half bearing difference over **25°**, or any local course deviation over **60°**. These are provisional gates; gradual curves or deliberate steering can remain.
5. `score = 100 × sum(section chord lengths) / sum(smoothed section path lengths)`. Those lengths share the same points. Only floating-point bounds are clamped to 0–100. Require at least **60 eligible seconds and 20% requested-duration coverage** to publish a score; otherwise null with a reason.

Return eligible/excluded seconds, coverage, section counts/ranges, path/chord totals, time-weighted median/P90 absolute angular deviation, and absolute lateral motion per kilometre of eligible path. Resolved oscillations count two opposite-sign crossings beyond a **3°** dead band as one cycle; cycles are not joined across section axes. Ten-second geometry suppresses fine changes and can miss short cycles. Lateral motion is not recoverable wasted distance. Exclusion-reason totals cover rejected sections; other excluded duration includes trims, gaps and short runs. Single-decimal display is not an accuracy guarantee. No score quality bands are defined.

## Descriptive matched-window drift

`independent_matched_windows_v1` uses **180-second** windows, starts on a **30-second** grid after **180 seconds** settling, with early windows wholly inside the first third and late windows wholly inside the final third. Long sessions increase the grid step deterministically to bound the candidate search to roughly 1,200 starts; the returned policy states the actual step.

Exclude timer pauses, reported falls/interruptions (point reports exclude intersecting windows), and low-speed candidates. Require at least 90% distance/GPS support, usable direction, no major half-window turn, no displacement jump over 8 m/s and reported GPS accuracy at most 20 m when present. A session-level suspect/unreliable/invalid HR warning blocks HR-dependent modes; it never invents an early invalid-HR boundary.

| Mode | Required stability/support | Match | Report |
|---|---|---|---|
| Speed at similar recorded HR/cadence | 90% joint distance/cadence/HR coverage; HR SD ≤5 bpm AND cadence SD ≤5 spm | HR difference ≤5 bpm; cadence ≤3 spm; heading ≤20° | Speed/DPS change |
| HR at similar speed | 90% joint distance/HR coverage; HR SD ≤5 bpm; distance-derived speed SD ≤max(0.1 m/s, 7% of mean) | Distance-based speed difference ≤3% of larger speed; heading ≤20° | HR difference |
| Cadence at similar speed | 90% matched distance/cadence coverage; cadence SD ≤5 spm; same distance-derived speed stability | Same speed/direction tolerance | Cadence/DPS change |

Candidates sort by normalized matching-channel difference, then earliest early/late starts. Greedy acceptance never reuses seconds **within a mode**; modes are separate estimands and can use the same windows. No greatest-decline selection. Summaries require **two independent pairs**; one pair remains inspectable but has no aggregate claim. Report median change, min/max pair spread, exact windows, pair count and unique supported seconds. Percentage denominators must be positive; missing optional channels return null changes. Speed and DPS changes at matched cadence are mathematically related.

These thresholds are prototype choices, not physiological calibration. Board identity is context; an unknown board is disclosed. Station weather and athlete reports remain separate contextual evidence. Current/chop/drafting/local wind are not normalized, so every result is labelled descriptive and `comparison_quality: conditions_not_normalized`. No fatigue probability, diagnosis or fitness score is computed. The 3-minute settling exclusion is explicit, not an inferred warmup label.

## UI and REST/MCP

Custom intervals use `add_custom_interval({session_id,start_s,end_s})` and `delete_custom_interval({session_id,interval_id})`. Bounds are finite, increasing elapsed seconds inside a session with recorded telemetry; missing GPS/sensors do not prevent saving. Exact duplicate bounds are idempotent. The stored athlete-selected range has a stable UUID, bounds and creation UTC time; derived duration, speed and `intervalStatistics` (including zig-zag) are attached from full records in the tenant-scoped evidence cache. Pauses and unsupported gaps retain their existing exclusions; custom intervals are not strict continuous best windows. Manual previews use the same pure calculation before persistence.

UI/dashboard and model context expose `customIntervals` separately from `windows`. Custom identities never collide with fixed 300/600/1200-second selectors. The model context omits raw zig-zag segments for custom intervals, matching existing compact evidence. Saved external summaries can refer to `interval:<id>` belonging to this session. Removing a tile or adding a new range advances the context revision; numerical calculations and original source data remain unchanged. Every interval tile displays its own zig-zag score or unavailable value; eligible coverage and reasons remain in metric details.

Home defaults to best-20-minute evidence, with a deliberate whole-session switch. Missing best efforts remain missing. Session selection drives the inspector and existing chart/map interval highlight. Metric and drift details use keyboard/touch-accessible native dialogs with Escape and focus return. The third chart switches cadence/DPS; weather remains in its existing map popover. Low-speed/timer evidence uses the existing event lane, distinct from athlete notes.

Dashboard/UI receives exact full-record evidence and the DPS series. `get_session_context` and `prepare_analysis_context` share the same functions, omit the chart series and raw zig-zag segments from model content, cap event listings at 100 and pair listings at 12 per mode with omitted counts, and retain exact aggregate values. Exact requested-interval evidence is calculated before the existing ≤120-record telemetry sample. Raw private GPS/device metadata is not added to model content. External ChatGPT supplies interpretation; the app makes no model calls or automatic coaching writes.

## Validation and limits

Synthetic tests cover irregular/clipped matched support, zero/missing cadence, pauses/gaps/resets, straight and oscillating tracks, turn rejection, dateline wrapping, reported GPS accuracy, source ranges, short intervals, 1-second versus 5-second sampling sensitivity, planted speed/HR/cadence changes, disjoint pairs, direction/annotation exclusions, stale-cache invalidation, UI/MCP numeric agreement, bounded evidence and tenant persistence. Browser checks and viewport evidence are recorded in [design-qa.md](../../design-qa.md).

Independent on-water validation with timed reference observations is still required to assess GPS noise sensitivity, minimum resolvable motion, cadence counting, event false positives and physiological interpretation. No field accuracy or population confidence claim follows from synthetic truth tests. Original source preservation permits reprocessing when the method improves.

## Home change arrows
A metric compares with the arithmetic mean of the immediately preceding three sessions in date/ID order, using the same scope. All three and the current value must be finite and the mean positive; no skipping missing sessions or zero filling. Changes strictly greater than 5% in magnitude get small green/up or red/down arrows with accessible percentage descriptions. Full history supplies baselines for the latest-ten rows. Colors mean numerical direction, including HR and cadence; they do not score fitness or technique.

Home row actions provide Edit, Delete (existing confirmation), Refresh weather (existing post-import service) and Recalculate. Recalculate evicts the tenant-scoped evidence cache and runs the current deterministic methods over full stored telemetry. It preserves source summaries, original bytes and user edits, and does not re-decode the FIT or fetch weather.

## Athlete goals
Goals are explicit tenant-wide at-least targets for maximum speed, current derived whole-session average speed (same supported estimator as Home), best continuous 300/600/1200-second speed, or longest continuous time strictly above a chosen recorded cadence. SQLite schema 5 adds a tenant-owned goals table; no source data reset. REST/MCP upsert_goal/delete_goal validate SI target and optional cadence threshold; dashboard/context expose goals and exact cadence-duration evidence. One target per metric/threshold; up to 20 goals. Edits invalidate stored session interpretation revisions.
Cadence duration requires both cadence endpoints strictly greater than X on increasing edges at most 15 seconds apart without timer-pause overlap. Missing endpoints, equality, lower cadence, pauses and longer gaps split efforts; no stitching. No supported cadence yields null; supported cadence with no qualifying effort yields 0. Earliest longest run wins, with exact supported bounds and covered seconds. Boundary uncertainty is up to the contributing sampling gaps; this is not a physiological achievement assessment.
Home adds explicit 5/10/20 and whole-session speed charts plus cadence-threshold charts for saved goals. Light dashed target lines appear only on compatible metric/scope charts; a 20-minute target never appears on a 5-minute chart. Targets do not replace missing measured data. All target entry uses mph/minutes; persistence uses m/s/seconds.
