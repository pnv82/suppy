# Supplied Garmin samples

| Supplied archive | Extracted FIT | Historical session match |
|---|---|---|
| `archives/24495535896 (1).zip` | `fit/24495535896_ACTIVITY.fit` | 2026-09-25 |
| `archives/24434833576.zip` | `fit/24434833576_ACTIVITY.fit` | 2026-09-20 |
| `archives/24249467884.zip` | `fit/24249467884_ACTIVITY.fit` | 2026-09-05 |

Copied from the three user-supplied files in Downloads; originals there were not changed. Each archive contains one FIT. [manifest.json](manifest.json) records byte sizes and SHA-256 checksums. Both archive CRC and FIT CRC were checked with the supplied data. Files are stored locally and excluded from Git by default.

Re-run `python scripts/inspect_samples.py` from the project root to verify and regenerate telemetry. Never edit these originals to resolve a parsing issue. The Aug 29 sheet session has no supplied file.
