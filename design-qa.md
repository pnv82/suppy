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
