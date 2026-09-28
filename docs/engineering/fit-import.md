# FIT import and deterministic evidence

The app owns ingestion, normalization, calculations and evidence retrieval, following [LLM versus app responsibilities](../product/llm%20vs%20app.md). ChatGPT interprets that evidence. No model is called during import, no inferred coaching fault is stored, and no spreadsheet is involved.

Weather retrieval is a separate post-commit operation in `server/operations.mjs`. The FIT decoder and synchronous commit have no provider dependency. Import returns without waiting for weather; retry, status and provenance are owned by the [weather service](weather.md).

## Supported input and validation

`server/fit-import.mjs` uses the [official Garmin JavaScript SDK](https://github.com/garmin/fit-javascript-sdk), pinned to `@garmin/fitsdk@21.217.0`. CRC/integrity checks and decoding must succeed. Exactly one activity file ID and one SUP session are required. Non-SUP and multisport activities are rejected. FIT start time and positive elapsed duration (at most seven days) are required. Missing optional sensors or GPS remain null; summary-only FITs are accepted. Missing, duplicate, decreasing or out-of-session record timestamps are rejected with a re-export message; records are never silently reordered.

Files are limited to 30 MB and 100,000 decoded messages. The narrow ZIP adapter accepts one flat FIT entry, stored or deflated, with matching CRC and declared lengths. It rejects additional entries, paths, encryption, symlinks, split archives and ZIP64. Inflation has an enforced 30 MB output limit. It never extracts to a filename on disk. For unsupported ZIP shapes, select the FIT directly.

SDK scaling converts measurement fields to SI; semicircle coordinates convert to degrees and invalid coordinate pairs become null. SDK profile expansion supplies SUP `totalStrokes`; the app does not fall back to generic cycles for measured totals. The separately labelled interval estimate integrates cadence as described below. HR-message merging is disabled so provenance remains record-based. Original bytes preserve richer, vendor and unknown fields even when the display adapter does not expose them.

FIT time is UTC. The user reviews an IANA display timezone, initially their browser timezone; UTC is the fallback. No timezone or launch landmark is inferred from coordinates. The first valid recorded GPS pair supplies a coordinate-based launch fallback, labelled `coordinate_fallback`; it is not proof of an exact launch site. A user-entered name is athlete reported. New IDs are `fit-<full FIT SHA-256>` strings; filenames never establish canonical identity.

## Preview and save contract

Both REST `/api/tools` and MCP expose:

- `preview_fit_import`: `filename`, `data_base64`, `timezone`. Decodes and calculates without persisting. Returns a checksum, summary, channel counts, quality flags, duplicate ID and candidate summaries. A simplified route is UI metadata only; its runs preserve gaps. The user reviews date, distance, route, timezone, name, board and any match.
- `commit_fit_import`: the same file fields plus `expected_sha256`, nullable `target_session_id`, nullable `board_id`, and optional `launch_name`. Revalidates bytes, checksum, identity and tenant-owned relationships inside a transaction before saving. Null target explicitly creates a new session. A target attaches only to a matching summary without an existing FIT. Default board preselection is a UI suggestion; the server assigns only the explicitly submitted board.

Exact FIT checksums identify duplicates within the trusted tenant, including renamed files and alternate ZIP packaging. Repeated imports return the original session without changing notes, board, title, revision or metrics. Confirmed alternate packaging is retained as another source blob. Historical migrated checksums are also recognized.

Candidate matching requires start time within 60 seconds (or the same local minute for a historical summary without UTC start) and distance within the larger of 2% or 100 metres. Candidates are suggestions, never automatic merges. The UI requires a choice if candidates exist. Attaching retains source summaries, source location, name, equipment, context, goals, annotations and original provenance; it adds measured telemetry and separately labelled derived evidence. Elapsed differences over 60 seconds or existing annotations outside the new elapsed duration reject attachment. Existing tracks cannot be replaced by this tool. Explicit creation remains available for distinct activities with similar measurements.

SQLite schema 2 stores immutable original upload bytes, uncompressed FIT bytes, SHA-256 checksums, original filename/archive member, import UTC time, decoder version, raw session/timer fields and zero-based half-open source record ranges in `fit_imports`. All keys, duplicate checks and foreign keys include the tenant. No original bytes are returned by dashboard/context tools or served as assets. Backups include raw uploads. Cancelled previews leave no stored files or sessions. Existing schema 1 data migrates transactionally on startup.

## Calculations and evidence

`src/domain/analysis.mjs` owns deterministic numerical calculations, versioned as `sup_deterministic_v2`, with separate computation-time metadata. Imports persist its output separately from device summaries and historical values. Context requests also calculate evidence for previously migrated sessions, without rewriting their history.

- Best 300/600/1200-second windows use `elapsed_continuous_v1`: piecewise-linear cumulative distance, exact elapsed boundaries, earliest tie within 1e-9 m/s, gaps at most 15 s, no timer pause, no distance reset or distance-implied speed over 8 m/s. GPS is unnecessary for a numeric window; the map uses only separate valid GPS runs. Unavailable windows include a reason. No sensor-accuracy certification is implied.
- Session and requested-interval speed, HR and raw cadence means/medians use left-held time weighting, clipped to requested boundaries. Both endpoints must be valid, ordered and at most 15 s apart; any edge overlapping a pause is excluded. Each channel returns covered seconds and percentage of the requested elapsed interval, with no endpoint extrapolation. Interval maxima use recorded samples in that interval, excluding pause interiors. Zero speed/cadence is valid; zero HR is unavailable. No supported weight returns null.
- Interval distance sums eligible distance segments and returns covered time plus distance/covered-time speed; this is explicitly different from a continuous best effort. Missing interval stroke distance is lazily estimated from matched distance and integrated cadence (`matched_distance_cadence_integral_v1`), with coverage and an explicit strokes/minute assumption. This is not a measured interval stroke count. See metrics.md for edge eligibility, zero and missing-data rules. Session stroke distance remains a watch estimate from explicit SUP totals.
- Timer stops preserve their first boundary until restart. If event-derived pause duration and elapsed-minus-active disagree by over 2 s, the entire interval is excluded from derived time calculations and flagged `timer_summary_event_mismatch`; device totals remain available. The synthetic exclusion is labelled `unresolved_timer_boundaries`, not a claim that the athlete paused throughout. Missing timer events are flagged; equal elapsed/active summaries can still support windows.

`prepare_analysis_context` now returns exact interval `evidence` computed over the complete stored records before its maximum-120-point illustration sample. It includes methods, units, coverage, current user context and source references. The LLM should use those values for calculations, and keep measurements, observations and hypotheses distinct. Its narrative or JSON output does not write back automatically. The existing external-analysis JSON schema remains a future, separately reviewed ingestion contract.

## Validation and remaining scope

`tests/fit-fixtures.mjs` generates synthetic FITs with Garmin's encoder. `tests/fit-import.test.mjs` checks decoding, CRC/ZIP bounds, gaps/pauses/resets, missing channels, weighting/interpolation, preview non-mutation, duplicates, candidate attachment, rollback, tenant isolation, original-byte checksums, backup/reopen, and shared REST/MCP behavior. Normal tests never read personal files or production databases. Browser QA uses an isolated database and synthetic activities.

The local UI and MCP transport are supported; actual ChatGPT file-selection availability and payload limits depend on the host and still require a live account check. Use the standalone local app if the host rejects a large file. Uploads are bounded but decoding runs synchronously on the local server; worker scheduling and streaming large telemetry are deferred. Multisport/other activity formats, replacing an existing track, advanced spike correction, validated interval stroke counts, GPS accuracy validation, environmental enrichment and reviewed LLM-result ingestion remain out of scope.

## Extended performance evidence (2026-09-27)

The current runtime method is `sup_deterministic_v2`. It adds shared speed/cadence support, experimental zig-zag, movement candidates, descriptive independent-window drift and a 30-second DPS chart series. Import also retains scaled fractional cadence/GPS accuracy and private lap/device/file-ID provenance. Fractional fields are preserved without guessing a cadence recombination. See [performance-metrics.md](performance-metrics.md) for formulas, gates, cache invalidation, source ranges and bounded model evidence. Old calculated methods are recomputed; no backwards compatibility layer or database reset was needed.
