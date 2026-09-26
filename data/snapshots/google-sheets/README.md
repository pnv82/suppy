# Read-only Sheet snapshot

`source-snapshot.json` stores the observed workbook metadata, bounded ranges, source URL and UTC capture time. It is an input fixture, not a live connection. It was captured through the Google Drive/Sheets connector without source writes.

Snapshot ranges: Sessions A1:AP8; Dashboard A1:T25; Weather Observations A1:T10; Data Dictionary A1:J60. See [data audit](../../../docs/data/data-audit.md). Trailing allocated rows were not exhaustively scanned. Refresh deliberately and preserve the source timestamp; do not silently label these values current.
