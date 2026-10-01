# Prototype architecture

React 19 + Vite, Leaflet for actual route geometry, Recharts for telemetry/trends, and Phosphor icons. A small Node 24+ server owns SQLite persistence and the MCP interface. App code owns deterministic analysis; interpretation and coaching stay in the conversation. Follow [LLM versus app responsibilities](../product/llm%20vs%20app.md) and [FIT import/evidence contracts](fit-import.md). See [storage and tenant boundaries](storage.md) for schema, configuration, migration, backup and deployment details.

## Shared operations

The standalone UI reads `/api/dashboard` and posts named operations to `/api/tools`. In a ChatGPT iframe, `src/services/client.mjs` uses the MCP Apps bridge instead. Both paths call `server/operations.mjs`, which delegates synchronous domain operations to `server/tools.mjs` against the same tenant-scoped SQLite store. Browser refresh reads current state; tool results refresh the active embedded UI. Cross-client live push is deferred.

`server/index.mjs` exposes a stateless Streamable HTTP endpoint at `/mcp`, using the MCP SDK v1 server. It registers standard MCP Apps metadata directly. The browser uses `@modelcontextprotocol/ext-apps` v2's protocol bridge; it does not import the v2 server helpers. The exact package versions are locked.

| Tool | Behavior |
|---|---|
| preview_fit_import | Validate user-selected FIT/ZIP and calculate a preview, without persistence |
| commit_fit_import | Revalidate and transactionally save a reviewed import, retaining originals and tenant-scoped identity |
| set_session_wind | Save/clear athlete-reported whole-session wind in SI, retaining history and original station evidence |
| fetch_session_weather | Start/retry independent IEM retrieval; return immediately after recording status |
| get_session_weather | Read status and saved SI weather evidence without contacting the provider |
| upsert_goal / delete_goal | Persist explicit SI athlete targets with tenant isolation |
| set_session_summary | Save revision-checked external LLM highlight/summary as unreviewed interpretation |
| suggest_launch_name | Async OpenStreetMap lookup near supported start GPS, tenant-scoped caching, confirmed-start preference and offline fallback; see [contract](launch-names.md) |
| recalculate_session | Refresh deterministic evidence from full stored telemetry |
| get_dashboard | Latest 10 summaries and UI data |
| get_session_context | Source metrics, annotations, goal, technique evidence and limitations |
| upsert_annotation | Create/edit a point or interval, validated against elapsed duration |
| delete_annotation | Remove an explicit annotation ID |
| update_session_context | Save athlete-provided additional context |
| update_training_focus | Save a speed target and valid dictionary IDs as athlete reports |
| prepare_analysis_context | Exact deterministic interval evidence, coverage and current context plus at most 120 illustrative telemetry records; no model call |
| upsert_board | Add a named board or rename an existing ID; reject duplicate/empty names |
| delete_board | Remove a board, atomically clear its linked session assignments and matching default; preserve sessions |
| set_default_board | Set/clear preferred board without rewriting historical assignments |
| assign_session_board | Set/clear a session's athlete-reported board and advance its revision |

Tools declare read/write/destructive behavior. UI metadata names `ui://suppy/dashboard.html`. The resource embeds the built JS/CSS, so it has no localhost asset dependency. Private records are sent in tool `_meta` for UI use; model-visible results contain summaries and bounded telemetry. The app bridge sends follow-up messages to the host conversation after context updates.

## Source and state

`server/database.mjs` stores canonical SI summaries and complete session aggregates in SQLite. `server/store.mjs` maps them to the existing display DTO (mph/mi/min); raw records and window calculations remain SI/UTC. This DTO does not replace the versioned external-analysis schema.

FIT owns records and timer events. Imported historical values remain labelled source summaries, with provenance archived in SQLite. Three tracks and four summaries were migrated to the local production tenant. Notes, goals, technique choices and revisions persist across restarts. New installations and new tenants start empty. No source snapshot or derived file is required at runtime. Auth0 owns standalone login and MCP account linking; `server/auth.mjs` verifies access tokens and provisions tenant IDs from the verified issuer/subject. `src/auth/AuthBoundary.jsx` gates private UI and resets requests/state during account changes. Sharing remains deferred. See [authentication.md](authentication.md).

Boards, defaults and assignments persist in tenant-scoped tables with composite foreign keys. The dashboard includes the board list and nullable default ID; session context includes the resolved athlete-reported board. Renaming a used board advances affected session revisions. No board is inferred from existing telemetry or from the default. See the runtime board contract in [data-model.md](../data/data-model.md).

`src/domain/metrics.mjs` implements lightweight deterministic display calculations: continuous elapsed windows, distance interpolation, a 15-second gap threshold, timer-pause exclusion and an 8 m/s distance-jump guard. It also provides time-weighted speed/HR medians, source-labelled maxima and estimated distance per stroke from explicit SUP FIT totals. `server/store.mjs` includes their SI values, coverage, input totals and source metadata under the session DTO's `statistics` field for both REST and MCP. Results are local estimates, not reviewed coaching outputs. All three intervals render independently and may overlap.

## UI and folders

`src/App.jsx` owns navigation and selected session/cursor/window. `src/components/` contains the present screen-level components. `src/services/` isolates host/HTTP operations. The previously reserved feature folders may be used when a feature grows; do not add abstractions solely to fill them.

`src/services/useNavigation.jsx` synchronizes the page and string session ID with `?page=home|sessions|boards|goals|chatgpt&session=<id>`. Initial load and browser history restore those values. Navigation pushes history entries; initial default-session resolution replaces the entry. A session without a page opens Sessions; unrecognized pages fall back to Sessions when a session is supplied, otherwise Home. Unknown session IDs remain explicit unavailable states on session-dependent pages. Other query parameters and hashes are preserved. Explicit MCP session results use the same navigation path; sandboxed hosts that deny history changes retain in-memory navigation. This does not change the parent ChatGPT conversation URL or select a tenant.

Home reuses `Compare.jsx`: latest-10 summary changes, newest-first session rows/cards and chronological charts. `Boards.jsx` contains the equipment list and session picker. Explicit session results from MCP open that session review. Direction arrows are deterministic GPS bearings in `metrics.mjs`; Leaflet handles selection emphasis and zoom-dependent marker spacing.

The map requests standard OpenStreetMap tiles, preserves attribution and browser caching, and displays the recorded route independently. No map key is embedded. Wind labels use meteorological from; the arrow points toward from + 180°. The legend uses retrieved time-weighted wind when available, preserving historical summaries separately. `WeatherPanel.jsx` follows the shared cursor. `server/weather/service.mjs` owns retrieval outside FIT transactions; `server/weather/iem.mjs` owns provider I/O; `src/domain/weather.mjs` owns pure matching/coverage. No spatial wind field is inferred. See [weather.md](weather.md).

## Running and testing

`npm run dev` starts Vite and the local server. `npm run build` packages client assets and preserves the starter's Sites files. `npm start` serves the built app and MCP on 127.0.0.1:3001. A static-only Sites deployment would lack the Node data/MCP routes; do not publish it as a working app.

`npm test` covers numeric policies, annotation/context validation and real MCP HTTP client/server interoperability. Browser QA covers rendering, interaction, responsive behavior and honest null states. `scripts/inspect_samples.py` and `scripts/validate_foundation.py` retain their offline data roles.

Use the README's private tunnel instructions to connect your account. A live ChatGPT account test remains distinct from local transport tests.

`SessionHeader.jsx` provides a compact native session picker and native modal dialog for name/board drafts. `update_session_details` is a write tool shared by REST/MCP; it validates the launch name and board before changing either, preserves source location and identity, and updates the analysis revision once. Dialog save errors remain inside the dialog. The native modal handles focus containment and Escape; Cancel discards local drafts.

## Empty highlight analysis request

An explicit click on an empty session highlight in a connected widget reads `get_session_context`, then `prepare_analysis_context` for the whole session. It sends only structured model evidence through `updateModelContext` before `sendMessage` (`ui/message`, the standard counterpart of `sendFollowUpMessage`). This follows [OpenAI MCP Apps guidance](https://developers.openai.com/plugins/build/chatgpt-ui), checked 2026-09-29. Metadata/raw uploads are excluded. Unknown elapsed duration uses source context with unavailable interval evidence. Existing summaries open without a new request.

The prompt requests interpretation and explicitly authorizes `set_session_summary` with current revision, provenance and supported evidence references; all measurements, reports and hypotheses stay distinct. The app never runs a model or claims an answer is complete on message acknowledgement. Reopening a successfully requested dialog does not resubmit; failures expose retry. Host tool-result delivery updates the saved summary; a manual refresh is available. Standalone empty highlights explain how to request analysis in ChatGPT.
