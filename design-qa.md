# Prototype validation

Checked locally on 2026-09-26. The built app runs at `http://127.0.0.1:3001` using the Node API/MCP server.

## Result

Local startup and the reviewed prototype flows pass. This is a UI prototype, not a completed live ChatGPT account integration or validated coaching system.

- `npm run build` succeeds. The large bundle warning remains; splitting is deferred in `todo.md`.
- `npm test`: 13 tests pass, including the home page, built asset delivery, route fallback, path containment, domain estimates, sample recognition and MCP integration.
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
