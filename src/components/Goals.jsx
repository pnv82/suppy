import React, { useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowDown } from "@phosphor-icons/react";
import {
  GOAL_METRICS,
  configuredGoals,
  bestGoalResult,
} from "../domain/goals.mjs";
import { mph } from "../domain/metrics.mjs";

function GoalRow({
  goal,
  best,
  busy,
  arrangingDisabled,
  first,
  last,
  onMove,
  onAction,
  onOpen,
  onDirty,
}) {
  const duration = goal.metric === "cadence_duration";
  const savedTarget =
    goal.target_si == null
      ? ""
      : String(
          Number(
            (duration ? goal.target_si / 60 : mph(goal.target_si)).toFixed(4),
          ),
        );
  const savedThreshold =
    goal.cadence_threshold_spm == null
      ? ""
      : String(goal.cadence_threshold_spm);
  const [target, setTarget] = useState(savedTarget);
  const [threshold, setThreshold] = useState(savedThreshold);
  useEffect(() => {
    setTarget(savedTarget);
    setThreshold(savedThreshold);
  }, [savedTarget, savedThreshold]);
  const dirty = target !== savedTarget || threshold !== savedThreshold;
  useEffect(() => {
    onDirty(goal.id, dirty);
  }, [goal.id, dirty, onDirty]);
  const title = GOAL_METRICS[goal.metric];
  return (
    <li className="goal-row" aria-label={title}>
      <div className="goal-identity">
        <h3>{title}</h3>
        <span className="caption">
          {duration
            ? "Continuous effort · pauses and gaps split runs"
            : goal.metric === "max_speed"
              ? "Recorded peak · may include sensor spikes"
              : goal.metric === "average_speed"
                ? "Whole session · supported data"
                : "Continuous elapsed time"}
        </span>
      </div>
      <div className="goal-best">
        <span className="goal-field-label">Current best</span>
        <strong>
          {best
            ? `${(duration ? best.value_si / 60 : mph(best.value_si)).toFixed(2)} ${duration ? "min" : "mph"}`
            : "Unavailable"}
        </strong>
        {best ? (
          <>
            <button
              className="goal-session-link"
              onClick={() => onOpen(best.session_id)}
            >
              {best.name} · {best.date}
            </button>
            <span className="caption">
              {best.source}
              {duration ? ` · above ${goal.cadence_threshold_spm} spm` : ""}
            </span>
          </>
        ) : (
          <span className="caption">
            {duration && goal.cadence_threshold_spm == null
              ? "Set a cadence threshold to see your best."
              : "No supported result in your history."}
          </span>
        )}
      </div>
      <form
        className="goal-settings"
        onSubmit={async (event) => {
          event.preventDefault();
          const saved = await onAction(
            "upsert_goal",
            {
              goal_id: goal.id,
              metric: goal.metric,
              target_si:
                target === savedTarget
                  ? goal.target_si
                  : target === ""
                    ? null
                    : Number(target) * (duration ? 60 : 0.44704),
              cadence_threshold_spm:
                duration && threshold !== "" ? Number(threshold) : null,
            },
            "Goal settings saved.",
          );
          if (saved) {
            setTarget(
              target === "" ? "" : String(Number(Number(target).toFixed(4))),
            );
            setThreshold(threshold === "" ? "" : String(Number(threshold)));
          }
        }}
      >
        <label>
          Target ({duration ? "min" : "mph"})
          <input
            aria-label={`${title} target (${duration ? "min" : "mph"})`}
            type="number"
            min="0.0001"
            max={duration ? 1440 : 30 / 0.44704}
            step="any"
            placeholder="Not set"
            value={target}
            disabled={busy}
            onChange={(e) => setTarget(e.target.value)}
          />
        </label>
        {duration && (
          <label>
            Above cadence (spm)
            <input
              aria-label="Cadence threshold (spm)"
              type="number"
              min="0"
              max="200"
              step="any"
              required={target !== ""}
              placeholder="Not set"
              value={threshold}
              disabled={busy}
              onChange={(e) => setThreshold(e.target.value)}
            />
          </label>
        )}
        <div className="goal-save-actions">
          <button
            className="button secondary small"
            disabled={busy || !dirty}
            aria-label={`Save ${title}`}
          >
            Save
          </button>
          {dirty && (
            <button
              type="button"
              className="button plain small"
              disabled={busy}
              onClick={() => {
                setTarget(savedTarget);
                setThreshold(savedThreshold);
              }}
            >
              Reset
            </button>
          )}
        </div>
      </form>
      <div className="goal-arrange">
        <div className="goal-order">
          <button
            className="button plain small"
            disabled={busy || arrangingDisabled || first}
            onClick={() => onMove(goal, -1)}
            aria-label={`Move ${title} up`}
          >
            <ArrowUp size={17} />
          </button>
          <button
            className="button plain small"
            disabled={busy || arrangingDisabled || last}
            onClick={() => onMove(goal, 1)}
            aria-label={`Move ${title} down`}
          >
            <ArrowDown size={17} />
          </button>
        </div>
        <button
          id={`goal-toggle-${goal.id}`}
          className="button secondary small"
          disabled={busy || arrangingDisabled}
          onClick={() => onMove(goal, 0)}
          aria-label={`${goal.active ? "Deactivate" : "Activate"} ${title}`}
        >
          {goal.active ? "Deactivate" : "Activate"}
        </button>
      </div>
    </li>
  );
}

export function Goals({ goals, sessions = [], busy, onAction, onOpen }) {
  const configured = configuredGoals(goals);
  const dirtyRows = useRef(new Set());
  const [hasDrafts, setHasDrafts] = useState(false);
  const onDirty = React.useCallback((id, dirty) => {
    if (dirty) dirtyRows.current.add(id);
    else dirtyRows.current.delete(id);
    setHasDrafts(dirtyRows.current.size > 0);
  }, []);
  async function move(goal, direction) {
    const active = configured.filter((g) => g.active).map((g) => g.id);
    const inactive = configured.filter((g) => !g.active).map((g) => g.id);
    const bucket = goal.active ? active : inactive;
    const index = bucket.indexOf(goal.id);
    if (direction === 0) {
      bucket.splice(index, 1);
      (goal.active ? inactive : active).push(goal.id);
    } else {
      [bucket[index], bucket[index + direction]] = [
        bucket[index + direction],
        bucket[index],
      ];
    }
    if (
      await onAction(
        "reorder_goals",
        { active_ids: active, inactive_ids: inactive },
        direction
          ? "Goal order saved."
          : `Goal moved to ${goal.active ? "inactive" : "active"}.`,
      )
    ) {
      requestAnimationFrame(() =>
        document.getElementById(`goal-toggle-${goal.id}`)?.focus(),
      );
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR TARGETS</p>
          <h1>Goals</h1>
          <p>
            Configure your targets. Active targets appear on matching Home
            trends.
          </p>
        </div>
      </div>
      <p className="caption goal-page-note">
        Best results use all your sessions, with matching durations. Conditions
        are not normalized. Targets mean at least the entered value; higher
        cadence is not inherently better.
      </p>
      {hasDrafts && (
        <p role="status" className="caption">
          Save or reset your edits before rearranging goals.
        </p>
      )}
      <div className="goal-buckets">
        {[true, false].map((active) => {
          const bucket = configured.filter((g) => g.active === active);
          const name = active ? "Active" : "Inactive";
          return (
            <section
              key={name}
              className="goal-bucket"
              aria-labelledby={`goals-${name}`}
            >
              <div className="goal-bucket-heading">
                <h2 id={`goals-${name}`}>
                  {name} <span>{bucket.length}</span>
                </h2>
                <p>
                  {active
                    ? "Your current priorities"
                    : "Keep for later · targets and results are retained"}
                </p>
              </div>
              {bucket.length ? (
                <ul className="goal-list">
                  {bucket.map((goal, index) => (
                    <GoalRow
                      key={goal.id}
                      goal={goal}
                      best={bestGoalResult(sessions, goal)}
                      busy={busy}
                      arrangingDisabled={hasDrafts}
                      first={index === 0}
                      last={index === bucket.length - 1}
                      onMove={move}
                      onAction={onAction}
                      onOpen={onOpen}
                      onDirty={onDirty}
                    />
                  ))}
                </ul>
              ) : (
                <p className="goal-empty">
                  {active
                    ? "No active goals. Activate a goal below when you want to focus on it."
                    : "All goals are active."}
                </p>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
