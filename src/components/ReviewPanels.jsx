import React, { useEffect, useState } from "react";
import { ChatCircleDots, Plus, Target, X } from "@phosphor-icons/react";
import { fmt } from "./SessionViews.jsx";

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
          Start
          <input
            value={draft.start}
            placeholder="mm:ss"
            pattern="[0-9]{1,3}:[0-5][0-9]"
            required
            onChange={(e) => setDraft({ ...draft, start: e.target.value })}
          />
        </label>
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

export function ContextPanel({ session, onSave, onAsk, busy }) {
  const [value, setValue] = useState(session.additionalContext);
  useEffect(
    () => setValue(session.additionalContext),
    [session.id, session.additionalContext],
  );
  return (
    <section className="context-panel">
      <h2>Session context</h2>
      <p className="source-note">{session.notes || "No source notes."}</p>
      <label htmlFor="extra-context">Additional data or observations</label>
      <textarea
        id="extra-context"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={4000}
        rows={3}
        placeholder="Session notes…"
      />
      <div className="panel-actions">
        <button
          className="button secondary small"
          disabled={busy || value === session.additionalContext}
          onClick={() => onSave(value)}
        >
          Save context
        </button>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => onAsk(value)}
        >
          <ChatCircleDots size={17} /> Ask for fresh analysis
        </button>
      </div>
    </section>
  );
}

export function FocusPanel({ session, issues, onSave, busy }) {
  const [goal, setGoal] = useState(session.goal?.speed_mph ?? ""),
    [duration, setDuration] = useState(session.goal?.duration_min ?? 20),
    [chosen, setChosen] = useState(session.technique || []),
    [issueId, setIssueId] = useState("");
  useEffect(() => {
    setGoal(session.goal?.speed_mph ?? "");
    setDuration(session.goal?.duration_min ?? 20);
    setChosen(session.technique || []);
    setIssueId("");
  }, [session.id, session.goal, session.technique]);
  const issue = issues.find((i) => i.id === issueId);
  const dirty =
    String(goal) !== String(session.goal?.speed_mph ?? "") ||
    Number(duration) !== (session.goal?.duration_min ?? 20) ||
    chosen.join() !== (session.technique || []).join();
  return (
    <section className="focus-panel">
      <h2>Your training focus</h2>
      <div className="goal-fields">
        <Target size={24} />
        <label>
          Speed target
          <input
            aria-label="Target speed in mph"
            type="number"
            step="0.1"
            min="0.1"
            max="30"
            placeholder="Set target"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
        </label>
        <span>mph for</span>
        <label>
          Window
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          >
            {[5, 10, 20].map((n) => (
              <option value={n} key={n}>
                {n} min
              </option>
            ))}
          </select>
        </label>
      </div>
      {goal !== "" && (
        <p className="caption">
          Recorded best {duration} min: {fmt(session[`best${duration}`], 2)} mph
          · target is your choice.
        </p>
      )}
      <label htmlFor="technique-choice">Technique dictionary</label>
      <select
        id="technique-choice"
        value={issueId}
        onChange={(e) => setIssueId(e.target.value)}
      >
        <option value="">Explore a technique focus…</option>
        {issues.map((i) => (
          <option value={i.id} key={i.id}>
            {i.label}
          </option>
        ))}
      </select>
      {issue && (
        <div className="technique-detail">
          <strong>{issue.label}</strong>
          <p>{issue.observation}</p>
          <p>
            <b>Evidence:</b> {issue.evidence_required}
          </p>
          <p>
            <b>Cue:</b> {issue.cue}
          </p>
          <button
            className="text-button"
            disabled={chosen.includes(issueId) || chosen.length >= 5}
            onClick={() => setChosen([...chosen, issueId])}
          >
            <Plus size={15} /> Add as self-reported focus
          </button>
        </div>
      )}
      <div className="focus-tags">
        {chosen.map((id) => (
          <span key={id}>
            {issues.find((i) => i.id === id)?.label}
            <button
              aria-label={`Remove ${issues.find((i) => i.id === id)?.label}`}
              onClick={() => setChosen(chosen.filter((i) => i !== id))}
            >
              <X size={14} />
            </button>
          </span>
        ))}
      </div>
      <button
        className="button secondary small"
        disabled={
          !dirty ||
          busy ||
          (goal !== "" &&
            (!Number.isFinite(Number(goal)) ||
              Number(goal) <= 0 ||
              Number(goal) > 30))
        }
        onClick={() =>
          onSave({
            goal_speed_mph: goal === "" ? null : Number(goal),
            goal_duration_min: duration,
            technique_ids: chosen,
          })
        }
      >
        Save training focus
      </button>
    </section>
  );
}
