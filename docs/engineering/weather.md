# Historical weather retrieval

Approved September 27, 2026. Weather is an independent app service, not a FIT decoder dependency or an LLM task. No model calls, forecasts, wave/current estimates, speed corrections or coaching conclusions are generated.

## Boundary and lifecycle

`server/fit-import.mjs` stays offline. `store.commitImport` commits FIT/session data synchronously. The shared REST/MCP dispatcher in `server/operations.mjs` then starts `server/weather/service.mjs` without awaiting the provider. Enrichment failure cannot roll back an import. Preview does not fetch; duplicate imports reuse successful weather. Existing sessions use `fetch_session_weather`; `get_session_weather` polls without provider requests. Both tools accept only a string `session_id`, resolved within the server's trusted tenant.

States are `not_requested` (implicit), `fetching`, `ready`, `partial`, `unavailable` and `error`. Each attempt has an ID, UTC start/finish and input location/time bounds. One in-process job per tenant/session deduplicates concurrent requests; refresh has a 30-second cooldown. The last successful `data` survives failed refreshes. Writes reread current state and check attempt identity, preserving concurrent notes/edits. There is no scheduled backfill or durable queue: interrupted jobs become explicitly retryable on the next status read. Polling does not navigate. Normal server shutdown drains jobs before closing its owned database.

## Provider and query

The [Iowa Environmental Mesonet ASOS/AWOS archive](https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?help) supplies routine/special METAR observations without an API key. The [public station catalog](https://mesonet.agron.iastate.edu/geojson/network/AZOS.geojson) is cached for 24 hours in memory. Requests are serialized at least 1.05 seconds apart, with a 20-second timeout each and bounded sizes (12 MB catalog, 2 MB observations, 10,000 observation rows).

The first valid recorded GPS point anchors station selection. Sessions require a UTC start and positive elapsed duration of at most seven days. Choose up to three stations within 50 km whose archives cover the activity date. Request their public IDs and UTC bounds from start minus one hour through end plus one hour, capped at current time. No filename, athlete notes, full track or exact athlete coordinates go to IEM. Future sessions, missing GPS, no nearby stations or no usable reports produce an unavailable state. Recent reports can be delayed; retry is explicit.

Choose the station with most wind-speed time coverage, then temperature coverage, then shortest distance. One station represents the whole session. Returned coordinates must match catalog coordinates within 1 km to prevent collisions between identical station IDs. Daily summaries/current forecasts never substitute for observations.

## Deterministic evidence

`server/weather/iem.mjs` validates CSV and normalizes to m/s, °C, percent and meteorological degrees **from** north, all in UTC. Knots convert by 1852/3600; Fahrenheit by `(F−32)×5/9`. Missing/out-of-range values stay null. Calm speed is zero with null direction; variable METAR winds retain speed with unknown direction. Duplicate timestamps retain the most complete row, with later rows winning ties. Normalized records retain raw METAR and one-based CSV source row numbers.

`src/domain/weather.mjs` implements `nearest_station_observation_v1`: nearest observation within 3600 seconds, earlier timestamp on a tie. Missing fields are not filled from other reports. Scalar summaries weight each observation by its nearest-time region clipped to session boundaries and one-hour support. Unsupported time is excluded from means but included in coverage denominators. Elapsed time includes pauses. Direction is a speed-weighted circular mean; resultant/vector-weight below 0.1 yields null. Each channel has independent coverage. `ready` means complete wind-speed time coverage; other channels can still be missing. `partial` retains available fields and actual coverage.

## Storage and presentation

Schema 3 adds immutable `weather_sources` keyed by tenant, session and attempt. Raw CSV, source/query metadata and SHA-256 response/catalog checksums are private. Parsed SI observations, summary, stations, method/policy, inputs, units and limitations live in the session's `weather` aggregate. Provider text is data, never instructions. Original FIT bytes, telemetry, workout calculations and historical wind summaries are untouched.

The presentation adapter converts retrieved wind to the existing mph DTO and exposes original summary fields as `legacyWeather`. Context includes weather evidence and uncertainty for external LLM interpretation; tools never return raw CSV. The UI shows mph/°F, distance in miles, UTC time, cursor-relative age, coverage, missing fields and an accessible observation table. The map legend remains an explicitly labelled session summary.

Airport observations are nearby context, not on-water measurements. Coverage describes timestamp support, not spatial accuracy. Provider quality control is limited; shelter, waves, currents and local gusts remain unresolved. Route-wide fields, stronger meteorological validation and public/authenticated hosting remain outside this slice.

## Validation

`tests/weather.test.mjs` uses synthetic CSV/catalog fixtures and isolated SQLite databases for normalization/nulls, calm/variable winds, circular averaging, ties/gaps, station ranking, provider failures, independent import completion, concurrent edits, deduplication/cooldown, persistence/provenance, tenant isolation and REST/MCP parity. Normal tests make no weather network calls. Browser QA uses a separate synthetic server; a live IEM smoke check verifies provider compatibility.

For `prepare_analysis_context`, the app also computes `weather_evidence.summary` over the exact requested UTC interval before the LLM receives context. Missing weather yields null; retained evidence after a failed refresh includes the current retrieval status and its original source timestamp.

## On-water adjustment and compact disclosure

The map widget opens only by explicit click/keyboard activation of its chevron summary; Escape closes it. Weather adds no section below the map. The bounded scrollable popover contains retrieval, cursor-linked station conditions, source/coverage, and the wind editor. Polling continues while the disclosure is closed, so imports still finish enrichment without opening it.

`set_session_wind` accepts `{session_id, wind: {wind_speed_mps, wind_from_deg, note} | null}`. Speed/direction may individually be null, but not both; speed is 0–80 m/s and from-direction is [0,360). Calm normalizes direction to null. Empty UI fields mean unknown. Reports have `source: athlete_reported`, `scope: session` and server UTC timestamps. They apply to the whole session, not inferred intervals; timed variations remain athlete annotations. `windAdjustmentHistory` retains saved reports and clear events. No schema migration is needed beyond schema 3.

An active report overrides summary wind in the map/comparison, labelled On-water report. Removing it restores retrieved station or original historical values. Station observations and raw source rows are never edited; refresh cannot erase the report. Context retains both, and `prepare_analysis_context.athlete_wind` is separate from calculated `weather_evidence`. Original summary fields remain available as `legacyWeather` even for sessions without retrieved weather. Reports work without GPS; station retrieval still requires GPS.
