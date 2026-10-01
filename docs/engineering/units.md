# Grouped display units

Settings (`?page=settings`) offers four independent choices, rather than one control per metric. Changes apply after Save changes. Restore defaults updates the form; saving persists them.

| Group | Options | Default | Applies to |
|---|---|---|---|
| Speed | mph, km/h, m/s | mph | Paddling speed, goal targets and comparison pace, wind and gusts |
| Distance | mi, km | mi | Session/import distances, station distance and map scale |
| Length | m, ft | m | Distance per stroke, short tracking measurements and nearby launch distances |
| Temperature | °F, °C | °F | Weather and temperature changes |

Time, cadence, heart rate, angles, percentages and scores retain their existing units. Leaflet uses the selected distance family and naturally switches from miles to feet or kilometres to metres at close zoom levels.

`src/domain/units.mjs` owns conversions and labels. Values entering the formatter are SI (temperature is Celsius, as in the weather contract). One mile is 1609.344 m, one foot is 0.3048 m, and one mph is 0.44704 m/s. Temperature changes use only the scale factor, without the absolute-temperature offset. Missing/nonfinite values stay unavailable, including in alternate-unit text.

`UnitsProvider` applies dashboard preferences to the whole app. `Measure` renders primary values with a native hover title containing the other supported units and hidden alternate text for screen readers. Custom goal rows/inputs, wind summaries and map scale expose equivalent hover titles. Chart series, axes and hover readouts use selected units; secondary tooltips do not nest another tooltip. Existing keyboard-accessible metric details remain available. Hover titles follow the browser's native delay and do not add focus stops or permanent controls.

Preferences apply to Home, session review and selectors, interval tiles, metric/drift details, Goals and their editors, comparison charts, weather summaries/observations and wind entry, import previews, Garmin activity distances and launch suggestions. Goal thresholds and achievement/progress comparisons remain SI. Editors convert typed values to SI, preserving the original precise target/pace when its rounded displayed value is unchanged. Displaying or changing units never rewrites stored session measurements, revisions or goal targets.

## Persistence and tools

Schema 6 adds `preferences.units_json` per tenant, with `{}` resolving to the existing defaults. The default-board preference is independent. `set_unit_preferences` accepts exactly:

```json
{"units":{"speed":"mph","distance":"mi","length":"m","temperature":"F"}}
```

All four groups are required. Unknown keys or units are rejected before mutation. The operation runs within the tenant-scoped transaction and is marked mutable/idempotent in MCP. HTTP dashboard, `get_dashboard` and tool-result `_meta.appData` expose normalized `units`. Tenant identity comes from the trusted request resolver, never from preference arguments. Refresh retrieves preferences saved by another client; there is no new live-push channel.

The existing presentation DTO still labels its stored-summary adapter values in mph/miles; raw telemetry and evidence stay SI. UI components convert those adapter fields back to SI at the display boundary before formatting. External LLM evidence/tool contracts retain their explicit units, with preferred display units provided separately in the dashboard. No source FIT, weather provenance or historical summary is reinterpreted.

## Validation

`tests/units.test.mjs` covers conversion round trips, defaults, null/zero handling, temperature deltas, alternate labels, goal values and scopes, Settings routing, schema upgrade, tenant isolation, reopen persistence, unchanged session rows/default board/targets, strict input validation, and HTTP/MCP agreement. Browser QA uses an isolated synthetic database; see `design-qa.md` for viewport and interaction coverage.
