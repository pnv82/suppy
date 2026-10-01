import React, { useState } from "react";
import { EvidenceDialog } from "./MetricEvidence.jsx";
import {
  HOME_COLUMNS,
  DEFAULT_HOME_COLUMNS,
  validateHomeColumns,
} from "../domain/home-columns.mjs";
import "./HomeColumns.css";

export function HomeColumns({ columns, onClose, onAction }) {
  const [selected, setSelected] = useState(columns);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  return (
    <EvidenceDialog title="Home columns" onClose={() => !saving && onClose()}>
      <p>
        Choose metrics for the session list. Session links, details and actions
        always stay visible. Best intervals and session properties keep their
        own scope.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError(false);
          try {
            if (
              await onAction(
                "set_home_columns",
                { columns: validateHomeColumns(selected) },
                "Home columns saved.",
              )
            )
              onClose();
            else setError(true);
          } catch {
            setError(true);
          } finally {
            setSaving(false);
          }
        }}
      >
        <fieldset className="home-column-options" disabled={saving}>
          <legend className="sr-only">Visible metrics</legend>
          {Object.entries(HOME_COLUMNS).map(([id, label]) => (
            <label key={id}>
              <input
                type="checkbox"
                checked={selected.includes(id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, id]
                      : selected.filter((c) => c !== id),
                  )
                }
              />
              {label}
            </label>
          ))}
        </fieldset>
        {error && <p role="alert">Columns could not be saved. Try again.</p>}
        <div className="home-column-actions">
          <button
            type="button"
            className="text-button"
            disabled={saving}
            onClick={() => setSelected([...DEFAULT_HOME_COLUMNS])}
          >
            Restore defaults
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={saving}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button" disabled={saving}>
            {saving ? "Saving…" : "Save columns"}
          </button>
        </div>
      </form>
    </EvidenceDialog>
  );
}
