import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowUp,
  Wind,
  Info,
  Plus,
  NotePencil,
  MapPin,
} from "@phosphor-icons/react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Tooltip as MapTooltip,
  useMap,
  ScaleControl,
  Marker,
  Pane,
  useMapEvents,
} from "react-leaflet";
import { divIcon } from "leaflet";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
} from "recharts";
import "leaflet/dist/leaflet.css";
import {
  WINDOW_COLORS,
  mph,
  feet,
  durationLabel,
  timeLabel,
  validRuns,
  segmentPoints,
  segmentDirections,
  interpolate,
  chartRows,
} from "../domain/metrics.mjs";

export const fmt = (value, dp = 0) =>
  value == null ? "—" : Number(value).toFixed(dp);
export const shortDate = (date) =>
  new Date(date + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
export const fullDate = (date) =>
  new Date(date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
export const bearing = (deg) =>
  deg == null
    ? "Unknown"
    : [
        "N",
        "NNE",
        "NE",
        "ENE",
        "E",
        "ESE",
        "SE",
        "SSE",
        "S",
        "SSW",
        "SW",
        "WSW",
        "W",
        "WNW",
        "NW",
        "NNW",
      ][Math.round(deg / 22.5) % 16];

function FitBounds({ points, reset }) {
  const map = useMap();
  useEffect(() => {
    if (points.length)
      map.fitBounds(
        points.map((p) => [p.latitude_deg, p.longitude_deg]),
        { padding: [45, 45], maxZoom: 15, animate: false },
      );
  }, [map, reset]);
  return null;
}
export function SessionMap({ session, selected, onSelect, cursor }) {
  const [tileError, setTileError] = useState(false);
  const runs = useMemo(
    () => validRuns(session.records, session.pauses, true),
    [session.records, session.pauses],
  );
  const all = runs.flat();
  const cursorRun = runs.find(
    (run) => cursor >= run[0].elapsed_s && cursor <= run.at(-1).elapsed_s,
  );
  const marker = cursorRun ? interpolate(cursorRun, cursor) : null;
  const windows = session.windows.filter(
    (w) => w.start != null && w.duration === selected,
  );
  if (!all.length)
    return (
      <div className="map-empty">
        <MapPin size={32} />
        <h3>No track for this session</h3>
        <p>
          The sheet has a summary. Add its Garmin FIT file to locate intervals.
        </p>
      </div>
    );
  return (
    <div className="map-wrap">
      <MapContainer
        center={[all[0].latitude_deg, all[0].longitude_deg]}
        zoom={13}
        scrollWheelZoom={false}
        className="route-map"
        aria-label="GPS track with the selected best interval and annotations"
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution={
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          }
          eventHandlers={{ tileerror: () => setTileError(true) }}
        />
        <FitBounds points={all} reset={session.id} />
        <ScaleControl position="bottomleft" imperial metric={false} />
        {runs.map((run, i) => (
          <Polyline
            key={i}
            positions={run.map((p) => [p.latitude_deg, p.longitude_deg])}
            pathOptions={{ color: "#304d61", weight: 3, opacity: 0.55 }}
          />
        ))}
        {selected &&
          windows
            .filter((w) => w.duration === selected)
            .map((w) => (
              <Pane
                name={`selected-window-${session.id}-${selected}`}
                key={`${session.id}-${selected}`}
                style={{ zIndex: 410 }}
              >
                <Polyline
                  positions={segmentPoints(session.records, w.start, w.end).map(
                    (p) => [p.latitude_deg, p.longitude_deg],
                  )}
                  pathOptions={{ color: "#fff", weight: 11, opacity: 0.9 }}
                  interactive={false}
                />
                <Polyline
                  positions={segmentPoints(session.records, w.start, w.end).map(
                    (p) => [p.latitude_deg, p.longitude_deg],
                  )}
                  pathOptions={{
                    color: WINDOW_COLORS[w.duration],
                    weight: 6,
                    opacity: 1,
                  }}
                  interactive={false}
                />
              </Pane>
            ))}
        <TravelArrows session={session} selected={selected} />
        {windows.map((w) => {
          const p = interpolate(session.records, w.start);
          return (
            p && (
              <CircleMarker
                key={w.duration}
                center={[p.latitude_deg, p.longitude_deg]}
                radius={5}
                pathOptions={{
                  color: WINDOW_COLORS[w.duration],
                  fillColor: "#fff",
                  fillOpacity: 1,
                  weight: 3,
                }}
                eventHandlers={{ click: () => onSelect(w) }}
              >
                <MapTooltip
                  direction={
                    w.duration === 300
                      ? "right"
                      : w.duration === 600
                        ? "left"
                        : "top"
                  }
                  className={`interval-map-label interval-${w.duration}`}
                  offset={[0, w.duration === 1200 ? -8 : 0]}
                >
                  {w.duration / 60} min start · {timeLabel(w.start)}
                </MapTooltip>
              </CircleMarker>
            )
          );
        })}
        {selected &&
          (() => {
            const w = windows.find((w) => w.duration === selected),
              p = w && interpolate(session.records, w.end);
            return (
              p && (
                <CircleMarker
                  center={[p.latitude_deg, p.longitude_deg]}
                  radius={6}
                  pathOptions={{
                    color: WINDOW_COLORS[selected],
                    fillColor: WINDOW_COLORS[selected],
                    fillOpacity: 1,
                  }}
                >
                  <MapTooltip direction="bottom">
                    {selected / 60} min end · {timeLabel(w.end)}
                  </MapTooltip>
                </CircleMarker>
              )
            );
          })()}
        <CircleMarker
          center={[all[0].latitude_deg, all[0].longitude_deg]}
          radius={6}
          pathOptions={{
            color: "#fff",
            fillColor: "#197b53",
            fillOpacity: 1,
            weight: 2,
          }}
        >
          <MapTooltip>Session start</MapTooltip>
        </CircleMarker>
        <CircleMarker
          center={[all.at(-1).latitude_deg, all.at(-1).longitude_deg]}
          radius={5}
          pathOptions={{
            color: "#fff",
            fillColor: "#192c44",
            fillOpacity: 1,
            weight: 2,
          }}
        >
          <MapTooltip>Session finish</MapTooltip>
        </CircleMarker>
        <Pane name="annotations" style={{ zIndex: 450 }}>
          {session.annotations.map((a) => {
            const p = interpolate(session.records, a.start_s);
            return (
              p?.latitude_deg != null && (
                <CircleMarker
                  key={a.id}
                  center={[p.latitude_deg, p.longitude_deg]}
                  radius={7}
                  pathOptions={{
                    color: "#fff",
                    fillColor: "#ae4265",
                    fillOpacity: 1,
                    weight: 2,
                  }}
                >
                  <MapTooltip>
                    {a.kind} · {timeLabel(a.start_s)} · {a.note}
                  </MapTooltip>
                </CircleMarker>
              )
            );
          })}
        </Pane>
        <Pane name="current-point" style={{ zIndex: 625 }}>
          {marker && (
            <CircleMarker
              center={[marker.latitude_deg, marker.longitude_deg]}
              radius={8}
              interactive
              pathOptions={{
                color: "#fff",
                weight: 3,
                fillColor: "#082936",
                fillOpacity: 1,
                className: "current-point",
              }}
            >
              <MapTooltip direction="top" offset={[0, -8]}>
                Current point · {timeLabel(cursor)}
              </MapTooltip>
            </CircleMarker>
          )}
        </Pane>
      </MapContainer>
      <p className="map-direction-caption">
        <ArrowUp size={16} />{" "}
        {selected
          ? `${selected / 60} min arrows: direction of travel.`
          : "Select a best window to highlight its interval."}{" "}
        {!marker && `GPS unavailable at ${timeLabel(cursor)}.`}
      </p>
      <div className="wind-overlay">
        {session.windFrom == null ? (
          <Wind size={27} />
        ) : (
          <ArrowUp
            size={29}
            weight="bold"
            style={{ transform: `rotate(${session.windFrom + 180}deg)` }}
          />
        )}
        <div>
          <strong>
            {session.windFrom == null
              ? "Wind unavailable"
              : `From ${bearing(session.windFrom)} · ${fmt(session.wind, 2)} mph`}
          </strong>
          <span>
            {session.windFrom == null
              ? "No station observation in source"
              : `${session.station || "Station"} · ${session.windFrom}° from · air flows ${bearing((session.windFrom + 180) % 360)}`}
          </span>
        </div>
      </div>
      <div className="map-north" aria-label="North is up">
        <span>N</span>
        <ArrowUp size={21} weight="fill" />
      </div>
      {tileError && (
        <div className="tile-message">
          Basemap unavailable. GPS track remains visible.
        </div>
      )}
    </div>
  );
}

function TravelArrows({ session, selected }) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const arrows = useMemo(() => {
    const candidates = session.windows.filter(
      (w) => w.start != null && selected === w.duration,
    );
    const accepted = [];
    for (const w of candidates) {
      const fractions = [0.15, 0.32, 0.5, 0.68, 0.85];
      for (const p of segmentDirections(
        session.records,
        w,
        session.pauses,
        fractions,
      )) {
        const pixel = map.project([p.latitude_deg, p.longitude_deg], zoom);
        if (accepted.some((a) => a.pixel.distanceTo(pixel) < 38)) continue;
        accepted.push({ ...p, duration: w.duration, pixel });
      }
    }
    return accepted;
  }, [map, zoom, session.records, session.pauses, session.windows, selected]);
  return arrows.map((p) => {
    const label = `${p.duration / 60} min travel ${bearing(p.bearing_deg)} at ${timeLabel(p.elapsed_s)}`;
    return (
      <Marker
        key={`${p.duration}-${p.elapsed_s}`}
        position={[p.latitude_deg, p.longitude_deg]}
        interactive={false}
        keyboard={false}
        icon={divIcon({
          className: "travel-marker",
          iconSize: [30, 42],
          iconAnchor: [15, 15],
          html: `<span class="travel-symbol" role="img" aria-label="${label}" style="color:${WINDOW_COLORS[p.duration]}"><svg viewBox="0 0 30 30" aria-hidden="true" style="transform:rotate(${p.bearing_deg}deg)"><path d="M15 3 L25 24 L15 19 L5 24 Z" fill="currentColor" stroke="white" stroke-width="2.5" stroke-linejoin="round"/></svg><b>${p.duration / 60}m</b></span>`,
        })}
      />
    );
  });
}

export function BestWindows({ session, selected, onSelect }) {
  return (
    <aside className="best-panel">
      <h2>
        Best windows{" "}
        <Info
          size={16}
          aria-label="Local estimates from FIT distance over continuous elapsed time"
        />
      </h2>
      <p className="eyebrow">LOCAL FIT ESTIMATES</p>
      <div className="window-list">
        {session.windows.map((w) => (
          <button
            type="button"
            key={w.duration}
            className={`window-button ${selected === w.duration ? "chosen" : ""}`}
            style={{ "--interval": WINDOW_COLORS[w.duration] }}
            onClick={() => onSelect(w)}
            disabled={w.start == null}
            aria-pressed={selected === w.duration}
          >
            <div>
              <span className="window-dot" />
              <strong>{w.duration / 60} min</strong>
              <b>
                {fmt(mph(w.speed_mps), 2)} <small>mph</small>
              </b>
            </div>
            <span className="window-time">
              {w.start == null
                ? "Track required"
                : `${timeLabel(w.start)} – ${timeLabel(w.end)}`}
            </span>
          </button>
        ))}
      </div>
      <p className="caption">
        Tap a window to follow its arrows from start to finish on the map and
        highlight its timeline. Local estimates may differ from the sheet.
      </p>
    </aside>
  );
}

export function MetricStrip({ session }) {
  const stats = session.statistics;
  const maxSpeed = stats?.speed_mps;
  const stroke = stats?.distance_per_stroke;
  const duration = durationLabel(session.active);
  return (
    <div className="metrics">
      {[
        ["Distance", fmt(session.distance, 2), "mi"],
        [
          "Duration · active",
          duration,
          "",
          Math.abs(session.elapsed - session.active) > 1 / 60
            ? `Elapsed ${durationLabel(session.elapsed)}`
            : null,
          `Active: ${fmt(session.active, 2)} min. Elapsed: ${fmt(session.elapsed, 2)} min. Display rounded to the nearest minute.`,
        ],
        [
          "Average speed",
          fmt(session.avgSpeed, 2),
          "mph",
          `Max ${fmt(mph(maxSpeed?.max), 2)} mph`,
          maxSpeed?.max_source === "fit_session"
            ? "Maximum speed from the FIT session summary; unfiltered watch value."
            : maxSpeed?.max_source === "fit_records"
              ? "Maximum recorded FIT speed; unfiltered watch value."
              : "Maximum speed unavailable: no detailed FIT data.",
        ],
        ["Average heart rate", fmt(session.avgHr), "bpm"],
        [
          "Cadence",
          fmt(session.cadence),
          "spm",
          `${fmt(feet(stroke?.value_m), 1)} ft/stroke${stroke?.value_m != null ? " · est." : ""}`,
          stroke?.value_m != null
            ? `Distance per stroke: ${fmt(stroke.value_m, 2)} m/stroke. FIT distance ${fmt(stroke.distance_m, 2)} m ÷ ${stroke.strokes} watch-counted strokes. Ground distance includes glide and conditions; not a measure of biomechanical efficiency.`
            : "Distance per stroke unavailable: a SUP FIT session with recorded distance and total strokes is required.",
        ],
      ].map(([label, value, unit, secondary, detail]) => (
        <div className="metric" key={label}>
          <div
            className="metric-value"
            title={label === "Duration · active" ? detail : undefined}
          >
            {label === "Duration · active" && value !== "—" ? (
              value
                .split(" ")
                .map((part, i) =>
                  i % 2 === 0 ? (
                    <strong key={i}>{part}</strong>
                  ) : (
                    <span key={i}>{part}</span>
                  ),
                )
            ) : (
              <>
                <strong>{value}</strong>
                <span>{unit}</span>
              </>
            )}
          </div>
          <p>{label}</p>
          {secondary && (
            <small className="metric-secondary" title={detail}>
              {secondary}
            </small>
          )}
        </div>
      ))}
    </div>
  );
}

export function Timeline({
  session,
  selected,
  cursor,
  setCursor,
  onAnnotate,
  onEdit,
}) {
  const rows = useMemo(() => chartRows(session.records), [session.records]);
  const max = session.elapsed,
    ticks = Array.from({ length: Math.floor(max / 20) + 1 }, (_, i) => i * 20);
  const w = session.windows.find((w) => w.duration === selected);
  const current = session.pauses.some((p) => cursor > p.start && cursor < p.end)
    ? null
    : interpolate(session.records, cursor);
  const pointTime = (event) => {
    if (event?.activeLabel == null) return null;
    const seconds = Math.round(Number(event.activeLabel) * 60);
    return Number.isFinite(seconds)
      ? Math.max(0, Math.min(Math.floor(max * 60), seconds))
      : null;
  };
  const moveCursor = (event) => {
    const seconds = pointTime(event);
    if (seconds != null) setCursor(seconds);
  };
  const annotatePoint = (event) => {
    const seconds = pointTime(event);
    if (seconds == null) return;
    setCursor(seconds);
    onAnnotate(seconds);
  };
  const keyboardCursor = (event) => {
    const step = event.shiftKey ? 10 : 1;
    const next = {
      ArrowRight: cursor + step,
      ArrowUp: cursor + step,
      ArrowLeft: cursor - step,
      ArrowDown: cursor - step,
      Home: 0,
      End: Math.floor(max * 60),
    }[event.key];
    if (next != null) {
      event.preventDefault();
      setCursor(Math.max(0, Math.min(Math.floor(max * 60), next)));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onAnnotate(cursor);
    }
  };
  return (
    <section className="timeline-section" aria-labelledby="timeline-title">
      <div className="section-heading">
        <div>
          <h2 id="timeline-title">Performance</h2>
          <p>
            Elapsed time · {durationLabel(session.elapsed)}
            <span className="quiet-divider">/</span>Hover to explore · click or
            tap to annotate
          </p>
        </div>
        {!rows.length && (
          <button
            className="button secondary small"
            onClick={() => onAnnotate(0)}
          >
            <Plus size={16} /> Add annotation
          </button>
        )}
      </div>
      {rows.length > 0 && (
        <>
          <p id="chart-keyboard-help" className="caption chart-help">
            Focus a chart and use arrow keys to move 1 second, Shift + arrow for
            10 seconds, Home/End for the limits, and Enter to annotate.
          </p>
          <div className="cursor-values">
            <span>At {timeLabel(cursor)}</span>
            <strong>{fmt(mph(current?.speed_mps), 2)} mph</strong>
            <strong>{fmt(current?.heart_rate_bpm)} bpm</strong>
            <strong>{fmt(current?.cadence_raw)} spm</strong>
            {!current && <span>No sample at this time</span>}
            <button className="text-button" onClick={() => onAnnotate(cursor)}>
              <NotePencil size={16} /> Annotate {timeLabel(cursor)}
            </button>
          </div>
        </>
      )}
      {rows.length ? (
        <div className="chart-stack">
          {[
            ["Speed", "mph", "speed", "#008996", [0, "auto"]],
            ["Heart rate", "bpm", "hr", "#d54d72", [60, 180]],
            ["Cadence", "spm", "cadence", "#6273c9", [0, "auto"]],
          ].map(([title, unit, key, color, domain], i) => {
            const stats =
              key === "speed"
                ? session.statistics?.speed_mps
                : key === "hr"
                  ? session.statistics?.heart_rate_bpm
                  : null;
            const convert = key === "speed" ? mph : (v) => v;
            const median = convert(stats?.median),
              peak = convert(stats?.max);
            return (
              <div className="timeline-row chart-row" key={key}>
                <div className="track-label" style={{ color }}>
                  {title}
                  <small>{unit}</small>
                </div>
                <div
                  className="metric-chart"
                  role="slider"
                  tabIndex={0}
                  aria-label={title + " chart time"}
                  aria-describedby="chart-keyboard-help"
                  aria-valuemin={0}
                  aria-valuemax={Math.floor(max * 60)}
                  aria-valuenow={cursor}
                  aria-valuetext={
                    timeLabel(cursor) +
                    ", " +
                    fmt(
                      key === "speed"
                        ? mph(current?.speed_mps)
                        : key === "hr"
                          ? current?.heart_rate_bpm
                          : current?.cadence_raw,
                      key === "speed" ? 2 : 0,
                    ) +
                    " " +
                    unit +
                    (!current ? ", no sample" : "")
                  }
                  onKeyDown={keyboardCursor}
                >
                  {key !== "cadence" && (
                    <div
                      className="chart-statistics"
                      aria-label={`${title} session statistics`}
                      style={{ "--series-color": color }}
                    >
                      <span title="Time-weighted median over valid recorded intervals. Pauses and gaps over 15 seconds are excluded.">
                        <i
                          className="stat-line median-line"
                          aria-hidden="true"
                        />
                        Median{" "}
                        <b>
                          {fmt(median, unit === "mph" ? 2 : 0)} {unit}
                        </b>
                      </span>
                      <span
                        title={
                          stats?.max_source === "fit_session"
                            ? "Maximum from the FIT session summary; may exceed the peak in sampled records."
                            : "Maximum of available recorded values; no spike filtering."
                        }
                      >
                        <i className="stat-line max-line" aria-hidden="true" />
                        Max{" "}
                        <b>
                          {fmt(peak, unit === "mph" ? 2 : 0)} {unit}
                        </b>
                      </span>
                    </div>
                  )}
                  <ResponsiveContainer
                    width="100%"
                    height={i === 2 ? 88 : 84}
                    minWidth={0}
                  >
                    <LineChart
                      data={rows}
                      margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
                      accessibilityLayer={false}
                      onMouseMove={moveCursor}
                      onClick={annotatePoint}
                    >
                      <CartesianGrid vertical={false} stroke="#e8edf1" />
                      <XAxis
                        type="number"
                        dataKey="t"
                        domain={[0, max]}
                        ticks={ticks}
                        tickFormatter={(v) => `${v}m`}
                        tick={{ fontSize: 11, fill: "#728397" }}
                        height={i === 2 ? 25 : 0}
                        hide={i !== 2}
                        axisLine={{ stroke: "#dce4e9" }}
                        tickLine={false}
                      />
                      <YAxis
                        width={36}
                        domain={domain}
                        tick={{ fontSize: 10, fill: "#8190a0" }}
                        tickCount={3}
                        axisLine={false}
                        tickLine={false}
                      />
                      {w?.start != null && (
                        <ReferenceArea
                          x1={w.start / 60}
                          x2={w.end / 60}
                          fill={WINDOW_COLORS[w.duration]}
                          fillOpacity={0.07}
                        />
                      )}{" "}
                      {session.pauses.map((p, n) => (
                        <ReferenceArea
                          key={`p${n}`}
                          x1={p.start / 60}
                          x2={p.end / 60}
                          fill="#8290a1"
                          fillOpacity={0.2}
                        />
                      ))}
                      {session.annotations.map((a) =>
                        a.end_s > a.start_s ? (
                          <ReferenceArea
                            key={a.id}
                            x1={a.start_s / 60}
                            x2={a.end_s / 60}
                            fill="#ae4265"
                            fillOpacity={0.12}
                          />
                        ) : (
                          <ReferenceLine
                            key={a.id}
                            x={a.start_s / 60}
                            stroke="#ae4265"
                            strokeDasharray="3 3"
                          />
                        ),
                      )}
                      <Line
                        type="linear"
                        dataKey={key}
                        stroke={color}
                        strokeWidth={1.6}
                        dot={false}
                        isAnimationActive={false}
                        connectNulls={false}
                      />
                      {Number.isFinite(median) && (
                        <ReferenceLine
                          y={median}
                          stroke={color}
                          strokeDasharray="6 4"
                          strokeWidth={1.25}
                          ifOverflow="extendDomain"
                        />
                      )}
                      {Number.isFinite(peak) && (
                        <ReferenceLine
                          y={peak}
                          stroke={color}
                          strokeDasharray="2 3"
                          strokeWidth={1.25}
                          ifOverflow="extendDomain"
                        />
                      )}
                      <ReferenceLine
                        x={cursor / 60}
                        stroke="#354a60"
                        strokeWidth={1}
                      />
                      <Tooltip content={() => null} cursor={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="timeline-empty">
          No time-series data available. Sheet summaries are shown above.
        </div>
      )}
      <div className="timeline-row annotation-track">
        <span className="track-label">Annotations</span>
        <div className="annotation-lane">
          {!session.annotations.length && (
            <span className="empty-annotation">
              Add conditions, falls, interruptions, or a note
            </span>
          )}
          {session.annotations.map((a) => (
            <button
              className="annotation-marker"
              key={a.id}
              style={{ left: `${(a.start_s / 60 / max) * 100}%` }}
              onClick={() => onEdit(a)}
              aria-label={`Edit ${a.kind} at ${timeLabel(a.start_s)}: ${a.note}`}
              title={`${timeLabel(a.start_s)} · ${a.note}`}
            >
              <NotePencil size={16} weight="fill" />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
