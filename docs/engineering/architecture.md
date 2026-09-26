# Prototype architecture

React 19 + Vite, Leaflet for actual route geometry, Recharts for telemetry/trends, and Phosphor icons. A small Node server owns the read-only source adapter, temporary edits and MCP interface. This local service is needed for the user's ChatGPT-native requirement; there is no database or model runtime.

## Shared operations

The standalone UI reads `/api/dashboard` and posts named operations to `/api/tools`. In a ChatGPT iframe, `src/services/client.mjs` uses the MCP Apps bridge instead. Both paths call `server/tools.mjs` against the same in-memory store. Browser refresh reads current state; tool results refresh the active embedded UI. Cross-client live push is deferred.

`server/index.mjs` exposes a stateless Streamable HTTP endpoint at `/mcp`, using the MCP SDK v1 server. It registers standard MCP Apps metadata directly. The browser uses `@modelcontextprotocol/ext-apps` v2's protocol bridge; it does not import the v2 server helpers. The exact package versions are locked.

| Tool | Behavior |
|---|---|
| get_dashboard | Latest 10 summaries and UI data |
| get_session_context | Source metrics, annotations, goal, technique evidence and limitations |
| upsert_annotation | Create/edit a point or interval, validated against elapsed duration |
| delete_annotation | Remove an explicit annotation ID |
| update_session_context | Save athlete-provided additional context |
| update_training_focus | Save a speed target and valid dictionary IDs as athlete reports |
| prepare_analysis_context | Current context plus at most 120 telemetry records; no model call |
| upsert_board | Add a named board or rename an existing ID; reject duplicate/empty names |
| delete_board | Remove an unused board; reject deletion while assigned |
| set_default_board | Set/clear preferred board without rewriting historical assignments |
| assign_session_board | Set/clear a session's athlete-reported board and advance its revision |

Tools declare read/write/destructive behavior. UI metadata names `ui://sup-training/dashboard.html`. The resource embeds the built JS/CSS, so it has no localhost asset dependency. Private records are sent in tool `_meta` for UI use; model-visible results contain summaries and bounded telemetry. The app bridge sends follow-up messages to the host conversation after context updates.

## Source and state

`server/store.mjs` maps sheet headers to a small display DTO and joins derived tracks by string session ID. Sheet summary fields keep their explicit display units (mph/mi/min); raw records and window calculations remain SI/UTC. This DTO does not replace the versioned external-analysis schema.

FIT owns records and timer events. Sheet values remain labelled source summaries. Three tracks and four summaries are available. Notes, goals and technique choices live in memory only; originals and Sheet are never modified. Restart discards edits. There is no authentication, persistence or sharing layer.

Boards and their default/assignments also live in memory. The dashboard includes the board list and nullable default ID; session context includes the resolved athlete-reported board. Renaming a used board advances affected session revisions. No board is inferred from existing telemetry or from the default. See the runtime board contract in [data-model.md](../data/data-model.md).

`src/domain/metrics.mjs` implements lightweight deterministic display calculations: continuous elapsed windows, distance interpolation, a 15-second gap threshold, timer-pause exclusion and an 8 m/s distance-jump guard. It also provides time-weighted speed/HR medians, source-labelled maxima and estimated distance per stroke from explicit SUP FIT totals. `server/store.mjs` includes their SI values, coverage, input totals and source metadata under the session DTO's `statistics` field for both REST and MCP. Results are local estimates, not reviewed coaching outputs. All three intervals render independently and may overlap.

## UI and folders

`src/App.jsx` owns navigation and selected session/cursor/window. `src/components/` contains the present screen-level components. `src/services/` isolates host/HTTP operations. The previously reserved feature folders may be used when a feature grows; do not add abstractions solely to fill them.

Home reuses `Compare.jsx`: latest-10 summary changes, newest-first session rows/cards and chronological charts. `Boards.jsx` contains the equipment list and session picker. Explicit session results from MCP open that session review. Direction arrows are deterministic GPS bearings in `metrics.mjs`; Leaflet handles selection emphasis and zoom-dependent marker spacing.

The map requests standard OpenStreetMap tiles, preserves attribution and browser caching, and displays the recorded route independently. No map key is embedded. Wind labels use meteorological from; the arrow points toward from + 180°. Current wind is a sheet summary, not a spatial weather field.

## Running and testing

`npm run dev` starts Vite and the local server. `npm run build` packages client assets and preserves the starter's Sites files. `npm start` serves the built app and MCP on 127.0.0.1:3001. A static-only Sites deployment would lack the Node data/MCP routes; do not publish it as a working app.

`npm test` covers numeric policies, annotation/context validation and real MCP HTTP client/server interoperability. Browser QA covers rendering, interaction, responsive behavior and honest null states. `scripts/inspect_samples.py` and `scripts/validate_foundation.py` retain their offline data roles.

Use the README's private tunnel instructions to connect your account. A live ChatGPT account test remains distinct from local transport tests.
