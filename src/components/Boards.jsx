import React, { useState } from "react";
import { Plus, PencilSimple, Trash, Check, Star } from "@phosphor-icons/react";

function BoardRow({ board, isDefault, busy, onAction }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(board.name);
  if (editing)
    return (
      <li className="board-row">
        <form
          className="board-edit"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await onAction(
                "upsert_board",
                { board_id: board.id, name },
                "Board renamed.",
              )
            )
              setEditing(false);
          }}
        >
          <label>
            Board name
            <input
              autoFocus
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button
            className="button primary small"
            disabled={busy || !name.trim()}
          >
            <Check size={16} /> Save name
          </button>
          <button
            type="button"
            className="button secondary small"
            disabled={busy}
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        </form>
      </li>
    );
  return (
    <li className="board-row">
      <div className="board-description">
        <h2>
          {board.name}{" "}
          {isDefault && (
            <span className="board-default">
              <Star size={13} weight="fill" />
              Default
            </span>
          )}
        </h2>
        <p className="caption">
          {board.sessionCount}{" "}
          {board.sessionCount === 1 ? "session" : "sessions"}
          {board.sessionCount
            ? " · Reassign sessions before deleting"
            : " · Not yet assigned"}
        </p>
      </div>
      <div className="board-actions">
        <button
          className="button secondary small"
          disabled={busy}
          aria-label={`Rename ${board.name}`}
          onClick={() => {
            setName(board.name);
            setEditing(true);
          }}
        >
          <PencilSimple size={16} />
          Rename
        </button>
        <button
          className="button plain small"
          disabled={busy || board.sessionCount > 0}
          aria-label={`Delete ${board.name}`}
          onClick={() =>
            onAction(
              "delete_board",
              { board_id: board.id },
              "Unused board deleted.",
            )
          }
        >
          <Trash size={16} />
          Delete
        </button>
      </div>
    </li>
  );
}

export function Boards({ boards, defaultBoardId, busy, onAction }) {
  const [name, setName] = useState("");
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR EQUIPMENT</p>
          <h1>Boards</h1>
          <p>Keep the board you used alongside each session.</p>
        </div>
        <span className="quiet-badge">Saved in your app</span>
      </div>
      <section className="board-settings" aria-labelledby="default-board-title">
        <div>
          <h2 id="default-board-title">Your default board</h2>
          <p className="caption">
            A shortcut when recording a session’s board. Existing sessions keep
            their assignments.
          </p>
        </div>
        <label>
          Default board
          <select
            aria-label="Default board"
            value={defaultBoardId ?? ""}
            disabled={busy || !boards.length}
            onChange={(e) =>
              onAction(
                "set_default_board",
                { board_id: e.target.value || null },
                "Default board updated.",
              )
            }
          >
            <option value="">No default</option>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      </section>
      <section className="board-library" aria-labelledby="board-list-title">
        <div className="section-heading">
          <h2 id="board-list-title">Your boards</h2>
          <span className="caption">{boards.length} saved</span>
        </div>
        {!boards.length ? (
          <div className="board-empty">
            <h3>No boards added yet</h3>
            <p>
              Add a name you recognize, such as the model and size. Your
              existing sessions will stay “Not recorded” until you choose a
              board.
            </p>
          </div>
        ) : (
          <ul className="board-list">
            {boards.map((b) => (
              <BoardRow
                key={b.id}
                board={b}
                isDefault={b.id === defaultBoardId}
                busy={busy}
                onAction={onAction}
              />
            ))}
          </ul>
        )}
        <form
          className="board-add"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await onAction(
                "upsert_board",
                { name },
                "Board added. You can now assign it to a session.",
              )
            )
              setName("");
          }}
        >
          <label>
            New board name
            <input
              aria-label="New board name"
              required
              maxLength={100}
              placeholder="Model and size, or a nickname"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button className="button primary" disabled={busy || !name.trim()}>
            <Plus size={18} />
            Add board
          </button>
        </form>
        <p className="caption">
          Boards, the default and session assignments are saved in your app and
          retained after restart.
        </p>
      </section>
    </>
  );
}
