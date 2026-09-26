# External analysis contracts

`analysis.schema.json` uses JSON Schema draft 2020-12 and version 0.1.0. It validates one analysis run, its source references, summary, 5/10/20-minute windows, conditions, events and technique observations. Unknown object keys are rejected to surface spelling/schema drift.

JSON Schema does not enforce all relationships. Also check unique IDs, resolved source refs, interval bounds, exactly one window per duration, end−start duration, dictionary version/IDs, evidence appropriate to observation status, and daily weather without fabricated times. `scripts/validate_foundation.py` applies these semantic checks to the included example.

When changing issue IDs or fields, update the dictionary, schema, prompt, example and validator together. Avoid breaking changes without a schema-version bump and an explicit migration note. The model for future app entities is in [data-model.md](../docs/data/data-model.md).
