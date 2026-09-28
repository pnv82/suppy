# Implementation status and next slice

## Initial version implemented

- Selected light map-led direction, with timeline annotations from concept 2.
- React/Vite UI using four stored historical summaries and three detailed tracks.
- 5/10/20-minute map/timeline highlights with real local estimates and source values kept separate.
- Chart-driven hover/keyboard time cursor, a labelled map point above overlays, click/tap annotations, gap-aware charts and missing-track/wind states. Duplicate below-map interval controls and the separate time slider are removed.
- Automatic latest-10 trends; four current sessions, eight parameter choices.
- Home now uses the comparison view, with newest-first session rows and phone cards.
- Only the selected best-window route, arrows and boundaries appear on the map. Full route, current point and all annotation markers remain visible.
- Documented start/launch-point naming; automatic geographic naming remains deferred.
- Persistent board list, default preference and per-session assignments, shared through REST/MCP and analysis context.
- Timed note create/edit/delete, extra context, speed targets and technique dictionary selection.
- Shared local REST/MCP operations and embedded ChatGPT UI resource.
- Validated SUP FIT/one-FIT ZIP preview and import, immutable source bytes, duplicate recognition and explicit candidate matching; copyable calculated evidence and README connection instructions.

Historical station weather retrieval is implemented independently after FIT commit, with persisted SI observations, coverage, provenance, retry and cursor-linked display. See [weather.md](weather.md).

## Validation

Run `npm test` and `npm run build`. Consult root `design-qa.md` for browser evidence and acceptance status. Validate live account connection separately; it requires the user's developer-mode/tunnel setup. Do not describe local protocol tests as a completed ChatGPT account connection.

## Next work

Use [todo.md](../../todo.md) as the deferred-work list. SUP FIT decoding and deterministic evidence are implemented under [LLM versus app responsibilities](../product/llm%20vs%20app.md). Reviewed LLM-result ingestion, advanced metric validation and multi-session feature requests remain future work. Authentication, sharing, broader activity formats and in-app model execution remain outside this slice.

P03 is automatic latest-10 comparison, superseding the initial two-session selection idea. P05 is explicit timed annotations. P01/P02/P04/P06 remain discarded.

- Minimal session header: chevron session picker and modal name/board editing, saved atomically through `update_session_details`. Removed the redundant stored summary block from session review.
- Compact left icon navigation replaces the horizontal header; responsive rail retains Import and all four pages with accessible labels and active-page indication.
- Best-window controls now form one compact horizontal row under the full-width map; removed section help text and map-direction caption.
- Summary metrics now occupy a compact panel right of the map on desktop, stacking below on narrow screens. Repeated instructional copy removed from session review.
- Session density refinement: pointer chart values, heading-level Annotate, wind/source disclosure, inline session date disclosure, and removal of repeated captions/footer.
- Grouped session overview: General distance/duration pair, three-column maximum/average/median Speed band, and Performance heart-rate/cadence pair with a separate estimated distance-per-stroke row. Uses existing summary/statistics values; no metric calculations or API contracts change.

## Persistent storage slice

Completed SQLite storage with transaction-based saves and schema versioning; tenant-scoped repositories and foreign keys; trusted REST/MCP identity resolution; one-time migration of current history; isolated synthetic tests/development data; backup/integrity CLI; updated persistent UI labels. See [storage.md](storage.md). Google Sheets is retired from all ongoing workflows.
