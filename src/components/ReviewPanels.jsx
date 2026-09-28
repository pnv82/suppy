import React from "react";
import { ChatCircleDots } from "@phosphor-icons/react";

export function AnnotationForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  onAsk,
  busy,
}) {
  return (
    <form className="annotation-editor" onSubmit={onSave}>
      <div className="editor-heading">
        <strong>{draft.id ? "Edit annotation" : "New annotation"}</strong>
        <span>Athlete reported · elapsed time</span>
      </div>
      <div className="editor-fields">
        <label>
          Selection
          <select
            value={draft.mode || "point"}
            onChange={(e) => setDraft({ ...draft, mode: e.target.value })}
          >
            <option value="point">Point</option>
            <option value="interval">Interval</option>
          </select>
        </label>
        <label>
          Start
          <input
            value={draft.start}
            placeholder="mm:ss"
            pattern="[0-9]{1,3}:[0-5][0-9]"
            required
            onChange={(e) => setDraft({ ...draft, start: e.target.value })}
          />
        </label>
        {draft.mode === "interval" && (
          <label>
            End
            <input
              value={draft.end}
              placeholder="mm:ss"
              pattern="[0-9]{1,3}:[0-5][0-9]"
              required
              onChange={(e) => setDraft({ ...draft, end: e.target.value })}
            />
          </label>
        )}
        <label>
          Type
          <select
            value={draft.kind}
            onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
          >
            {["condition", "interruption", "fall", "note"].map((k) => (
              <option value={k} key={k}>
                {k[0].toUpperCase() + k.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Timing
          <select
            value={draft.timing}
            onChange={(e) => setDraft({ ...draft, timing: e.target.value })}
          >
            <option value="approximate">Approximate</option>
            <option value="exact">Exact</option>
          </select>
        </label>
        <label className="note-field">
          Note
          <input
            value={draft.note}
            maxLength={2000}
            required
            placeholder="What changed on the water?"
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
          />
        </label>
        <button className="button primary" disabled={busy} type="submit">
          Save note
        </button>
        <button className="button plain" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <button
        type="button"
        className="text-button"
        disabled={!draft.note.trim() || busy}
        onClick={onAsk}
      >
        <ChatCircleDots size={17} /> Save & ask ChatGPT about this interval
      </button>
    </form>
  );
}
