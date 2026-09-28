import React, { useState } from "react";
import { GOAL_METRICS } from "../domain/goals.mjs";
import { mph } from "../domain/metrics.mjs";
export function Goals({ goals, busy, onAction }) {
  const [draft, setDraft] = useState({
    metric: "best_1200",
    target: "",
    threshold: "",
    id: null,
  });
  const duration = draft.metric === "cadence_duration";
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR TARGETS</p>
          <h1>Goals</h1>
          <p>Set a target to show alongside the matching Home trend.</p>
        </div>
      </div>
      <form
        className="goal-editor"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await onAction(
              "upsert_goal",
              {
                ...(draft.id ? { goal_id: draft.id } : {}),
                metric: draft.metric,
                target_si: Number(draft.target) * (duration ? 60 : 0.44704),
                cadence_threshold_spm: duration
                  ? Number(draft.threshold)
                  : null,
              },
              "Goal saved.",
            )
          )
            setDraft({ ...draft, id: null, target: "" });
        }}
      >
        <label>
          Metric
          <select
            value={draft.metric}
            onChange={(e) => setDraft({ ...draft, metric: e.target.value })}
            disabled={busy}
          >
            {Object.entries(GOAL_METRICS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Target ({duration ? "minutes" : "mph"})
          <input
            type="number"
            min="0.01"
            step="0.01"
            required
            value={draft.target}
            onChange={(e) => setDraft({ ...draft, target: e.target.value })}
            disabled={busy}
          />
        </label>
        {duration && (
          <label>
            Cadence above (spm)
            <input
              type="number"
              min="0"
              max="200"
              step="0.1"
              required
              value={draft.threshold}
              onChange={(e) =>
                setDraft({ ...draft, threshold: e.target.value })
              }
              disabled={busy}
            />
          </label>
        )}
        <button className="button primary" disabled={busy}>
          {draft.id ? "Save goal" : "Add goal"}
        </button>
        {draft.id && (
          <button
            type="button"
            className="button secondary"
            onClick={() => setDraft({ ...draft, id: null, target: "" })}
          >
            Cancel edit
          </button>
        )}
      </form>
      <p className="caption">
        Targets mean at least the entered value. Cadence duration uses
        continuous supported time strictly above your threshold; pauses and gaps
        split efforts. A higher cadence is not inherently better.
      </p>
      <ul className="board-list">
        {goals.map((g) => (
          <li className="board-row" key={g.id}>
            <div className="board-description">
              <h2>{GOAL_METRICS[g.metric]}</h2>
              <p>
                At least{" "}
                {g.metric === "cadence_duration"
                  ? `${(g.target_si / 60).toFixed(2)} min above ${g.cadence_threshold_spm} spm`
                  : `${mph(g.target_si).toFixed(2)} mph`}
              </p>
            </div>
            <div className="board-actions">
              <button
                className="button secondary small"
                disabled={busy}
                aria-label={`Edit ${GOAL_METRICS[g.metric]}`}
                onClick={() =>
                  setDraft({
                    id: g.id,
                    metric: g.metric,
                    target: String(
                      g.metric === "cadence_duration"
                        ? g.target_si / 60
                        : Number(mph(g.target_si).toFixed(2)),
                    ),
                    threshold: String(g.cadence_threshold_spm ?? ""),
                  })
                }
              >
                Edit
              </button>
              <button
                className="button plain small"
                disabled={busy}
                aria-label={`Delete ${GOAL_METRICS[g.metric]}`}
                onClick={() =>
                  onAction("delete_goal", { goal_id: g.id }, "Goal deleted.")
                }
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
      {!goals.length && (
        <p>No goals yet. Choose a metric and your own target.</p>
      )}
    </>
  );
}
