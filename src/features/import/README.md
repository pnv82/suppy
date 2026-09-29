# Local activity import

`src/components/ImportDialog.jsx` previews user-selected SUP FIT/one-FIT ZIP files through shared REST/MCP tools. `src/services/fit-import.mjs` encodes the upload; `server/fit-import.mjs` validates and decodes with Garmin's SDK. Preview sends the file to the configured app server without persisting it. Explicit commit preserves original bytes, provenance, deterministic evidence and tenant-scoped identity in SQLite. See `docs/engineering/fit-import.md`.

`GarminPicker.jsx` adds direct personal-account import inside the existing modal. Sign-in is local REST only; safe MCP tools browse/preview/commit after connection. The server Garmin adapter/service holds expiring account and original-file previews in memory. See `docs/engineering/garmin-connect.md`.
