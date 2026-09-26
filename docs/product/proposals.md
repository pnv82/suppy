# Additional feature decisions

User decision, **2026-09-25 America/Los_Angeles**: “P03, P05 - approved, others - discard.” P03 and P05 are now in scope. P01, P02, P04 and P06 are discarded; do not implement or re-propose them without a new user request.

| ID | Status | Feature | Smallest useful version |
|---|---|---|---|
| P01 | Discarded | Compare outbound and return legs | No dedicated leg-comparison feature |
| P02 | Discarded | Quick post-session check-in | No check-in flow |
| P03 | Approved and refined | Automatic latest-10 comparison | User refined this to automatically compare the most recent 10 sessions and chart key-parameter dynamics. Use all available sessions when fewer than 10 exist; preserve context and avoid normalized performance claims. |
| P04 | Discarded | One technique focus for the next outing | No next-outing focus/pinning feature; original dictionary and session observations remain in scope |
| P05 | Approved | Annotate interruptions and conditions | Select a chart point or interval; add/edit/remove an annotation with event type, note and timing confidence; keep prototype edits in memory |
| P06 | Discarded | Video evidence link for a technique observation | No video-link management UI; the domain evidence requirements remain valid |

The requested base MVP still includes quality labels, missing-data handling, map/chart linking, targets and the technique dictionary. These were not discarded by the decision on optional proposals.

Latest refinement: light/simple concept 1 selected; concept 2's timeline annotations are an explicit feature. Best 5/10/20-minute markers must be evident on both map and timeline. ChatGPT-native interaction and README connection steps are required. Costly analysis is deferred in root `todo.md`.
