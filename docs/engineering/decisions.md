# Decision log

| Date | Decision | Status / rationale |
|---|---|---|
| 2026-09-25 | Foundation first: folders, Markdown, data samples and contracts | Requested; no runnable web UI in this task |
| 2026-09-25 | External LLM analysis, reviewed results in Google Sheets | Requested; no in-app analysis backend |
| 2026-09-25 | Preserve raw Garmin archives and FITs separately | Implemented; traceable originals plus regenerable derived JSON |
| 2026-09-25 | Snapshot-first data access | Prototype assumption; works without authentication or changing the source Sheet |
| 2026-09-25 | SI domain units and UTC, imperial initial display | Prototype convention matching current Sheet presentation |
| 2026-09-25 | Elapsed continuous best-window policy with explicit gaps | Proposed analysis policy; historical values remain unverified legacy values |
| 2026-09-25 | Evidence-based technique vocabulary, no watch-only confirmation | Implemented in draft dictionary and schema; coach review remains open |
| 2026-09-25 | Frontend stack, visual design, chart/map library | Deferred to the UI task; avoid premature tooling commitments |
| 2026-09-25 | Extra features | User approved P03 (similar-session comparison) and P05 (timed annotations); discarded P01, P02, P04 and P06 |
| 2026-09-25 | UI exploration | User requested a few UI options; generate three independent concepts before choosing a visual target |

Update this file when a consequential choice is made. Do not interpret a draft technical default as user approval for a new product feature.

## Initial app decisions — 2026-09-26

- User selected light map-led concept 1 plus concept 2's timeline annotations.
- P03 now means automatic latest-10 trends. This supersedes manual two-session selection.
- User explicitly required a ChatGPT-native app with clear README connection instructions and fresh conversational analysis after notes/context changes.
- React/Vite + Leaflet + Recharts + Phosphor; local Node REST/MCP server for shared temporary state. This supersedes the foundation-only/no-service assumption.
- Best-window map/timeline locations use labelled local display estimates from actual FIT distance/time. Sheet values stay separate. Robust validation and costly analysis are deferred.
- The first file picker recognizes supplied samples by hash; decoding arbitrary new FITs remains explicit in `todo.md`.
- Secure MCP Tunnel is the documented private account-connection path. No account connection, public deployment or tunnel has been created by this build.
