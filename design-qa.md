# Metrics implementation QA — 2026-09-27 (America/Los_Angeles)

**Final result: passed.** Latest: [Tracking Control Score verification](#tracking-control-score-verification-2026-09-29-utc). Earlier checks are preserved below.

## Scope and visual truth

- User selection: option 2's selected-interval properties/details plus option 1's clean chart interval highlight. Option 3's replacement table is excluded. Home uses a cleaner list, defaulting to best 20 minutes.
- Source visual truth: [combined selected target](docs/design/concepts/metrics-selected-target.png), informed by the three studies in [metrics-ui-plan.md](docs/design/metrics-ui-plan.md).
- Rendered implementation: isolated synthetic SQLite app at `http://127.0.0.1:3002`; final production startup verified at `http://127.0.0.1:3001`.
- Desktop source and implementation: 1487 × 1058 pixels, CSS viewport 1487 × 1058, devicePixelRatio 1. No density resampling. [Final desktop screenshot](.tools/qa/metrics-session-desktop-final.jpg).
- State: selected best 20 minutes, DPS in the third lane, metric inspector visible. Synthetic route/values differ intentionally from the illustrative source. The real Leaflet map and computed Recharts plots replace illustration-only geometry. Existing compact navigation/header and median/max references remain.
- Full-view comparison: source and rendered screenshots were opened together in the same image comparison input on initial and revised passes. Inspector, interval controls and chart highlight were also inspected as focused regions in those full-resolution inputs. Their text was readable; separate crops were unnecessary.
- Narrow checks: CSS 390 × 844, 320 × 760 and tablet 768 × 1024. Native mobile screenshots exclude the scrollbar: JPEG content widths 375 px at the 390 px viewport, DPR 1. [Phone list](.tools/qa/metrics-home-mobile-final.jpg), [phone session](.tools/qa/metrics-session-mobile-final.jpg), [phone drift dialog](.tools/qa/metrics-drift-mobile-final.jpg). Screenshots are browser-native JPEG bytes; final links use the matching extension.

## Findings and comparison history

1. **[P2, fixed] Supporting interval metrics too small.** Initial desktop capture `.tools/qa/metrics-session-desktop-v1.png` used inherited 9–10 px supporting text. Cadence and DPS were harder to scan than the selected design. Increased desktop support text to 12 px, strengthened the inspector headline, and used 64 px interval controls while reducing map height to preserve the compact overview. A follow-up caught inherited column flow expanding the cards; corrected it to a single support row. Final desktop image above verifies readable values and three chart lanes in the existing footprint.
2. **[P2, fixed] Excessive mobile list spacing.** `.tools/qa/metrics-home-mobile-v1.png` inherited desktop cell padding inside phone cards, producing roughly 435 px cards. Narrow-specific padding and footer layout reduced cards to roughly 304 px before final touch-target expansion. The final phone-list image verifies compact grouping without losing coverage or estimate qualifiers.
3. **[P2, fixed] Trend control overflow at 320 px.** The long metric option forced the select to extend to x346. Constrained the flex label/select to the available width. DOM checks on the revised page show no page-wide overflow at 320, 390 or 768 px.
4. **[P2, fixed] Narrow DPS selector was truncated.** Shortened its visible label to “DPS (est.)”; the lane retains m/stroke units and its accessible chart name remains “Distance / stroke chart time”. Details explain the estimate and rolling window.
5. **[P3, accepted] Visual reference is illustrative.** The implemented inspector is narrower and the overall screen denser than the image study to retain the existing application's vertical-space discipline. No fabricated map, weather, curved plot or athlete value was copied from the study. Existing map tiles and source maxima remain. Exact pixel matching of fictional content is not an acceptance criterion.

No actionable P0/P1/P2 findings remain.

## Required fidelity surfaces

- **Fonts/typography:** preserved existing Inter/system/Segoe UI stack; distinct session title, paired headline and secondary evidence hierarchy. Generated typography is an approximate style reference. Values and units remain legible; long titles wrap on phones.
- **Spacing/layout rhythm:** map-led overview, inspector in the existing right-hand region, compact interval row and three charts. Inspector stacks at narrow widths; deeper metrics/drift use dismissible overlays. No new permanent analysis panel or fourth chart.
- **Colors/tokens:** existing white/navy/teal palette and interval colors retained. Root computed background is `rgb(255,255,255)`; captured screenshots have the same warm tint seen in earlier project captures, so raw screenshot color fidelity is limited by capture conditions. No compensating yellow CSS was introduced.
- **Image quality/assets:** retained actual Leaflet/OpenStreetMap tiles, chart vectors and the established Phosphor icon set. The generated reference is documentation, not a rasterized app surface. Map route geometry reflects synthetic records, not the illustrative route.
- **Copy/content:** best-20 versus session scope is explicit; DPS stays “est.”; partial support is qualified; zig-zag stays experimental with coverage. Drift is descriptive with independent pair counts and conditions not normalized. Missing telemetry stays unavailable. Native dialogs expose alternate units, exact bounds, methods, source, exclusions and angular deviations.

## Browser flows verified

- Home defaults to best 20 minutes; whole-session switch and zig-zag trend selection work. No fallback from a missing best effort to a session average.
- Open session, choose a 20-minute interval, synchronize chart/map selection, return to whole-session scope, switch cadence/DPS.
- Metric details open by click and Enter. Tab remains inside the native modal; Escape closes and returns focus to the trigger.
- Chart keyboard arrows update elapsed cursor. Drift reveals five non-overlapping pairs and the planted −10% speed change; exact early/late buttons move the cursor.
- Missing cadence, missing GPS and summary-only sessions remain usable. Missing GPS preserves distance/cadence evidence; absent cadence does not become zero or guessed DPS.
- A separate synthetic low-speed/timer fixture displays neutral low-speed and recorded-timer markers alongside a distinct athlete note. Mouse and keyboard marker navigation reaches 5:00 and 25:00; details expose 5-second boundary uncertainty.
- Phone details/drift dialogs fit the viewport and scroll internally. Primary new narrow-screen controls have 44 px height; interval controls remain larger.
- Standalone Ask ChatGPT prepares a copyable bounded context containing the selected interval's exact evidence. It makes no model call or external message.
- Browser error/warning log check returned no entries. This does not claim a new live ChatGPT-account integration test.

## Validation and operational checks

- `npm test`: **58 passing** tests, including new numerical/coverage/geometry/drift/import tests, UI/MCP evidence agreement, context invalidation, tenant isolation, source preservation and persistence.
- `npm run build`: passes. Existing approximately 1.1 MB JS bundle warning and third-party annotation warnings remain; bundle splitting is already deferred.
- Relative document link/anchor audit: 70 references passed. `git diff --check` passes.
- Restarted the verified local app server with the same production database after completing the build. All five sessions expose `sup_deterministic_v2`; dashboard returned HTTP 200 (about 131 ms in the startup check).
- Before/after hashes confirm persisted session records and uploaded original/FIT bytes unchanged. No production seeding or database reset. Synthetic fixtures use their own explicitly named database.
- Independent on-water validation of zig-zag resolution/noise, cadence counting, low-speed thresholds and drift interpretation remains future work. Synthetic correctness is not field accuracy or a physiological claim.

## Implementation checklist

- [x] Shared current evidence, provenance, coverage and unavailable rules.
- [x] Clean best-20 list; selected-interval inspector and chart band.
- [x] DPS chart switch, conservative events, descriptive drift and experimental session/interval zig-zag.
- [x] Desktop/narrow/missing-data/keyboard checks and visual correction loop.
- [x] Methods, plan status, suspended research and todo references updated.

final result: passed

---

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

## Session management refinement — 2026-09-27

Validated the built app against a separate synthetic SQLite database on port 3002. Home maximum-speed selector switches the chronological graph; missing FIT maximum remains a dash. Session Edit saves additional observations, reopens with persisted text, traps Tab including the textarea, and Escape restores focus. Previous/next navigation and the enriched session picker work; summary-only sessions retain disabled interval tiles and missing statistics. At 390 px the picker stays within the viewport and scrolls internally; confirmed deletion of a disposable fixture closes the dialog and navigates to a remaining session. No production session was changed. Automated checks: 40 tests pass, including delete/archive/re-import, tenant isolation and atomic details/context saves; production build passes with the existing bundle-size warning. Interval stroke distance remains unavailable pending validated interval stroke counts.

## Lazy interval stroke-distance calculation — 2026-09-27

All 45 tests pass; production build succeeds (existing bundle-size warning). In the isolated synthetic database on port 3002, a legacy session without cached interval statistics now displays 12.3 ft/stroke est. in all three tiles, with 100% matched coverage and the cadence assumption in accessible detail text. Verified Enter selects the interval. Checked 1440 px desktop and 390 px mobile, including compact wrapping without horizontal overflow or added tile height. Summary-only session retains unavailable cadence/stroke distance. Calculation uses matched distance/cadence edges, excludes gaps/pauses/resets/spikes, clips interval boundaries, preserves existing numeric evidence, and does not rewrite historical stored sessions. Browser validation completed after the temporary approval-review usage limit cleared.

## Next tasks · 2026-09-28
- Maximum speed: verified Home table/cards and keyboard-operable trend selector using synthetic next-qa.sqlite on port 3011. Missing max remains unavailable; at 390 px there is no horizontal overflow. Build and six session/interval tests passed. Whole-session max is explicitly independent of best-20 basis.

- Training focus removal already implemented; confirmed absent from session review at desktop and phone widths. Stored historical reports remain preserved.
- Session deletion already implemented: browser confirmation/Keep session checked; 11 FIT tests pass including byte-preserving archives, tenant isolation and re-import.
- Interval tile task already implemented: cadence and estimated metres/stroke visible at desktop/390 px; keyboard selection updates inspector to Best 5 min. Six interval/session tests pass.
- Additional context already moved into Edit: saved a synthetic observation at 390 px, reopened at desktop, checked Escape dismissal. Atomic detail-save test passes.
- Wide navigation: browser checked at 1440 px (persistent labels, keyboard Home) and 390 px (44 px icon buttons, hidden idle labels). Build passed.
- Persistent point: at 390 px used Home, Right, Enter, Right; cursor moved to 2 s, annotation stayed at 1 s. Verified prefilled Start, cancel, both map marker classes at 1440 px. Build passed.
- Interval selection: actual clicks at 3:20 then Shift-click at 8:40 produced 3:20–8:40. Keyboard Home/Enter/Shift+Right/Shift+Enter produced 0:00–0:10. Phone Point mode hides End. Build passed. Map point distinction inspected visually (SVG class queries are not available through the browser DOM projection).
- HR/DPS swap: checked populated inspector at desktop and summary-only null values at 390 px, without horizontal overflow. Build passed.
- Travel arrows: selected 5 min by keyboard, verified multiple arrows on phone, desktop and after zoom; width reduced to track width. Missing-GPS state remains unchanged. Build passed.
- Picker: added eight older synthetic sessions only to next-qa.sqlite. Verified Latest 10 of 12, search finding oldest cove 0, no-match state at 390 px, and Escape. Build passed.
- Home summaries strip: already absent in current implementation. Verified only the page heading, trends and session grid remain; retained the explicit available-session count and per-session values.
- Home graph order: browser headings now Recent sessions, Speed over time, Best 20-minute metrics at phone and desktop widths. Build passed.
- Change arrows: numeric threshold/null/zero/three-session test passes. Synthetic +50% max shows at desktop and 390 px with descriptive accessible label; scope switching works. Build passed.
- Suppy branding: browser title/accessible home name verified on phone/desktop; SVG favicon is bundled. Seven MCP/static packaging tests and build pass. Existing operator tunnel profile and storage environment names intentionally remain stable.
- Home menu: desktop and phone keyboard/menu edit, cancel and deletion confirmation checked; recalculation verified after restarting the isolated QA server. Recalculation regression test verifies identical evidence and unchanged source/context, and rejects unknown tenant/session input. Build passed.
- External summary: version/ref/revision validation, stale detection and clear tested; MCP tests pass. Browser verified persisted synthetic summary and provenance at desktop, empty summary at 390 px, keyboard opening and Escape. Build passed.
- Goals: nine cadence/storage/MCP tests pass. Browser created best-20 target at 390 px, verified matching 5 mph chart line; created 10 min above 30 spm at desktop and verified its chart/line. Empty state and keyboard navigation checked. Build passed. Automatic review initially rejected Goals, then accepted after reading the explicit Next task and proposals distinction.
- Upload redesign: synthetic FIT chosen through the real file chooser, preview verified at desktop and visually at 390 px. Malformed synthetic FIT displays actionable integrity error; Escape dismisses. Existing import contract tests cover missing sensors/summary-only files. Build passed; originals/production data untouched.
- Offline naming: tests cover early supported GPS, missing/bad/late GPS, generic bays, finish exclusion, reference validation and non-mutation. Browser verified prior confirmed start ranking, public Bonita Cove candidate on relocated synthetic GPS, explicit save, and no-candidate state at phone width. No production tracks or coordinates were used.

Final integration: all 65 Node tests and the production build pass. Updated the weather persistence assertion for schema 5. Desktop 1440 px, intermediate 1100 px and phone 390 px checks show no page-wide overflow. Browser viewport override was reset. Synthetic screenshot evidence is saved privately in `data/storage/suppy-next-home.png` and `data/storage/suppy-next-phone.png`; production data and original files were not modified. Existing build warnings and live ChatGPT-account verification remain outstanding. See [delivery decisions](docs/engineering/next-session-2026-09-28.md).

Foundation audit also passes: schema/analysis semantics, 14 dictionary issues, three original checksum/ZIP/track checks and links in 45 Markdown files. Its local-link validator now decodes percent-encoded filenames, fixing false failures on existing space-containing paths.

## Online launch-name lookup — 2026-09-28

After explicit approval of start-coordinate transmission to the Overpass endpoint, enabled server-side geographic lookup from Edit → Suggest nearby launch. Desktop 1440 × 1000 and phone 390 × 844 checks used synthetic sessions in isolated in-memory databases. Checked ranked source-labelled suggestions, Enter selection/save, source-link Tab focus, Escape, missing GPS, empty results and provider-failure feedback without changing existing names. No page-wide horizontal overflow. Temporary QA servers were stopped and the viewport reset.

A separate live request using the public Bonita Cove reference returned Bonita Cove and Santa Barbara Cove. The live browser flow returned both OSM candidates plus the historical Bahia Point fallback, and keyboard Save renamed only the synthetic session. Private proof: `data/storage/launch-lookup-live.png`; additional synthetic states: `data/storage/launch-lookup-desktop.png` and `data/storage/launch-lookup-phone.png`.

All 72 Node tests pass, including provider request/timeout/size limits, caching, tenant isolation, provenance validation, and REST/MCP equivalence with open-world tool metadata. Production build passes with existing warnings; foundation audit checks 46 Markdown files and unchanged original hashes. Live ChatGPT account embedding remains unverified. See [lookup contracts](docs/engineering/launch-names.md); production sessions and original FIT/ZIP files were not modified.

## Custom interval tiles and interval zig-zag — 2026-09-28

Desktop 1440 × 1080 and narrow 390 × 844 browser checks used synthetic sessions in `.tools/custom-interval-ui.sqlite` on port 3002. Verified point-only selections hide Add interval; forward/backward keyboard ranges and click/Shift-click ranges preview exact evidence; Choose interval end extends the next click/tap/Enter without Shift; saving several tiles, selecting equal-duration ranges, duplicate reuse, browser refresh and server restart, keyboard removal and focus return. Selected tiles scroll fully into the strip without page-wide horizontal overflow. Metric dialogs open by keyboard and return focus on Escape. Missing GPS/HR/cadence and summary-only sessions retain unavailable states and explicit reasons. No browser console errors.

All 77 Node tests and the production build pass. New regressions cover persistent/tenant/session ownership, exact interval versus whole-session zig-zag, compact REST/MCP evidence, invalid bounds, gaps/pauses, missing/short GPS support, summary-reference invalidation, and absent map boundary markers inside pauses or GPS gaps. The original metric policy and source bytes remain unchanged. Private screenshot evidence: `.tools/custom-interval-desktop.png` and `.tools/custom-interval-phone.png`; these files and the synthetic database are ignored by Git. The main local app was rebuilt/restarted; private production session selections were not modified.

## Local Auth0 authentication — 2026-09-29

The existing Auth0 application is now a Single Page Application with exact callback/logout/origin URLs for the two loopback hosts on ports 3001 and 5173. Its password database connection was disabled and Google remained enabled. The new RS256 Suppy API uses `http://127.0.0.1:3001/mcp`, one `suppy:access` permission, per-app user-delegated authorization and no client-credentials access; the SPA has the sole granted permission. The tenant's resource compatibility and issuer-response toggles were already enabled. Auth0 API evidence: `data/storage/auth0-api.png` (private, ignored by Git).

Live Chrome checks used `data/storage/auth-browser.sqlite`, separate from the existing local history. Google login produced a verified empty workspace and a 0-session Home state; REST without a token returned 401 with protected-resource metadata. Google cancellation returned to private sign-in. The account menu opened with Enter and closed with Escape; Sign out cleared private UI, and Switch Google account opened Google's account chooser. Declining consent during a switch returned to private sign-in. One callback after an earlier cancellation briefly reported an Auth0 state error; a fresh authorization after the API grant succeeded. Later switches and logins reached the empty workspace. Desktop 1440 px and phone 390 px showed no horizontal overflow, with the rail filling viewport height on phone. Refresh returned to the signed-out screen with private data hidden: SDK memory tokens were cleared and this browser did not restore silently. Reauthentication can reopen the same workspace; tokens were not saved outside SDK memory. A final Google login against the normal SQLite file also opened an empty account workspace while retaining the existing `local` tenant history.

Node 24 ran 83 passing tests, including signature/time/scope rejection, REST/MCP challenges, two-user tenant isolation, account request invalidation and restart persistence. The Node 24 build passed. Live ChatGPT linking and hosted HTTPS were deferred because the final URL and client registration are pending; Render configuration is prepared but unpublished. The original ZIP/FIT files and `local` tenant were not modified.
## Tracking Control Score verification (2026-09-29 UTC)

- Replaced the path-ratio headline with the four-component `TCS_v1` across best/custom tiles, manual previews, the inspector, metric details, Home rows/cards and trend points. Shared green/teal/amber/orange/red bands retain numeric values and accessible band labels; missing scores are neutral. No new persistent panel or repeated experimental disclaimer.
- In-app Browser verification at 1440×1000, 390×844 and 320×844, using an isolated in-memory SQLite tenant and synthetic straight/oscillating/missing-GPS/summary-only sessions. Confirmed all five colors and gray missing values, the 0–100 trend, component details and score/coverage agreement between custom tile and inspector.
- Keyboard Enter opened details; Escape closed them and restored focus. Home/Enter/End/Shift+Enter selected a chart range; Add interval saved it and it remained after reload. A 30-second custom interval stayed unavailable. Phone details fit without horizontal overflow; page width stayed within the viewport. No browser console errors during the synthetic flow.
- Live read-only smoke check after restarting the local server: Liberty Station 59:05–66:11 shows **59.7/100**, red, with **93% eligible coverage**, matching the API and pure calculation. The production session-state fingerprint was unchanged by the restart/read flow. No original FIT/ZIP or source data was altered. Local screenshot: `data/storage/zigzag-study/tcs-liberty-desktop.png` (private, ignored).
- `npm test`: **84 passed**. `npm run build`: passed, with the existing large-bundle/third-party annotation warnings. Current-turn diff has no whitespace errors; the pre-existing `todo.md` blank checklist item retains its existing trailing space.
- User-led on-water/interval calibration remains deferred in `todo.md`; no claim of validated anchors, technique diagnosis or live ChatGPT account connection.

## FIT import timestamp precision and diagnostics (2026-09-29 UTC)

- Reproduced the rejection in the unchanged September 5 sample: its final record is at 6459 s, while reported elapsed duration is 6458.494 s. Import now accounts for whole-second FIT timestamps only through the final partial second, preserving the record, elapsed/active summaries and original bytes. Genuine missing, duplicate, backward and out-of-session times have separate diagnostics with one-based record numbers and relevant UTC times/differences. Best windows stay within reported elapsed duration.
- In-app Browser checks at 1440 × 1000 and 390 × 844 used an isolated in-memory tenant on port 3011 and synthetic FIT/ZIP files. Verified timestamp rejection, recovery by choosing a valid file, fractional-end preview/save, FIT-versus-ZIP duplicate recognition preserving an edited name, deletion/re-import, missing GPS/HR/cadence, keyboard Enter/Escape and focus return. Error and missing-data dialogs fit without page-wide horizontal overflow. No browser console errors. Viewport reset after QA; temporary server stopped.
- All **86 Node tests** and the production build pass, with the existing third-party annotation and large-bundle warnings. Regressions cover fractional boundaries, exact/beyond-boundary rejection, sub-300-second efforts, source retention, duplicate/delete/re-import persistence, tenant isolation and identical REST/MCP errors on preview and commit.
- All three original FIT files decode successfully with unchanged checksums. Restarted the main local app on port 3001; read-only previews of all three original files now report the correct existing-session duplicates. Production session-row fingerprint is unchanged after restart and previews. No personal FIT/ZIP was modified or re-imported into production.
- Private synthetic screenshot evidence: `.tools/fit-import-qa/duplicate-desktop.png`, `.tools/fit-import-qa/error-phone.png`, `.tools/fit-import-qa/preview-desktop.png`, `.tools/fit-import-qa/missing-phone.png`. Additional user files and live ChatGPT account embedding were not available for verification.

## Selective events and temperature — 2026-09-29

Validated with isolated synthetic SQLite data at 1440×1000 and 390×844. The timeline retains sustained low-speed events and temperature-supported possible falls, without timer-pause markers. Enter on each event moves the chart cursor; event evidence expands by keyboard, and Escape closes metric details. Missing-temperature tracks retain low-speed events; summary-only tracks show the empty time-series/event state. A linked athlete fall annotation appears once without a duplicate detection marker. No persistent vertical space was added.

Validation: `npm test` passed 92 tests; `npm run build` passed (existing bundle-size/Zod annotation warnings). Synthetic tests cover cooling lag, missing channels, pauses/gaps, negative temperatures, insufficient cooling, ordinary stops, launch/finish filtering, annotation linkage, tenant isolation and automatic saved-FIT channel recovery.

Existing local tracks were refreshed after a SQLite backup. The three historical originals were attached to their existing sessions only after matching their preserved source FIT checksums. Original FIT/ZIP bytes remain unchanged. The user-confirmed September 20 annotation was corrected to exact 48:41; other notes were preserved. The detected onset bracket is 48:41–48:48. Thresholds remain provisional, pending more confirmed examples.

## Older-watch sample imports — 2026-09-29 UTC

- Added unchanged private ZIP/FIT copies for source IDs `20005174116`, `19857824112`, `17095580563` and `24521449019`, with byte lengths, SHA-256 checksums, device metadata and the user's inflatable-board report in the sample manifest. The first three identify Instinct Solar; the fourth identifies Enduro 3. No production import or board-assignment tool was called.
- Reproduced timer-confirmed ending differences of 1.587, 3.715 and 3.729 seconds in the Instinct Solar files. The importer now accepts an extension of at most 5 seconds only with a complete, strictly ordered start/stop sequence beginning at session start and an exact match between final stop and final record. It retains raw timestamps/durations and a quality warning with UTC boundaries. Best windows remain within the reported elapsed duration. Missing/contradictory timer evidence and larger discrepancies still fail.
- All **94 tests**, the production build, and the foundation audit pass. The explicit `node scripts/validate-fit-samples.mjs` check verifies all seven private archives/FITs against the current importer without touching SQLite. Normal tests remain synthetic. Existing bundle-size/Zod annotation warnings remain.
- Browser checks at 1440 × 1000 and 390 × 844 used an isolated in-memory tenant and synthetic files. Verified expanded timing evidence, successful save with an inflatable board, missing GPS/HR/cadence, rejection without corroborating timer events, keyboard Enter/Escape and focus return. No horizontal overflow or console errors. Temporary viewport and server were cleaned up. Screenshots: `.tools/older-watch-qa/preview-desktop.png`, `.tools/older-watch-qa/preview-phone.png`, `.tools/older-watch-qa/error-phone.png`.
- Restarted the main app on port 3001. Live previews accept the three Instinct Solar files and recognize the Enduro 3 file as an existing duplicate. Downloads and all six stored original/FIT blob pairs match their checksums. The production session-row fingerprint changed during live checks; tool responses also invoke the existing dashboard path that can refresh missing temperature fields and invalidate stored derived evidence. Without a before-row snapshot, exact row deltas are unverified, so these checks do not establish unchanged session metadata. No rollback of potentially concurrent user edits was attempted.

## Next items: launch naming (2026-09-29)

Validated using an in-memory synthetic tenant, injected geographic provider and synthetic FITs on port 3015. Import preview selected Synthetic Beach with a source link and review notice; keyboard submission saved the name. Checked desktop 1440×1000 and narrow 390×844 layouts. Missing GPS, provider failure, duplicate bypass, non-mutating preview and provenance validation are covered by synthetic tests. No production data or original files changed.

## Next items: route direction (2026-09-29)

Checked the synthetic curved route at 1440×1000 and 390×844, keyboard zoom and best-window selection, and summary-only missing GPS. Full-route chevrons remain faint beneath interval overlays and introduce zero keyboard tab stops. No page overflow at the narrow width. Existing direction/pause/gap tests plus a GPS-without-distance assertion pass; production build succeeds.

## Next items: candidate annotations (2026-09-29)

Synthetic temperature-supported possible fall at 6:39–7:30: keyboard activation pins the range and opens a Note/Approximate draft. Moving the speed cursor to session end preserves both bounds. Reviewed interruption saves to the annotation lane and replaces the linked candidate; reload retains the note. Desktop and phone editor layouts, cancellation, and summary-only annotation access checked. Event/domain tests and production build pass.

## Next items: highlight analysis (2026-09-29)

Browser-tested the built widget inside a synthetic host using the installed MCP Apps AppBridge and actual postMessage transport. Verified latest context (including saved annotation/source notes/calculated metrics), context-before-message order, rejected-message feedback, successful retry, no duplicate on dialog reopen, and a synthetic saved result delivered back through the bridge. Standalone missing-summary instructions and Escape/focus return checked on phone; desktop and narrow layouts checked. Local service tests cover missing duration, already-saved summaries, revision freshness and failure propagation. This is a protocol/UI check, not a live ChatGPT account or model-quality test.

## Next items: speed quality (2026-09-29)

A synthetic 18 mph record and FIT maximum are excluded from speed statistics, charts and analysis while remaining visible as raw evidence. Checked metric details and missing telemetry at desktop 1440×1000 and phone 390×844; keyboard opens/closes details. Regression tests cover independent channel coverage, null maxima and existing sessions without rewriting source. All 101 tests pass; production build succeeds with existing bundle/annotation warnings.

## Next items: personal Garmin import (2026-09-29)

Used an injected personal-account adapter and synthetic FITs in the isolated in-memory tenant. At 390×844 and 1440×1000, checked sign-in, wrong-code feedback, keyboard MFA retry, activity labels with missing time/distance, no-GPS/no-sensor preview and save, explicit similar-session choice, launch suggestion confirmation and saved session. Manual file import still identifies the same original as a duplicate and opens the existing session. Cancel/Escape and focus return remain supported; no horizontal overflow. Screenshots: `.tools/qa-garmin-mobile.png`, `.tools/qa-garmin-desktop.png`.

All 107 tests pass, including actual MCP transport with a synthetic connected account and separate tests for credentials, tenant isolation, provider errors and original bytes/provenance. Production build and foundation audit pass; preexisting Zod annotations and bundle-size warnings remain. No live Garmin credentials were used; live sign-in/download validation remains a user account check.
Embedded AppBridge browser check also confirms that a disconnected widget shows local-app sign-in instructions and a connection refresh button, with no credential fields. The safe Garmin tools were exercised over real MCP transport with the synthetic account.
