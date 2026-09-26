# Deferred work

The current slice intentionally prioritizes the light UI and ChatGPT-native skeleton. This list does not revive discarded P01/P02/P04/P06 proposals.

## Demanding analysis and domain work

- [ ] Validate Garmin cadence/fractional cadence/stroke-count semantics across devices before showing distance per stroke or efficiency.
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

- [ ] On a specific session page, show similar sessions and allow comparison with the top five matches. Define similarity criteria (such as duration, distance, session type and available conditions), explain why each session matches, and handle missing context before implementing ranking. This session-specific feature is deferred; the global Compare screen continues to show automatic latest-10 trends.
- [ ] Decode arbitrary valid Garmin FIT files / one-FIT ZIPs in the app, preview their identity, match by time/distance and reject malformed/ambiguous activities. Current Import FIT recognizes only the three supplied samples by hash.
- [ ] Add read-only Google Sheets refresh and column/schema validation with missing-column errors. No OAuth or live sync is currently required.
- [ ] Map timestamped weather observations onto the timeline with coverage/age and directional changes. Current map uses the sheet's session wind summary; manual timed conditions already render.
- [ ] Support precise technique evidence timing and more source-event detail when timestamps exist. Unknown-time falls/interruptions must remain untimed.
- [ ] Expand comparison history after more sessions arrive; explicitly validate partial/null metrics and dates across locales.
- [ ] Broader metric null-state and large-data performance checks, route direction controls, timeline zoom and drag-to-select.
- [ ] Split/lazy-load the current UI bundle while preserving self-contained ChatGPT resource packaging; current production JS is roughly 1 MB uncompressed.

## Intentionally outside this prototype

Authentication, durable storage, sharing/multi-user support, public deployment, automatic Garmin sync, extra import formats, weather services, video-link management and training-plan generation. Public distribution also requires a hosted/authenticated MCP design and account-level review. None is implemented or implied by local connection instructions.
