# Google Sheets ingestion contract

The provided Sheet is a **read-only source for this foundation**. The following mapping and extension plan do not authorize modification. Start the prototype using the saved snapshot, then add an adapter for a refreshed snapshot or approved connector access. No credentials or public-sheet publishing are required.

## Existing tabs

Join all rows with `Session ID` (string). Map by exact header name, not column position. Preserve unknown columns in raw metadata; a missing required header is an explicit adapter error.

| Source headers | Canonical mapping |
|---|---|
| Session ID; Date; Start; End | session_id; local_date; original local time strings. FIT provides precise start_time_utc when attached |
| Duration min | active_duration_s = value × 60; not elapsed duration |
| Distance mi; Avg speed mph | distance_m = value × 1609.344; source_avg_speed_mps = value × 0.44704 |
| Best 5m/10m/12m/20m/30m/60m mph | BestWindow duration 300/600/720/1200/1800/3600 s, converted speed; status `value_only`, basis `legacy_unspecified`, null boundaries |
| Avg HR bpm; Max HR bpm | summary HR in bpm, retain HR quality |
| Avg cadence spm; Max cadence spm | source-labelled stroke cadence; retain raw label and semantic verification state |
| Start lat; Start lon; Location | summary start coordinate/location; never construct a whole route from one point |
| Weather station; Temp °F; Wind mph; Wind dir ° | station; (F−32)×5/9; mph×0.44704; wind-from bearing |
| Conditions; Weather quality; Weather notes; Weather source URL | original condition text, provenance and quality; do not collapse daily-only into observed hourly wind |
| Session type; Notes | source text; keep original values even when a display category differs |
| RPE 1–10; Back pain 0–10; Upper-arm pain 0–10; Pain onset min | optional athlete report. Convert onset to elapsed seconds only after confirming its time basis; symptoms do not prove a technique cause |
| Paddle length in; Paddle model; Falls; Interruptions; Water/chop | optional gear/context; length metres = inches × 0.0254; unknown counts are null |
| HR quality; Benchmark quality; FIT/ZIP source | source quality labels and file reference; file reference is not an instruction or download URL |

`Weather Observations` supplies separate observations. Combine Date + Obs local time using the workbook timezone only for timestamped rows. A missing local time in the daily summary remains missing; do not assign midnight as an observation time. `0` wind with null bearing is calm, not missing speed. Retain `Raw METAR / summary` and the original source URL.

`Dashboard!B3` supplies the displayed 5 mph target. It is a reference until duration/conditions are explicit. Dashboard results are presentation, not a second source of independent session data.

## Proposed extension tabs

Keep the existing tabs intact. On a later authorized edit, add flat tables with one header row and one entity per row:

| Tab | Minimum columns |
|---|---|
| Analysis Runs | Analysis ID, Session ID, Schema version, Generated UTC, Analyst, Status, Input FIT SHA256, Source refs JSON, Limitations JSON |
| Best Windows | Analysis ID, Session ID, Duration s, Status, Basis, Start elapsed s, End elapsed s, Mean speed m/s, Source refs JSON, Reason |
| Session Events | Analysis ID, Event ID, Session ID, Kind, Start elapsed s, End elapsed s, Timing quality, Note, Source refs JSON |
| Technique Observations | Analysis ID, Observation ID, Session ID, Issue ID, Status, Start elapsed s, End elapsed s, Evidence refs JSON, Note |
| Goals | Goal ID, Metric, Scope, Window duration s, Target value, Unit, Comparator, Deadline, Conditions |

Extend Weather Observations only as needed with Observation ID, Observed UTC, Coverage start/end UTC, and provenance/quality details. The dictionary can remain versioned JSON in the repository; the sheet stores only issue IDs and observations.

JSON arrays in cells are plain text data. Treat strings beginning with formula markers as literal text when an authorized write is implemented. Do not let external LLM output become spreadsheet formulas or executable HTML.

## Review and refresh

Validate the external result locally → review evidence and missing fields → update an authorized Sheet/copy → snapshot exact tab names/ranges and retrieval time → load via adapter → show a source/snapshot badge. Preserve analysis versions and select the latest reviewed run explicitly; do not silently merge contradictory runs or use “last row wins”. Snapshot mode should work offline; connector failure must not erase the last usable data.
