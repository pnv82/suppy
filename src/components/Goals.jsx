import React, { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowDown,
  DotsThree,
  ArrowsDownUp,
  Check,
  Timer,
  Heart,
  Compass,
  PersonSimpleWalk,
  Lightning,
  Waves,
} from "@phosphor-icons/react";
import {
  GOAL_METRICS,
  configuredGoals,
  bestGoalResult,
  goalValue,
  goalFactor,
  goalUnit,
  goalLowerIsBetter,
  goalScope,
} from "../domain/goals.mjs";
import { EvidenceDialog } from "./MetricEvidence.jsx";
import { timeLabel } from "../domain/metrics.mjs";
import "./Goals.css";

const display = (goal, value) =>
  value == null
    ? "—"
    : goalValue(goal, value).toFixed(
        ["effort_economy", "tracking_control", "turns_footwork"].includes(
          goal.metric,
        )
          ? 1
          : 2,
      );
const iconFor = (metric) =>
  metric === "effort_economy"
    ? Heart
    : metric === "tracking_control"
      ? Compass
      : metric === "turns_footwork"
        ? PersonSimpleWalk
        : metric === "stroke_effectiveness"
          ? Waves
          : ["endurance", "cadence_duration"].includes(metric)
            ? Timer
            : Lightning;
const methods = {
  endurance:
    "Fastest continuous 30- or 60-minute effort. Pauses, missing distance and gaps over 15 seconds break the effort.",
  stroke_effectiveness:
    "Fastest sampled 5-minute block within ±3 spm of your chosen cadence, with steady cadence and full matched distance/cadence support. Estimated metres per stroke are shown alongside speed.",
  effort_economy:
    "Lowest average HR in a steady 5-minute block within ±3% of your chosen pace. Full distance/HR support is required; flagged HR sessions are excluded. The first 3 minutes are skipped. Lower is better for this comparison, not a fitness diagnosis.",
  tracking_control:
    "Highest whole-session Tracking Control Score on eligible GPS sections. Intentional turns, low speed and unsupported GPS are excluded. This describes trajectory control, not a confirmed technique assessment.",
  turns_footwork:
    "Successful controlled turns divided by attempts, scored using the weaker direction. Report both directions for a session. A success means completing your turn and footwork under control without a fall. This is your observation, never inferred from the watch.",
  cadence_duration:
    "Longest continuously supported time strictly above your cadence threshold. Pauses, missing cadence and gaps over 15 seconds split runs. Higher cadence is not inherently better.",
  max_speed:
    "Highest valid FIT session maximum, with recorded samples as a fallback. Sensor spikes can still affect the result.",
  average_speed:
    "Highest calculated average across supported session data, using the same estimator as Home.",
};

function GoalEditor({ goal, best, busy, onAction, onClose, onOpen }) {
  const [target, setTarget] = useState(
    goal.target_si == null
      ? ""
      : String(Number(goalValue(goal, goal.target_si).toFixed(4))),
  );
  const [threshold, setThreshold] = useState(goal.cadence_threshold_spm ?? "");
  const [cadence, setCadence] = useState(goal.cadence_spm ?? "");
  const [pace, setPace] = useState(
    goal.pace_mps == null ? "" : Number((goal.pace_mps / 0.44704).toFixed(4)),
  );
  const [window, setWindow] = useState(goal.window_s ?? 1800);
  const [failed, setFailed] = useState(false);
  const unit = goalUnit(goal);
  return (
    <EvidenceDialog title={GOAL_METRICS[goal.metric]} onClose={onClose}>
      <div className="goal-dialog-best">
        <span>Current best</span>
        <strong>
          {display(goal, best?.value_si)} <small>{best ? unit : ""}</small>
        </strong>
        {best ? (
          <button
            className="goal-source-link"
            onClick={() => {
              onClose();
              onOpen(best.session_id);
            }}
          >
            {best.name} · {best.date}
          </button>
        ) : (
          <p>
            {goalScope(goal).startsWith("Choose")
              ? goalScope(goal) + " to find matching results."
              : "No matching result yet."}
          </p>
        )}
      </div>
      <form
        className="goal-dialog-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setFailed(false);
          const original =
            goal.target_si == null
              ? ""
              : String(Number(goalValue(goal, goal.target_si).toFixed(4)));
          const args = {
            goal_id: goal.id,
            metric: goal.metric,
            target_si:
              target === original
                ? goal.target_si
                : target === ""
                  ? null
                  : Number(target) * goalFactor(goal),
            cadence_threshold_spm:
              goal.metric === "cadence_duration" && threshold !== ""
                ? Number(threshold)
                : null,
          };
          if (goal.metric === "endurance") args.window_s = Number(window);
          if (goal.metric === "stroke_effectiveness")
            args.cadence_spm = cadence === "" ? null : Number(cadence);
          if (goal.metric === "effort_economy")
            args.pace_mps = pace === "" ? null : Number(pace) * 0.44704;
          if (await onAction("upsert_goal", args, "Goal saved.")) onClose();
          else setFailed(true);
        }}
      >
        <div className="goal-dialog-fields">
          {goal.metric === "endurance" && (
            <label>
              Continuous duration
              <select
                value={window}
                disabled={busy}
                onChange={(e) => setWindow(e.target.value)}
              >
                <option value={1800}>30 minutes</option>
                <option value={3600}>60 minutes</option>
              </select>
            </label>
          )}
          {goal.metric === "stroke_effectiveness" && (
            <label>
              Compare at cadence (spm)
              <input
                type="number"
                min="1"
                max="200"
                step="any"
                value={cadence}
                placeholder="Not set"
                disabled={busy}
                onChange={(e) => setCadence(e.target.value)}
              />
            </label>
          )}
          {goal.metric === "effort_economy" && (
            <label>
              Compare at pace (mph)
              <input
                type="number"
                min="0.01"
                max={6 / 0.44704}
                step="any"
                value={pace}
                placeholder="Not set"
                disabled={busy}
                onChange={(e) => setPace(e.target.value)}
              />
            </label>
          )}
          {goal.metric === "cadence_duration" && (
            <label>
              Cadence above (spm)
              <input
                type="number"
                min="0"
                max="200"
                step="any"
                value={threshold}
                required={target !== ""}
                placeholder="Not set"
                disabled={busy}
                onChange={(e) => setThreshold(e.target.value)}
              />
            </label>
          )}
          <label>
            {goalLowerIsBetter(goal) ? "Target at most" : "Target at least"} (
            {unit})
            <input
              type="number"
              min="0.0001"
              max={
                goal.metric === "cadence_duration"
                  ? 1440
                  : goal.metric === "effort_economy"
                    ? 250
                    : ["tracking_control", "turns_footwork"].includes(
                          goal.metric,
                        )
                      ? 100
                      : 30 / 0.44704
              }
              step="any"
              value={target}
              placeholder="Not set"
              disabled={busy}
              onChange={(e) => setTarget(e.target.value)}
            />
          </label>
        </div>
        <details className="goal-method">
          <summary>How this is measured</summary>
          <p>
            {methods[goal.metric] ||
              "Fastest calculated effort over this exact continuous duration. Pauses and unsupported gaps split efforts; historical summaries never fill missing results."}
          </p>
          <p>
            Results cover all your sessions. Board, wind and water conditions
            can differ; comparisons are not condition-normalized.
          </p>
          {best && (
            <p>
              {best.source}
              {best.evidence?.start_s != null
                ? ` · ${timeLabel(best.evidence.start_s)}–${timeLabel(best.evidence.end_s)}`
                : ""}
              {best.evidence?.coverage_pct != null
                ? ` · ${best.evidence.coverage_pct.toFixed(0)}% support`
                : ""}
            </p>
          )}
          {best?.evidence?.dps_m != null && (
            <p>
              Estimated stroke distance: {best.evidence.dps_m.toFixed(2)}{" "}
              m/stroke ({(best.evidence.dps_m * 3.28084).toFixed(2)} ft/stroke).
            </p>
          )}
          {best?.evidence?.left_attempts != null && (
            <p>
              Left: {best.evidence.left_successes}/{best.evidence.left_attempts}{" "}
              successful. Right: {best.evidence.right_successes}/
              {best.evidence.right_attempts} successful.
            </p>
          )}
          {best && unit === "mph" && (
            <p>
              {best.value_si.toFixed(2)} m/s ·{" "}
              {(best.value_si * 3.6).toFixed(2)} km/h.
            </p>
          )}
        </details>
        {failed && (
          <p role="alert">
            Could not save. Your edits are still here; check the values and try
            again.
          </p>
        )}
        <div className="goal-dialog-actions">
          <button
            className="button plain"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            Save
          </button>
        </div>
      </form>
    </EvidenceDialog>
  );
}

function PracticeEditor({ goal, sessions, busy, onAction, onClose }) {
  const ordered = [...sessions].sort((a, b) => b.date.localeCompare(a.date));
  const [sessionId, setSessionId] = useState(ordered[0]?.id ?? "");
  const [draft, setDraft] = useState({});
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const prior = goal.practice_results?.find(
      (r) => r.session_id === sessionId,
    );
    setDraft(
      Object.fromEntries(
        [
          "left_successes",
          "left_attempts",
          "right_successes",
          "right_attempts",
        ].map((key) => [key, prior?.[key] ?? ""]),
      ),
    );
  }, [goal.practice_results, sessionId]);
  const save = async (result) => {
    setFailed(false);
    if (
      await onAction(
        "set_goal_practice",
        { goal_id: goal.id, session_id: sessionId, result },
        result ? "Practice result saved." : "Practice result cleared.",
      )
    )
      onClose();
    else setFailed(true);
  };
  return (
    <EvidenceDialog title="Turns and footwork · practice" onClose={onClose}>
      {!sessions.length ? (
        <p>Import a session before recording practice.</p>
      ) : (
        <form
          className="goal-dialog-form"
          onSubmit={(e) => {
            e.preventDefault();
            save(
              Object.fromEntries(
                Object.entries(draft).map(([k, v]) => [k, Number(v)]),
              ),
            );
          }}
        >
          <label>
            Session
            <select
              value={sessionId}
              disabled={busy}
              onChange={(e) => setSessionId(e.target.value)}
            >
              {ordered.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.date} · {s.title || s.location}
                </option>
              ))}
            </select>
          </label>
          <p className="caption">
            Count controlled turns without a fall. Record both directions.
          </p>
          {["left", "right"].map((side) => (
            <fieldset className="goal-practice-fields" key={side}>
              <legend>{side === "left" ? "Left turns" : "Right turns"}</legend>
              {["successes", "attempts"].map((kind) => (
                <label key={kind}>
                  {kind === "successes" ? "Successful" : "Attempted"}
                  <input
                    aria-label={`${side} ${kind}`}
                    type="number"
                    required
                    min={kind === "attempts" ? 1 : 0}
                    max={
                      kind === "successes" && draft[`${side}_attempts`] !== ""
                        ? draft[`${side}_attempts`]
                        : 1000
                    }
                    step="1"
                    value={draft[`${side}_${kind}`] ?? ""}
                    disabled={busy}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        [`${side}_${kind}`]: e.target.value,
                      })
                    }
                  />
                </label>
              ))}
            </fieldset>
          ))}
          {failed && (
            <p role="alert">
              Could not save this result. Your entries are still here; check
              them and try again.
            </p>
          )}
          <div className="goal-dialog-actions">
            {goal.practice_results?.some((r) => r.session_id === sessionId) && (
              <button
                type="button"
                className="button plain"
                disabled={busy}
                onClick={() => save(null)}
              >
                Clear result
              </button>
            )}
            <button
              type="button"
              className="button plain"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </button>
            <button className="button primary" disabled={busy}>
              Save result
            </button>
          </div>
        </form>
      )}
    </EvidenceDialog>
  );
}

export function Goals({ goals, sessions = [], busy, onAction, onOpen }) {
  const configured = configuredGoals(goals);
  const [editing, setEditing] = useState(null);
  const [practice, setPractice] = useState(null);
  const [reordering, setReordering] = useState(false);
  const [menu, setMenu] = useState(null);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenu(null);
    };
    const escape = (e) => {
      if (e.key === "Escape") {
        setMenu(null);
        document.getElementById(`goal-menu-${menu}`)?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [menu]);
  async function move(goal, direction) {
    const active = configured.filter((g) => g.active).map((g) => g.id),
      inactive = configured.filter((g) => !g.active).map((g) => g.id);
    const bucket = goal.active ? active : inactive,
      index = bucket.indexOf(goal.id);
    if (!direction) {
      bucket.splice(index, 1);
      (goal.active ? inactive : active).push(goal.id);
    } else
      [bucket[index], bucket[index + direction]] = [
        bucket[index + direction],
        bucket[index],
      ];
    setMenu(null);
    if (
      await onAction(
        "reorder_goals",
        { active_ids: active, inactive_ids: inactive },
        direction
          ? "Goal order saved."
          : `Moved to ${goal.active ? "inactive" : "active"}.`,
      )
    )
      requestAnimationFrame(() =>
        document.getElementById(`goal-menu-${goal.id}`)?.focus(),
      );
  }
  const editingGoal = configured.find((g) => g.id === editing),
    practiceGoal = configured.find((g) => g.id === practice);
  return (
    <div className="goals-page">
      <div className="goals-heading">
        <div>
          <h1>Goals</h1>
          <p>Your next milestones.</p>
        </div>
        <button
          className={`button ${reordering ? "primary" : "plain"}`}
          aria-pressed={reordering}
          onClick={() => {
            setReordering(!reordering);
            setMenu(null);
          }}
        >
          {reordering ? <Check size={17} /> : <ArrowsDownUp size={17} />}{" "}
          {reordering ? "Done" : "Reorder"}
        </button>
      </div>
      {[true, false].map((active) => {
        const bucket = configured.filter((g) => g.active === active),
          name = active ? "Active" : "Inactive";
        return (
          <section
            className={`goal-section ${active ? "" : "is-inactive"}`}
            key={name}
            aria-labelledby={`goals-${name}`}
          >
            <div className="goal-section-heading">
              <h2 id={`goals-${name}`}>
                {name} <span>{bucket.length}</span>
              </h2>
              <span>Best</span>
              <span>Target</span>
              <span />
            </div>
            {!bucket.length ? (
              <p className="goals-empty">
                {active
                  ? "Activate a goal from its menu to get started."
                  : "All goals are active."}
              </p>
            ) : (
              <ul className="goals-list">
                {bucket.map((goal, index) => {
                  const best = bestGoalResult(sessions, goal),
                    Icon = iconFor(goal.metric),
                    unit = goalUnit(goal);
                  return (
                    <li
                      className="goal-item"
                      key={goal.id}
                      aria-label={GOAL_METRICS[goal.metric]}
                    >
                      <button
                        id={`goal-overview-${goal.id}`}
                        className="goal-overview"
                        aria-label={`Edit ${GOAL_METRICS[goal.metric]}`}
                        onClick={() => {
                          setEditing(goal.id);
                          setMenu(null);
                        }}
                      >
                        <span className="goal-name">
                          <span className="goal-symbol">
                            <Icon size={20} />
                          </span>
                          <span>
                            <strong>{GOAL_METRICS[goal.metric]}</strong>
                            <small>{goalScope(goal)}</small>
                          </span>
                        </span>
                        <span
                          className="goal-number"
                          aria-label={
                            best ? undefined : "Best result unavailable"
                          }
                        >
                          <small className="mobile-label">Best</small>
                          <strong>
                            {display(goal, best?.value_si)}
                            {best && <small> {unit}</small>}
                          </strong>
                        </span>
                        <span className="goal-target">
                          <small className="mobile-label">Target</small>
                          {goal.target_si == null ? (
                            <span className="goal-unset">Set target</span>
                          ) : (
                            <span>
                              {goalLowerIsBetter(goal) ? "≤" : "≥"}{" "}
                              {display(goal, goal.target_si)}{" "}
                              <small>{unit}</small>
                            </span>
                          )}
                        </span>
                      </button>
                      <div
                        className="goal-row-tools"
                        ref={menu === goal.id ? menuRef : null}
                      >
                        {reordering && (
                          <div className="goal-reorder-tools">
                            <button
                              className="icon-button"
                              aria-label={`Move ${GOAL_METRICS[goal.metric]} up`}
                              disabled={busy || index === 0}
                              onClick={() => move(goal, -1)}
                            >
                              <ArrowUp size={16} />
                            </button>
                            <button
                              className="icon-button"
                              aria-label={`Move ${GOAL_METRICS[goal.metric]} down`}
                              disabled={busy || index === bucket.length - 1}
                              onClick={() => move(goal, 1)}
                            >
                              <ArrowDown size={16} />
                            </button>
                          </div>
                        )}
                        <button
                          id={`goal-menu-${goal.id}`}
                          className="icon-button"
                          aria-label={`Actions for ${GOAL_METRICS[goal.metric]}`}
                          aria-expanded={menu === goal.id}
                          disabled={busy}
                          onClick={() =>
                            setMenu(menu === goal.id ? null : goal.id)
                          }
                        >
                          <DotsThree size={23} />
                        </button>
                        {menu === goal.id && (
                          <div
                            className="goal-popover"
                            aria-label={`${GOAL_METRICS[goal.metric]} actions`}
                          >
                            <button
                              onClick={() => {
                                setEditing(goal.id);
                                setMenu(null);
                              }}
                            >
                              Edit target & details
                            </button>
                            {goal.metric === "turns_footwork" && (
                              <button
                                onClick={() => {
                                  setPractice(goal.id);
                                  setMenu(null);
                                }}
                              >
                                Record practice
                              </button>
                            )}
                            {best && (
                              <button
                                onClick={() => {
                                  setMenu(null);
                                  onOpen(best.session_id);
                                }}
                              >
                                View best session
                              </button>
                            )}
                            <button onClick={() => move(goal, 0)}>
                              Move to {active ? "inactive" : "active"}
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
      {editingGoal && (
        <GoalEditor
          goal={editingGoal}
          best={bestGoalResult(sessions, editingGoal)}
          busy={busy}
          onAction={onAction}
          onOpen={onOpen}
          onClose={() => {
            setEditing(null);
            requestAnimationFrame(() =>
              document.getElementById(`goal-overview-${editing}`)?.focus(),
            );
          }}
        />
      )}
      {practiceGoal && (
        <PracticeEditor
          goal={practiceGoal}
          sessions={sessions}
          busy={busy}
          onAction={onAction}
          onClose={() => {
            setPractice(null);
            requestAnimationFrame(() =>
              document.getElementById(`goal-menu-${practice}`)?.focus(),
            );
          }}
        />
      )}
    </div>
  );
}
