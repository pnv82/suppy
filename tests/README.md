# Verification

Run `npm test` for numeric/domain tests, MCP HTTP integration and starter packaging. Run `npm run build` before the MCP resource test so the embeddable UI is available.

The tests exercise continuous timed windows, pauses/gaps and boundary interpolation; automatic latest-10 selection; annotation validation/edit/delete and fresh context; technique IDs; a real MCP handshake/tool/resource flow; shared REST state; and cross-site write rejection.

Use browser acceptance checks for map/timeline linking, annotation and goal forms, prompt preparation, comparison, keyboard cursor behavior, responsive layout and missing-data states. Evidence is recorded in root `design-qa.md`. Do not add tests that only repeat JSX markup.

FIT tests use Garmin's encoder to generate synthetic activity bytes and ZIPs. They verify integrity, bounded extraction, nulls, pauses/gaps, numerical evidence, immutable provenance, duplicates, matching, tenant ownership, backup and REST/MCP import. Broader activity formats, real ChatGPT account flows and large histories remain in root `todo.md`.

Storage tests verify restart persistence for every edit category, durable deletion, SI/null conversion, backup/restore, composite foreign keys, transaction rollback, fresh reads from separate connections, empty tenants, schema-version rejection, and tenant isolation through REST, MCP structured output and UI metadata. They use synthetic fixtures and temporary databases only; no personal history, Google Sheets files or production database is needed.

Custom interval tests verify several saved ranges, equal-duration identities, duplicate reuse, restart and tenant/session isolation, deletion, exact interval zig-zag versus session evidence, compact analysis agreement, missing sensors/GPS, short intervals, gap/pause coverage, supported map boundaries and external-summary reference invalidation. MCP integration verifies both writable interval tools share REST state. Browser checks cover selection, saving, scrolling, keyboard/touch alternatives, removal and missing-data states.
