import React, { useState } from "react";
import { UNIT_GROUPS, DEFAULT_UNITS } from "../domain/units.mjs";
import { useUnits } from "./Units.jsx";
import {
  DEFAULT_GOAL_HISTORY_DEPTH,
  MAX_GOAL_HISTORY_DEPTH,
} from "../domain/goals.mjs";
import "./Settings.css";
export function Settings({
  busy,
  onAction,
  goalHistoryDepth = DEFAULT_GOAL_HISTORY_DEPTH,
}) {
  const { preferences } = useUnits();
  const [historyDepth, setHistoryDepth] = useState(String(goalHistoryDepth));
  const validDepth =
    Number.isInteger(Number(historyDepth)) &&
    Number(historyDepth) >= 1 &&
    Number(historyDepth) <= MAX_GOAL_HISTORY_DEPTH;
  const [draft, setDraft] = useState(preferences);
  const changed = Object.keys(DEFAULT_UNITS).some(
    (group) => draft[group] !== preferences[group],
  );
  return (
    <section className="unit-settings">
      <div className="page-heading">
        <div>
          <h1>Settings</h1>
          <p>Make Suppy work for you.</p>
        </div>
      </div>
      <form
        aria-label="Goal assessment settings"
        onSubmit={async (event) => {
          event.preventDefault();
          if (validDepth)
            await onAction(
              "set_goal_history_depth",
              { sessions: Number(historyDepth) },
              "Goal history depth saved.",
            );
        }}
      >
        <h2>Goals</h2>
        <label className="unit-setting-row">
          <span>
            <strong>History depth</strong>
            <small id="goal-history-help">
              Assess your current level using your latest sessions.
            </small>
          </span>
          <span className="history-depth-input">
            <input
              aria-label="Goal history depth"
              aria-describedby="goal-history-help"
              type="number"
              min="1"
              max={MAX_GOAL_HISTORY_DEPTH}
              step="1"
              required
              value={historyDepth}
              onChange={(event) => setHistoryDepth(event.target.value)}
              disabled={busy}
            />
            <span>sessions</span>
          </span>
        </label>
        <div className="unit-settings-actions">
          <span className="caption">Default: 10 sessions</span>
          <button
            className="button primary"
            type="submit"
            disabled={
              busy || !validDepth || Number(historyDepth) === goalHistoryDepth
            }
          >
            Save history depth
          </button>
        </div>
      </form>
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
