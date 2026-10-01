import React, { useState } from "react";
import { UNIT_GROUPS, DEFAULT_UNITS } from "../domain/units.mjs";
import { useUnits } from "./Units.jsx";
import "./Settings.css";
export function Settings({ busy, onAction }) {
  const { preferences } = useUnits();
  const [draft, setDraft] = useState(preferences);
  const changed = Object.keys(DEFAULT_UNITS).some(
    (group) => draft[group] !== preferences[group],
  );
  return (
    <section className="unit-settings">
      <div className="page-heading">
        <div>
          <h1>Settings</h1>
          <p>Make the numbers feel familiar.</p>
        </div>
      </div>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          await onAction(
            "set_unit_preferences",
            { units: draft },
            "Units saved.",
          );
        }}
      >
        <h2>Measurement units</h2>
        <p className="caption">
          One choice for each group. Hover a value anywhere in the app to see it
          in other units.
        </p>
        {Object.entries(UNIT_GROUPS).map(([group, info]) => (
          <label className="unit-setting-row" key={group}>
            <span>
              <strong>{info.label}</strong>
              <small>{info.description}</small>
            </span>
            <select
              aria-label={`${info.label} unit`}
              value={draft[group]}
              onChange={(event) =>
                setDraft({ ...draft, [group]: event.target.value })
              }
              disabled={busy}
            >
              {Object.entries(info.options).map(([key, unit]) => (
                <option key={key} value={key}>
                  {unit.label} ({unit.symbol})
                </option>
              ))}
            </select>
          </label>
        ))}
        <div className="unit-settings-actions">
          <button
            className="text-button"
            type="button"
            disabled={busy}
            onClick={() => setDraft({ ...DEFAULT_UNITS })}
          >
            Restore defaults
          </button>
          <button
            className="button primary"
            disabled={busy || !changed}
            type="submit"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </section>
  );
}
