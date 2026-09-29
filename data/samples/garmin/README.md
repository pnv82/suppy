# Supplied Garmin samples

| Supplied archive | Extracted FIT | Historical session match |
|---|---|---|
| `archives/24495535896 (1).zip` | `fit/24495535896_ACTIVITY.fit` | 2026-09-25 |
| `archives/24434833576.zip` | `fit/24434833576_ACTIVITY.fit` | 2026-09-20 |
| `archives/24249467884.zip` | `fit/24249467884_ACTIVITY.fit` | 2026-09-05 |
| `archives/20005174116.zip` | `fit/20005174116_ACTIVITY.fit` | 2025-08-09 (FIT date) |
| `archives/19857824112.zip` | `fit/19857824112_ACTIVITY.fit` | 2025-07-26 (FIT date) |
| `archives/17095580563.zip` | `fit/17095580563_ACTIVITY.fit` | 2024-09-21 (FIT date) |
| `archives/24521449019.zip` | `fit/24521449019_ACTIVITY.fit` | 2026-09-27 (FIT date) |

Seven user-supplied files have been copied from Downloads; originals there were not changed. Each archive contains one FIT. [manifest.json](manifest.json) records byte sizes and SHA-256 checksums. Both archive CRC and FIT CRC were checked with the supplied data. Archives, FITs and derived telemetry stay local and are excluded from Git by default. Filename IDs are source references, not values inferred from FIT contents or canonical IDs for new app imports.

The user reported that all four added samples (`20005174116`, `19857824112`, `17095580563`, `24521449019`) used an **inflatable board**. This is stored as an athlete report in each manifest entry; no board model or database board ID is inferred. The user described these as older-watch samples. File-ID metadata identifies the first three as `instinctSolar` and the fourth as `enduro3`; the source report and device metadata remain distinct. Adding to this sample set does not import sessions or assign equipment in the production database.

The three Instinct Solar files have final records matching terminal timer stops 1.587, 3.715 and 3.729 seconds beyond the reported elapsed duration. They exercise the timer-corroborated ending policy in [FIT import](../../../docs/engineering/fit-import.md). Their late session/lap save timestamps are not used as recording boundaries. The Enduro 3 addition already passed the importer before that change. All records and source bytes are retained.

Run `node scripts/validate-fit-samples.mjs` to verify checksums and current app import acceptance without database writes. Re-run `python scripts/inspect_samples.py` from the project root to verify and regenerate telemetry. Never edit these originals to resolve a parsing issue. The Aug 29 sheet session has no supplied file.
