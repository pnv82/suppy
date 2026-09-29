import React, { useEffect, useRef, useState } from "react";
import { UploadSimple, File, Check, X } from "@phosphor-icons/react";
import { callTool } from "../services/client.mjs";
import { uploadArguments } from "../services/fit-import.mjs";
import { fmt } from "./SessionViews.jsx";
import { durationLabel, mph } from "../domain/metrics.mjs";

function RoutePreview({ runs }) {
  const points = runs.flat();
  if (!points.length)
    return (
      <p>
        No continuous GPS route available. Recorded telemetry and summary
        metrics can still be imported.
      </p>
    );
  const lat = points.map((p) => p[0]),
    lon = points.map((p) => p[1]);
  const minLat = Math.min(...lat),
    minLon = Math.min(...lon),
    midLat = (Math.max(...lat) + minLat) / 2;
  const xScale = Math.cos((midLat * Math.PI) / 180);
  const width = (Math.max(...lon) - minLon) * xScale,
    height = Math.max(...lat) - minLat;
  const scale = Math.min(280 / (width || 1e-8), 130 / (height || 1e-8));
  return (
    <svg
      className="import-route"
      viewBox="0 0 320 170"
      role="img"
      aria-label="Recorded route preview; gaps remain separate"
    >
      {runs.map((run, i) => (
        <polyline
          key={i}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          points={run
            .map(
              ([a, b]) =>
                `${(320 - width * scale) / 2 + (b - minLon) * xScale * scale},${(170 + height * scale) / 2 - (a - minLat) * scale}`,
            )
            .join(" ")}
        />
      ))}
    </svg>
  );
}

export function ImportDialog({ boards, defaultBoardId, onClose, onImported }) {
  const dialog = useRef(null),
    opener = useRef(document.activeElement);
  const [file, setFile] = useState(null),
    [timezone, setTimezone] = useState(
      Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    );
  const [preview, setPreview] = useState(null),
    [args, setArgs] = useState(null),
    [runs, setRuns] = useState([]);
  const [target, setTarget] = useState(""),
    [name, setName] = useState(""),
    [launchReference, setLaunchReference] = useState(null),
    [board, setBoard] = useState(defaultBoardId || "");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const el = dialog.current;
    el.showModal();
    return () => {
      el.close();
      opener.current?.focus();
    };
  }, []);
  useEffect(() => {
    if (!busy) dialog.current?.querySelector(preview ? "h2" : "input")?.focus();
  }, [preview, busy]);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!preview) {
        const input = await uploadArguments(file, timezone);
        const result = await callTool("preview_fit_import", input);
        const suggested =
          result.structuredContent.launch_suggestions?.candidates[0];
        setName(suggested?.name || "");
        setLaunchReference(suggested?.source_ref || null);
        setArgs(input);
        setPreview(result.structuredContent);
        setRuns(result._meta.importRoute || []);
        setTarget(
          result.structuredContent.candidates.length &&
            !result.structuredContent.duplicate_session_id
            ? "choose"
            : "",
        );
      } else {
        const result = await callTool("commit_fit_import", {
          ...args,
          expected_sha256: preview.sha256,
          target_session_id: target || null,
          board_id: board || null,
          launch_name: name,
          launch_source_ref: launchReference,
        });
        onImported(
          result.structuredContent.session_id,
          result.structuredContent.status,
        );
        onClose();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const s = preview?.summary;
  return (
    <dialog
      ref={dialog}
      className="session-edit-dialog import-dialog"
      aria-labelledby="import-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <div className="dialog-heading">
          <h2 id="import-title" tabIndex={-1}>
            {preview ? "Review your paddle" : "Import a paddle"}
          </h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close import"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <ol className="import-steps" aria-label="Import progress">
          <li aria-current={!preview ? "step" : undefined}>
            <span>{preview ? <Check size={14} /> : 1}</span>Choose file
          </li>
          <li aria-current={preview ? "step" : undefined}>
            <span>2</span>Review & save
          </li>
        </ol>
        {!preview ? (
          <>
            <p>
              Choose a SUP activity to preview its route and metrics before
              saving.
            </p>
            <label className="import-file-card">
              <UploadSimple size={30} aria-hidden="true" />
              <strong>Choose your Garmin activity</strong>
              <span className="caption">
                SUP FIT or single-FIT ZIP · up to 30 MB
              </span>
              <input
                aria-label="Garmin activity"
                autoFocus
                type="file"
                accept=".fit,.zip"
                required
                disabled={busy}
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              {file && (
                <span className="import-file-name">
                  <File size={16} />
                  {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
                </span>
              )}
            </label>
            <label>
              Display timezone
              <input
                value={timezone}
                required
                maxLength={100}
                disabled={busy}
                onChange={(e) => setTimezone(e.target.value)}
                list="import-timezones"
              />
            </label>
            <datalist id="import-timezones">
              <option value="UTC" />
              <option value="America/Los_Angeles" />
            </datalist>
            <p className="caption">
              FIT timestamps stay in UTC. The display timezone is your choice;
              the file may not identify it. FIT or single-FIT ZIP, up to 30 MB.
            </p>
          </>
        ) : (
          <>
            <p>
              <strong>
                {s.date} · {s.start}
              </strong>{" "}
              · {s.timezone}
            </p>
            <dl className="import-metrics">
              <div>
                <dt>Distance</dt>
                <dd>
                  {fmt(s.distance, 2)} <small>mi</small>
                </dd>
              </div>
              <div>
                <dt>Active time</dt>
                <dd>{durationLabel(s.active)}</dd>
              </div>
              <div>
                <dt>Elapsed time</dt>
                <dd>{durationLabel(s.elapsed)}</dd>
              </div>
            </dl>
            <RoutePreview runs={runs} />
            <p>
              {preview.record_count.toLocaleString()} records ·{" "}
              {preview.gps_count.toLocaleString()} GPS points
            </p>
            <dl className="import-metrics">
              <div>
                <dt>FIT avg. speed</dt>
                <dd>
                  {fmt(s.avgSpeed, 2)} <small>mph</small>
                </dd>
              </div>
              <div>
                <dt>FIT avg. HR</dt>
                <dd>
                  {fmt(s.avgHr)} <small>bpm</small>
                </dd>
              </div>
              <div>
                <dt>Recorded cadence</dt>
                <dd>
                  {fmt(s.cadence)} <small>spm</small>
                </dd>
              </div>
            </dl>
            <p>
              Calculated best 5 / 10 / 20 min:{" "}
              {s.windows.map((w) => fmt(mph(w.speed_mps), 2)).join(" / ")} mph
            </p>
            {s.quality.length > 0 && (
              <details>
                <summary>Data quality ({s.quality.length})</summary>
                <ul>
                  {s.quality.map((q) => (
                    <li key={q.code}>
                      {q.code === "record_timestamp_end_precision"
                        ? "Whole-second timestamp at session end; original timing retained"
                        : q.code === "record_after_reported_end"
                          ? `Final records match the timer stop, ${q.difference_s} s after the reported duration. Original timing retained. Records affected`
                          : q.code.replaceAll("_", " ")}
                      : {q.count}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {preview.duplicate_session_id ? (
              <p role="status">
                This FIT is already stored. Open the existing session; its edits
                stay intact.
              </p>
            ) : (
              <>
                {preview.candidates.length > 0 && (
                  <label>
                    Possible existing session
                    <select
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                      disabled={busy}
                    >
                      <option value="choose" disabled>
                        Choose how to import
                      </option>
                      <option value="">Create a separate session</option>
                      {preview.candidates.map((c) => (
                        <option key={c.id} value={c.id} disabled={c.has_track}>
                          {c.date} · {c.title}
                          {c.has_track
                            ? " (already has a FIT)"
                            : " — attach FIT"}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {preview.candidates.length > 0 && (
                  <p className="caption">
                    Similar start time and distance. Attaching keeps existing
                    summaries, notes, name and board. Existing FIT tracks cannot
                    be replaced.
                  </p>
                )}
                {!target && (
                  <>
                    <label>
                      Launch name (optional)
                      <input
                        value={name}
                        maxLength={100}
                        placeholder={s.title}
                        onChange={(e) => {
                          setName(e.target.value);
                          setLaunchReference(null);
                        }}
                        disabled={busy}
                      />
                    </label>
                    <p className="caption">
                      Nearby launch suggestions are unconfirmed. Review the name
                      before importing. Exact start coordinates are used for the
                      OpenStreetMap lookup.
                    </p>
                    {preview.launch_suggestions?.lookup.message && (
                      <p role="status">
                        {preview.launch_suggestions.lookup.message}
                      </p>
                    )}
                    {preview.launch_suggestions?.reason && (
                      <p role="status">{preview.launch_suggestions.reason}</p>
                    )}
                    <div className="launch-suggestions">
                      {preview.launch_suggestions?.candidates.map((c) => (
                        <div key={c.source_ref}>
                          <button
                            type="button"
                            className="text-button"
                            disabled={busy}
                            onClick={() => {
                              setName(c.name);
                              setLaunchReference(c.source_ref);
                            }}
                          >
                            {c.name} · {c.distance_m} m · use name
                          </button>
                          <small>
                            {c.source === "openstreetmap" ? (
                              <a
                                href={c.source_url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                OpenStreetMap contributors · nearby mapped
                                feature
                              </a>
                            ) : c.source === "previous_athlete_confirmation" ? (
                              "Previously confirmed nearby start"
                            ) : (
                              <a
                                href={
                                  preview.launch_suggestions.catalog.source_url
                                }
                                target="_blank"
                                rel="noreferrer"
                              >
                                Historical City beach reference
                              </a>
                            )}
                          </small>
                        </div>
                      ))}
                    </div>
                    <label>
                      Board
                      <select
                        value={board}
                        onChange={(e) => setBoard(e.target.value)}
                        disabled={busy}
                      >
                        <option value="">Not recorded</option>
                        {boards.map((b) => (
                          <option value={b.id} key={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {defaultBoardId && (
                      <p className="caption">
                        Your default board is preselected for review.
                      </p>
                    )}
                  </>
                )}
              </>
            )}
            <p className="caption">
              Calculated from recorded data with pause and gap checks. Missing
              values are shown as —. Original files are preserved when saved.
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="dialog-error">
            {error}
          </p>
        )}
        {busy && (
          <p role="status">
            {preview
              ? "Saving import…"
              : "Validating file, calculating metrics and finding nearby launches…"}
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
          {preview && (
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => {
                setPreview(null);
                setArgs(null);
                setFile(null);
                setTarget("");
                setError("");
              }}
            >
              Choose another file
            </button>
          )}
          <button
            className="button primary"
            disabled={busy || target === "choose" || (!preview && !file)}
          >
            {preview
              ? preview.duplicate_session_id
                ? "Open existing session"
                : target
                  ? "Attach FIT"
                  : "Import session"
              : "Preview file"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
