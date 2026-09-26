# next improvements
- [x] display the current point on the map
- [x] remove dedicated controls for Explore track and Intervals (ones that below the map). The point selection should be combined with the interactive behavior of the charts (including adding the annotation). For best intervals we already have a control on the right side of the map.

- [ ] move board selection and session name adjustment to the separate dialog, that will be called via small Edit icon near the session name - we need to keep the UI light and minimalistic.
- [ ] no need for the "Sheet summary" section - it seem to be a duplicate.
- [ ] make a session selector a small chevron near the name of the session - this will allow the UI to remain tidy and light. It is overloaded right now.

- [ ] allow to delete sessions, so i can test the uploads
- [ ] review docs\product\llm vs app.md and add it to the documentation, architecture and principles of the app. Analyse if any adjustment of the current app need to be made. If yes - document them in todo.md and start implementing one by one.
- [ ] to keep the map not so busy display only one active interval at a time on the map


# Deferred work

The current slice intentionally prioritizes the light UI and ChatGPT-native skeleton. This list does not revive discarded P01/P02/P04/P06 proposals.

## Demanding analysis and domain work

- [ ] Validate Garmin cadence/fractional cadence/stroke-count semantics across devices and against manually counted strokes before efficiency claims. The summary now shows a labelled distance-per-stroke estimate from explicit SUP FIT distance/total-stroke fields only; cadence-derived stroke counts remain deferred.
- [ ] Validate the local 5/10/20-minute display estimates against reviewed external results; add robust GPS/spike handling, coverage reasons and source-method reconciliation. Current estimates split at pauses, invalid GPS/distance and gaps over 15 seconds.
- [ ] Add detailed interval analytics: time-weighted HR/cadence, drift, pacing consistency, boundary confidence and methodology provenance.
- [ ] Add condition-aware comparison only after validated wind/current/wave/board context exists. Raw last-10 trends already work; no normalization or causal fitness claim is implemented.
- [ ] Review the SUP technique dictionary with a qualified coach. Preserve evidence requirements and confounders; do not turn watch patterns into confirmed biomechanical faults.
- [ ] Extend goal types beyond duration-scoped speed; define evaluation windows and compatible units before adding automatic goal assessment.

## External analysis and ChatGPT

- [ ] Complete a live account test: Secure MCP Tunnel connection, ChatGPT tool discovery/selection, iframe rendering, notes/context round-trip, and fresh analysis after an edit. Local MCP transport tests are already implemented.
- [ ] Refine bounded telemetry retrieval for multi-session questions, pagination and token budgets. Current analysis context is one session plus at most 120 records, without coordinates in model-visible telemetry.
- [ ] Add versioned analysis output ingestion with schema validation, provenance, review status and stale-result invalidation after annotations/context change.
- [ ] Implement human-reviewed analysis writeback to a sheet only when specifically authorized. The app currently reads the captured snapshot only.
- [ ] Design empty/error/retry behavior for model answers and host-dependent UI permissions using real ChatGPT testing.
- [ ] Optional later, only with new scope: model execution, queues, long-running analysis, caching and evaluation of analysis quality. ChatGPT currently performs interpretation in the conversation.

## Data, imports and richer display

- [ ] Add confirmed launch-point mappings and optional geographic lookup for session names. Keep source locations as unconfirmed fallbacks until specific start names are known; never change stable session IDs.
- [ ] When arbitrary new-session imports are implemented, preselect the default board for user review. Existing sample recognition only opens a known session and must not overwrite its board.
- [ ] On a specific session page, show similar sessions and allow comparison with the top five matches. Define similarity criteria (such as duration, distance, session type and available conditions), explain why each session matches, and handle missing context before implementing ranking. This session-specific feature is deferred; the global Compare screen continues to show automatic latest-10 trends.
- [ ] Decode arbitrary valid Garmin FIT files / one-FIT ZIPs in the app, preview their identity, match by time/distance and reject malformed/ambiguous activities. Current Import FIT recognizes only the three supplied samples by hash.
- [ ] Map timestamped weather observations onto the timeline with coverage/age and directional changes. Current map uses the sheet's session wind summary; manual timed conditions already render.
- [ ] Support precise technique evidence timing and more source-event detail when timestamps exist. Unknown-time falls/interruptions must remain untimed.
- [ ] Expand comparison history after more sessions arrive; explicitly validate partial/null metrics and dates across locales.
- [ ] Broader metric null-state and large-data performance checks, timeline zoom and drag-to-select. Best-window travel arrows are implemented; richer direction controls remain optional future work.
- [ ] Split/lazy-load the current UI bundle while preserving self-contained ChatGPT resource packaging; current production JS is roughly 1 MB uncompressed.
- [ ] add integration with Garmin, so i can load sessions data directly from there, omitting export/import step fo the fit files.

## Infrustructure
- [ ] Move from the Google Sheet as a storage to SQL Lite. Separate the production data from the test development
- [ ] let's deploy the app to @Sites, so i can use it

## Intentionally outside this prototype

Authentication, durable storage, sharing/multi-user support, public deployment, automatic Garmin sync, extra import formats, weather services, video-link management and training-plan generation. Public distribution also requires a hosted/authenticated MCP design and account-level review. None is implemented or implied by local connection instructions.
