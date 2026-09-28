# Metrics UI design proposal

Status: **selected direction implemented**. The user chose option 2’s interval properties/details and option 1’s clean chart interval highlight; option 3 was rejected. Home defaults to best-20-minute metrics with a whole-session switch. Experimental zig-zag and descriptive drift were explicitly authorized after the exploration.

Companion: [revised metrics plan](../product/key%20metrics.md). Methodology, scope and unavailable rules there govern the eventual UI. Generated image text/geometry is illustrative and does not define calculations or source data.

## Selected implementation

The [combined target](concepts/metrics-selected-target.png) consolidates the selection. It is an illustrative visual reference, not athlete data. The running app uses the existing Leaflet map and Recharts plots, a Session / Selected interval inspector in the existing right-side space, accessible metric-details and drift dialogs, and a cadence/DPS switch in the third chart lane. Drift does not replace the chart with option 3’s table.

The session list has compact columns for speed at cadence, estimated m/stroke, experimental zig-zag with coverage, and HR; distance, duration and board stay with session identity. Default scope is the best continuous 20 minutes. Whole-session scope is explicit; missing interval data is not silently replaced. Synthetic browser QA and remaining limitations are in [design-qa.md](../../design-qa.md).

The three alternatives below are retained as the historical exploration. Their earlier staging restrictions are superseded by the user’s implementation authorization and the [current method contract](../engineering/performance-metrics.md).

## Design brief and references

An athlete reviewing a Garmin SUP session should immediately see sustained speed at recorded cadence, estimated ground distance per stroke, and the amount of supporting evidence. Deeper analysis should be available without increasing persistent vertical space.

Use the current session review: compact left icon rail, launch-point title/session navigation, map, grouped session overview, horizontal 5/10/20-minute controls and synchronized charts. References inspected directly: the existing grouped-overview screenshot in private local QA output and [selected light direction](references/selected-light-ui.png). The mockups use illustrative values; no new session analysis has run.

Use existing Inter/system typography and CSS colors: white background, navy `#12283f`, muted `#63788d`, teal `#008591`, dividers `#e0e7ed`, pale surface `#f4f8fa`. The yellow tint in a QA capture is not a new palette. Keep the left rail as the only primary navigation; do not revive the older horizontal navigation in the original reference.

## Shared placement rules

| Surface | Proposed treatment | Scope and safeguards |
|---|---|---|
| Best-window tiles | Headline speed at cadence; second line estimated metres/stroke | The same selected 5/10/20-minute interval drives map/charts. Partial cadence support is explicit; retain speed if cadence/DPS are unavailable |
| Session overview | Keep General/Speed groups; group cadence and DPS, with HR distinct | Label whole-session scope; never replace with interval values without a visible scope switch |
| Performance charts | Allow cadence/DPS selection in an existing lane, or switch the existing region's analysis mode | No fourth permanently stacked chart. Retain synchronized elapsed axis, gaps and keyboard cursor |
| Metric details | Scope, alternate units, coverage, calculation basis and reason if unavailable | Hover is a convenience; focus/tap/click also work. Essential estimate/partial/unavailable labels are always visible |
| Later matched-window analysis | Explicitly opened view in existing space | Show matching basis, exact early/late intervals, support and confounders. One pair is descriptive; it is not a session fatigue diagnosis |
| Map | Full route plus only selected best-window emphasis; compact weather disclosure | No added below-map conditions section. Route/annotations and unavailable GPS remain distinct |
| Home | Keep automatic latest-10 trends; add eligible metric choices later | Do not present whole-session pairs as normalized benchmarks or color every increase as improvement |

Speed stays mph; DPS uses m/stroke. Example interval values are internally consistent rounded examples: 5.10 mph at 42 spm gives about 3.26 m/stroke; 4.84 at 40 gives 3.25; 4.66 at 38 gives 3.29. These do not specify actual measurements, goals or ideal cadence.

## Three alternative interaction models

### Interval first

The smallest change: strengthen the interval-tile hierarchy, keep the summary scope fixed, and switch the third chart lane between cadence and DPS. An explicitly opened metric popover gives matched support and alternate units without a new panel or row. Its clean interval highlight is part of the selected combined design.

Tradeoff: detailed interval evidence is distributed between tiles, chart readout and a popover. The summary must remain clearly labelled as whole-session data.

### Contextual inspector

The right-hand summary region has an explicit Session / Selected interval scope control. Selecting the interval view shows paired speed/cadence, DPS, HR, exact bounds and support in the same footprint. The full map and three-lane chart structure remain.

Tradeoff: easier evidence inspection, but whole-session values are temporarily out of view. A scope switch must be deliberate and obvious, with a direct return to the session summary. Merely moving the chart cursor must not silently change scope.

### Evidence on demand

The performance region offers Timeline / Compare windows after the drift stage is validated. Compare windows replaces the chart region with early/late measurements, matching basis, supported time and a compact interval locator. The selected best-window map remains separate from the comparison's exact time ranges.

Tradeoff: gives deeper evidence a clear place without extending the page, but hides the usual chart stack while open. Return to Timeline and Inspect windows must restore the relevant shared cursor/selection. A single matched pair is labelled descriptive, with neutral changes and visible condition limitations.

These are alternatives, not a requirement to combine all controls. The drift view belongs to a later stage, while core tile/DPS changes can ship first. Generated visuals are not pixel-perfect implementation contracts: any accidental duplicate navigation, decorative route geometry, altered weather, extra interval lane or source badge in an image must not override these written constraints.

## Interaction, missing data and narrow screens

- Selecting a best-window tile retains its exact interval and map/chart synchronization. Existing chart keyboard controls remain usable; this work does not silently implement the separate pending pinned-cursor proposal.
- Metric details open by labelled click/tap or keyboard activation; support Escape and focus return. Hover/focus may reveal alternate units, but never make essential information hover-only.
- Missing cadence: speed remains visible, cadence/DPS show unavailable with reason. Missing GPS: retain supported numerical evidence and show route unavailable. Partial support: visible qualifier and supported duration. Summary-only sessions retain summary values without invented timelines or interval evidence.
- HR-quality warnings remain visible. Unknown affected times do not become shaded invented intervals. Missing weather remains unavailable; illustrative mock weather is not a new observation.
- Low-speed evidence later appears as neutral markers in existing timelines, visually distinct from athlete annotations. No cause label is inferred and overlapping reports are not double-counted.
- Desktop retains map/summary columns. At 900 px and below follow existing stacked layout, keeping the three compact window controls readable; allow two-line values instead of shrinking typography.
- On narrow screens, detailed inspector/drift content opens in a dismissible overlay or replaces the existing chosen region. It never appends a permanent analysis block. Use a readable comparison table or early/late row pairs without page-wide scrolling.
- Selected state needs text/border cues as well as color. Touch targets remain at least 44 px. Charts have textual values and supported-time details; keyboard users can inspect and annotate without pointer movement.

## Generation briefs and artifacts

Built-in Image Gen was used for three independent desktop concepts at a requested 1440 × 1024 composition. Each received the inspected current-app screenshot as a visual reference. The first also received the original selected light design as style grounding. Date anchor: 2026-09-27 America/Los_Angeles; session date retained as 2026-09-25. All metric examples are illustrative.

The shared prompt brief requires existing Inter/white/navy/teal styling, left navigation rail, map-led layout, same-height window controls, clear session/interval scope, three chart lanes, readable units, no permanent vertical expansion and no speculative scores or fall labels. Per-concept direction:

- Interval first: emphasize speed/cadence and metres/stroke in tiles; show DPS selected in the cadence lane and a coverage/alternate-unit popover.
- Contextual inspector: replace the existing right panel's contents with selected-interval evidence; show unavailable wind, interval support and a method/details action.
- Evidence on demand: replace the chart region with one descriptive early/late matched pair, exact windows, neutral differences and an explicit unknown-current/wind limitation.

The generated studies are displayed in the chat and saved here in that displayed order:

1. [Interval first](concepts/metrics-interval-first.png).
2. [Contextual inspector](concepts/metrics-contextual-inspector.png).
3. [Evidence on demand](concepts/metrics-evidence-on-demand.png).

Their displayed order defines option numbers. The user subsequently authorized the combined implementation described above.

Visual review notes: the first study accidentally includes the older horizontal navigation in addition to the rail; retain only the rail. The third repeats a source weather reading alongside an unavailable state; the eventual UI must show one evidence-backed weather state. Large concept-name headings in studies two/three are presentation labels, not replacement session titles. The third study's tiles retain a separate cadence line; the written paired-value hierarchy remains the proposed default. Plot shapes, map geometry and illustrative support percentages do not certify real calculations. These details need correction in the selected design before implementation.

## Future implementation acceptance

Validate actual browser flows at desktop and narrow widths, including keyboard/touch details, all missing-data states and session/interval scope transitions. Check that the visible values share the intended support and units, and that no new persistent chart row has appeared. Zig-zag must retain its experimental label, coverage and limitations. Static mockups do not satisfy browser QA or prove that any feature is running.
