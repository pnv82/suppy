# Next - Other
- [ ] automatic launch spot based  naming does not work now - still suggests just a latitude and longitude as a name
- [ ] show track direction with a light arrows within a track. Make them barely visible not to obstruct the map view.
- [ ] allow to convert the event candidates into the annotation - for example when clicking on the even marker select a permanent spot on the timeline, right now it does not do anything.
- [ ] when session highlight clicked in the context of ChatGPT session (i.e. app is a widget) and there is no previous analysis saved - initiate analysys in the host session (from what I understood via sendFollowUpMessage). Carefully select a good prompt that will be sent to a ChatGPT, make sure full context of the session (with annotations, notes, calculated metrics etc.) is available to the ChatGPT (i assume via MCP?). If same is called in the web app and has not data yet - show an instruction to call it from the context of the ChatGPT.

# Deferred work

The current slice intentionally prioritizes the light UI and ChatGPT-native skeleton. This list does not revive discarded P01/P02/P04/P06 proposals.
- [ ] Automatic interval detection is suspended; see [S3: effort intervals](docs/product/key%20metrics.md#s3-automatic-effort-intervals-and-exhaustive-segment-labels).


## Demanding analysis and domain work

- [ ] Validate Garmin cadence/fractional cadence/stroke-count semantics across devices and against manually counted strokes before efficiency claims. Whole-session DPS uses explicit SUP FIT totals; interval DPS already uses a labelled cadence-integral estimate. Neither is a validated independent stroke counter.
- [ ] Validate the local 5/10/20-minute display estimates against reviewed external results; add robust GPS/spike handling, coverage reasons and source-method reconciliation. Current estimates split at pauses, invalid GPS/distance and gaps over 15 seconds.
- [x] Add exact interval time-weighted speed/HR/raw cadence means and medians, coverage, distance and methodology provenance before model-visible downsampling.
- [ ] Validate metric thresholds against independently annotated on-water sessions; synthetic coverage, event boundary and independent-pair checks are implemented. See [validation gates](docs/product/key%20metrics.md#9-validation-and-release-gates).
- [ ] Condition-normalized comparison remains suspended under [S4](docs/product/key%20metrics.md#s4-environmental-normalization-and-historical-benchmarks). Raw last-10 trends already work; no normalization or causal fitness claim is implemented.
- [ ] Review the SUP technique dictionary with a qualified coach. Preserve evidence requirements and confounders; do not turn watch patterns into confirmed biomechanical faults.
- [ ] Extend goal types beyond the implemented speed and cadence-duration targets; define evaluation windows and compatible units before adding automatic goal assessment.

## Suspended metrics research

Dedicated reference: [Part II of the metrics plan](docs/product/key%20metrics.md#part-ii-suspended-research-and-future-work). These items are outside the active delivery stages. Review their independent-evidence and promotion gates before bringing one forward.

- [ ] [S1: Local course variability, tracking/zig-zag and eventual paddle-side inference](docs/product/key%20metrics.md#s1-local-course-variability-tracking-and-zig-zag). The four-component [TCS_v1](docs/engineering/tracking-control-score.md) and score colors are implemented by explicit user request. Athlete-labelled interval/session validation, anchor/weight calibration, independent accuracy/sensitivity checks and paddle-side inference remain future work.
- [ ] [S2: Fall/remount and semantic interruption detection](docs/product/key%20metrics.md#s2-fallremount-and-semantic-interruption-classification). Collect independently timed labels and assess false positives; ordinary stops must not become probable falls.
- [ ] [S3: Automatic effort intervals and exhaustive segment labels](docs/product/key%20metrics.md#s3-automatic-effort-intervals-and-exhaustive-segment-labels). Preserve explicit lap/workout evidence first.
- [ ] [S4: Environmental normalization and historical benchmarks](docs/product/key%20metrics.md#s4-environmental-normalization-and-historical-benchmarks). Validate conditions/equipment support before normalized claims.
- [ ] [S5: Physiological fatigue/regression models and composite indices](docs/product/key%20metrics.md#s5-physiological-fatigue-models-and-composite-indices). Keep simple descriptive drift and external interpretation separate.
- [ ] [S6: Steady-only DPS, universal GPS thresholds/scores, timestamp repair and permanent chart additions](docs/product/key%20metrics.md#s6-alternative-estimands-generic-thresholds-and-repair-mode). Each needs a bounded decision and validation.

## External analysis and ChatGPT

- [ ] Complete a live account test: Secure MCP Tunnel connection, ChatGPT tool discovery/selection, iframe rendering, notes/context round-trip, and fresh analysis after an edit. Local MCP transport tests are already implemented.
- [ ] Refine bounded telemetry retrieval for multi-session questions, pagination and token budgets. Current analysis context is one session plus at most 120 records, without coordinates in model-visible telemetry.
- [ ] Add versioned analysis output ingestion with schema validation, provenance, review status and stale-result invalidation after annotations/context change.
- [ ] Design empty/error/retry behavior for model answers and host-dependent UI permissions using real ChatGPT testing.
- [ ] Optional later, only with new scope: model execution, queues, long-running analysis, caching and evaluation of analysis quality. ChatGPT currently performs interpretation in the conversation.

## Data, imports and richer display

- [ ] Optionally expand the offline launch catalog beyond six historical Mission Bay references. On-demand OpenStreetMap lookup and nearby athlete-confirmed starts are implemented; keep unconfirmed fallbacks and stable session IDs. Review provider hosting before public deployment.
- [x] Preselect the default board for review in new-session imports; duplicate/attached sessions retain their existing board.
- [ ] On a specific session page, show similar sessions and allow comparison with the top five matches. Define similarity criteria (such as duration, distance, session type and available conditions), explain why each session matches, and handle missing context before implementing ranking. This session-specific feature is deferred; the global Compare screen continues to show automatic latest-10 trends.
- [x] Decode valid single-session SUP FIT / one-FIT ZIP uploads, preview identity/route/metrics, explicitly match by time/distance, retain originals and reject malformed/unsupported activities. See `docs/engineering/fit-import.md`.
- [ ] Profile large-import decoding and histories before adding worker scheduling, streaming/chunked uploads or lazy telemetry loading; verify actual ChatGPT host file-selection/payload limits. Current limits: 30 MB and 100,000 FIT messages.
- [ ] Expand comparison history after more sessions arrive; explicitly validate partial/null metrics and dates across locales.
- [ ] Split/lazy-load the current UI bundle while preserving self-contained ChatGPT resource packaging; current production JS is roughly 1 MB uncompressed.
- [ ] add integration with Garmin, so i can load sessions data directly from there, omitting export/import step fo the fit files.

## Infrustructure
- [ ] Before public multi-user hosting, implement authentication and bind validated identities to the existing tenant resolver; add user-facing concurrent-edit conflict handling.
- [ ] let's deploy the app to @Sites, so i can use it

## Intentionally outside this prototype

Authentication, user sharing, public deployment, automatic Garmin sync, extra import formats, video-link management and training-plan generation. Public distribution also requires a hosted/authenticated MCP design and account-level review. None is implemented or implied by local connection instructions.

- Validate temperature-assisted possible-fall detection against more athlete-timed falls and non-fall stops/immersions; measure false alarms and missed events before claiming reliability. Current speed/cooling thresholds are provisional.
