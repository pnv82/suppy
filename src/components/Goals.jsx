import React, { useEffect, useId, useRef, useState } from "react";
import {
  DotsThree,
  Timer,
  Heart,
  Compass,
  PersonSimpleWalk,
  Lightning,
  Waves,
  Info,
  DotsSixVertical,
  CheckCircle,
} from "@phosphor-icons/react";
import {
  GOAL_METRICS,
  configuredGoals,
  bestGoalResult,
  goalValue,
  goalFactor,
  goalUnit,
  goalLowerIsBetter,
  goalAchieved,
  goalScope,
} from "../domain/goals.mjs";
import { EvidenceDialog } from "./MetricEvidence.jsx";
import { timeLabel } from "../domain/metrics.mjs";
import { goalDropOrder } from "../domain/goal-order.mjs";
import { useGoalDrag } from "./useGoalDrag.js";
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
  stroke_effectiveness:
    "We check five-minute stretches where your stroke rate stays steady and averages within 3 strokes per minute of your chosen rate. For each stretch, we divide distance by time. Your best is the fastest average among the stretches checked. Only stretches with complete distance and stroke readings count. Metres per stroke is distance divided by the estimated number of strokes.",
  effort_economy:
    "We skip the first 20 minutes of the session, then check five-minute stretches with steady speed and heart rate, within 3% of your chosen speed. A session needs at least 25 minutes to qualify. Your best is the lowest average heart rate among those stretches. We need complete readings and skip sessions flagged for unreliable heart rate. Lower means fewer heartbeats at a similar speed; it does not prove improved fitness.",
  tracking_control:
    "We use your GPS path to give each session a score from 0 to 100. It combines typical and larger changes in direction, how widely your path wanders, and repeated zigzags. Turns, very slow sections and poor GPS readings are left out. Higher means a steadier recorded path; your best is your highest session score.",
  turns_footwork:
    "For each session you report, we divide successful turns by attempts for each direction, then use the lower percentage. For example, 8 out of 10 left and 6 out of 10 right gives 60%. Count a success when you complete the turn and footwork under control without falling. Your best is your highest session percentage. These are your reports, not watch measurements.",
  cadence_duration:
    "Cadence means strokes per minute. We time how long your recorded stroke rate stays above your chosen number and keep your longest run. Reaching or dropping below that number, pausing the recording, missing stroke readings, or a recording gap over 15 seconds starts a new run. A faster stroke rate is not always better paddling.",
  max_speed:
    "Your fastest recorded speed across all sessions. We use the watch’s session peak, or its individual speed readings if that peak is missing or rejected as unrealistic. This is a brief peak, not a speed you held. Smaller sensor spikes can still affect it.",
  average_speed:
    "For each session, we divide recorded distance by time over sections with usable distance and stroke-rate readings. If no matching stroke-rate data is available, we use distance readings alone. Recording pauses and missing data are left out. Your best is the highest of these session averages.",
};

function goalMethod(goal) {
  const minutes =
    goal.metric === "endurance"
      ? (goal.window_s ?? 1800) / 60
      : { best_300: 5, best_600: 10, best_1200: 20 }[goal.metric];
  return minutes
    ? `We find the uninterrupted ${minutes} minutes where you travelled farthest, then divide that distance by ${minutes} minutes to get your average speed. Your best is the fastest across all sessions. Recording pauses, missing distance readings and gaps over 15 seconds break an effort. Time spent stopped still counts if the recording keeps running.`
    : methods[goal.metric];
}

function GoalHint({ goal, onOpen }) {
  const id = useId(),
    trigger = useRef(null),
    hint = useRef(null);
  const [open, setOpen] = useState(false);
  const position = () => {
    const button = trigger.current.getBoundingClientRect(),
      panel = hint.current.getBoundingClientRect();
    const left = Math.max(
      16,
      Math.min(
        button.right - panel.width,
        window.innerWidth - panel.width - 16,
      ),
    );
    const top =
      button.bottom + panel.height + 8 <= window.innerHeight - 16
        ? button.bottom + 8
        : Math.max(16, button.top - panel.height - 8);
    Object.assign(hint.current.style, { left: `${left}px`, top: `${top}px` });
  };
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", position);
    document.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      document.removeEventListener("scroll", position, true);
    };
  }, [open]);
  return (
    <>
      <button
        ref={trigger}
        className="icon-button goal-hint-button"
        aria-label={`How ${GOAL_METRICS[goal.metric]} is calculated`}
        aria-expanded={open}
        aria-controls={id}
        aria-describedby={open ? id : undefined}
        onKeyDown={(event) => {
          if (event.key === "Tab") hint.current.hidePopover();
        }}
        onClick={() => {
          if (open) hint.current.hidePopover();
          else {
            onOpen();
            hint.current.showPopover();
            position();
          }
        }}
      >
        <Info size={18} aria-hidden="true" />
      </button>
      <div
        ref={hint}
        id={id}
        className="goal-hint"
        popover="auto"
        role="tooltip"
        onToggle={(event) => setOpen(event.newState === "open")}
      >
        <strong>{GOAL_METRICS[goal.metric]}</strong>
        <p>{goalMethod(goal)}</p>
        <p className="goal-hint-note">
          A dash means there is not enough matching data yet.
        </p>
      </div>
    </>
  );
}

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
          <p>{goalMethod({ ...goal, window_s: Number(window) })}</p>
          <p>
            Best results compare all your sessions. Wind, water and your board
            can affect them; we do not adjust the numbers for these differences.
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
  const [menu, setMenu] = useState(null);
  const menuRef = useRef(null);
  const dragInstructions = useId();
  const { root, drag, handleProps, announcement } = useGoalDrag({
    goals: configured,
    busy,
    onStart: () => setMenu(null),
    onDrop: async (id, target) => {
      const order = goalDropOrder(
        configured,
        id,
        target.active,
        target.beforeId,
      );
      if (!order) return;
      await onAction("reorder_goals", order, "Goal order saved.");
      requestAnimationFrame(() =>
        document
          .getElementById(`goal-drag-${id}`)
          ?.focus({ preventScroll: true }),
      );
    },
  });
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
    <div className={`goals-page${drag ? " is-dragging" : ""}`} ref={root}>
      <p className="sr-only" id={dragInstructions}>
        Drag to reorder or move between Active and Inactive. For keyboard use,
        use the goal’s actions menu to move up, move down or change its bucket.
        Press Escape to cancel a drag.
      </p>
      <div className="sr-only" role="status" aria-live="polite">
        {drag
          ? `${drag.label}. ${drag.target ? `${drag.target.active ? "Active" : "Inactive"}, position ${drag.target.position}.` : "Outside a bucket. Release to cancel."}`
          : announcement}
      </div>
      <div className="goals-heading">
        <div>
          <h1>Goals</h1>
          <p>Your next milestones.</p>
        </div>
      </div>
      {[true, false].map((active) => {
        const bucket = configured.filter((g) => g.active === active),
          name = active ? "Active" : "Inactive";
        return (
          <section
            className={`goal-section ${active ? "" : "is-inactive"}${drag?.target?.active === active ? " is-drop-target" : ""}`}
            key={name}
            data-goal-bucket={active ? "active" : "inactive"}
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
                {drag
                  ? "Drop here"
                  : active
                    ? "Activate a goal from its menu to get started."
                    : "All goals are active."}
              </p>
            ) : (
              <ul className="goals-list">
                {bucket.map((goal, index) => {
                  const best = bestGoalResult(sessions, goal),
                    achieved = goalAchieved(goal, best),
                    Icon = iconFor(goal.metric),
                    unit = goalUnit(goal);
                  return (
                    <li
                      className={`goal-item${achieved ? " is-achieved" : ""}${drag?.id === goal.id ? " is-drag-source" : ""}${drag?.target?.active === active && drag.target.beforeId === goal.id ? " is-drop-before" : ""}`}
                      key={goal.id}
                      data-goal-id={goal.id}
                      aria-label={GOAL_METRICS[goal.metric]}
                    >
                      <button
                        id={`goal-drag-${goal.id}`}
                        className="goal-drag-handle"
                        aria-label={`Drag ${GOAL_METRICS[goal.metric]}`}
                        aria-describedby={dragInstructions}
                        disabled={busy}
                        {...handleProps(goal, GOAL_METRICS[goal.metric])}
                      >
                        <DotsSixVertical size={18} aria-hidden="true" />
                      </button>
                      <button
                        id={`goal-overview-${goal.id}`}
                        className="goal-overview"
                        aria-label={`Edit ${GOAL_METRICS[goal.metric]}`}
                        aria-describedby={
                          achieved ? `goal-achieved-${goal.id}` : undefined
                        }
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
                            <span
                              className={
                                achieved ? "goal-achieved-target" : undefined
                              }
                              title={achieved ? "Target achieved" : undefined}
                            >
                              {achieved && (
                                <>
                                  <CheckCircle
                                    size={16}
                                    weight="fill"
                                    aria-hidden="true"
                                  />
                                  <span
                                    className="sr-only"
                                    id={`goal-achieved-${goal.id}`}
                                  >
                                    Target achieved
                                  </span>
                                </>
                              )}
                              <span>
                                {goalLowerIsBetter(goal) ? "≤" : "≥"}{" "}
                                {display(goal, goal.target_si)}{" "}
                                <small>{unit}</small>
                              </span>
                            </span>
                          )}
                        </span>
                      </button>
                      <div
                        className="goal-row-tools"
                        ref={menu === goal.id ? menuRef : null}
                      >
                        <GoalHint goal={goal} onOpen={() => setMenu(null)} />
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
                            <button
                              disabled={busy || index === 0}
                              onClick={() => move(goal, -1)}
                            >
                              Move up
                            </button>
                            <button
                              disabled={busy || index === bucket.length - 1}
                              onClick={() => move(goal, 1)}
                            >
                              Move down
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => move(goal, 0)}
                            >
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
            {drag?.target?.active === active &&
              drag.target.beforeId == null && (
                <div className="goal-drop-end" aria-hidden="true" />
              )}
          </section>
        );
      })}
      {drag && (
        <div
          className="goal-drag-preview"
          aria-hidden="true"
          style={{
            left: Math.max(8, Math.min(drag.x + 14, window.innerWidth - 288)),
            top: Math.max(8, Math.min(drag.y + 14, window.innerHeight - 76)),
          }}
        >
          <DotsSixVertical size={18} />
          <span>
            <strong>{drag.label}</strong>
            <small>
              {drag.target
                ? `${drag.target.active ? "Active" : "Inactive"} · Position ${drag.target.position}`
                : "Release to cancel"}
            </small>
          </span>
        </div>
      )}
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
