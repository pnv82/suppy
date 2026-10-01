import React, { useEffect, useId, useRef, useState } from "react";
import { Trophy } from "@phosphor-icons/react";
import { GOAL_METRICS, goalUnit, goalValue } from "../domain/goals.mjs";
import "./GoalTrophy.css";

export function GoalTrophy({ goal }) {
  return goal ? <ReachedGoal key={goal.id} goal={goal} /> : null;
}

function ReachedGoal({ goal }) {
  const id = useId();
  const trigger = useRef(null),
    hint = useRef(null);
  const [open, setOpen] = useState(false);
  const position = () => {
    const button = trigger.current.getBoundingClientRect();
    const panel = hint.current.getBoundingClientRect();
    const left = Math.max(
      12,
      Math.min(button.left, window.innerWidth - panel.width - 12),
    );
    const top =
      button.bottom + panel.height + 6 <= window.innerHeight - 12
        ? button.bottom + 6
        : Math.max(12, button.top - panel.height - 6);
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
  }, [open, goal]);
  const target = `${goalValue(goal, goal.target_si).toFixed(goalUnit(goal) === "mph" ? 2 : 1)} ${goalUnit(goal)}`;
  const label = `${GOAL_METRICS[goal.metric]} goal reached: at least ${target}`;
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="goal-trophy"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        aria-describedby={open ? id : undefined}
        title={label}
        onKeyDown={(event) => {
          if (event.key === "Tab") hint.current.hidePopover();
        }}
        onClick={() => {
          if (open) hint.current.hidePopover();
          else {
            hint.current.showPopover();
            position();
          }
        }}
      >
        <Trophy size={15} weight="duotone" aria-hidden="true" />
      </button>
      <span
        ref={hint}
        id={id}
        className="goal-trophy-hint"
        popover="auto"
        role="tooltip"
        onToggle={(event) => setOpen(event.newState === "open")}
      >
        {label}
      </span>
    </>
  );
}
