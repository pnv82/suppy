# Offline developer utilities

Install the pinned utility dependencies into a project-local virtual environment (validated with Python 3.12). Calling its interpreter directly avoids shell activation requirements:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r scripts/requirements.txt
.\.venv\Scripts\python.exe scripts/validate_foundation.py
```

Both scripts resolve paths from their own location and use the selected interpreter's installed packages. The retired `.tools/python` package directory is no longer injected into Python's import path. `.venv` is ignored by Git.

`inspect_samples.py` verifies the three supplied one-FIT archives, decodes with Garmin's SDK, checks integrity and regenerates derived telemetry/inventory. Run it only when those derived files need regeneration; ordinary validation is read-only:

```powershell
.\.venv\Scripts\python.exe scripts/inspect_samples.py
```

It does not analyze training or download weather. The parser output retains unknown-channel information in the inventory counts, not a full vendor-data export. Neither utility reads Google Sheets or changes SQLite data.

`validate_foundation.py` checks the example contract, relational constraints, dictionary IDs, original/derived file provenance, session joins and local Markdown links. To validate a new external result alone:

```powershell
.\.venv\Scripts\python.exe scripts/validate_foundation.py --analysis path/to/result.json
```

Passing validation establishes structural consistency; it does not verify the truth of sources or coaching interpretations. New ingestion still needs adapter validation. These Python packages are offline developer utilities, not app runtime dependencies.
