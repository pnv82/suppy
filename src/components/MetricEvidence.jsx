import React, { useEffect, useRef, useState } from "react";
import { X, Info, ChatCircle } from "@phosphor-icons/react";
import { mph, timeLabel, durationLabel } from "../domain/metrics.mjs";
import { metricView } from "../domain/metric-view.mjs";
import { intervalTitle, reviewIntervals } from "../domain/intervals.mjs";
import { TrackingScore } from "./TrackingScore.jsx";
import {
  detectedEventLabel,
  detectedEventDescription,
} from "../domain/events.mjs";
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
    z = e?.tracking;
  const whole = duration == null,
    movement = session.deterministic?.movement;
  return (
    <EvidenceDialog
      title={`${whole ? "Whole session" : intervalTitle(view.window)} · metric details`}
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
        <dt>Speed quality filter</dt>
        <dd>
          Excluded samples: {e?.speed_mps?.quality?.excluded_sample_count ?? 0},
          outside 0–6 m/s (13.42 mph ceiling). Raw recorded maximum:{" "}
          {fmt(mph(e?.speed_mps?.quality?.raw_max_mps), 2)} mph. Coverage
          excludes edges touching rejected samples; smaller artifacts may
          remain.
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
            {session.statistics?.speed_mps?.summary_max_excluded && (
              <>
                <dt>Excluded FIT maximum</dt>
                <dd>
                  Original FIT maximum{" "}
                  {fmt(
                    mph(session.statistics.speed_mps.raw_summary_max_mps),
                    2,
                  )}{" "}
                  mph excluded by the speed sanity ceiling; the displayed
                  maximum uses supported records, or remains unavailable.
                </dd>
              </>
            )}
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
          <summary>Detected events & supporting evidence</summary>
          {movement.events.map((event, i) => (
            <p key={i}>
              {detectedEventLabel(event)}
              {event.annotation_ids?.length
                ? " (linked to athlete annotation)"
                : ""}{" "}
              · {timeLabel(event.start_s)}–{timeLabel(event.end_s)}
              {` · ${detectedEventDescription(event)}`}
              {event.timing_basis === "temperature_change" &&
                ` · cooling observed ${timeLabel(event.evidence.temperature_change_bracket_s[0])}–${timeLabel(event.evidence.temperature_change_bracket_s[1])}; exact fall time unknown`}
              {event.onset_bracket_s &&
                ` · onset bracket ${timeLabel(event.onset_bracket_s[0])}–${timeLabel(event.onset_bracket_s[1])}`}
              {event.boundary_uncertainty_s != null
                ? ` · boundary uncertainty up to ${fmt(event.boundary_uncertainty_s)} s`
                : ""}
            </p>
          ))}
        </details>
      )}
      <h3>Tracking Control Score</h3>
      <dl className="evidence-properties">
        <dt>Score</dt>
        <dd>
          <TrackingScore value={z?.score} />
        </dd>
        <dt>Eligible coverage</dt>
        <dd>
          {fmt(z?.coverage_pct)}% · {fmt(z?.covered_s)} s ·{" "}
          {fmt(z?.valid_distance_m)} m
        </dd>
        <dt>Data support</dt>
        <dd>{z?.confidence?.toLowerCase() || "Unavailable"}</dd>
        {z?.components?.map((component) => (
          <React.Fragment key={component.key}>
            <dt>
              {component.label} · {fmt(component.weight * 100)}%
            </dt>
            <dd>
              {fmt(component.value, 2)} {component.unit} ·{" "}
              {fmt(component.score, 1)} / 100
            </dd>
          </React.Fragment>
        ))}
        <dt>Complete oscillations</dt>
        <dd>{fmt(z?.resolved_cycles)}</dd>
      </dl>
      {z?.reason && <p className="evidence-reason">{z.reason}</p>}
      <details>
        <summary>Score calculation & colors</summary>
        <p>
          35% median course deviation + 30% P90 deviation + 25% lateral corridor
          + 10% oscillation frequency. Higher scores indicate a steadier
          recorded trajectory.
        </p>
        <p>
          90–100 green · 80–89 teal · 70–79 amber · 60–69 orange · below 60 red.
          Unavailable scores are gray.
        </p>
        <p>
          Local course uses 6 seconds; the reference uses 30 seconds. Corridor
          width covers the central 95% of lateral offsets. Pauses, reported
          interruptions, turns, low speed and unsupported GPS are excluded.
        </p>
        {!!Object.keys(z?.excluded_reasons || {}).length && (
          <p>
            Excluded:{" "}
            {Object.entries(z.excluded_reasons)
              .map(
                ([key, value]) =>
                  key.replaceAll("_", " ") + " " + fmt(value) + " s",
              )
              .join(" · ")}
            . Other excluded time includes boundaries and gaps.
          </p>
        )}
      </details>
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
    z = e?.tracking;
  const best =
    session.windows.find((w) => w.duration === 1200 && w.start != null) ||
    reviewIntervals(session).find((w) => w.start != null);
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
          {selected == null ? "Whole session" : intervalTitle(view.window)}
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
            : timeLabel(view.window?.duration)}
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
      <div className="inspector-tracking">
        <div>
          <span title="Tracking Control Score">TCS</span>
          <TrackingScore value={view.tracking} />
        </div>
        <p>Higher = steadier trajectory · {fmt(z?.coverage_pct)}% eligible</p>
      </div>
      <div className="inspector-actions">
        <button className="text-button" onClick={() => setDetails(true)}>
          <Info size={16} /> Metric details
        </button>
        <button
          className="text-button"
          disabled={selected != null && !view.window}
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
