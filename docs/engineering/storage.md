# Persistent storage and tenant boundaries

SQLite is the app's source of truth. The server requires Node.js 24+ and uses its bundled `node:sqlite` module, with no database daemon or native npm addon. See the [Node SQLite API](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html). Schema version 5 is created/migrated transactionally; newer unknown versions fail without resetting the database. Migrations belong in `server/database.mjs`. Version 2 adds immutable FIT upload provenance and byte storage. Version 3 adds immutable weather response provenance per tenant, session and attempt. Version 4 adds private deletion archives; version 5 adds tenant-scoped SI goals. Existing sessions and edits are preserved.

## Files and environments

`npm start` defaults to `data/storage/production.sqlite`. `npm run dev` sets `NODE_ENV=development` for its server and uses `data/storage/development.sqlite`. `SUP_DB_PATH` explicitly overrides either path (relative paths resolve against the working directory). SQLite files and their WAL/SHM sidecars are ignored by Git and never served as client assets. Use a persistent local disk/volume with appropriate OS permissions. A static Sites worker cannot host this Node/SQLite backend.

An empty database starts with no sessions or boards. There is no automatic seeding from personal files and no Google Sheets integration. Weather fetches run separately after FIT commit or on explicit refresh; startup never fetches weather. The original four summaries and three detailed tracks in this workspace were migrated once into the production `local` tenant. A saved recovery snapshot also restored the existing board/default and two timed annotations, keeping their IDs and revisions. Historical ranges, source URLs, capture metadata, SHA-256 and raw track/timer data remain archived inside `session_sources`; original FITs/ZIPs remain unchanged. Those historical references are provenance only. Startup, tests, and normal use do not read the old snapshot or derived files.

For a separate synthetic development history, in PowerShell:

```powershell
$env:NODE_ENV = "development"
npm run db -- seed-demo
Remove-Item Env:NODE_ENV
npm run dev
```

Seeding refuses a populated tenant. Tests use isolated in-memory or temporary file databases and synthetic inputs from `tests/fixtures.mjs`; they never open the production path. An explicit `SUP_DB_PATH` is an operator override, so keep it unset when using default environment separation.

## Schema and transaction rules

Custom interval selections live in each session's JSON aggregate as `customIntervals: [{id,start,end,source:"athlete_selected",created_at_utc}]`, with elapsed bounds in seconds. No new table or database reset is required. Add/remove operations read and validate the trusted tenant's current session inside the existing transaction, increment its revision and retain all telemetry, annotations, best windows and original uploads. Duplicate bounds reuse the saved ID without advancing revision. Derived interval evidence is calculated on read and is not written as a new measurement. Normal SQLite backup includes these selections.

| Table | Ownership and data |
|---|---|
| tenants | String ID and creation time in UTC |
| boards | Composite `(tenant_id, id)` key; normalized name unique per tenant |
| sessions | Composite `(tenant_id, id)` key; local date index; board FK; revision; versioned-by-schema JSON aggregate |
| goals | Composite tenant/id key, explicit SI target, metric, cadence threshold and athlete-report provenance |
| preferences | One row per tenant with a nullable default board FK |
| session_sources | Immutable import provenance/raw payload per tenant and session |
| weather_sources | Immutable provider response/source metadata per tenant, session and attempt, with owning session FK; never returned by tools |
| fit_imports | Tenant-scoped immutable original upload/FIT blobs, checksums and decoder/source provenance; FK to the owning session |

Session aggregates contain summaries, records, pauses, display estimates, annotations, additional context, legacy contextual goals and technique selections. SI summaries and legacy goal fields are stored in `data_si`; the presentation adapter converts them to the mph/miles/minutes DTO. The separate Goals section stores tenant-wide SI targets in `goals.data_json`. Telemetry stays SI/UTC, with explicit IANA session timezone and original local time strings. Nulls and elapsed/active time remain distinct. Raw historical payloads retain their original units. Keeping complex track/annotation payloads together is deliberate for this small app; relational ownership and board references are enforced by SQLite.

Every mutation runs inside `BEGIN IMMEDIATE`/commit/rollback and reads the latest state inside that transaction. Session detail edits and board renames with affected revisions are atomic. Acknowledgements are returned only after commit. WAL, FULL synchronous mode, foreign keys, prepared SQL parameters and a five-second busy timeout are enabled. No stale process cache is used. Concurrent changes to different fields are preserved; competing edits to the same field are last committed write wins. Browser refresh retrieves another client's edits; live push and user-facing conflict resolution remain deferred.

## Multitenancy provision

All private rows and repository queries are tenant-scoped. Composite foreign keys prevent references to another tenant's boards or sessions, even when session IDs overlap. Dictionary entries are public, shared reference data. New tenants begin empty; history is never copied automatically.

The default local identity is `local`. An operator can provision another tenant:

```powershell
npm run db -- create-tenant athlete-two
$env:SUP_TENANT_ID = "athlete-two"
$env:SUP_PORT = "3002"
npm start
```

For a future authenticated multi-user host, `createHttpServer(undefined, { database, resolveTenant })` accepts a trusted asynchronous request resolver. It must validate authentication and return a pre-provisioned tenant ID. Missing, invalid or unknown identity is denied; there is no fallback to `local` when a resolver is installed. REST and every stateless MCP request use this same boundary, including model results and UI metadata. Tool schemas reject extra tenant arguments; query parameters and unverified headers cannot select a tenant.

This provision is data isolation, not a login system. The standalone server still binds to loopback and trusts its configured tenant. Everyone who can reach that local endpoint has access to that tenant. Separate private endpoints may use the same database with different configured tenants; public multi-user deployment needs authenticated identity resolution and authorization before exposure. No tenant selector or tenant-creation HTTP/MCP tool is provided.

## Backup, restore and maintenance

```powershell
npm run db -- check
npm run db -- backup C:\backups\sup-2026-09-27.sqlite
```

Backup uses SQLite's online backup API, includes all tenants and provenance, and refuses an existing destination. Treat the result as private user data. Do not copy only the main file while the app is running: committed pages may still be in the WAL. For restore, stop every process using the database, keep the old database/sidecars as a separate recovery copy, and point `SUP_DB_PATH` to a fresh copy of the backup. Run `check`, then start the app. Do not restore over live sidecars. No schema reset or destructive reset command is provided.

`openDatabase().importState()` is an internal operator/bootstrap helper used by synthetic fixtures and the completed local migration; it is not a public arbitrary-result ingestion contract. It inserts only into an empty tenant within one transaction. Validated FIT uploads use [preview/commit import tools](fit-import.md) and store source blobs in the same database, so normal backup includes them. Reviewed LLM-result ingestion with full schema validation/versioning remains deferred. All ingestion writes target the app database, never a spreadsheet.

## Session deletion

Schema v4 adds private deleted-session and deleted-FIT archives. `delete_session({session_id})` transactionally archives the selected tenant's complete session, source/weather provenance and unchanged original/FIT bytes, then removes active session and import rows. Boards/defaults remain. The upload can be imported again, including with the same generated ID. Archives are included in backups but excluded from app queries and duplicate matching; there is no UI archive restoration flow. Source files on disk remain untouched. The tool is marked destructive and writable in MCP.

`update_session_details` accepts optional `note` (up to 4000 characters) alongside name/board, committing all three atomically. Omitting note preserves existing observations.
