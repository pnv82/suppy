import { useEffect, useRef, useState } from "react";

export function useGoalDrag({ goals, busy, onStart, onDrop }) {
  const root = useRef(null),
    gesture = useRef(null),
    frame = useRef(null);
  const [drag, setDrag] = useState(null);
  const [announcement, setAnnouncement] = useState("");
  const signature = goals.map((goal) => `${goal.id}:${goal.active}`).join("|");

  function cancel() {
    const current = gesture.current;
    gesture.current = null;
    cancelAnimationFrame(frame.current);
    if (current?.handle.hasPointerCapture(current.pointerId))
      current.handle.releasePointerCapture(current.pointerId);
    setDrag(null);
  }

  function destination(current) {
    if (
      current.x < 0 ||
      current.x > window.innerWidth ||
      current.y < 0 ||
      current.y > window.innerHeight
    )
      return null;
    for (const section of root.current.querySelectorAll("[data-goal-bucket]")) {
      const rect = section.getBoundingClientRect();
      if (
        current.x < rect.left ||
        current.x > rect.right ||
        current.y < rect.top ||
        current.y > rect.bottom
      )
        continue;
      const rows = [...section.querySelectorAll("[data-goal-id]")].filter(
        (row) => row.dataset.goalId !== current.id,
      );
      const before = rows.find((row) => {
        const bounds = row.getBoundingClientRect();
        return current.y < bounds.top + bounds.height / 2;
      });
      return {
        active: section.dataset.goalBucket === "active",
        beforeId: before?.dataset.goalId ?? null,
        position: before ? rows.indexOf(before) + 1 : rows.length + 1,
      };
    }
    return null;
  }

  function update() {
    const current = gesture.current;
    if (!current?.started) return;
    const bounds = root.current.getBoundingClientRect();
    // Scroll while held near an edge, even when the pointer is stationary.
    if (current.x >= bounds.left && current.x <= bounds.right) {
      const edge = 64;
      const speed =
        current.y < edge
          ? -Math.min(16, (edge - current.y) / 4)
          : current.y > window.innerHeight - edge
            ? Math.min(16, (current.y - window.innerHeight + edge) / 4)
            : 0;
      if (speed) window.scrollBy({ top: speed, behavior: "instant" });
    }
    current.target = destination(current);
    const next = {
      id: current.id,
      label: current.label,
      x: current.x,
      y: current.y,
      target: current.target,
    };
    setDrag((previous) =>
      JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
    );
    frame.current = requestAnimationFrame(update);
  }

  useEffect(() => {
    cancel();
  }, [signature, busy]);

  useEffect(() => {
    const escape = (event) => {
      if (event.key === "Escape" && gesture.current) {
        event.preventDefault();
        cancel();
        setAnnouncement("Move cancelled.");
      }
    };
    window.addEventListener("keydown", escape);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("keydown", escape);
      window.removeEventListener("blur", cancel);
      cancelAnimationFrame(frame.current);
      gesture.current = null;
    };
  }, []);

  function handleProps(goal, label) {
    return {
      onPointerDown(event) {
        if (busy || !event.isPrimary || event.button !== 0 || gesture.current)
          return;
        event.preventDefault();
        const handle = event.currentTarget;
        handle.focus({ preventScroll: true });
        handle.setPointerCapture(event.pointerId);
        gesture.current = {
          id: goal.id,
          label,
          handle,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          x: event.clientX,
          y: event.clientY,
          started: false,
        };
        setAnnouncement("");
        onStart();
      },
      onPointerMove(event) {
        const current = gesture.current;
        if (!current || current.pointerId !== event.pointerId) return;
        current.x = event.clientX;
        current.y = event.clientY;
        if (
          !current.started &&
          Math.hypot(current.x - current.startX, current.y - current.startY) >=
            6
        ) {
          current.started = true;
          update();
        }
      },
      onPointerUp(event) {
        const current = gesture.current;
        if (!current || current.pointerId !== event.pointerId) return;
        current.x = event.clientX;
        current.y = event.clientY;
        const target = current.started ? destination(current) : null;
        cancel();
        if (target) onDrop(current.id, target);
        else if (current.started) setAnnouncement("Move cancelled.");
      },
      onPointerCancel: cancel,
      onLostPointerCapture: cancel,
      onDragStart: (event) => event.preventDefault(),
    };
  }

  return { root, drag, handleProps, announcement };
}
