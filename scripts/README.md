# Offline developer utilities

Install the pinned utility dependencies into a project-local directory:

```powershell
python -m pip install --target .tools/python -r scripts/requirements.txt
python scripts/inspect_samples.py
python scripts/validate_foundation.py
```

Both scripts resolve paths from their own location. `inspect_samples.py` verifies the three supplied one-FIT archives, decodes with Garmin's SDK, checks integrity and exports selected telemetry. It does not analyze training or download weather. The parser output retains unknown-channel information in the inventory counts, not a full vendor-data export.

`validate_foundation.py` checks the example contract, relational constraints, dictionary IDs, original/derived file provenance, sheet joins and local Markdown links. To validate a new external result alone:

```powershell
python scripts/validate_foundation.py --analysis path/to/result.json
```

Passing validation establishes structural consistency; it does not verify the truth of sources or coaching interpretations. The frontend will need its own adapter validation. Runtime dependencies for the future app are not installed by these commands.
