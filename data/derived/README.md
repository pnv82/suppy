# Regenerable telemetry

Run `python scripts/inspect_samples.py` from the repository root. It writes:

- `fit-inventory.json`: integrity results, message/field counts, selected session values and timer events.
- `<session-id>-track.json`: basic timestamped telemetry and events for local UI development.

These files are ignored by Git, retain private GPS data, and are not placed in public static assets. They are a projection of the FIT, not a complete decoder export. Cadence remains raw and no best-window or technique analysis is computed. Some FIT events occur after session completion (for example recovery HR); consumers must not extend the recorded session to include them.
