import React, { useEffect, useRef, useState } from "react";
import { X, Info, ChatCircle } from "@phosphor-icons/react";
import { mph, timeLabel, durationLabel } from "../domain/metrics.mjs";
import { metricView } from "../domain/metric-view.mjs";
const fmt = (v, dp = 0) => (Number.isFinite(v) ? v.toFixed(dp) : "—");

export function EvidenceDialog({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement,
      dialog = ref.current;
    dialog.showModal();
    return () => {
      dialog.close();
      previous?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="session-edit-dialog evidence-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close details"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function MetricDetails({ session, duration, onClose }) {
  const view = metricView(session, duration),
    e = view.evidence,
    z = e?.zigzag;
  const whole = duration == null,
    movement = session.deterministic?.movement;
  return (
    <EvidenceDialog
      title={`${whole ? "Whole session" : `Best ${duration / 60} min`} · metric details`}
      onClose={onClose}
    >
      <p>
        Derived from full recorded telemetry. Pauses and unsupported gaps are
        excluded from supported averages; elapsed best efforts retain stationary
        time.
      </p>
      <dl className="evidence-properties">
        <dt>Speed at cadence</dt>
        <dd>
          {fmt(mph(view.speed), 2)} mph @ {fmt(view.cadence)} spm
        </dd>
        <dt>Alternate speed</dt>
        <dd>
          {fmt(view.speed == null ? null : view.speed * 3.6, 2)} km/h ·{" "}
          {fmt(view.speed, 2)} m/s
        </dd>
        <dt>Matched support</dt>
        <dd>
          {fmt(e?.speed_cadence?.covered_s)} s /{" "}
          {fmt(e?.speed_cadence?.timer_eligible_s)} timer-eligible s (
          {fmt(view.coverage)}%)
        </dd>
        <dt>Elapsed coverage</dt>
        <dd>{fmt(e?.speed_cadence?.elapsed_coverage_pct)}%</dd>
        <dt>Estimated strokes</dt>
        <dd>{fmt(e?.distance_per_stroke?.estimated_strokes, 1)}</dd>
        <dt>Ground distance / stroke</dt>
        <dd>
          {fmt(view.dps, 2)} m ·{" "}
          {fmt(view.dps == null ? null : view.dps / 0.3048, 2)} ft
        </dd>
        <dt>HR coverage</dt>
        <dd>
          {fmt(e?.heart_rate_bpm?.coverage_pct)}%
          {session.hrQuality ? ` · ${session.hrQuality}` : ""}
        </dd>
        <dt>Recorded speed mean / median / max</dt>
        <dd>
          {[e?.speed_mps?.mean, e?.speed_mps?.median, e?.speed_mps?.max]
            .map((v) => fmt(mph(v), 2))
            .join(" / ")}{" "}
          mph
        </dd>
        {whole && (
          <>
            <dt>Distance / active / elapsed</dt>
            <dd>
              {fmt(session.distance, 2)} mi · {durationLabel(session.active)} /{" "}
              {durationLabel(session.elapsed)}
            </dd>
            <dt>Stored summary speed / HR / cadence</dt>
            <dd>
              {fmt(session.avgSpeed, 2)} mph · {fmt(session.avgHr)} bpm ·{" "}
              {fmt(session.cadence)} spm ·{" "}
              {session.records.length
                ? "FIT / imported summary"
                : "imported historical summary"}
            </dd>
            <dt>Session maximum speed</dt>
            <dd>
              {fmt(mph(session.statistics?.speed_mps?.max), 2)} mph ·{" "}
              {session.statistics?.speed_mps?.max_source || "unavailable"}
            </dd>
            <dt>FIT total-stroke DPS</dt>
            <dd>
              {fmt(session.statistics?.distance_per_stroke?.value_m, 2)}{" "}
              m/stroke · separate device-total estimate
            </dd>
            <dt>Moving / low speed / timer paused / unknown</dt>
            <dd>
              {[
                movement?.supported_moving_s,
                movement?.supported_low_speed_s,
                movement?.explicit_paused_s,
                movement?.unknown_s,
              ]
                .map((v) => fmt(v))
                .join(" / ")}{" "}
              s
            </dd>
          </>
        )}
      </dl>
      <p className="caption">
        {e?.distance_per_stroke?.assumption ||
          "No supported distance/cadence data."}{" "}
        Pairing requires 90% matched coverage. Lower coverage is partial
        evidence. The DPS chart uses trailing 30-second windows, requires 90%
        support, and breaks at gaps.
      </p>
      {e?.distance_per_stroke?.reason && (
        <p className="evidence-reason">{e.distance_per_stroke.reason}</p>
      )}
      {whole && !!movement?.events?.length && (
        <details>
          <summary>Movement events & boundary uncertainty</summary>
          {movement.events.map((event, i) => (
            <p key={i}>
              {event.type === "timer_pause"
                ? "Recorded timer pause"
                : "Low-speed candidate; cause unknown"}{" "}
              · {timeLabel(event.start_s)}–{timeLabel(event.end_s)}
              {event.boundary_uncertainty_s != null
                ? ` · boundary uncertainty up to ${fmt(event.boundary_uncertainty_s)} s`
                : ""}
            </p>
          ))}
        </details>
      )}
      <h3>Zig-zag · experimental</h3>
      <p>
        Higher means a straighter GPS path in eligible local sections. It does
        not measure board yaw, technique quality or energy efficiency.
      </p>
      <dl className="evidence-properties">
        <dt>Score / coverage</dt>
        <dd>
          {fmt(z?.score, 1)} / 100 · {fmt(z?.coverage_pct)}%
        </dd>
        <dt>Eligible / excluded</dt>
        <dd>
          {fmt(z?.covered_s)} / {fmt(z?.excluded_s)} s
        </dd>
        <dt>Median / P90 course deviation</dt>
        <dd>
          {fmt(z?.median_course_error_deg, 1)}° /{" "}
          {fmt(z?.p90_course_error_deg, 1)}°
        </dd>
        <dt>Resolved oscillations</dt>
        <dd>{fmt(z?.zigzag_cycles_per_min, 2)} cycles/min</dd>
        <dt>Lateral motion</dt>
        <dd>{fmt(z?.lateral_motion_m_per_km, 1)} m/km · not wasted distance</dd>
      </dl>
      {z?.reason && <p className="evidence-reason">{z.reason}</p>}
      <p className="caption">
        60-second local sections, 5-second smoothing and 10-second geometry
        steps; turns over 25°, low speed, bad GPS and unsupported boundaries are
        excluded. At least 60 eligible seconds and 20% coverage are required.
        Fine oscillations can be missed; GPS noise and conditions affect
        results. Thresholds are provisional.
      </p>
      {z?.limitations
        ?.filter((text) => text.startsWith("GPS accuracy"))
        .map((text) => (
          <p className="caption" key={text}>
            {text}
          </p>
        ))}
      {!!Object.keys(z?.excluded_reasons || {}).length && (
        <p className="caption">
          Excluded sections:{" "}
          {Object.entries(z.excluded_reasons)
            .map(
              ([key, value]) => `${key.replaceAll("_", " ")} ${fmt(value)} s`,
            )
            .join(" · ")}
          . Other excluded time is unsupported boundaries, gaps or short runs.
        </p>
      )}
      <details>
        <summary>Method & source</summary>
        <p className="evidence-source">
          {e?.method || "Unavailable"} · {z?.method || "No GPS evidence"}
          <br />
          {session.sourceRef || "Source not recorded"}
        </p>
      </details>
    </EvidenceDialog>
  );
}

export function MetricsInspector({ session, selected, onSelect, onAsk }) {
  const [details, setDetails] = useState(false);
  const view = metricView(session, selected),
    e = view.evidence,
    z = e?.zigzag;
  const best =
    session.windows.find((w) => w.duration === 1200 && w.start != null) ||
    session.windows.find((w) => w.start != null);
  return (
    <aside className="metrics-inspector" aria-label="Metric inspector">
      <div className="metric-scope" aria-label="Metric scope">
        <button aria-pressed={selected == null} onClick={() => onSelect(null)}>
          Session
        </button>
        <button
          aria-pressed={selected != null}
          disabled={!best}
          onClick={() => onSelect(view.window || best)}
        >
          Selected interval
        </button>
      </div>
      <div>
        <h2>
          {selected == null ? "Whole session" : `Best ${selected / 60} min`}
        </h2>
        <p className="paired-headline">
          {fmt(mph(view.speed), 2)} <small>mph</small>{" "}
          <span>
            @ {fmt(view.cadence)} <small>spm</small>
          </span>
        </p>
        <p className="dps-headline">
          {fmt(view.hr)} bpm · heart rate
          {session.hrQuality && ` · ${session.hrQuality}`}
        </p>
      </div>
      <dl className="inspector-properties">
        <dt>{selected == null ? "Distance" : "Time"}</dt>
        <dd>
          {selected == null
            ? `${fmt(session.distance, 2)} mi`
            : `${timeLabel(view.window?.start)} – ${timeLabel(view.window?.end)}`}
        </dd>
        <dt>{selected == null ? "Active / elapsed" : "Duration"}</dt>
        <dd>
          {selected == null
            ? `${durationLabel(session.active)} / ${durationLabel(session.elapsed)}`
            : `${selected / 60} min`}
        </dd>
        <dt>Distance / stroke · est.</dt>
        <dd>
          {fmt(view.dps, 2)} m/stroke
          {view.dps != null && !view.paired && <small> · partial</small>}
        </dd>
        <dt>Matched coverage</dt>
        <dd>
          {fmt(view.coverage)}%
          {!view.paired && <small> · insufficient for pairing</small>}
        </dd>
      </dl>
      <div className="inspector-zigzag">
        <div>
          <span>Zig-zag</span>
          <strong>
            {fmt(view.zigzag, 1)} <small>/ 100 · experimental</small>
          </strong>
        </div>
        <p>
          Higher = straighter recorded path · {fmt(z?.coverage_pct)}% eligible
        </p>
      </div>
      <div className="inspector-actions">
        <button className="text-button" onClick={() => setDetails(true)}>
          <Info size={16} /> Metric details
        </button>
        <button
          className="text-button"
          onClick={() =>
            onAsk(
              selected == null
                ? {}
                : { start_s: view.window.start, end_s: view.window.end },
            )
          }
        >
          <ChatCircle size={16} /> Ask ChatGPT
        </button>
      </div>
      {details && (
        <MetricDetails
          session={session}
          duration={selected}
          onClose={() => setDetails(false)}
        />
      )}
    </aside>
  );
}

const modeLabels = {
  speed_at_effort: "Speed at similar HR / cadence",
  hr_at_speed: "HR at similar speed",
  cadence_at_speed: "Cadence at similar speed",
};
export function DriftDetails({ session, onClose, onInspect }) {
  const drift = session.deterministic?.drift;
  return (
    <EvidenceDialog title="Descriptive performance drift" onClose={onClose}>
      <p>
        Independent early/late 3-minute windows. A change describes recorded
        performance; it is not a fatigue diagnosis. Conditions are not
        normalized.
      </p>
      {Object.entries(modeLabels).map(([key, label]) => {
        const mode = drift?.modes?.[key];
        return (
          <section className="drift-mode" key={key}>
            <h3>{label}</h3>
            <p className="drift-result">
              {fmt(mode?.change, 1)} {mode?.unit}{" "}
              <span>
                · {mode?.pair_count ?? 0} independent pairs ·{" "}
                {fmt((mode?.unique_supported_s ?? 0) / 60, 1)} supported min
              </span>
            </p>
            {mode?.status === "single_pair" && (
              <p>One pair only; no aggregate claim.</p>
            )}
            {mode?.reason && <p className="evidence-reason">{mode.reason}</p>}
            {mode?.range && (
              <p className="caption">
                Pair range: {fmt(mode.range[0], 1)} to {fmt(mode.range[1], 1)}{" "}
                {mode.unit}. Median shown only with at least two pairs.
              </p>
            )}
            {!!mode?.pairs?.length && (
              <details>
                <summary>Inspect matched windows</summary>
                {mode.pairs.map((pair, i) => (
                  <div className="drift-pair" key={i}>
                    <div>
                      {[pair.early, pair.late].map((w, j) => (
                        <button
                          className="text-button"
                          key={j}
                          onClick={() => {
                            onInspect(w.start_s);
                            onClose();
                          }}
                        >
                          {j ? "Late" : "Early"} {timeLabel(w.start_s)}–
                          {timeLabel(w.end_s)}
                        </button>
                      ))}
                    </div>
                    <p>
                      {[pair.early, pair.late]
                        .map(
                          (w) =>
                            `${fmt(mph(w.speed_mps), 2)} mph @ ${fmt(w.cadence_spm)} spm · ${fmt(w.heart_rate_bpm)} bpm`,
                        )
                        .join(" → ")}
                    </p>
                    <p className="caption">
                      Speed {fmt(pair.changes.speed_pct, 1)}% · DPS{" "}
                      {fmt(pair.changes.dps_pct, 1)}% · HR{" "}
                      {fmt(pair.changes.hr_bpm, 1)} bpm · cadence{" "}
                      {fmt(pair.changes.cadence_pct, 1)}%
                    </p>
                  </div>
                ))}
              </details>
            )}
          </section>
        );
      })}
      <details>
        <summary>Matching method & limitations</summary>
        <p>
          First and last thirds, after a 3-minute settling period. At least 90%
          support, no timer pause, reported fall/interruption, low-speed
          candidate or major turn. HR/cadence SD ≤5; matching within 5 bpm and 3
          spm, or within 3% speed. Heading within 20°. No seconds are reused
          within a mode. Best matching signals first, earliest ties; never
          largest decline.
        </p>
        {drift?.limitations?.map((text) => (
          <p key={text}>{text}</p>
        ))}
        <p className="caption">
          Provisional thresholds; synthetic validation does not establish
          physiological validity. Method: {drift?.method}
        </p>
      </details>
    </EvidenceDialog>
  );
}
