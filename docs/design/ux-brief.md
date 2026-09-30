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
7. **Boards:** add/rename a named board, choose/clear a default, and delete only unused boards. The session Edit dialog has a board picker and a “Use default” shortcut when unassigned. Show “Not recorded” initially, and identify selections as athlete reported. Default changes never rewrite past sessions. All board edits persist across server restarts.

Vertical space is precious: do not add below-map sections or increase persistent vertical footprint without user confirmation. Weather lives in the map widget’s chevron disclosure, opened only by explicit click/keyboard action, never hover. Its scrollable popover contains retrieval, evidence and a whole-session on-water wind adjustment with restore.

## Review screen behavior

| Region | Content and interaction |
|---|---|
| Header | Date/time with timezone, location, session type, previous/next session, source/storage state |
| Key metrics | Distance; active and elapsed duration; speed; HR; cadence. Show current target only where comparable |
| Map | Full route with start/finish, travel direction and selected interval. Wind arrow shows air motion **toward**, while label says **from NNE, 5.75 mph**. A legend explains both |
| Best sections | 5/10/20-minute controls show speed, interval times and validity. Only the selected interval is drawn on the map, including its arrows and boundary labels; annotation markers remain visible. A value without boundaries stays a readable value with “Location unavailable” |
| Charts | Aligned speed, HR and cadence plots on elapsed time. Shared chart hover/keyboard cursor and labelled map point above route overlays. Click/tap a chart or press Enter to annotate; choose best intervals beside the map. Preserve raw gaps and label any display smoothing |
| Conditions | Weather observations at their actual times; station and quality; shaded coverage only where supported. Falls, pauses or chop show only at known timestamps |
| Technique | Selected issues with “Athlete reported”, “Hypothesis”, or “Video/coach observed”; evidence, alternative explanations and one cue. Empty is “No technique observations recorded” |
| Actions | Contextual access to attach file, set target, select issue, copy external-analysis prompt, compare sessions and annotate. Prioritize one primary action per view; every action has a visible result |

Wind on the map is a nearby-station observation, not a spatially measured wind field. A cursor may select the nearest usable observation under the coverage policy; do not animate invented wind between measurements. Daily-only weather cannot become minute-by-minute wind.

## Key flows

**Review:** select session → inspect summary/conditions → choose best 10 min → locate its route and charts → review evidence → inspect goal gap.

**Attach detailed data:** choose SUP FIT/one-FIT ZIP and display timezone → validate → preview date/time/distance, route, sensor counts, quality and calculated best windows → choose an existing candidate or a separate session → review launch name/default board for new sessions → persist after revalidation → show route/chart availability. Duplicates open the existing session without changing its edits. Cancel saves nothing. A file may have summary or distance data without GPS; retain the useful part. Narrow layouts scroll inside the modal; keyboard and Escape/Cancel remain available. See [FIT import contract](../engineering/fit-import.md).

**Use external analysis:** select session → show available inputs and unresolved gaps → copy the prompt → analyze externally → review result. Future versioned result ingestion will write to SQLite; no spreadsheet transfer or refresh is part of the workflow.

**Technique selection:** open dictionary → filter phase/search wording → read what evidence is needed → select issue and evidence status → attach note/time reference → view the observation in context.

**Automatic comparison (refined P03):** open Home → latest 10 sessions selected automatically → inspect chronological trends in speed, best 5/10/20, HR, cadence, distance and active duration → open any session from the table. Four sessions are currently available. The trend is descriptive, not a normalization for conditions. Missing wind stays unknown.

**Annotate (approved P05):** click/focus a chart timestamp or select an interval → add type (interruption, fall, condition change or note), note and timing confidence → save to SQLite → reflect the marker on charts/map where coordinates exist. Edit/remove must work. Distinguish source events from editable manual annotations. Unknown-time source counts stay separate from new timed markers.

**Ask again in ChatGPT:** save a note or extra context → prepare the current session context, revision and bounded telemetry → send the question to the host conversation. ChatGPT interprets the data; the local app never pretends that background analysis ran. The same action in standalone mode reveals copyable context. Account connection follows the root README.

Map point hints (current point, interval boundaries, session endpoints and annotations) appear only on marker hover. Keep markers visible without persistent tooltip boxes; times remain available in the sidebar and chart readout.

**Best-window emphasis:** show only the selected map section with its travel arrows and start/end labels, using the 5/10/20-minute controls beside the map. Before selection, show the full route without best-window overlays. Preserve all annotation markers and the current point regardless of selection. The selected interval remains shaded on all performance charts. Local FIT estimates and stored historical values have distinct source labels.

Each best section has color-matched travel arrows with a duration badge. Selecting a window replaces the previous interval completely; zoom reveals more separated arrows. Start/end labels and the selected button provide non-color cues. These arrows follow GPS travel order; the separate wind overlay describes airflow.

The charts are the time control; there is no separate Explore track slider or interval-lane control. Hover updates the shared cursor and map point. Click/tap opens a timestamp-prefilled annotation editor; explicit start/end fields allow interval notes. Focus any chart and use arrows for one second, Shift + arrows for ten seconds, Home/End for elapsed limits, and Enter/Space to annotate. Initial selection uses the first valid GPS point. Gaps and pauses show no map point and an explicit GPS-unavailable message. Summary-only sessions retain a manual annotation action. Drag selection, timeline zoom, observation-by-observation weather, broad imports and full evidence editing remain deferred in root `todo.md`.

Discarded optional flows: outbound/return comparison, post-session check-in, next-outing focus pinning and video-link management. Evidence labels in the original technique workflow remain required.

## States required for the prototype

- Summary only: Aug 29 is present in storage but no supplied FIT.
- Unknown wind: Sep 5 has a daily summary, no session-time wind observations.
- Suspect early HR: Sep 5 and Sep 25 are flagged; exact affected intervals are unknown.
- Paused recording: Sep 20; show breaks without joining the route across missing telemetry.
- Best value without location: stored historical summary has speeds but no window boundaries.
- Empty goals or technique observations, loading, malformed file, unsupported file, duplicate file, ambiguous match, and storage errors.

## Accessibility and responsive behavior

All chart/map information needed for a decision must also be available in text or a table. Do not use color alone for selected windows or quality. Use labelled controls, visible keyboard focus, readable contrast, and accessible touch targets. Charts need units and a keyboard-accessible cursor/interval alternative. At narrow widths, put summary then map/window controls then charts in reading order; avoid page-wide horizontal scrolling. Reduce motion when requested by the system.

## Design review tasks

Use the real Sep 25 summary and track for the main state; also inspect Sep 5 missing weather and Aug 29 missing track. A reviewer should be able to locate a selected interval, identify whether wind is observed or unknown, explain a goal's duration, and distinguish a technique hypothesis from direct evidence without reading a manual.

## Minimal session header refinement

The title has a small chevron for session selection, retaining date, launch name, distance and active duration in the native picker. A small Edit icon opens a modal dialog containing the launch-point name and board selection, with an explicit Save/Cancel. Board defaults are optional shortcuts inside the dialog; board management remains on Boards. Escape/Cancel discard drafts and restore focus to Edit. The duplicated stored summary block is removed from Best windows; source values remain on Home and in analysis context. Summary-only sessions still explicitly show unavailable local windows.

## Compact left navigation

A fixed 64 px icon rail replaces the top bar, narrowing to 56 px on phones. Home, Sessions, Boards and ChatGPT share one vertical navigation group; Import FIT sits at the bottom. Every icon has an accessible name and a hover/keyboard-focus label; Escape dismisses labels. Active pages use a filled icon, tinted background and edge marker. The content begins at the top of the viewport. Touch targets stay 44 px, and very narrow screens stack best-window controls and use two metric columns. URL navigation, session context and the Edit dialog are unchanged.

## Best-window row refinement

The map spans the full content width, with 5/10/20-minute controls in one compact horizontal row directly underneath, including on phones. Each control retains duration, speed and exact interval times; missing tracks show disabled controls. The section heading, local-estimate eyebrow, explanatory paragraph and map-direction help caption are removed. Local FIT provenance remains in the accessible region name and documented metric contract. Missing GPS is a conditional map status. Selection still synchronizes the map and charts.

## Compact metric panel

Desktop session review places key metrics in a bordered panel to the right of the map and its best-window row. The selected design combines option 2's General and Performance pairs with option 3's three-column Speed band. General shows distance and active duration above their labels; Speed shows maximum, average and median together with a shared visible mph unit; Performance pairs average heart rate and cadence above a full-width distance-per-stroke row. Semantic definition lists retain a unit for each speed value for assistive technology. Distance per stroke remains labelled “est.” and elapsed time appears separately when it differs from active time. Source/method descriptions accompany the values; missing metrics remain visible as an em dash with an accessible “Unavailable” label.

At 900 px and below the panel stacks after the map, retaining the three topic groups and horizontal speed comparison. Text may wrap at the smallest widths. Removed chart pointer instructions and repeated context/focus help paragraphs; chart keyboard instructions remain available to assistive technology. Units, unavailable values, evidence labels and source-quality context remain.

## Session density refinements

Performance has one heading row with Annotate at the current cursor. Current telemetry appears in a pointer-positioned chart tooltip (also available on chart keyboard focus); the separate values row and repeated elapsed caption are removed. The wind digest reveals HR/wind quality and the source link on hover or activation, including summary-only sessions. A compact date beside the session title opens full date/time/source details. The app footer is removed. Existing chart keyboard and annotation actions remain available.

## Session management refinement (2026-09-27)

Custom interval refinement (2026-09-28): a non-empty manual chart range reveals Add interval in the existing Performance actions. Shift-click or Shift-Enter/Space extends a pinned point in either direction; Choose interval end makes the next click/tap/Enter extend it without a modifier. Before saving, the inspector and map/chart highlight use the sorted manual bounds. Saving adds and selects a persistent custom tile; choosing a saved/best tile clears the manual draft. Point-only selections have no Add action. Multiple tiles share the existing strip with contained horizontal scrolling, keyboard focus and separate labelled removal controls. Fixed best windows and custom tiles show interval-specific TCS with shared score colors; component values, eligible coverage and missing reasons remain in accessible metric details. Experimental status is documented in the TCS contract.

Training focus and the separate context panel are removed from session review for now. The existing Edit session dialog holds source notes and additional observations, saved atomically with name and board. Deletion requires confirmation inside the dialog and navigates to a remaining session, or Home when empty. Original uploads/provenance remain privately archived; re-upload is permitted. Saved legacy goals and technique reports remain preserved for compatibility.

The top row has previous (older) / next (newer) controls, disabled at the ends. A single session-selection popover contains full date, local start/end, explicit timezone, distance, active duration, type and source availability. The separate info disclosure is removed. Home includes maximum speed in cards, table and chronological trends using the same FIT maximum as session review, with nulls kept as gaps.

Interval tiles replace start/end text with time-weighted interval cadence and distance per stroke. Missing interval stroke distance now calculates lazily as a labelled cadence-integral estimate, with matched coverage and missing-data rules; whole-session stroke distance is never substituted. Map/chart interval boundaries remain unchanged.

At 1400 px and wider the navigation expands to 168 px with persistent section names. Smaller widths retain the compact icon rail and focus/hover labels; vertical footprint is unchanged.

Chart selection now persists independently of the hover/keyboard cursor. Click/Enter/Space pins a point; Annotate uses that point until cleared. The map shows a light current dot and outlined selected dot; charts use a solid light cursor and dark dashed selection. Selection resets when switching sessions. Gaps have no interpolated map marker.

Shift+Click extends the pinned point to an interval, including backwards selection. Shift+Enter/Space is the keyboard equivalent. The Annotate action prefills sorted bounds. The editor offers explicit Point/Interval modes and editable bounds for touch users; point mode saves equal start/end timestamps.

The current metric inspector places heart rate below speed/cadence, and estimated stroke distance in the properties list (exchanged positions). Coverage, HR quality and partial DPS labels remain visible.

Best-window travel markers are now 6 px wide chevrons within the selected track, without duration badges. Up to 39 candidate positions use 14 px screen spacing; zoom reveals more arrows. The selected tile and boundary hints retain duration labels.

The session picker initially lists the latest ten. Search covers the complete stored history by launch/source location, date or stable ID, including older sessions. Empty results and result counts are explicit; Escape returns focus to the picker.

Home now presents its chronological trend above the latest-ten grid, in both desktop and phone reading order.

Goals is a configuration page exposing all existing metrics without an add dropdown. Inline targets and current best results sit in ordered Active/Inactive buckets. Up/down and Activate/Deactivate buttons support pointer, touch and keyboard use, preserving focus after movement. Unset goals start inactive; saved settings and results remain visible when inactive. Current best uses all history and links to its source session. Home shows only active, set targets as light dashed lines and text labels; its cadence options also exclude inactive/unset targets. This does not restore the removed training-focus panel or next-outing technique pinning.

Import uses a two-step Choose file / Review & save dialog, with a native accessible file chooser, filename/size confirmation, centered route preview and grouped distance/time/sensor metrics. The phone modal scrolls internally; action buttons wrap. Existing duplicate, candidate, missing-data and error behavior is retained.

Full-route travel direction uses faint white chevrons within the existing line, with at least 38 px separation and a 160-marker cap. Each continuous GPS run is handled independently; pauses, missing GPS and stationary geometry produce no connecting arrow. They sit beneath selected-interval highlights, have no pointer or keyboard interaction, and add no vertical space. GPS direction does not require recorded distance.

Click, tap or keyboard-activate a detected-event diamond to pin its start/end on the timeline and map and open the existing annotation editor. The draft defaults to an approximate note and displays candidate evidence separately. It is saved only after the athlete supplies an observation; detected possible falls are never automatically promoted to reported falls. Hover/cursor movement leaves the range fixed; Cancel leaves it selected for later use.

## Goals refinement (2026-09-30)

Goals is read-first: compact rows with a small category icon, title/scope, best result, target and overflow menu. Active/Inactive headings share column labels. Editing opens one modal; methods and evidence stay behind an explicit disclosure. Reorder is an explicit temporary mode, with labelled keyboard-accessible up/down controls. Menus hold Move to active/inactive, View best session, and Record practice for turns/footwork. Phone rows keep best and target side by side below the title. No default inline forms or repeated explanatory paragraphs. All eleven goal types remain directly discoverable. Targets, conditions, source boundaries and practice observations follow [goals.md](../engineering/goals.md).

An info button on each goal opens a short, plain-language calculation hint without opening its editor. Hints support touch and keyboard use, close with Escape or outside interaction, and fit the viewport on phones. The same explanation appears in the editor’s measurement disclosure; the page keeps its compact row height.
