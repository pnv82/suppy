# Implementation status and next slice

## Initial version implemented

- Selected light map-led direction, with timeline annotations from concept 2.
- React/Vite UI using four stored historical summaries and three detailed tracks.
- 5/10/20-minute map/timeline highlights with real local estimates and source values kept separate.
- Chart-driven hover/keyboard time cursor, a labelled map point above overlays, click/tap annotations, gap-aware charts and missing-track/wind states. Duplicate below-map interval controls and the separate time slider are removed.
- Automatic latest-10 trends; four current sessions, eight parameter choices.
- Home now uses the comparison view, with newest-first session rows and phone cards.
- Only the selected best-window route, arrows and boundaries appear on the map. Full route, current point and all annotation markers remain visible.
- Start/launch-point naming with on-demand OpenStreetMap lookup, source-labelled suggestions and explicit confirmation; see [launch lookup](launch-names.md).
- Persistent board list, default preference and per-session assignments, shared through REST/MCP and analysis context.
- Timed note create/edit/delete, extra context, speed targets and technique dictionary selection.
- Shared local REST/MCP operations and embedded ChatGPT UI resource.
- Validated SUP FIT/one-FIT ZIP preview and import, immutable source bytes, duplicate recognition and explicit candidate matching; copyable calculated evidence and README connection instructions.

Historical station weather retrieval is implemented independently after FIT commit, with persisted SI observations, coverage, provenance, retry and cursor-linked display. See [weather.md](weather.md).

## Validation

Run `npm test` and `npm run build`. Consult root `design-qa.md` for browser evidence and acceptance status. Validate live account connection separately; it requires the user's developer-mode/tunnel setup. Do not describe local protocol tests as a completed ChatGPT account connection.

## Next work

The [revised metrics plan](../product/key%20metrics.md) is implemented for paired speed/cadence, matched DPS, conservative low-speed evidence, descriptive independent-window drift and Tracking Control Score. See [performance metric contracts](performance-metrics.md). The selected UI combines the interval inspector and clean chart band, with a compact best-20-minute Home list. Old calculated evidence is discarded in favor of one current contract; no migration or database reset was necessary. Original uploads remain unchanged.

Use [todo.md](../../todo.md) as the deferred-work list. SUP FIT decoding and deterministic evidence are implemented under [LLM versus app responsibilities](../product/llm%20vs%20app.md). Reviewed LLM-result ingestion, advanced metric validation and multi-session feature requests remain future work. The 2026-09-29 user authorization adds Auth0 Google login, verified REST/MCP requests, empty account workspaces and Render preparation; see [authentication.md](authentication.md). Public hosting/live ChatGPT account linking remain deferred until the HTTPS URL is chosen. Sharing, broader activity formats and in-app model execution remain outside this slice.

P03 is automatic latest-10 comparison, superseding the initial two-session selection idea. P05 is explicit timed annotations. P01/P02/P04/P06 remain discarded.

- Minimal session header: chevron session picker and modal name/board editing, saved atomically through `update_session_details`. Removed the redundant stored summary block from session review.
- Compact left icon navigation replaces the horizontal header; responsive rail retains Import and all four pages with accessible labels and active-page indication.
- Best-window controls now form one compact horizontal row under the full-width map; removed section help text and map-direction caption.
- Summary metrics now occupy a compact panel right of the map on desktop, stacking below on narrow screens. Repeated instructional copy removed from session review.
- Session density refinement: pointer chart values, heading-level Annotate, wind/source disclosure, inline session date disclosure, and removal of repeated captions/footer.
- Grouped session overview: General distance/duration pair, three-column maximum/average/median Speed band, and Performance heart-rate/cadence pair with a separate estimated distance-per-stroke row. Uses existing summary/statistics values; no metric calculations or API contracts change.

## Persistent storage slice

Completed SQLite storage with transaction-based saves and schema versioning; tenant-scoped repositories and foreign keys; trusted REST/MCP identity resolution; one-time migration of current history; isolated synthetic tests/development data; backup/integrity CLI; updated persistent UI labels. See [storage.md](storage.md). Google Sheets is retired from all ongoing workflows.

## Session management refinement (2026-09-27)

Training focus and the separate context panel are removed from session review for now. The existing Edit session dialog holds source notes and additional observations, saved atomically with name and board. Deletion requires confirmation inside the dialog and navigates to a remaining session, or Home when empty. Original uploads/provenance remain privately archived; re-upload is permitted. Saved legacy goals and technique reports remain preserved for compatibility.

The top row has previous (older) / next (newer) controls, disabled at the ends. A single session-selection popover contains full date, local start/end, explicit timezone, distance, active duration, type and source availability. The separate info disclosure is removed. Home now defaults to supported best-20-minute metrics; the existing FIT maximum remains in session chart references and metric details.

Interval tiles replace start/end text with time-weighted interval cadence and distance per stroke. Current interval evidence is calculated as a labelled cadence-integral estimate, with matched coverage and missing-data rules; whole-session stroke distance is never substituted. Map/chart interval boundaries remain unchanged.

## Personal Garmin import (2026-09-29)

The user approved a personal Garmin Connect integration. On-demand account connection, MFA, SUP activity browsing and original-file preview/save reuse the deterministic FIT import pipeline. Credentials are entered only in the direct local app; the widget uses safe tools after local sign-in. Tokens are temporary and tenant-scoped. No automatic synchronization is implemented. See [Garmin contracts](garmin-connect.md).

## Goals configuration (2026-09-30)

The Goals page now exposes the existing catalog directly, with current best results across all history, source-session links, inline targets and ordered Active/Inactive buckets. Configuration and atomic reorder operations are tenant-scoped and shared by REST/MCP. Only active targets with values appear in Home trends. No additional coaching goals were implemented. See [goals.md](goals.md).

## Approved goal expansion and lighter configuration (2026-09-30)

Added longer endurance (30/60-minute continuous speed), stroke effectiveness (speed at chosen cadence), effort economy (HR at chosen pace), tracking control and athlete-reported turns/footwork success in both directions. Configurable targets are unset by default. Compact read-first rows show Best/Target; row activation opens a focused editor, menus hold bucket/source/practice actions, and Reorder temporarily reveals movement controls. No extra session-review height. See [goals.md](goals.md) for exact methods and reporting boundaries.

## Grouped unit settings (2026-10-01)

Added Settings with four independently selectable measurement families: speed, distance, length and temperature. Defaults remain mph, miles, metres/stroke and Fahrenheit. Tenant preferences persist in SQLite and are shared through REST and MCP. Primary values expose alternate-unit hover text; session charts, goals, weather, map scale and import previews use the selected units. Goal/wind inputs convert to SI on save. Stored measurements, evidence calculations and target comparison logic are unchanged. See [units.md](units.md).
