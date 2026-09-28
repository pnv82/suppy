import React, { useEffect, useRef, useState } from "react";
import {
  CaretDown,
  CaretLeft,
  CaretRight,
  PencilSimple,
  X,
  Sparkle,
} from "@phosphor-icons/react";
import { EvidenceDialog } from "./MetricEvidence.jsx";
import { callTool } from "../services/client.mjs";
import { durationLabel, latestSessions } from "../domain/metrics.mjs";
import { fullDate, fmt } from "./SessionViews.jsx";

export function SessionEditDialog({
  session,
  boards,
  defaultBoardId,
  onClose,
  onSave,
  onDelete,
  onManage,
  returnFocusRef,
  deleting = false,
}) {
  const dialog = useRef(null);
  const [note, setNote] = useState(session.additionalContext ?? "");
  const [confirmDelete, setConfirmDelete] = useState(deleting);
  const [name, setName] = useState(session.title);
  const [boardId, setBoardId] = useState(session.boardId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState(null),
    [finding, setFinding] = useState(false),
    [launchReference, setLaunchReference] = useState(null);
  const preferred = boards.find((b) => b.id === defaultBoardId);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    element.querySelector("input")?.focus();
    return () => {
      element.close();
      returnFocusRef?.current?.focus({ preventScroll: true });
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
            "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
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
              note,
              launch_source_ref: launchReference,
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
            onChange={(e) => {
              setName(e.target.value);
              setLaunchReference(null);
            }}
            aria-describedby="session-name-help"
          />
        </label>
        <p id="session-name-help" className="caption">
          Use the start or launch point. Original location: {session.location}.
        </p>
        <div className="launch-suggestions">
          <button
            type="button"
            className="text-button"
            disabled={finding || busy}
            onClick={async () => {
              setFinding(true);
              setError("");
              try {
                const result = await callTool("suggest_launch_name", {
                  session_id: session.id,
                });
                setSuggestions(result.structuredContent);
              } catch (e) {
                setError(e.message);
              } finally {
                setFinding(false);
              }
            }}
          >
            {finding ? "Finding nearby launches…" : "Suggest nearby launch"}
          </button>
          <p className="caption">
            Uses local names near the recorded start. Review the suggestion
            before saving.
          </p>
          {suggestions?.reason && <p role="status">{suggestions.reason}</p>}
          {suggestions?.candidates.map((c) => (
            <div key={c.source_ref}>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setName(c.name);
                  setLaunchReference(c.source_ref);
                }}
              >
                {c.name} · {Math.round(c.distance_m)} m · use name
              </button>
              <small>
                {c.source === "historical_city_beach_reference" ? (
                  <a
                    href={suggestions.catalog.source_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    City beach reference · {suggestions.catalog.source_date}
                  </a>
                ) : (
                  "Previously confirmed nearby start"
                )}
              </small>
            </div>
          ))}
          {suggestions?.catalog && (
            <p className="caption">
              {suggestions.catalog.scope}. {suggestions.catalog.limitations}
            </p>
          )}
        </div>
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
        <p className="source-note">{session.notes || "No source notes."}</p>
        <label>
          Additional data or observations
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={4000}
            rows={3}
            disabled={busy}
          />
        </label>
        <p className="caption">
          Changes are athlete reported and saved in your app.
        </p>
        {error && (
          <p className="dialog-error" role="alert">
            {error}
          </p>
        )}
        <div className="session-delete">
          {confirmDelete ? (
            <>
              <p>
                Delete {session.title}? Notes and edits will leave the app. You
                can upload the FIT again; original files remain privately
                archived.
              </p>
              <button
                type="button"
                className="button danger"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await onDelete();
                    onClose();
                  } catch (e) {
                    setError(e.message);
                    setBusy(false);
                  }
                }}
              >
                Confirm deletion
              </button>
              <button
                type="button"
                className="button plain"
                disabled={busy}
                onClick={() => setConfirmDelete(false)}
              >
                Keep session
              </button>
            </>
          ) : (
            <button
              type="button"
              className="text-button danger"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              Delete session
            </button>
          )}
        </div>
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
  onDelete,
  onManage,
}) {
  const [editing, setEditing] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase();
  const choices = query
    ? sessions.filter((s) =>
        `${s.title} ${s.location} ${s.date} ${fullDate(s.date)} ${s.id}`
          .toLocaleLowerCase()
          .includes(query),
      )
    : latestSessions(sessions);
  const editTrigger = useRef(null);
  const picker = useRef(null);
  const index = sessions.findIndex((s) => s.id === session.id);
  return (
    <>
      <div className="session-heading">
        <div>
          <div className="session-title-row">
            <h1>{session.title}</h1>
            <button
              className="icon-button"
              aria-label="Session highlight and summary"
              title="Session highlight and summary"
              onClick={() => setSummaryOpen(true)}
            >
              <Sparkle
                size={19}
                weight={session.llmSummary ? "fill" : "regular"}
              />
            </button>
            <details
              className="session-picker"
              ref={picker}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  picker.current.open = false;
                  picker.current.querySelector("summary").focus();
                }
              }}
            >
              <summary aria-label="Choose session" title="Choose session">
                <CaretDown size={20} />
              </summary>
              <div className="session-picker-popover" aria-label="Sessions">
                <label className="session-search">
                  Search all sessions
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Launch, date or session ID"
                  />
                </label>
                <p className="caption" role="status">
                  {query
                    ? `${choices.length} matching sessions`
                    : `Latest ${choices.length} of ${sessions.length} sessions`}
                </p>
                {!choices.length && <p>No matching sessions.</p>}
                {choices.map((s) => (
                  <button
                    key={s.id}
                    aria-current={s.id === session.id ? "true" : undefined}
                    onClick={() => {
                      picker.current.open = false;
                      onOpen(s.id);
                    }}
                  >
                    <strong>
                      {s.title} · {fullDate(s.date)}
                    </strong>
                    <span>
                      {s.start}–{s.end} · {s.timezone}
                    </span>
                    <span>
                      {fmt(s.distance, 2)} mi · {durationLabel(s.active)} active
                      · {s.type}
                    </span>
                    <span>
                      {s.records.length
                        ? "Garmin FIT + stored summary"
                        : "Stored summary only"}
                    </span>
                  </button>
                ))}
              </div>
            </details>
            <button
              ref={editTrigger}
              className="icon-button session-edit-trigger"
              aria-label="Edit session"
              title="Edit session"
              onClick={() => setEditing(true)}
            >
              <PencilSimple size={19} />
            </button>
          </div>
        </div>
        <nav className="session-navigation" aria-label="Session navigation">
          <button
            className="icon-button"
            aria-label="Previous session"
            title="Previous (older) session"
            disabled={index === sessions.length - 1}
            onClick={() => onOpen(sessions[index + 1].id)}
          >
            <CaretLeft size={21} />
          </button>
          <button
            className="icon-button"
            aria-label="Next session"
            title="Next (newer) session"
            disabled={index <= 0}
            onClick={() => onOpen(sessions[index - 1].id)}
          >
            <CaretRight size={21} />
          </button>
        </nav>
      </div>
      {editing && (
        <SessionEditDialog
          returnFocusRef={editTrigger}
          session={session}
          boards={boards}
          defaultBoardId={defaultBoardId}
          onClose={() => setEditing(false)}
          onSave={onSave}
          onDelete={onDelete}
          onManage={() => {
            setEditing(false);
            onManage();
          }}
        />
      )}
      {summaryOpen && (
        <EvidenceDialog
          title="Session highlight and summary"
          onClose={() => setSummaryOpen(false)}
        >
          {session.llmSummary ? (
            <>
              <p className="eyebrow">
                LLM interpretation · unreviewed
                {session.llmSummary.stale ? " · OUT OF DATE" : ""}
              </p>
              <h3>{session.llmSummary.highlight}</h3>
              <p className="summary-prose">{session.llmSummary.summary}</p>
              {session.llmSummary.stale && (
                <p role="status">
                  Session context has changed since this analysis. Ask ChatGPT
                  to review the latest evidence.
                </p>
              )}
              <p className="caption">
                {session.llmSummary.model} ·{" "}
                {session.llmSummary.generated_at_utc}
              </p>
              <p className="caption">
                Evidence: {session.llmSummary.evidence_refs.join(", ")}
              </p>
            </>
          ) : (
            <p>
              No analysis saved yet. Ask ChatGPT to analyze this session and
              save a highlight and summary through Suppy.
            </p>
          )}
        </EvidenceDialog>
      )}
    </>
  );
}
