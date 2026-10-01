# Performance metrics: current implementation

Core performance metrics and descriptive drift were implemented under the 2026-09-27 authorization. The later four-component TCS replaces path straightness under the explicit 2026-09-29 request. This contract supersedes the earlier planning-only restrictions for those bounded features. Broader suspended work remains in [Part II](../product/key%20metrics.md#part-ii-suspended-research-and-future-work) and [todo.md](../../todo.md).

## Inputs, freshness and source boundaries

`src/domain/analysis.mjs` owns `sup_deterministic_v7`, using full stored records before chart rendering or model-visible sampling. Current calculated evidence replaces stale methods; no compatibility adapter or data migration was added. No existing database or source upload needed deletion. Original FIT/ZIP bytes and hashes are unchanged.

The store attaches a SHA-256 dependency key over method, elapsed duration, full records, pauses, board identity, HR quality, annotations, source reference and session revision. Cache entries are scoped by database object and trusted tenant identity, limited to 30 sessions per tenant. Each analysis includes computation UTC time, source reference, method/policy and context revision. Editing relevant context produces fresh evidence. Original source bytes remain immutable; normalized records can recover newly supported fields from the verified original FIT. Computation time can change after reopening; numerical results and dependency hashes remain reproducible.

`deterministic.summary` and each `windows[].statistics` share the interval contract. Interval records retain bracketing samples needed for clipping, source index ranges use zero-based half-open bounds, and unavailable source indexes stay null. A range is the enclosing source slice, not proof that every enclosed point qualified. Tracking section ranges include their smoothing support.

Channel statistics retain time-weighted mean/median, standard deviation, recorded maximum, covered/excluded seconds, coverage and unavailable reason. Speed, HR, cadence, distance and GPS eligibility are independent. The existing strict timestamp, 15-second gap, 8 m/s distance-jump and elapsed best-window rules remain. Pauses/gaps are never stitched. Possible-fall detection is a provisional multi-signal heuristic; no implicit hard/easy classification is used.

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

`selective_movement_v3` separates timer accounting, internal low-speed support, selectively displayed events, and athlete annotations. Low-speed entry requires both edge speeds below **0.5 m/s**, corroborated by available cumulative-distance/GPS displacement speeds below **0.7 m/s**; if both are available they must agree. Exit threshold is **0.7 m/s** to reduce toggling. A candidate needs at least **5 seconds and two supported edges**. Missing cadence never means zero; observed zero can corroborate an event.

Each candidate includes elapsed bounds and maximum contributing sample gap as boundary uncertainty. This describes supported low ground speed, not its cause or precise transition time. Timer, supported moving/low-speed, and unknown durations remain separate; unresolved timer boundaries count as unknown. Short supported low-speed edges can contribute duration without meeting the event minimum. Ground movement can include drift. Best effort calculations do not remove inferred low-speed periods.

### Selective event refresh and temperature (2026-09-29)

The user confirmed the September 20 fall at **48:41 elapsed** and authorized temperature-assisted detection, replacement of generated events, and automatic recalculation for existing uploads. Athlete annotations are preserved. Slow-speed events remain useful; timer stops should not clutter the detected-event lane.

- Imported records retain nullable signed `temperature_c` (watch measurement, not ambient weather). On first load of an uploaded track missing this channel, the server verifies the tenant-owned saved FIT checksum, decodes it, verifies record-count/timestamp alignment, and saves the recovered channel. Original bytes/checksums and other record channels remain unchanged. A track without saved source bytes remains usable without temperature.
- `sup_deterministic_v7` replaces earlier calculated evidence on load/context/open and invalidates method-dependent caches. Old generated events are discarded. The existing Recalculate action uses this method too.
- Internal supported low-speed intervals still inform duration accounting and drift exclusions. Displayed low-speed events require **20 supported seconds** and recorded movement ≥**1.2 m/s** within **30 seconds** before and after, with continuous ≤15-second support and no timer pause. This removes brief fluctuations and launch/finish standing. Timer pauses never become detected events but still break continuous efforts.
- A possible fall requires the existing corroborated low-speed support (≥5 seconds/two edges), an immediately preceding moving sample ≥**1.2 m/s**, a speed loss ≥**1 m/s**, and cooling ≥**2°C** from that preceding sample within **90 seconds** of low-speed onset. Cooling must persist across observations ≥**5 seconds** apart. Temperature gaps, nulls and pauses break support. Nonzero cadence does not veto a candidate.
- A fall candidate replaces the overlapping low-speed event. Fall/interruption annotations within **15 seconds** link via `annotation_ids`; the timeline shows the annotation once, while metric details retain the supporting detection. Other notes remain independent. A linked detection stays `candidate`, never automatically confirmed.
- Possible falls expose onset and temperature-change brackets, speeds, cooling magnitude, source record range, method/policy and sample boundary uncertainty. Brackets locate recorded transitions, not exact immersion. Temperature lag is not captured by sample-gap uncertainty.

Stationary footwork extension: the user reported many falls in West Cost Rental during same-place practice. `selective_movement_v3` also considers cooling without a moving-to-stopped transition. A new **≥1°C** temperature step must occur inside spatially corroborated low-speed support, follow **30 seconds** of stable temperature, and persist **15 seconds** across continuous samples (≤15-second gaps; no null temperature or timer pauses). The resulting possible fall carries `evidence.signal: cooling_at_low_speed` and `timing_basis: temperature_change`. Its marker brackets the observed cooling, not the exact fall. It is a weaker, more sensitive hypothesis than the existing ≥2°C-plus-abrupt-slowdown path. Neither requires zero cadence.

Continued cooling is grouped into one episode until temperature rises **≥1°C** from the episode minimum. This avoids marking every degree lost as another fall, but cannot recover repeated falls before warming. An overlapping abrupt-slowdown candidate takes precedence. Stable-temperature stationary practice alone creates no new fall markers. Existing sustained low-speed-event filtering and athlete annotation linkage remain unchanged. `sup_deterministic_v7` invalidates prior calculations on load/open/Recalculate.

Thresholds are provisional. Splashing/deliberate immersion can resemble falls; short falls, missing temperature and weak thermal contrast can be missed. One athlete-confirmed example is not precision/recall validation. Best-window denominators and timer semantics remain unchanged.

## Tracking Control Score

The user authorized the four-component composite and color-coded UI on 2026-09-29. `TCS_v1` replaces the previous local chord/path ratio. It weights normalized median deviation (35%), P90 deviation (30%), central-95% lateral corridor (25%) and complete oscillation frequency (10%). Exact geometry, anchors, shared eligibility, confidence, colors and validation limits are defined in [tracking-control-score.md](tracking-control-score.md).

Current evidence is `summary.tracking` / `statistics.tracking`, including raw component values, normalized components, score version, policy and coverage. One current method is calculated across session, best/custom interval, manual preview and model context. Old path-ratio scores are never mixed into TCS trends. The documentation retains the experimental status; the UI uses TCS with numeric/color bands and exposes details without repeated experimental disclaimers.

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

Custom intervals use `add_custom_interval({session_id,start_s,end_s})` and `delete_custom_interval({session_id,interval_id})`. Bounds are finite, increasing elapsed seconds inside a session with recorded telemetry; missing GPS/sensors do not prevent saving. Exact duplicate bounds are idempotent. The stored athlete-selected range has a stable UUID, bounds and creation UTC time; derived duration, speed and `intervalStatistics` (including TCS) are attached from full records in the tenant-scoped evidence cache. Pauses and unsupported gaps retain their existing exclusions; custom intervals are not strict continuous best windows. Manual previews use the same pure calculation before persistence.

UI/dashboard and model context expose `customIntervals` separately from `windows`. Custom identities never collide with fixed 300/600/1200-second selectors. The model context omits tracking segments for custom intervals, matching existing compact evidence. Saved external summaries can refer to `interval:<id>` belonging to this session. Removing a tile or adding a new range advances the context revision; numerical calculations and original source data remain unchanged. Every interval tile displays its own TCS score or unavailable value; eligible coverage and reasons remain in metric details.

Home defaults to best-20-minute evidence, with a deliberate whole-session switch. Missing best efforts remain missing. Session selection drives the inspector and existing chart/map interval highlight. Metric and drift details use keyboard/touch-accessible native dialogs with Escape and focus return. The third chart switches cadence/DPS; weather remains in its existing map popover. Selected low-speed events and possible falls use the existing event lane. Timer pauses remain calculation boundaries, not detected-event markers. Detections linked to existing fall/interruption annotations show only the annotation marker.

Dashboard/UI receives exact full-record evidence and the DPS series. `get_session_context` and `prepare_analysis_context` share the same functions, omit the chart series and tracking segments from model content, cap event listings at 100 and pair listings at 12 per mode with omitted counts, and retain exact aggregate values. Exact requested-interval evidence is calculated before the existing ≤120-record telemetry sample. Raw private GPS/device metadata is not added to model content. External ChatGPT supplies interpretation; the app makes no model calls or automatic coaching writes.

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

## Recorded speed sanity filter

`speed_sanity_v1` excludes recorded speeds outside 0–6 m/s (13.42 mph) from charts, cursor values, speed statistics and exact analysis evidence. It rejects a FIT session maximum outside that range and falls back to supported records, or null. Original samples and FIT totals remain available as raw provenance; quality details show excluded counts and the original maximum. Invalid edges reduce speed coverage without changing HR/cadence coverage, clipping values or stitching gaps. Existing sessions use the policy on read without requiring re-import.

This is a provisional flat-water screening threshold, not a physical speed limit. The [ICF 2019 report](https://paddleworldwide.com/news/baxter-fastest-ever-piana-first-time-fastest-sup-world-titles) reports 46.38 seconds over 200 m (about 9.65 mph average); an instantaneous peak can be faster. The 6 m/s ceiling allows margin but may exclude legitimate surfing/current-assisted travel, and smaller artifacts can remain. Distance/GPS jump checks retain their separate 8 m/s ceiling. Source-reported whole-session average distance/time is not relabelled as a filtered telemetry mean. Analysis method is now `sup_deterministic_v7`.

The original catalog is extended by the five goal types approved on 2026-09-30. Current goal configuration, exact endurance windows, sampled cadence/pace matching, TCS and manual turn reporting are specified in [goals.md](goals.md). The metric-specific target unit/comparator supersedes the earlier all-speed/all-at-least description above.


## Continuous 10-second maximum speed (2026-10-01)

**Max speed (10 s)** replaces instantaneous/device peak speed in session statistics, Home comparisons and trends, maximum-speed goals and external analysis evidence. `statistics.speed_mps.max` and deterministic `speed_mps.max` use `continuous_10s_speed_v1`; `max_10s` retains SI value, exact elapsed bounds, covered seconds, source record range (zero-based half-open when available), policy and unavailable reason. `recorded_max` retains the filtered instantaneous maximum; `raw_summary_max_mps` retains Garmin's original session peak, even when rejected. HR/cadence maximum definitions do not change.

Speed is held from each left sample to its next timestamp. Both endpoint speeds must pass the existing 0–6 m/s sanity filter; timestamps must increase with gaps at most 15 s, and the edge must not overlap a timer pause. Missing/rejected readings split support rather than being removed. This uses the existing sample-hold support policy, not evidence of one reading per second. Require **100% supported coverage of all 10 elapsed seconds**, within the reported session/requested interval. No extrapolation, pause stitching, partial-window denominator or fallback to Garmin's peak. Summary-only, shorter and unsupported sessions return null.

Evaluate starts at every supported sample boundary and boundary minus 10 s, clipping runs to the requested bounds. An integrated step function gives the exact maximum elapsed-time-weighted mean without a sample-count average or time grid. Ties within 1e-9 m/s select the earliest start. `sup_deterministic_v7` invalidates previous generated evidence; source records/uploads are unchanged. Averaging reduces isolated-spike influence but does not validate measurements; smaller artifacts and assisted travel remain confounders. The provisional gap/ceiling rules remain unchanged.


DPS outlier review (2026-10-01): [small-denominator diagnosis and proposed support gates](dps-outlier-review.md). The existing matched DPS method remains unchanged pending implementation; adequate channel coverage alone does not guarantee enough integrated strokes for a useful short-window ratio.
