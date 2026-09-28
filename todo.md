# Next - Other

- [x] add maximum speed attribute to the main page and graphs
- [x] get rid of the "Your training focus" functionality for now, it is not meaningfull yet
- [x] allow to delete sessions, so i can test the uploads
- [x] on the interval tiles do nto show the start-end time, better show the cadence and distance per stroke.
- [x] move additional session data into session edit dialog
- [x] Integrate `docs/product/llm vs app.md` into architecture and agent principles. App-owned FIT import and deterministic interval evidence are implemented; remaining multi-session evidence, advanced features and reviewed LLM-result persistence are listed below.
- [ ] if we have sufficient horizontal space - show the names of the sections in the left toolbar
- [ ] update how i'm using the markers on the graphs - let's have to states - current position and selected spot (last clicked position, i.e. some persistency). Selected spot will allow to add annotations better, right now it is hard to attach annotation to a specific spot because it moves with any mouse move. This also mean couple of different markers on the map - one is lights, following the active position of the mouse on the graphs. Second - last selected position.

- [ ] introduce a notion of the session highlight and summary. It is to be filled the the LLM from outside when it is analysing existing session.
- [ ] in session overview exchange places for heart rate and stroke distance - it is better logical grouping.
- [ ] make arrows of the direction smaller - they take to much space and obstruct the view. Ideally if they will fit into the widths of the track and will be draw a bit more frequently - right now 5min segment with default zoom usually has only one arrow.
- [ ] let's make session selector popover riacher - show last 10 session and allow to search rest.
- [ ] let's refine the naming logic of the session - propose a name of the nearest launch point to the start point (usually name of the cove or beach). Do not use generic names - Mission Bay - it is huge and could mean anything.
- [ ] allow to select intervals on the graph with Shift+Click modifier. This will allow to have a more precise annotations. I.e. annotations now have two modes - specific point, as now and interval.
- [ ] add sections Goals, where i will be able to define my targets. So far we will start with - max speed, best 5, 10, 20 min speed, avg speed, longest time with cadesse over X. When applicable - display goal on the graph on Home page as light dashed line.
- [ ] make upload dialog pretty
- [ ] Rename app to Suppy in all places. Also add the icon fro the web-site.

# Next - Main page redesign
- [ ] get rid of the summaries line - it is confusing, not clear what it shows
- [ ] move the graph to the top of the screen - it is muc useable
- [ ] add controls to manage the session (behind 3 dots menu) - delete, recalculate, refresh weather, edit
- [ ] show the dynamic for the key attributes in the grid - if there is more that 5% change compared to the window of avg last 3 session - show the dynamic with a a small colored arrow (red/down, green/up)

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
- [ ] Extend goal types beyond duration-scoped speed; define evaluation windows and compatible units before adding automatic goal assessment.

## Suspended metrics research

Dedicated reference: [Part II of the metrics plan](docs/product/key%20metrics.md#part-ii-suspended-research-and-future-work). These items are outside the active delivery stages. Review their independent-evidence and promotion gates before bringing one forward.

- [ ] [S1: Local course variability, tracking/zig-zag and eventual paddle-side inference](docs/product/key%20metrics.md#s1-local-course-variability-tracking-and-zig-zag). The experimental local path-straightness score is implemented by explicit user request. Independent accuracy/sensitivity validation, quality bands and paddle-side inference remain future work.
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

- [ ] Add confirmed launch-point mappings and optional geographic lookup for session names. Keep source locations as unconfirmed fallbacks until specific start names are known; never change stable session IDs.
- [x] Preselect the default board for review in new-session imports; duplicate/attached sessions retain their existing board.
- [ ] On a specific session page, show similar sessions and allow comparison with the top five matches. Define similarity criteria (such as duration, distance, session type and available conditions), explain why each session matches, and handle missing context before implementing ranking. This session-specific feature is deferred; the global Compare screen continues to show automatic latest-10 trends.
- [x] Decode valid single-session SUP FIT / one-FIT ZIP uploads, preview identity/route/metrics, explicitly match by time/distance, retain originals and reject malformed/unsupported activities. See `docs/engineering/fit-import.md`.
- [ ] Profile large-import decoding and histories before adding worker scheduling, streaming/chunked uploads or lazy telemetry loading; verify actual ChatGPT host file-selection/payload limits. Current limits: 30 MB and 100,000 FIT messages.
- [x] Retrieve nearby historical station observations independently after import and show weather at the shared chart cursor with age, station distance, coverage and retry. See `docs/engineering/weather.md`.
- [ ] Consider a dedicated weather timeline layer and route-wide station selection if needed; the current panel follows the shared cursor using one station near the recorded launch.
- [ ] Support precise technique evidence timing and more source-event detail when timestamps exist. Unknown-time falls/interruptions must remain untimed.
- [ ] Expand comparison history after more sessions arrive; explicitly validate partial/null metrics and dates across locales.
- [ ] Broader metric null-state and large-data performance checks, timeline zoom and drag-to-select. Best-window travel arrows are implemented; richer direction controls remain optional future work.
- [ ] Split/lazy-load the current UI bundle while preserving self-contained ChatGPT resource packaging; current production JS is roughly 1 MB uncompressed.
- [ ] add integration with Garmin, so i can load sessions data directly from there, omitting export/import step fo the fit files.

## Infrustructure
- [x] Replace Google Sheets with SQLite persistence and separate production/development/test data; add tenant isolation and backup/restore support.
- [ ] Before public multi-user hosting, implement authentication and bind validated identities to the existing tenant resolver; add user-facing concurrent-edit conflict handling.
- [ ] let's deploy the app to @Sites, so i can use it

## Intentionally outside this prototype

Authentication, user sharing, public deployment, automatic Garmin sync, extra import formats, video-link management and training-plan generation. Public distribution also requires a hosted/authenticated MCP design and account-level review. None is implemented or implied by local connection instructions.
