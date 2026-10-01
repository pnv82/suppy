import React, { useEffect, useId, useRef, useState } from "react";
import {
  Plus,
  PencilSimple,
  Trash,
  Star,
  Check,
  X,
  Stack,
} from "@phosphor-icons/react";
import { EvidenceDialog } from "./MetricEvidence.jsx";
import "./Boards.css";

function BoardEditor({ board, boards, busy, onAction, onClose }) {
  const [name, setName] = useState(board?.name ?? "");
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);
  const nameInput = useRef(null);
  useEffect(() => nameInput.current?.focus(), []);
  const clean = name.trim();
  const duplicate = boards.some(
    (item) =>
      item.id !== board?.id && item.name.toLowerCase() === clean.toLowerCase(),
  );
  return (
    <EvidenceDialog
      title={board ? "Rename board" : "Add board"}
      onClose={() => !submitting.current && onClose()}
    >
      <form
        className="board-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || submitting.current || !clean || duplicate) return;
          submitting.current = true;
          setFailed(false);
          try {
            if (
              await onAction(
                "upsert_board",
                { ...(board ? { board_id: board.id } : {}), name: clean },
                board ? "Board renamed." : "Board added.",
              )
            )
              onClose();
            else setFailed(true);
          } finally {
            submitting.current = false;
          }
        }}
      >
        <label>
          Board name
          <input
            ref={nameInput}
            required
            maxLength={100}
            value={name}
            disabled={busy}
            placeholder="Model, size, or a nickname"
            aria-invalid={duplicate || undefined}
            aria-describedby={duplicate ? "board-name-error" : undefined}
            onChange={(event) => {
              setName(event.target.value);
              setFailed(false);
            }}
          />
        </label>
        {duplicate && (
          <p className="board-form-error" id="board-name-error" role="alert">
            A board with this name already exists.
          </p>
        )}
        {failed && (
          <p className="board-form-error" role="alert">
            Couldn’t save this board. Your changes are still here; try again.
          </p>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="button plain small"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="button primary small"
            disabled={busy || !clean || duplicate || clean === board?.name}
          >
            {busy ? "Saving…" : board ? "Save name" : "Add board"}
          </button>
        </div>
      </form>
    </EvidenceDialog>
  );
}

function BoardDelete({ board, isDefault, busy, onAction, onClose, onDeleted }) {
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);
  return (
    <EvidenceDialog
      title="Delete board?"
      onClose={() => !submitting.current && onClose()}
    >
      <form
        className="board-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || submitting.current) return;
          submitting.current = true;
          setFailed(false);
          try {
            if (
              await onAction(
                "delete_board",
                { board_id: board.id },
                "Board deleted.",
              )
            )
              onDeleted();
            else setFailed(true);
          } finally {
            submitting.current = false;
          }
        }}
      >
        <p>
          Delete <strong>{board.name}</strong>?
          {board.sessionCount > 0 &&
            ` The board field will be cleared on ${board.sessionCount} linked ${board.sessionCount === 1 ? "session" : "sessions"}. The sessions will be kept.`}
          {isDefault ? " Your default board will also be cleared." : ""}
        </p>
        {failed && (
          <p className="board-form-error" role="alert">
            Couldn’t delete this board. Please try again.
          </p>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="button plain small"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button small board-delete-button" disabled={busy}>
            {busy ? "Deleting…" : "Delete board"}
          </button>
        </div>
      </form>
    </EvidenceDialog>
  );
}

function BoardRow({ board, boards, isDefault, busy, onAction, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(board.name);
  const [failed, setFailed] = useState(false);
  const input = useRef(null),
    pencil = useRef(null),
    submitting = useRef(false);
  const errorId = useId();
  const clean = name.trim();
  const duplicate = boards.some(
    (item) =>
      item.id !== board.id && item.name.toLowerCase() === clean.toLowerCase(),
  );
  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    }
  }, [editing]);
  function cancel() {
    setEditing(false);
    setFailed(false);
    requestAnimationFrame(() => pencil.current?.focus());
  }
  return (
    <li className="boards-item">
      <button
        className="icon-button board-favorite"
        disabled={busy}
        aria-label={`Favorite ${board.name}`}
        aria-pressed={isDefault}
        title={
          isDefault
            ? "Clear favorite (default board)"
            : "Use as favorite (default board)"
        }
        onClick={() =>
          onAction(
            "set_default_board",
            { board_id: isDefault ? null : board.id },
            isDefault ? "Favorite board cleared." : "Favorite board updated.",
          )
        }
      >
        <Star
          size={19}
          weight={isDefault ? "fill" : "regular"}
          aria-hidden="true"
        />
      </button>
      <div className="boards-name">
        {editing ? (
          <form
            className="board-name-editor"
            onKeyDown={(event) => {
              if (event.key === "Escape" && !submitting.current) {
                event.preventDefault();
                cancel();
              }
            }}
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy || submitting.current || !clean || duplicate) return;
              if (clean === board.name) {
                cancel();
                return;
              }
              submitting.current = true;
              setFailed(false);
              try {
                if (
                  await onAction(
                    "upsert_board",
                    { board_id: board.id, name: clean },
                    "Board renamed.",
                  )
                )
                  cancel();
                else setFailed(true);
              } finally {
                submitting.current = false;
              }
            }}
          >
            <input
              ref={input}
              aria-label={`Name for ${board.name}`}
              value={name}
              required
              maxLength={100}
              aria-invalid={duplicate || undefined}
              aria-describedby={duplicate || failed ? errorId : undefined}
              disabled={busy}
              onChange={(event) => {
                setName(event.target.value);
                setFailed(false);
              }}
            />
            <div className="board-name-actions">
              <button
                className="icon-button"
                title="Save name"
                aria-label={`Save name for ${board.name}`}
                disabled={busy || !clean || duplicate}
              >
                <Check size={17} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="icon-button"
                title="Cancel"
                aria-label={`Cancel renaming ${board.name}`}
                disabled={busy}
                onClick={cancel}
              >
                <X size={17} aria-hidden="true" />
              </button>
            </div>
            {(duplicate || failed) && (
              <p className="board-form-error" id={errorId} role="alert">
                {duplicate
                  ? "A board with this name already exists."
                  : "Couldn’t save. Your changes are still here; try again."}
              </p>
            )}
          </form>
        ) : (
          <>
            <h2>{board.name}</h2>
            <button
              ref={pencil}
              className="icon-button board-name-edit"
              title="Rename board"
              aria-label={`Rename ${board.name}`}
              disabled={busy}
              onClick={() => {
                setName(board.name);
                setEditing(true);
              }}
            >
              <PencilSimple size={16} aria-hidden="true" />
            </button>
          </>
        )}
      </div>
      <span className="boards-sessions">
        {board.sessionCount}
        <span> {board.sessionCount === 1 ? "session" : "sessions"}</span>
      </span>
      <button
        className="icon-button board-row-delete"
        title="Delete board"
        aria-label={`Delete ${board.name}`}
        disabled={busy}
        onClick={onDelete}
      >
        <Trash size={17} aria-hidden="true" />
      </button>
    </li>
  );
}

export function Boards({ boards, defaultBoardId, busy, onAction }) {
  const [editor, setEditor] = useState(null);
  const addButton = useRef(null);
  return (
    <section className="boards-page" aria-labelledby="boards-title">
      <div className="boards-heading">
        <h1 id="boards-title">
          Boards{" "}
          <span className="boards-count">
            {boards.length}
            <span className="sr-only">
              {" "}
              saved {boards.length === 1 ? "board" : "boards"}
            </span>
          </span>
        </h1>
        <button
          ref={addButton}
          className="button primary small"
          disabled={busy}
          onClick={() => setEditor({ kind: "add" })}
        >
          <Plus size={17} aria-hidden="true" />
          Add board
        </button>
      </div>
      {boards.length ? (
        <>
          <div className="boards-columns" aria-hidden="true">
            <span />
            <span>Board</span>
            <span>Sessions</span>
            <span />
          </div>
          <ul className="boards-list" aria-label="Your boards">
            {boards.map((board) => (
              <BoardRow
                key={board.id}
                board={board}
                boards={boards}
                isDefault={board.id === defaultBoardId}
                busy={busy}
                onAction={onAction}
                onDelete={() => setEditor({ kind: "delete", board })}
              />
            ))}
          </ul>
        </>
      ) : (
        <div className="boards-empty">
          <Stack size={30} weight="light" aria-hidden="true" />
          <h2>No boards yet</h2>
          <p>Add your first board, then choose it when recording a session.</p>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => setEditor({ kind: "add" })}
          >
            <Plus size={16} aria-hidden="true" />
            Add your first board
          </button>
        </div>
      )}
      {editor?.kind === "delete" ? (
        <BoardDelete
          board={editor.board}
          isDefault={editor.board.id === defaultBoardId}
          busy={busy}
          onAction={onAction}
          onClose={() => setEditor(null)}
          onDeleted={() => {
            setEditor(null);
            requestAnimationFrame(() => addButton.current?.focus());
          }}
        />
      ) : (
        editor && (
          <BoardEditor
            board={editor.board}
            boards={boards}
            busy={busy}
            onAction={onAction}
            onClose={() => setEditor(null)}
          />
        )
      )}
    </section>
  );
}
