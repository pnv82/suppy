# UX brief and Product Design handoff

## Core experience

The product is a personal SUP session review workspace. Home now opens with the most recent sessions and their key-parameter changes, using the previous Compare view. Open a session to review its route, sustained efforts and evidence. Favor readable charts and condition context over score badges.

The user selected concept 1's light/simple map-led direction, with concept 2's timeline annotations. The refined visual target is `references/selected-light-ui.png`. The app uses real data rather than the mock's illustrative interval positions. The initial implementation and browser validation are recorded in root `design-qa.md`.

## Information architecture

1. **Home:** previous Compare view, now the default entry point. Latest 10 sessions in descending date order, key metrics, board, wind/quality and track availability, plus chronological trends. No filler when fewer exist. Session rows become cards on phones. The session dropdown retains date, location, total distance and active hours/minutes.
2. **Session review:** primary workspace; summary, map, sustained efforts, time series, conditions and technique.
3. **Contextual panels:** target editor, issue selector, attach FIT, external-analysis prompt. Keep these attached to the selected session.
4. **Comparison on Home (P03):** automatically select the latest 10 sessions and show chronological key-parameter trends plus a session table. If fewer exist, show the available count explicitly. No manual pair selection or dedicated leg comparison.
5. **Annotations (P05):** select a chart point or interval and open a small editor; keep the underlying route and timeline in view.
6. **ChatGPT:** embedded UI plus tools inside the conversation; save annotations/additional context and request fresh analysis. Standalone mode provides the connection guide and a copyable prompt.
7. **Boards:** add/rename a named board, choose/clear a default, and delete only unused boards. Session review has a board picker and a “Use default” shortcut when unassigned. Show “Not recorded” initially, and identify selections as athlete reported. Default changes never rewrite past sessions. All board edits reset on server restart.

## Review screen behavior

| Region | Content and interaction |
|---|---|
| Header | Date/time with timezone, location, session type, previous/next session, source/snapshot state |
| Key metrics | Distance; active and elapsed duration; speed; HR; cadence. Show current target only where comparable |
| Map | Full route with start/finish, travel direction and selected interval. Wind arrow shows air motion **toward**, while label says **from NNE, 5.75 mph**. A legend explains both |
| Best sections | 5/10/20-minute controls show speed, interval times and validity. Overlap is allowed; selected interval is visually dominant. A value without boundaries stays a readable value with “Location unavailable” |
| Charts | Aligned speed, HR and cadence plots on elapsed time. Shared chart hover/keyboard cursor and labelled map point above route overlays. Click/tap a chart or press Enter to annotate; choose best intervals beside the map. Preserve raw gaps and label any display smoothing |
| Conditions | Weather observations at their actual times; station and quality; shaded coverage only where supported. Falls, pauses or chop show only at known timestamps |
| Technique | Selected issues with “Athlete reported”, “Hypothesis”, or “Video/coach observed”; evidence, alternative explanations and one cue. Empty is “No technique observations recorded” |
| Actions | Contextual access to attach file, set target, select issue, copy external-analysis prompt, compare sessions and annotate. Prioritize one primary action per view; every action has a visible result |

Wind on the map is a nearby-station observation, not a spatially measured wind field. A cursor may select the nearest usable observation under the coverage policy; do not animate invented wind between measurements. Daily-only weather cannot become minute-by-minute wind.

## Key flows

**Review:** select session → inspect summary/conditions → choose best 10 min → locate its route and charts → review evidence → inspect goal gap.

**Attach detailed data:** choose FIT/ZIP → validate → preview date/time/distance and candidate session → confirm match if ambiguous → attach in memory → show route/chart availability. A file may have summary data without GPS; retain the useful part.

**Use external analysis:** select session → show available inputs and unresolved gaps → copy the prompt → analyze externally → review result → manually update a sheet copy/new analysis rows when authorized → refresh the local snapshot. This foundation does not write to the user's Sheet.

**Technique selection:** open dictionary → filter phase/search wording → read what evidence is needed → select issue and evidence status → attach note/time reference → view the observation in context.

**Automatic comparison (refined P03):** open Home → latest 10 sessions selected automatically → inspect chronological trends in speed, best 5/10/20, HR, cadence, distance and active duration → open any session from the table. Four sessions are currently available. The trend is descriptive, not a normalization for conditions. Missing wind stays unknown.

**Annotate (approved P05):** click/focus a chart timestamp or select an interval → add type (interruption, fall, condition change or note), note and timing confidence → save to temporary state → reflect the marker on charts/map where coordinates exist. Edit/remove must work. Distinguish source events from editable manual annotations. Unknown-time source counts stay separate from new timed markers.

**Ask again in ChatGPT:** save a note or extra context → prepare the current session context, revision and bounded telemetry → send the question to the host conversation. ChatGPT interprets the data; the local app never pretends that background analysis ran. The same action in standalone mode reveals copyable context. Account connection follows the root README.

**Best-window emphasis:** show the labelled, colored map sections with 5/10/20-minute controls beside the map and the selected interval shaded on all performance charts. Selection adds emphasis, start/end times and a linked cursor. Local FIT estimates and Sheet values have distinct source labels.

Each best section has color-matched travel arrows with a duration badge. Selecting a window brings its line above overlapping tracks and dims the others; zoom reveals more separated arrows. Start/end labels and the selected button provide non-color cues. These arrows follow GPS travel order; the separate wind overlay describes airflow.

The charts are the time control; there is no separate Explore track slider or interval-lane control. Hover updates the shared cursor and map point. Click/tap opens a timestamp-prefilled annotation editor; explicit start/end fields allow interval notes. Focus any chart and use arrows for one second, Shift + arrows for ten seconds, Home/End for elapsed limits, and Enter/Space to annotate. Initial selection uses the first valid GPS point. Gaps and pauses show no map point and an explicit GPS-unavailable message. Summary-only sessions retain a manual annotation action. Drag selection, timeline zoom, observation-by-observation weather, broad imports and full evidence editing remain deferred in root `todo.md`.

Discarded optional flows: outbound/return comparison, post-session check-in, next-outing focus pinning and video-link management. Evidence labels in the original technique workflow remain required.

## States required for the prototype

- Summary only: Aug 29 is present in the Sheet but no supplied FIT.
- Unknown wind: Sep 5 has a daily summary, no session-time wind observations.
- Suspect early HR: Sep 5 and Sep 25 are flagged; exact affected intervals are unknown.
- Paused recording: Sep 20; show breaks without joining the route across missing telemetry.
- Best value without location: current Sheet has speeds but no window boundaries.
- Empty goals or technique observations, loading, malformed file, unsupported file, duplicate file, ambiguous match, and stale snapshot.

## Accessibility and responsive behavior

All chart/map information needed for a decision must also be available in text or a table. Do not use color alone for selected windows or quality. Use labelled controls, visible keyboard focus, readable contrast, and accessible touch targets. Charts need units and a keyboard-accessible cursor/interval alternative. At narrow widths, put summary then map/window controls then charts in reading order; avoid page-wide horizontal scrolling. Reduce motion when requested by the system.

## Design review tasks

Use the real Sep 25 summary and track for the main state; also inspect Sep 5 missing weather and Aug 29 missing track. A reviewer should be able to locate a selected interval, identify whether wind is observed or unknown, explain a goal's duration, and distinguish a technique hypothesis from direct evidence without reading a manual.
