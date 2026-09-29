# Tracking Control Score (TCS)

Implemented by explicit user request on 2026-09-29 after review of the supplied four-component proposal. `TCS_v1` replaces `local_path_straightness_v1`; the broader calculation contract is `sup_deterministic_v3`. The user will validate real intervals/sessions later. Experimental calibration and limitations belong here, not in repeated UI disclaimers.

## Score and components

Higher is steadier recorded trajectory. The score is a deterministic GPS trajectory descriptor, not board yaw, measured steering force, energy efficiency, or a confirmed technique fault. Conditions, intentional steering, speed and device uncertainty can affect it. Current anchors, weights, thresholds, confidence rules and color bands are **experimental Suppy calibration**, not validated SUP standards.

| Component | Good anchor (100) | Poor anchor (0) | Weight |
|---|---:|---:|---:|
| Median absolute course deviation | 3° | 12° | 35% |
| P90 absolute course deviation | 6° | 20° | 30% |
| Central-95% lateral corridor | 1 m | 4 m | 25% |
| Complete trajectory oscillations/minute | 2 | 6 | 10% |

Each component is `clamp(100 * (poor - value) / (poor - good), 0, 100)`. TCS is their weighted sum. Missing components return null; their weights are never redistributed. A real zero is valid. The proposal's example (5.2°, 9.4°, 1.8 m, 3.1 cycles/min) gives **74.7420634920635**. Saturation beyond anchors is intentional for this version and must be reconsidered during field calibration.

## Exact geometry and shared support

1. Keep domain values in SI and original elapsed timestamps. Split GPS runs at invalid coordinates, non-increasing times, pauses, gaps over 15 s, reported accuracy outside 0–20 m, or displacement speed over 8 m/s. Missing accuracy does not become zero and caps confidence. Original records and FIT/ZIP bytes are never rewritten.
2. Trim 15 s at both ends of each supported run and requested interval. Evaluate midpoint geometry over one-second cells, including a clipped final cell. Every percentile uses cell duration as weight, so irregular recording does not over-weight bursts. Linear position interpolation only occurs inside a supported run; longitude and angular differences wrap. One-second evaluation creates no additional observations.
3. Actual local course is the bearing between positions at `t−3` and `t+3`. Reference course is the bearing between `t−15` and `t+15`. Absolute circular difference supplies median/P90 evidence. Local displacement divided by 6 s must be 1–8 m/s. Require at least three raw supporting records for the reference window. A first-half/second-half bearing change over 25° excludes a turn; zero/undefined displacement is excluded.
4. **Corridor definition:** the reference line is the great-circle line through the two 30 s reference endpoints. The signed perpendicular offset of the current position from that line is `R * asin(sin(distance(left,current)/R) * sin(bearing(left,current)−reference))`. The time-weighted 97.5th percentile minus the 2.5th percentile of those signed offsets gives the central-95% local corridor width over common eligible support. This is a moving reference, not one line fitted to the whole route, a 100 m fitted-line corridor, or the earlier 90% corridor experiment. Numbers from those experiments cannot be plugged into this contract interchangeably.
5. Oscillation counting circularly smooths signed course error over ±2 s inside each uninterrupted eligible run. Require a sustained excursion of at least 3° for 2 s before adopting a new sign. Two opposite-sign transitions form one complete cycle. Dead-band samples do not change the established sign; no incomplete cycle is joined across gaps, turns, low-speed sections or reports. There are no arbitrary one-minute resets. Frequency divides complete cycles by eligible minutes.
6. Explicitly timed `fall`/`interruption` athlete annotations exclude every analysis cell whose reference support intersects that report, including point annotations. No probable-fall classifier, inferred launch/landing interval or environmental class is introduced. Low-speed and turn gates cover supported maneuver evidence, without claiming its cause. All four components use precisely the same eligible cells. Recorded path distance is integrated over those cells separately from device cumulative distance.

Policy constants are centralized in `TRACKING_POLICY`; pure calculations permit explicit policy overrides for future tests. They are not exposed as user settings in this slice. Shortening windows, changing anchors/weights or changing eligibility for production must advance the method/version and refresh the current evidence together.

## Availability and support

At least **60 eligible seconds and 20% requested elapsed coverage** are required to publish a score. Shorter selections show an unavailable dash and reason. This preserves useful custom-interval scoring while distinguishing limited support.

The stored heuristic confidence is `INVALID` if no score, `LOW` if fewer than 300 eligible seconds, less than 500 m, coverage below 60%, or a contributing raw sample gap over 10 s. Otherwise `HIGH` requires all contributing GPS accuracy values present and at most 10 m, maximum gap at most 5 s, and coverage at least 80%; remaining supported scores are `MEDIUM`. These labels summarize data support, not calibrated probability or independently established positional accuracy. The details dialog calls this “Data support.” No weather-dependent confidence is invented when local conditions are unknown.

`excluded_reasons` counts rejected analysis cells. The difference between requested and eligible duration also includes unsupported run boundaries, missing telemetry and short runs; therefore reason totals need not equal total excluded time. Source ranges are zero-based half-open enclosing raw slices, including bracketing support. Unavailable original source indexes stay null.

## Storage, API and comparison

`deterministic.summary.tracking` and each best/custom interval's `statistics.tracking` retain score, version, four raw component metrics, normalized component scores/anchors/weights, policy, confidence, eligible time/distance, coverage, source ranges and exclusions. `metricView().tracking` is the headline score. No `zigzag` compatibility alias or dual calculation is provided.

REST dashboard, MCP context, exact requested-interval evidence and manual previews call the same deterministic functions with the same annotations. Bounded model context omits segment arrays while retaining exact aggregates and component scores. Whole-session data never fills a missing selected interval. Existing tenant-scoped cache keys include the new analysis method plus full records, pauses, annotations and revision. Old derived methods are replaced on calculation rather than mixed into current comparisons; viewing does not mutate the database. Existing persisted import evidence and source archives remain intact. No SQLite migration/reset is necessary.

## UI

The existing score row, interval tiles and comparison column now show **TCS /100**, with a single shared renderer and one decimal. Home's TCS trend retains a 0–100 axis and colors its data points with the same bands. No new persistent rows/panels are added. The details dialog exposes all four values, component contributions, coverage, data support, method and color thresholds. Experimental wording is confined to documentation.

| Displayed score | Color | Accessible band label |
|---|---|---|
| 90–100 | Green | Very strong trajectory control |
| 80–89.9 | Teal | Strong trajectory control |
| 70–79.9 | Amber | Moderate trajectory control |
| 60–69.9 | Orange | Significant trajectory instability |
| Below 60 | Red | Poor trajectory control |
| Unavailable | Neutral gray | Unavailable |

Color is accompanied by the numeric value and accessible band name. Band selection uses the displayed one-decimal precision to avoid boundary/color disagreement. Missing scores never use the red zero band.

## Validation and deferred calibration

Synthetic tests cover the supplied normalization example, anchors/clamps, missing components, all color boundaries, known straight/oscillating tracks, complete cycles, mirrored geometry, north/dateline wrapping, fractional interval bounds, irregular sampling, pauses/gaps, turns, explicit annotations, confidence, source immutability, current-method replacement, tenant scope and UI/MCP agreement.

User-labelled real sessions/intervals, anchor/weight tuning, independent GPS/board reference validation, unresolved high-frequency oscillations, slow wandering versus curvature, and high-amplitude weaving rejected as turns remain future calibration work. A median 7 s raw recording gap cannot establish every 10 s oscillation merely because the algorithm evaluates each second. Thresholds and score colors must not be treated as established technique grades. Population percentiles, fatigue diagnosis and automatic environmental normalization are not implemented.
