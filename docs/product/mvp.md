# MVP brief

## Intended user and outcome

A SUP racer reviews a recent Garmin session and can answer: How did I paddle? Where were my strongest sustained efforts? What conditions affected them? Which supported technique issue and target should I focus on next?

Initial data is a small personal history. The spreadsheet uses imperial display units and a 5 mph race-pace reference. Preserve that reference; do not invent a race distance, deadline, HR zone, or ideal cadence.

## Requested capabilities

| Capability | Prototype behavior | Completion criterion |
|---|---|---|
| Track map and wind | Route, direction of travel, observed wind legend, best 5/10/20-minute overlays | Selecting an available window highlights its exact interval on map and charts; missing boundaries are explicit |
| Session overview | Distance, elapsed/active duration, average speed, HR, cadence, available quality flags | Every metric has a unit and source; missing values remain visible as unavailable |
| Time-series dynamics | Linked speed, HR and cadence plots with weather and known event markers | One elapsed-time cursor and interval selection connect plots and map; gaps stay gaps |
| Targets/goals | Display and edit prototype goal values, scope and optional deadline | A target can be evaluated only against a compatible metric/duration; unset remains unset |
| Technique problems | Search/select a curated issue; attach evidence status and a practice cue | Watch-only hypotheses cannot appear as confirmed faults |
| Garmin upload | Accept a local `.fit` or the supplied one-FIT `.zip` shape, preview identity and track, attach to a sheet session | No remote upload needed; unsupported/malformed files show a useful message |
| External LLM prompt | Copy a session-specific analysis request with contract, inputs and missing-data list | User can review the prompt and transfer resulting analysis to the spreadsheet manually |
| Spreadsheet results | Read reviewed summaries and analysis via a small adapter; initially use an explicit captured snapshot | Show source and snapshot time; never imply live sync when using a fixture |
| Automatic comparison (P03 refined) | Always select the latest 10 sessions, or all available if fewer; show chronological trends for average/best speed, HR, cadence, distance and duration | No manual pair selection required; dates/units/context are visible; no condition-normalized fitness score |
| Timed annotations (P05 approved) | Add, edit and remove interruption/condition markers at a point or selected interval | Map/charts reflect the annotation; timing confidence and source remain visible; edits are temporary |
| ChatGPT-native app | Embed the session UI in chat and expose read/update/context tools; request fresh analysis after notes or extra data | Shared state reaches the model through bounded context; the README explains account connection; never claim a model job ran locally |

## Scope boundary

No authentication, durable backend storage, multi-user sharing, broad import compatibility, automatic weather retrieval, Garmin account sync, in-app coaching analysis, training-plan generator, or public deployment in this slice. A small local Node/MCP server holds temporary state for the UI and ChatGPT. Restart clears edits.

The initial build supports visual linking and lightweight local 5/10/20-minute distance/time estimates so their real locations are visible. These are labelled separately from reviewed Sheet results. Coaching interpretation, robust metric analysis and arbitrary new-file decoding remain deferred in `todo.md`.

## Defaults and unresolved decisions

- Desktop-first session review, with usable phone layouts; no live-on-water navigation UI.
- Main route: session list → session review. Goals, technique selection and the prompt are contextual panels.
- Default best efforts: continuous elapsed-time 300/600/1200-second windows, specified in the metric contract. Historical sheet values have an unverified method and must retain that label.
- Detailed track is optional. The fourth sheet session, `24162211256`, intentionally exercises a summary-only state.
- The selected direction is light/simple concept 1 with annotations from concept 2. P03 and P05 are approved; P01, P02, P04 and P06 are discarded.

## Initial slice versus full feature depth

The initial app has a speed target scoped to 5/10/20 minutes, self-reported dictionary selection, and recognition of the three supplied FIT/ZIP files. General metric targets, richer technique evidence editing, arbitrary FIT decoding, live spreadsheet refresh and typed analysis-result import remain in root `todo.md`. The capability table describes the intended path without implying these deferred depths already work.
