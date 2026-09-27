# next improvements
- [ ] allow to delete sessions, so i can test the uploads
- [x] Integrate `docs/product/llm vs app.md` into architecture and agent principles. App-owned FIT import and deterministic interval evidence are implemented; remaining multi-session evidence, advanced features and reviewed LLM-result persistence are listed below.
- [ ] if we have sufficient horizontal space - show the names of the sections in the left toolbar
- [ ] on the interval tiles do nto show the start-end time, better show the cadence and distance per stroke.


# Deferred work

The current slice intentionally prioritizes the light UI and ChatGPT-native skeleton. This list does not revive discarded P01/P02/P04/P06 proposals.

## Demanding analysis and domain work

- [ ] Validate Garmin cadence/fractional cadence/stroke-count semantics across devices and against manually counted strokes before efficiency claims. The summary now shows a labelled distance-per-stroke estimate from explicit SUP FIT distance/total-stroke fields only; cadence-derived stroke counts remain deferred.
- [ ] Validate the local 5/10/20-minute display estimates against reviewed external results; add robust GPS/spike handling, coverage reasons and source-method reconciliation. Current estimates split at pauses, invalid GPS/distance and gaps over 15 seconds.
- [x] Add exact interval time-weighted speed/HR/raw cadence means and medians, coverage, distance and methodology provenance before model-visible downsampling.
- [ ] Extend deterministic interval analytics with drift, pacing consistency and boundary confidence after defining/test-validating each method. Interval stroke distance needs a validated interval stroke counter.
- [ ] Add condition-aware comparison only after validated wind/current/wave/board context exists. Raw last-10 trends already work; no normalization or causal fitness claim is implemented.
- [ ] Review the SUP technique dictionary with a qualified coach. Preserve evidence requirements and confounders; do not turn watch patterns into confirmed biomechanical faults.
- [ ] Extend goal types beyond duration-scoped speed; define evaluation windows and compatible units before adding automatic goal assessment.

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
- [ ] Map timestamped weather observations onto the timeline with coverage/age and directional changes. Current map uses the stored session wind summary; manual timed conditions already render.
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

Authentication, user sharing, public deployment, automatic Garmin sync, extra import formats, weather services, video-link management and training-plan generation. Public distribution also requires a hosted/authenticated MCP design and account-level review. None is implemented or implied by local connection instructions.
