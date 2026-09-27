# Data layout

- `samples/garmin/`: supplied originals and extracted FITs; see the manifest.
- `storage/`: private production/development SQLite databases, ignored by Git.
- `snapshots/google-sheets/`: retired historical archive retained unchanged; no runtime or test dependency.
- `derived/`: regenerated local telemetry/inventory, intentionally outside Git.
- `reference/`: versioned curated dictionary; intended to travel with the source code.
- `fixtures/`: historical contract examples; runnable tests/development use synthetic `tests/fixtures.mjs`.

The original samples and snapshot include location and personal activity data and are ignored by Git. The example fixture includes real summary values and session references, but no route coordinates. If publishing the repository later, review source-bearing documentation/fixtures and substitute synthetic examples as appropriate. No publication is part of this task.
