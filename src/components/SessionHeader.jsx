import React, { useEffect, useRef, useState } from "react";
import { CaretDown, PencilSimple, X } from "@phosphor-icons/react";
import { durationLabel } from "../domain/metrics.mjs";
import { shortDate, fullDate, fmt } from "./SessionViews.jsx";

function SessionEditDialog({
  session,
  boards,
  defaultBoardId,
  onClose,
  onSave,
  onManage,
  returnFocusRef,
}) {
  const dialog = useRef(null);
  const [name, setName] = useState(session.title);
  const [boardId, setBoardId] = useState(session.boardId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const preferred = boards.find((b) => b.id === defaultBoardId);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    element.querySelector("input")?.focus();
    return () => {
      element.close();
      returnFocusRef.current?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="session-edit-dialog"
      aria-labelledby="session-edit-title"
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = [
          ...event.currentTarget.querySelectorAll(
            "button:not(:disabled), input:not(:disabled), select:not(:disabled)",
          ),
        ];
        const first = controls[0],
          last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onSave({
              session_id: session.id,
              name: name.trim(),
              board_id: boardId || null,
            });
            onClose();
          } catch (e) {
            setError(e.message);
            setBusy(false);
          }
        }}
      >
        <div className="dialog-heading">
          <h2 id="session-edit-title">Edit session</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close session editor"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <label>
          Session name
          <input
            autoFocus
            required
            maxLength={100}
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
            aria-describedby="session-name-help"
          />
        </label>
        <p id="session-name-help" className="caption">
          Use the start or launch point. Original location: {session.location}.
        </p>
        <label>
          Board
          <select
            aria-label="Session board"
            value={boardId}
            disabled={busy || !boards.length}
            onChange={(e) => setBoardId(e.target.value)}
          >
            <option value="">Not recorded</option>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.id === defaultBoardId ? " · default" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="dialog-board-actions">
          {!boardId && preferred && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => setBoardId(preferred.id)}
            >
              Use default: {preferred.name}
            </button>
          )}
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={onManage}
          >
            {boards.length ? "Manage boards" : "Add boards"}
          </button>
        </div>
        <p className="caption">
          Changes are athlete reported and reset on server restart.
        </p>
        {error && (
          <p className="dialog-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy || !name.trim()}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function SessionHeader({
  session,
  sessions,
  boards,
  defaultBoardId,
  onOpen,
  onSave,
  onManage,
}) {
  const [editing, setEditing] = useState(false);
  const editTrigger = useRef(null);
  return (
    <>
      <div className="session-heading">
        <div>
          <div className="session-title-row">
            <h1>{session.title}</h1>
            <div className="compact-session-select">
              <CaretDown size={20} aria-hidden="true" />
              <select
                aria-label="Choose session"
                title="Choose session"
                value={session.id}
                onChange={(e) => onOpen(e.target.value)}
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {shortDate(s.date)} · {s.title} · {fmt(s.distance, 2)} mi ·{" "}
                    {durationLabel(s.active)}
                  </option>
                ))}
              </select>
            </div>
            <button
              ref={editTrigger}
              className="icon-button session-edit-trigger"
              aria-label="Edit session"
              title="Edit session"
              onClick={() => setEditing(true)}
            >
              <PencilSimple size={19} />
            </button>
            <details className="session-metadata">
              <summary aria-label="Session details">
                {shortDate(session.date)}
              </summary>
              <div className="session-meta-popover">
                <div>{fullDate(session.date)}</div>
                <div>
                  {session.start}–{session.end} PT
                </div>
                <div>
                  {session.records.length
                    ? "Garmin FIT + sheet snapshot"
                    : "Sheet summary only"}
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>
      {editing && (
        <SessionEditDialog
          returnFocusRef={editTrigger}
          session={session}
          boards={boards}
          defaultBoardId={defaultBoardId}
          onClose={() => setEditing(false)}
          onSave={onSave}
          onManage={() => {
            setEditing(false);
            onManage();
          }}
        />
      )}
    </>
  );
}
