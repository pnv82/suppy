# Input adapters

The FIT adapter is implemented in `server/fit-import.mjs`, where bounded original files enter Garmin's official SDK. It returns normalized domain records, timer events, measured summaries, provenance and explicit validation errors. Synthetic encoder inputs live in `tests/fit-fixtures.mjs`. No credentials, model calls or network enrichment belong in this adapter.
