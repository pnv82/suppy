# MVP brief

## Intended user and outcome

A SUP racer reviews a recent Garmin session and can answer: How did I paddle? Where were my strongest sustained efforts? What conditions affected them? Which supported technique issue and target should I focus on next?

Initial data is a small personal history. The initial history uses imperial display units and a 5 mph race-pace reference. Preserve that reference; do not invent a race distance, deadline, HR zone, or ideal cadence.

## Requested capabilities

| Capability | Prototype behavior | Completion criterion |
|---|---|---|
| Track map and wind | Route, direction of travel, observed wind legend, best 5/10/20-minute overlays | Selecting an available window highlights its exact interval on map and charts; missing boundaries are explicit |
| Session overview | Distance, elapsed/active duration, average speed, HR, cadence, available quality flags | Every metric has a unit and source; missing values remain visible as unavailable |
| Home / recent sessions | Landing page reuses automatic comparison, with latest 10 sessions ordered by date descending, key characteristics and chronological trends | Four current sessions are shown without filler; each opens its session review; phone cards retain the same values |
| Session board and board list | Add/rename boards, set/clear a default, assign/clear a board on each session, delete unused boards | Default never rewrites historical sessions; assignments reach analysis context as athlete reports; all edits persist in SQLite |
| Time-series dynamics | Linked speed, HR and cadence plots with weather and known event markers | One elapsed-time cursor and interval selection connect plots and map; gaps stay gaps |
| Targets/goals | Display and edit prototype goal values, scope and optional deadline | A target can be evaluated only against a compatible metric/duration; unset remains unset |
| Technique problems | Search/select a curated issue; attach evidence status and a practice cue | Watch-only hypotheses cannot appear as confirmed faults |
| Garmin upload | Accept a local `.fit` or the supplied one-FIT `.zip` shape, preview identity and track, recognize a stored session | No remote upload needed; unsupported/malformed files show a useful message |
| External LLM prompt | Copy a session-specific analysis request with contract, inputs and missing-data list | User can review the prompt and review resulting analysis; versioned app ingestion remains deferred |
| App-owned data | Store summaries, tracks, user edits and provenance in SQLite | Restart retains edits; no spreadsheet dependency; tenant boundaries apply to all private data |
| Automatic comparison (P03 refined) | Always select the latest 10 sessions, or all available if fewer; show chronological trends for average/best speed, HR, cadence, distance and duration | No manual pair selection required; dates/units/context are visible; no condition-normalized fitness score |
| Timed annotations (P05 approved) | Add, edit and remove interruption/condition markers at a point or selected interval | Map/charts reflect the annotation; timing confidence and source remain visible; edits persist across restarts |
| ChatGPT-native app | Embed the session UI in chat and expose read/update/context tools; request fresh analysis after notes or extra data | Shared state reaches the model through bounded context; the README explains account connection; never claim a model job ran locally |

Historical station weather retrieval is approved and implemented independently after FIT commit, with manual retry, saved provenance and cursor-linked observations. Failures never block an upload. See [weather.md](../engineering/weather.md).

## Scope boundary

No authentication, multi-user sharing, broad import compatibility, Garmin account sync, in-app coaching analysis, training-plan generator, or public deployment in this slice. A small local Node/MCP server persists data in SQLite for the UI and ChatGPT. Tenant-scoped keys and a trusted request-identity resolver provide the foundation for multiple users; public authenticated hosting remains future work.

The app supports validated SUP FIT/one-FIT ZIP import and deterministic 5/10/20-minute distance/time windows, channel-weighted interval evidence and coverage. Calculated evidence stays separate from device summaries and stored historical results. Interpretation and coaching run in the external LLM; advanced sensor validation and richer analysis remain in `todo.md`. See [responsibilities](llm%20vs%20app.md) and [import contract](../engineering/fit-import.md).

## Defaults and unresolved decisions

- Session names follow the **start/launch point**, not the destination, finish point or the whole route. Prefer a user-confirmed specific launch name; use a known start-point mapping when available. Until a launch point is confirmed, retain the source location as an explicitly unconfirmed fallback rather than inventing a more precise place. Display the date separately to distinguish repeat visits. Naming never changes the string session ID. Offline suggestions use nearby athlete-confirmed starts and a small source-labelled beach catalog. Automatic reverse geocoding remains deferred.
- Desktop-first session review, with usable phone layouts; no live-on-water navigation UI.
- Main route: Home session grid → session review. Goals has a separate navigation section; annotations, editing and the analysis prompt use contextual dialogs.
- Default best efforts: continuous elapsed-time 300/600/1200-second windows, specified in the metric contract. Historical imported values have an unverified method and must retain that label.
- Detailed track is optional. The fourth stored session, `24162211256`, intentionally exercises a summary-only state.
- The selected direction is light/simple concept 1 with annotations from concept 2. P03 and P05 are approved; P01, P02, P04 and P06 are discarded.

## Initial slice versus full feature depth

The app has a separate Goals section for maximum/average/best-5/10/20 speed and continuous cadence-duration targets, plus validated SUP FIT/ZIP import. Small versioned external highlights/summaries are supported. Richer technique editing, broader activity formats and full typed analysis-envelope ingestion remain in root `todo.md`.

## Session management refinement (2026-09-27)

Training focus and the separate context panel are removed from session review for now. The existing Edit session dialog holds source notes and additional observations, saved atomically with name and board. Deletion requires confirmation inside the dialog and navigates to a remaining session, or Home when empty. Original uploads/provenance remain privately archived; re-upload is permitted. Saved legacy goals and technique reports remain preserved for compatibility.

The top row has previous (older) / next (newer) controls, disabled at the ends. A single session-selection popover contains full date, local start/end, explicit timezone, distance, active duration, type and source availability. The separate info disclosure is removed. Home includes maximum speed in cards, table and chronological trends using the same FIT maximum as session review, with nulls kept as gaps.

Interval tiles replace start/end text with time-weighted interval cadence and distance per stroke. Missing interval stroke distance now calculates lazily as a labelled cadence-integral estimate, with matched coverage and missing-data rules; whole-session stroke distance is never substituted. Map/chart interval boundaries remain unchanged.
