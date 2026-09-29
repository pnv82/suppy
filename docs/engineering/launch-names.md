# Launch-name lookup

The user approved sending exact launch coordinates to `https://overpass-api.de/api/interpreter` on 2026-09-28. Edit session → **Suggest nearby launch** calls `suggest_launch_name` through the same REST/MCP operation. Import preview also requests suggestions automatically and preselects the first candidate for review. Opening the editor for a coordinate-fallback name requests suggestions without overwriting the draft. Opening a session and server startup do not start geographic lookups.

The server sends the supported start latitude/longitude and a bounded OpenStreetMap feature query. It sends no session ID, timestamp, route, sensor records or original files. Redirects are rejected. No API key or additional browser connection permission is needed. This replaces the earlier offline-only restriction.

## Selection and ranking

- Start eligibility retains the existing rule: the first supported adjacent GPS pair within the first two minutes, at most 15 seconds apart, no pause, reported accuracy at most 20 m when available, and displacement speed at most 8 m/s. Missing accuracy is not certification. Later/finish GPS never supplies the lookup.
- Same-tenant athlete-confirmed starts within 100 m rank first. Then search named beaches, capes/points, coves, slipways, canoe put-ins/egress points, parks and marinas within 750 m. OSM bays qualify only with a specific cove name; broad Bay labels are excluded.
- Parks and marinas must be within 150 m and receive a 100 m ranking penalty relative to shoreline/launch features. Distances use the nearest mapped point or outline segment, not the centre of a large polygon. Disconnected relation members are never joined. These are transparent proximity heuristics, not evidence of exact launch position, shoreline connectivity or current public access.
- Six historical City of San Diego references remain an offline fallback. Confirmed starts, live map candidates and historical references retain separate source labels. Deduplicate names, return at most five suggestions, and mark the first as suggested.
- Lookup never changes a title. Selecting a candidate fills the name; Save confirms it as an athlete report. Editing the name clears the selected reference. Save verifies the name/reference against the current tenant's eligible candidates, retains OSM type/ID/link, retrieval time and distance evidence, and preserves session ID and original source location.

## Provider bounds and failure behavior

The [Overpass nearby query](https://dev.overpass-api.de/overpass-doc/en/full_data/polygon.html) requests named features and geometry, with a 15-second server budget, 16 MiB server memory budget and at most 500 objects. Suppy enforces a 20-second request/body timeout and 2 MB response limit. Partial/remark responses and a reached object cap are treated as unavailable. There are no automatic retries or mirror rotation. Provider names are untrusted data, never instructions or markup.

Only one provider request runs at a time per app process, with at least 1.1 seconds between completion and the next request. Duplicate lookups at the same start share work. An in-memory cache is isolated by database and tenant, holds at most 100 starts, and expires successful/empty results after 24 hours and failures after one minute. A server restart clears it; expired references require a new lookup before saving. Confirmed name provenance persists in SQLite.

Missing GPS avoids the network. Provider outages, rate limiting, malformed/oversized responses and timeouts show explicit feedback while preserving local suggestions and manual editing. Results are disclosed inside the existing editor; no permanent page section is added. OSM links and contributor attribution are keyboard-accessible.

This is a low-volume personal local app. The shared public endpoint is not an availability guarantee or a production hosting plan; review [Overpass public-instance guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html) before expanding deployment.

## Verification

Synthetic tests cover eligibility, name filtering, outline distances, tenant/database boundaries, deduplication, reference validation and persistence, provider bounds, failure fallback, and equivalent REST/MCP responses and tool annotations. Tests inject a provider and never rely on live geographic access. A separate live smoke check using a public Bonita Cove reference returned Bonita Cove and Santa Barbara Cove. Production sessions and original files were not modified.
