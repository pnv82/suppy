# Retired historical source mapping

Google Sheets ingestion and writeback were retired by the SQLite migration. This file remains only so historical links and provenance can be understood. No implementation should fetch, refresh, edit or require a spreadsheet.

The original four summaries were migrated once, joining string session IDs to the supplied FIT inventory. Original ranges, headers, raw values, source URL, capture metadata and SHA-256 remain in SQLite's tenant-scoped session_sources archive. Original snapshot and Garmin files are preserved unchanged outside public assets and commits.

Active summaries use SI storage: miles × 1609.344 → metres; mph × 0.44704 → m/s; minutes × 60 → seconds. Unknown values remain null; active/elapsed time stay separate. Historical best-window speeds retain unverified methods and missing boundaries. Source URLs are evidence, never actions to perform.

Current contracts and operations are in [data-model.md](data-model.md) and [storage.md](../engineering/storage.md). Future reviewed-analysis ingestion writes versioned results into app storage after validation and review.
