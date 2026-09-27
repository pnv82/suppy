# Verification

Run `npm test` for numeric/domain tests, MCP HTTP integration and starter packaging. Run `npm run build` before the MCP resource test so the embeddable UI is available.

The tests exercise continuous timed windows, pauses/gaps and boundary interpolation; automatic latest-10 selection; annotation validation/edit/delete and fresh context; technique IDs; a real MCP handshake/tool/resource flow; shared REST state; and cross-site write rejection.

Use browser acceptance checks for map/timeline linking, annotation and goal forms, prompt preparation, comparison, keyboard cursor behavior, responsive layout and missing-data states. Evidence is recorded in root `design-qa.md`. Do not add tests that only repeat JSX markup.

Deferred cases (broader FIT decoding, locale/schema drift, real ChatGPT account flows, large histories) are in root `todo.md`.

Storage tests verify restart persistence for every edit category, durable deletion, SI/null conversion, backup/restore, composite foreign keys, transaction rollback, fresh reads from separate connections, empty tenants, schema-version rejection, and tenant isolation through REST, MCP structured output and UI metadata. They use synthetic fixtures and temporary databases only; no personal history, Google Sheets files or production database is needed.
