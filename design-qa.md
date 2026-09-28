# Prototype validation

Checked locally on 2026-09-26. The built app runs at `http://127.0.0.1:3001` using the Node API/MCP server.

## Result

Local startup and the reviewed prototype flows pass. This is a UI prototype, not a completed live ChatGPT account integration or validated coaching system.

- `npm run build` succeeds. The large bundle warning remains; splitting is deferred in `todo.md`.
- `npm test`: 19 tests pass, including board lifecycle/context, travel direction, the home page, built asset delivery, route fallback, absent OAuth discovery metadata, path containment, domain estimates, sample recognition and MCP integration.
- Offline foundation validation passes: schema/analysis semantics, 14 dictionary issues, three sample checksum/ZIP/track checks, four sheet sessions and links in 38 Markdown files.
- Fixed a startup defect where a trailing slash in the build-directory path caused `/` to return 403. The HTTP regression test also checks HEAD and missing assets.

## Browser checks

The final built app was checked in the in-app browser at 1440 × 1050 and 390 × 844. The viewport override was reset afterward.

- The latest session loads real telemetry and OpenStreetMap tiles. All three best-window start labels and timeline lanes are present. Selecting 10 minutes shows its end marker and highlights the corresponding chart interval.
- The keyboard time slider advances by one second and updates the text readout.
- Compare shows the four available sessions, chronological values and an explicit latest-10 policy. No placeholder sessions are added.
- At narrow width, the annotation form exposes Start, End, Type, Timing and Note; “Approximate” fits its control. Session and comparison layouts have no page-wide horizontal overflow.
- Sep 5 explicitly shows unavailable wind. Aug 29 shows a summary-only state, disabled interval location controls and missing telemetry rather than invented values.
- No console warnings or errors were captured on the desktop session view.

Earlier implementation checks exercised annotation create/edit/delete, saved context and training focus, comparison parameter switching, and the local MCP Apps host harness. The harness received fresh context and follow-up messages after edits; it is not a live ChatGPT account test.

## Visual evidence

The selected reference is `docs/design/references/selected-light-ui.png`. It and the final desktop screenshot were inspected together. The implementation preserves the light layout, map/sidebar hierarchy, summary row and stacked interval/chart structure. Real GPS and interval boundaries replace the reference's illustrative route. The implementation includes additional context and training-focus panels below the charts.

Current screenshots are private local artifacts under `.tools/qa/` and are excluded from Git:

- `local-desktop.png`: session review with the 10-minute interval selected.
- `local-compare-desktop.png`: automatic comparison.
- `local-mobile.png`: session review and annotation editor.
- `local-compare-mobile.png`: narrow comparison view.

The in-app captures show a warm tint while the computed page background is white (`rgb(255, 255, 255)`). Layout and interaction were assessed; exact color reproduction is not claimed. Earlier design screenshots under `docs/design/qa/` show intermediate states, not the final build.

## Remaining limits

- Live ChatGPT connection, account permissions and real model/tool selection still require the README connection steps and an account test.
- Browser file selection was previously blocked by the Chrome extension's file-access permission. Sample recognition is covered by automated tests for all supplied FIT/ZIP bytes, renamed files and rejected inputs; arbitrary FIT decoding is deferred.
- Formal screen-reader testing, broad device coverage and demanding analysis remain future work. The checks above are focused prototype validation.
- Edits are temporary and reset on server restart. Raw activities and spreadsheet snapshots remain local and ignored by Git.

## Metric detail update — 2026-09-26

All five browser comments are implemented: summary max speed, estimated distance per stroke, hours/minutes duration, speed median/max values and lines, and HR median/max values and lines.

- Built and ran all 16 tests. New checks cover irregular time weighting, pauses/gaps, zero/missing data, FIT-summary maxima, explicit stroke totals and rounding across an hour.
- Reviewed the running build at 1280, 895 and 390 px widths. Summary details and chart legends fit without page-wide horizontal overflow. Reference lines use different dash styles and have matching text values.
- Latest session: 1 hr 26 min active, 5.71 mph max, estimated 11.1 ft/stroke; speed median 4.20 mph, HR median 150 bpm and max 176 bpm.
- Sep 20 keeps active 1 hr 43 min separate from elapsed 1 hr 46 min. Its HR axis includes the 184 bpm maximum.
- Aug 29 retains unavailable max-speed/stroke-distance fields and no invented median/chart. Keyboard cursor still advances by one second. Browser console checks returned no warnings or errors.
- Private screenshots: `.tools/qa/metrics-desktop.png`, `metrics-895.png`, `metrics-mobile.png`. The existing preview tab stopped responding during reload; validation continued in a fresh tab in the same browser. The latest session was restored and viewport override reset afterward.

Distance per stroke remains a labelled watch estimate; it has not been validated against manually counted strokes. The methodology and source fields are documented in `docs/domain/metrics.md` and passed through the REST/MCP context.

## Tunnel discovery fix — 2026-09-26

The user reported `oauth_metadata FAIL` with a JSON parse error on `<`. Reproduced: the server's SPA fallback returned `200 text/html` for missing OAuth discovery documents. The server now returns `404 application/json` for `/.well-known/*`, accurately indicating absent OAuth. The MCP POST endpoint and UI fallback continue to work.

- All 17 tests pass, including a regression check for protected-resource, authorization-server and OpenID discovery paths, plus the existing MCP handshake/tool/resource integration.
- Restarted the local Node server after confirming there were no temporary user edits to lose. Direct checks return 404 for discovery, 405 for MCP GET and 200 for the home page.
- The installed `tunnel-client` v0.0.15 passes discovery: `OAuth metadata not advertised; all candidates returned HTTP 404`.
- That client check used isolated flags, a non-secret placeholder and a loopback control-plane base URL; it verifies local discovery behavior, not real tunnel authorization, polling or account installation. The user's terminal holds the actual `CONTROL_PLANE_API_KEY`; it is not inherited by this task. No credential source was changed and no tunnel was started by this task.

## Session chooser detail — 2026-09-26

The session dropdown now includes total distance in miles and active duration in hours/minutes alongside date and location. Its label identifies the active-time basis. Reused the existing duration and missing-value formatters; no metric calculations changed.

Production build passes. Browser checks at 895 × 884 and 390 × 844 confirm the selected label is fully readable with no horizontal page overflow. Keyboard End/Enter selects the Aug 29 summary-only session and Home/Enter restores the latest session. No browser warnings/errors were captured. Private evidence: `.tools/qa/session-chooser-desktop.png` and `.tools/qa/session-chooser-mobile.png`.

## Home, travel direction and boards — 2026-09-26

Tool access recovered and implementation resumed. Home now reuses the comparison screen: latest values and changes, newest-first session list, then the chronological parameter chart. At phone widths, session rows become cards with the same values. The start/launch-point naming rule is recorded in the MVP and agent instructions; precise automatic launch naming remains deferred.

Best-window arrows follow GPS travel order. The overview shows duration-labelled arrows, and selecting 5/10/20 minutes raises that route above overlaps while dimming the others. Start/end labels and timeline selection remain connected. Automated checks cover outbound/return bearings, north, stationary points and omission across gaps, pauses or missing GPS.

Board management supports create, rename, explicit default selection/clearing, session assignment/clearing and deletion of unused boards. A used board cannot be deleted. Defaults do not rewrite history. All four operations are available through the shared REST/MCP interface; fresh analysis context includes the athlete-reported board and updated revision.

- Final production build succeeds; all 19 tests pass. The existing bundle-size warning remains.
- Browser checks at 1280 × 900, 895 × 884 and 390 × 844: newest-first rows, four actual sessions, trend parameter switching, keyboard opening of sessions and best-window selection, and no page-wide horizontal overflow.
- Added a temporary board using Enter, set its default, assigned it to Sep 25, renamed it, checked that deletion was disabled while assigned, changed the default without changing the assignment, cleared the assignment, and deleted the remaining unused QA board. The user's concurrently renamed “Backfish 14 2025” board and default were preserved; the live server was not restarted afterward.
- Verified Aug 29 summary-only state and Sep 5 unknown wind; unassigned boards remain “Not recorded”. No warnings/errors were captured in the final browser checks.
- Private evidence: `.tools/qa/home-desktop.png`, `home-mobile.png`, `boards-mobile.png`, `directions-desktop.png`, `directions-mobile.png`. Board screenshots may contain temporary QA names. Viewport override reset after checks.

The server is running at `http://127.0.0.1:3001`. Board state is temporary and resets on server restart. Live account/tunnel integration remains a separate check; local MCP tests confirm eleven tool definitions and board round-trip behavior.

## Chart point and simpler timeline — 2026-09-26

Removed the separate Explore track slider and best-window timeline lanes. The existing best-window sidebar still selects route/chart highlights. Chart hover moves a shared cursor and a labelled current map point above interval overlays; click/tap opens an annotation at that timestamp. Each chart supports arrow keys, Shift + arrows, Home/End and Enter/Space, with focus moving into the editor. Initial selection uses the first valid GPS point; unavailable GPS and pauses do not invent map positions.

- All 19 tests pass; production build passes with existing dependency-comment and bundle-size warnings.
- Browser checks at 1280 × 1000 and 390 × 844 covered best-window selection, hover, chart click, keyboard movement, annotation save/delete, and editor focus. No page-wide horizontal overflow at narrow width.
- Confirmed Aug 29 summary-only state retains manual annotation, Sep 5 unknown wind, and the missing GPS at Sep 25 0:00 hides the point while 0:10 restores it.
- Rapid session switching exposed a Leaflet zoom-transition teardown error. Session fitBounds now disables animation to avoid a pending transition after map removal; final build verified, this last change has not had a separate browser replay.
- Private screenshot: `.tools/qa/chart-cursor-desktop.png`. Temporary QA annotation was deleted; existing board state was preserved. Live ChatGPT embedding and formal screen-reader testing remain unverified.

## Page and session URLs — 2026-09-26

The address bar now records page and string session ID. Direct links, refresh, and Back/Forward restore the selected view. Navigating among Home, Sessions, Boards and ChatGPT retains session context. Unknown session IDs show an unavailable state with a keyboard-accessible return to Home. README and architecture describe the URL contract and embedded-host limitations.

- Production build and all 19 tests pass. Existing dependency-comment and bundle-size warnings remain. An initial test run overlapped the build and hit a missing packaging artifact; rerunning after build completion passed.
- Browser verification at 1280 × 900 and 390 × 844: direct Aug 29 summary-only link, keyboard page/session selection, Back/Forward, Boards and session refresh, ChatGPT refresh retaining Sep 5 context, missing wind, and unknown-session recovery. No page-wide overflow or captured warnings/errors.
- Existing server and temporary board state were preserved. Viewport override reset. Live ChatGPT embedding is still unverified; sandboxed hosts retain UI navigation if history updates are denied.

## Selected interval only — 2026-09-26

The map now draws only the selected best interval, including its travel arrows and start/end labels. With no selection it shows the full route without interval overlays. Annotation markers remain independent of the selection and render above the interval line; the current point is preserved.

- Production build and all 19 tests pass; existing build warnings remain.
- Browser checks at 1280 × 1000 and 390 × 844: switched 5/10/20-minute windows using keyboard and click, confirmed only selected boundary labels, and verified a temporary annotation outside every best window remained on the map throughout. Removed the QA annotation afterward.
- Checked initial unselected map, summary-only session and narrow layout without horizontal overflow. No browser errors or warnings captured.
- Screenshot: `.tools/qa/selected-interval-map.png`. Existing server state preserved; no restart. Live ChatGPT embedding remains separately unverified.

## Hover-only map hints — 2026-09-26

Removed permanent current-point and best-window boundary tooltips. Current point now accepts pointer hover; annotation/session endpoint hints retain their existing hover behavior. Markers and sidebar/chart timing remain visible without tooltip boxes.

Build passes. Browser verified no idle hints, current-point hint on hover, removal on pointer leave, keyboard best-window selection, and no idle hints or horizontal overflow at 390 px. Screenshot: `.tools/qa/hover-only-map.png`. Existing build warnings remain.

## Minimal session header and Edit dialog — 2026-09-26

Moved the board picker into a native modal opened by the small pencil beside the title. The dialog also edits the launch-point name, stages both fields until Save, and retains Cancel, default-board selection and board management. A compact native chevron picker replaces the wide session selector. Removed the Sheet summary block from Best windows; Home and model context retain source values. Existing selected-window map changes were preserved.

- Build and all 20 tests pass, including atomic detail edits, invalid-board rollback, name validation, unchanged source location/string ID and updated analysis context. Existing build warnings remain.
- Browser checks at 1280 × 900 and 390 × 844 covered keyboard session selection, empty boards, default selection, combined name/board save, blank-name rejection, Escape/Cancel, focus entering the name field and returning to Edit, modal Tab containment, and the summary-only session. No horizontal page overflow. No captured browser warnings/errors.
- Private screenshot: `.tools/qa/minimal-session-header.png`. Tests that changed data used an isolated server. The running app on port 3001 was updated with all existing temporary session and board state restored and compared against the pre-restart snapshot. Live ChatGPT embedding remains unverified.

## Compact left navigation — 2026-09-26

Replaced the horizontal top bar with a fixed 64 px icon rail (56 px on phones), preserving Home, Sessions, Boards, ChatGPT and Import FIT. Removed duplicate ChatGPT navigation. Icons have accessible names, hover/focus labels, Escape dismissal, and active-page markers. The content starts at the top of the viewport. Removed superseded header styles.

- Production build and all 20 tests pass; existing dependency-comment and bundle-size warnings remain.
- Browser checks at 1280 × 900, 390 × 844 and 320 × 720 cover all pages, keyboard navigation, active states, focus labels/Escape, Skip to content, session URL updates, detailed tracks, unknown wind and summary-only states. No horizontal page overflow or captured warnings/errors. Import remains reachable at 740 × 360.
- At the smallest width, metrics use two columns and best-window controls stack to fit beside the rail. Private screenshot: `.tools/qa/left-navigation-rail.png`. Viewport reset; server was not restarted and temporary data was preserved. Live ChatGPT embedding remains unverified.

## Horizontal best-window controls — 2026-09-26

Moved the three local best-window controls under the full-width map, removed the section heading/eyebrow/help paragraph and map-direction caption, and retained duration, speed, elapsed boundaries, selection and unavailable states. Missing GPS uses a conditional map status. The row stays horizontal at narrow widths.

- Production build and all 20 tests pass; existing build warnings remain.
- Browser checks at 981 × 884, 1280 × 900, 390 × 844 and 320 × 720: horizontal layout, no page-wide overflow, keyboard window selection and linked map/chart state, and disabled summary-only controls. Server state was preserved.

## Right-side metrics and reduced help text — 2026-09-26

Moved summary metrics into a compact right-side panel with aligned labels/values, subtle separators and retained secondary values. Narrow layouts stack the panel after the map. Removed visible chart interaction instructions and repeated context/focus explanatory text; keyboard instructions remain screen-reader accessible. Build and all 20 tests pass. Final browser visual verification was blocked by a browser URL-policy rejection while reloading the browser error page. The stopped local server was restarted using the previously saved temporary-state snapshot; edits made after that snapshot cannot be verified as recovered. Live embedding remains unverified.

## Session tooltip and metadata cleanup — 2026-09-26

Implemented all six browser comments: floating chart telemetry, heading-level Annotate, removed repeated elapsed caption, wind/source disclosure, removed footer, and inline date disclosure beside the title. Source metadata remains reachable without a track. Chart values remain available on keyboard focus and in slider ARIA values.

Build and all 20 tests pass. Browser verification at 981 × 884, 390 × 844 and 320 × 720 covered pointer/keyboard values, annotation prefill/cancel, date disclosure, source link, summary-only state and no horizontal overflow. No captured warnings/errors. Private screenshot: `.tools/qa/session-density-final.png`. Viewport reset; no server restart or saved-data edits in this change. Live ChatGPT embedding remains unverified.

## SQLite persistence and tenant boundaries — 2026-09-26

Replaced temporary/snapshot labels with saved app data and removed the source-sheet link. Desktop 1440 × 1000 and phone 390 × 844 / 320 × 720 checks used a separate backup database. Verified board creation/default, keyboard session editing (Enter/save and Escape/cancel), assignment, context save, chart ArrowRight movement, summary-only/missing-wind states, and no horizontal overflow. Stopped and restarted the server and verified name/board/default/assignment/context persisted. A separate empty tenant showed no sessions, with working navigation and unavailable metrics. Browser captured no warnings/errors.

All 24 Node tests and the production build pass. SQLite integrity/foreign-key checks pass, and backup/reopen tests pass. Migrated summaries/records/windows/pauses and archived source payloads were compared to the pre-migration data; original FIT/ZIP hashes are unchanged. A recovery snapshot restored the user's existing board/default and two timed annotations, including IDs/revisions. The final production backup is data/storage/backups/post-migration.sqlite (private, ignored).

The optional Python foundation audit could not load jsonschema from the pre-existing local Python environment (access/import failure). Original-file checksums and Markdown links were checked separately with Node. Live ChatGPT account embedding remains unverified; MCP transport and tenant isolation are tested locally. Authentication/public multi-user hosting and arbitrary new FIT/result ingestion remain deferred.
Final production UI evidence: `.tools/qa/sqlite-persistence.png`. The app is running against the production database on port 3001; QA database servers were stopped. Temporary viewport overrides were reset.

## Remaining audit completed — 2026-09-27

Resolved the Python dependency blocker with a project-local `.venv` and the existing pinned requirements. Both offline utilities now use the selected interpreter's packages; they no longer inject the inaccessible `.tools/python` directory. Markdown validation excludes dependency/generated directories before descending into them.

The full foundation audit passes: external JSON schema and analysis semantics, 14 technique dictionary entries, three original archive/FIT checksum and ZIP/derived-track checks, and local links in 39 Markdown files. Standalone analysis JSON validation also passes. All 24 Node tests and SQLite integrity/foreign-key checks pass again. This completes the previously blocked audit; production session content and original files were not modified. No UI change required another browser pass. Authentication/public hosting and live ChatGPT account verification remain outside this validation follow-up.
# FIT import and deterministic evidence — 2026-09-27

Validated the actual built UI using an isolated SQLite database and synthetic Garmin-encoded FITs. Desktop flow: empty history → keyboard-open Import → preview date, route and metrics → enter launch name → save → select best 20 minutes and use the chart keyboard cursor. Narrow viewport (390 × 844): duplicate ZIP preview/open, new activity with missing GPS/HR/cadence, and malformed FIT error. Missing sensors remain unavailable while distance-based best windows remain usable. No page-wide horizontal overflow was observed. Browser console had no application errors during the desktop flow.

Evidence: [desktop imported session](docs/design/qa/import-desktop.png), [narrow duplicate preview](docs/design/qa/import-mobile.png). The three original supplied FITs were decoded read-only as an additional compatibility check; no production sessions were written. Automated tests cover REST/MCP import and interval evidence, raw checksum preservation, duplicates, tenant boundaries, atomic rollback, backup/reopen, corrupt ZIP/FIT, pauses, gaps and missing channels. Actual ChatGPT host file selection and large-payload limits remain a live-account check.

## Historical weather retrieval — 2026-09-27

Validated the built UI on an isolated in-memory SQLite server with synthetic station observations at 1440 × 1000 and 390 × 844. Checked manual retrieval, pending/success states, refresh, provider outage/retry, missing GPS (disabled retrieval with reason), unknown gust/direction values, keyboard Enter on controls/disclosure, and chart End moving the weather cursor to another observation. The observation table scrolls inside its region; no page-wide horizontal overflow was observed. A duplicate sibling React key found during session switching was fixed and retested: one session header and picker remain.

All 38 Node tests pass, including independent post-import enrichment, failure preservation, exact interval weather evidence, SI normalization, coverage, tenant isolation, raw provenance and persistence. Build passes with the existing bundle-size/dependency-comment warnings. A real IEM request for the uploaded September 27 session returned seven NZY observations, 2.8 miles from its first GPS point, with complete wind-speed temporal coverage under the documented one-hour rule. That evidence is saved in production SQLite; no synthetic data was inserted there. A pre-weather database backup was made and schema 3 integrity/foreign-key checks passed. Live ChatGPT account embedding remains unverified.

## Compact weather disclosure and on-water wind — 2026-09-27

Removed the below-map weather section. All retrieval, observation and adjustment controls now live inside the map widget's explicit chevron disclosure, bounded to the map with internal scrolling. Verified desktop (1280 px) and phone (390 × 844): no page overflow, no extra below-map block, popover stays within map bounds. Click-close while the pointer remains over the widget leaves it closed; keyboard Escape closes and returns focus to the summary without reopening. Explicit Enter reopens it.

Synthetic-only browser edits verified save (6.5 mph from east with note), restoration, calm with unknown direction on phone, session switching, and missing GPS with adjustment still available. Station observations remain visible separately. All 39 tests pass, including on-water report persistence, refresh concurrency, history, source separation in analysis, validation and tenant boundaries. Build passes. Production retains its seven retrieved NZY observations and has no test adjustments. The server on port 3001 was restarted with the feature.
