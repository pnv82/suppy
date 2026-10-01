# Next - Other
- [ ] Replace the headline maximum speed with **Max speed (10 s)**: the highest elapsed-time-weighted average over a continuous 10-second window with sufficient recorded coverage. Never bridge pauses, missing data or rejected readings; retain existing speed-quality checks and keep Garmin's original peak in metric details. Apply the same definition to session summaries, Home comparisons, maximum-speed goals and external analysis evidence, without adding persistent vertical UI space. Unsupported sessions remain unavailable rather than falling back to an instantaneous peak. Preserve original data and method provenance; averaging reduces spike influence but does not validate measurements. Update metric contracts and test isolated spikes, irregular sampling, pauses/gaps, rejected readings and summary-only sessions; verify desktop/narrow-screen and keyboard flows.
- [ ] Allow to configure the columns on the main page to see the remaining session parameters (for example a compound columns with 5/10/20 intervals highlights as we have earlier)

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

- [ ] [S2: Fall/remount and semantic interruption detection](docs/product/key%20metrics.md#s2-fallremount-and-semantic-interruption-classification). Collect independently timed labels and assess false positives; ordinary stops must not become probable falls.
- [ ] [S3: Automatic effort intervals and exhaustive segment labels](docs/product/key%20metrics.md#s3-automatic-effort-intervals-and-exhaustive-segment-labels). Preserve explicit lap/workout evidence first.
- [ ] [S4: Environmental normalization and historical benchmarks](docs/product/key%20metrics.md#s4-environmental-normalization-and-historical-benchmarks). Validate conditions/equipment support before normalized claims.
- [ ] [S5: Physiological fatigue/regression models and composite indices](docs/product/key%20metrics.md#s5-physiological-fatigue-models-and-composite-indices). Keep simple descriptive drift and external interpretation separate.
- [ ] [S6: Steady-only DPS, universal GPS thresholds/scores, timestamp repair and permanent chart additions](docs/product/key%20metrics.md#s6-alternative-estimands-generic-thresholds-and-repair-mode). Each needs a bounded decision and validation.

- [ ] Complete a live personal Garmin account sign-in/MFA/download check in the local app. Synthetic adapter, REST/MCP and browser flows are validated; upstream account challenges still need the user’s account.

## External analysis and ChatGPT

- [ ] Complete a live account test: Secure MCP Tunnel connection, ChatGPT tool discovery/selection, iframe rendering, notes/context round-trip, and fresh analysis after an edit. Local MCP transport tests are already implemented.
- [ ] Refine bounded telemetry retrieval for multi-session questions, pagination and token budgets. Current analysis context is one session plus at most 120 records, without coordinates in model-visible telemetry.
- [ ] Add versioned analysis output ingestion with schema validation, provenance, review status and stale-result invalidation after annotations/context change.
- [ ] Design empty/error/retry behavior for model answers and host-dependent UI permissions using real ChatGPT testing.
- [ ] Optional later, only with new scope: model execution, queues, long-running analysis, caching and evaluation of analysis quality. ChatGPT currently performs interpretation in the conversation.

## Data, imports and richer display

- [ ] On a specific session page, show similar sessions and allow comparison with the top five matches. Define similarity criteria (such as duration, distance, session type and available conditions), explain why each session matches, and handle missing context before implementing ranking. This session-specific feature is deferred; the global Compare screen continues to show automatic latest-10 trends.
- [ ] Profile large-import decoding and histories before adding worker scheduling, streaming/chunked uploads or lazy telemetry loading; verify actual ChatGPT host file-selection/payload limits. Current limits: 30 MB and 100,000 FIT messages.
- [ ] Expand comparison history after more sessions arrive; explicitly validate partial/null metrics and dates across locales.
- [ ] Split/lazy-load the current UI bundle while preserving self-contained ChatGPT resource packaging; current production JS is roughly 1 MB uncompressed.


## Infrustructure
- [x] Replace Google Sheets with SQLite persistence and separate production/development/test data; add tenant isolation and backup/restore support.
- [x] Auth0 Google login and verified REST/MCP identity are bound to tenant-scoped storage, with empty account provisioning and account-state invalidation. See [authentication.md](docs/engineering/authentication.md).
- [ ] Before public hosting, choose the HTTPS URL, register its immutable Auth0 API Identifier/callbacks and ChatGPT client, configure production Google credentials, verify live linking, and approve Render publication. User-facing concurrent-edit conflict handling remains deferred.

## Intentionally outside this prototype

User sharing, public deployment, automatic Garmin sync, extra import formats, video-link management and training-plan generation. Authentication is implemented under the 2026-09-29 authorization; public distribution and live ChatGPT account linking still require HTTPS/provider setup and separate publication approval.

- Validate temperature-assisted possible-fall detection against more athlete-timed falls and non-fall stops/immersions; measure false alarms and missed events before claiming reliability. Current speed/cooling thresholds are provisional.

## Goal measurement validation

The approved goal types are implemented; field calibration remains deferred. Validate cadence-band ±3 spm/SD ≤5, effort-economy pace ±3% and HR SD ≤5 against repeated same-board, comparable-condition sessions. Check sensitivity of sampled five-minute rankings to candidate spacing and sensor artifacts. Turns/footwork remains an athlete report; do not infer success from watch telemetry. No universal achievement threshold or condition normalization is established by these app policies. See docs/engineering/goals.md.
