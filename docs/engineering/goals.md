# Goals configuration

Goals displays every supported metric directly: maximum speed, whole-session average speed, best continuous 5/10/20-minute speed, and longest continuous time above a recorded cadence threshold. There is no metric dropdown or add step. Existing additional cadence configurations remain visible.

Unconfigured entries have stable `catalog:<metric>` IDs, `active:false`, and null target/threshold. Reading the catalog does not seed SQLite or invent athlete targets. Existing saved goals retain their IDs and targets and default to active. Dashboard and session context expose the full catalog with `active` and `position`.

`upsert_goal` saves an explicit target in SI, or null to clear it. Cadence thresholds may be saved without a duration target so the best result can be inspected. A duration target requires a threshold. Saving preserves activation/order unless explicitly changed. The UI saves per row and protects unsaved drafts by disabling rearrangement until they are saved or reset.

`reorder_goals({active_ids,inactive_ids})` specifies each current catalog ID exactly once. The server validates membership, uniqueness and completeness against the trusted tenant and writes both buckets in one transaction. Up/down buttons reorder within a bucket; Activate/Deactivate append to the destination bucket. Keyboard focus follows the moved row. State survives restart. Inactive and unset targets do not create Home chart lines or cadence trend options. Deactivation retains targets and results.

Current best searches the tenant's entire available session history, not only the latest ten. It uses the same selectors as Home: FIT session maximum (recorded-sample fallback), supported calculated session average, exact continuous 300/600/1200-second windows, and continuous cadence duration strictly above the configured threshold. Pauses, missing cadence and gaps split cadence runs. Zero supported time above threshold is zero; absent evidence is null. Historical imported summaries never substitute for calculated windows. Every available result shows its unit, source type, launch name and date, and opens the source session. Conditions are not normalized; the UI makes no automatic achievement or fitness claim.

No new coaching goal types or targets are created by this change. Coaching proposals remain outside the app pending user review. Original FIT/ZIP files and database schema are unchanged.
