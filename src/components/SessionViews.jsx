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
} from "react-leaflet";
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
  timeLabel,
  validRuns,
  segmentPoints,
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
        { padding: [45, 45], maxZoom: 15 },
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
  const all = runs.flat(),
    marker = interpolate(session.records, cursor);
  const windows = session.windows
    .filter((w) => w.start != null)
    .sort((a, b) => b.duration - a.duration);
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
        aria-label="GPS track with best 5, 10 and 20 minute sections"
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
        {windows.map((w) => (
          <Polyline
            key={w.duration}
            positions={segmentPoints(session.records, w.start, w.end).map(
              (p) => [p.latitude_deg, p.longitude_deg],
            )}
            pathOptions={{
              color: WINDOW_COLORS[w.duration],
              weight: w.duration === 1200 ? 13 : w.duration === 600 ? 8 : 4,
              opacity: selected && selected !== w.duration ? 0.48 : 0.95,
            }}
            eventHandlers={{ click: () => onSelect(w) }}
          />
        ))}
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
                  permanent
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
                  {w.duration / 60} min · {timeLabel(w.start)}
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
                  <MapTooltip direction="bottom" permanent>
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
        {marker?.latitude_deg != null && (
          <CircleMarker
            center={[marker.latitude_deg, marker.longitude_deg]}
            radius={6}
            pathOptions={{
              color: "#fff",
              weight: 3,
              fillColor: "#082936",
              fillOpacity: 1,
            }}
          />
        )}
      </MapContainer>
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
      <div className="source-summary">
        <h3>Sheet summary</h3>
        {[5, 10, 20].map((n) => (
          <div key={n}>
            <span>{n} min</span>
            <strong>
              {fmt(session[`best${n}`], 2)} <small>mph</small>
            </strong>
          </div>
        ))}
      </div>
      <p className="caption">
        Tap a window to highlight it on the map and timeline. Local estimates
        may differ from the sheet.
      </p>
    </aside>
  );
}

export function MetricStrip({ session }) {
  return (
    <div className="metrics">
      {[
        ["Distance", fmt(session.distance, 2), "mi"],
        ["Duration · active", fmt(session.active, 1), "min"],
        ["Average speed", fmt(session.avgSpeed, 2), "mph"],
        ["Average heart rate", fmt(session.avgHr), "bpm"],
        ["Cadence", fmt(session.cadence), "spm"],
      ].map(([label, value, unit]) => (
        <div className="metric" key={label}>
          <div>
            <strong>{value}</strong> <span>{unit}</span>
          </div>
          <p>{label}</p>
        </div>
      ))}
    </div>
  );
}

function ChartTip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <strong>{timeLabel(Number(label) * 60)}</strong>
      <span>
        {fmt(payload[0].value, unit === "mph" ? 2 : 0)} {unit}
      </span>
    </div>
  );
}
export function Timeline({
  session,
  selected,
  onSelect,
  cursor,
  setCursor,
  onAnnotate,
  onEdit,
}) {
  const rows = useMemo(() => chartRows(session.records), [session.records]);
  const max = session.elapsed,
    ticks = Array.from({ length: Math.floor(max / 20) + 1 }, (_, i) => i * 20);
  const w = session.windows.find((w) => w.duration === selected);
  const current = interpolate(session.records, cursor);
  return (
    <section className="timeline-section" aria-labelledby="timeline-title">
      <div className="section-heading">
        <div>
          <h2 id="timeline-title">Interval windows & performance</h2>
          <p>
            Elapsed time · {fmt(session.elapsed, 1)} min
            <span className="quiet-divider">/</span>Tap a chart or scrub to
            explore the track
          </p>
        </div>
        <button
          className="button secondary small"
          onClick={() => onAnnotate(cursor)}
        >
          <Plus size={16} /> Add annotation
        </button>
      </div>
      <div className="window-lanes">
        {session.windows.map((item) => (
          <div className="timeline-row" key={item.duration}>
            <strong
              className="track-label"
              style={{ color: WINDOW_COLORS[item.duration] }}
            >
              {item.duration / 60} min
            </strong>
            <div
              className="lane"
              style={{ "--interval": WINDOW_COLORS[item.duration] }}
            >
              {item.start == null ? (
                <span className="unavailable-lane">
                  Track required to locate this window
                </span>
              ) : (
                <button
                  className={`interval-bar ${selected === item.duration ? "active" : ""}`}
                  style={{
                    left: `${(item.start / 60 / max) * 100}%`,
                    width: `${(item.duration / 60 / max) * 100}%`,
                  }}
                  onClick={() => onSelect(item)}
                  aria-label={`Highlight best ${item.duration / 60} minutes, ${timeLabel(item.start)} to ${timeLabel(item.end)}`}
                >
                  <span className="bar-start">{timeLabel(item.start)}</span>
                  <span className="bar-end">{timeLabel(item.end)}</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {rows.length ? (
        <div className="chart-stack">
          {[
            ["Speed", "mph", "speed", "#008996", [0, "auto"]],
            ["Heart rate", "bpm", "hr", "#d54d72", [60, 180]],
            ["Cadence", "spm", "cadence", "#6273c9", [0, "auto"]],
          ].map(([title, unit, key, color, domain], i) => (
            <div className="timeline-row chart-row" key={key}>
              <div className="track-label" style={{ color }}>
                {title}
                <small>{unit}</small>
              </div>
              <div className="metric-chart">
                <ResponsiveContainer
                  width="100%"
                  height={i === 2 ? 88 : 70}
                  minWidth={0}
                >
                  <LineChart
                    data={rows}
                    margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
                    onClick={(e) => {
                      if (e?.activeLabel != null)
                        setCursor(Number(e.activeLabel) * 60);
                    }}
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
                    <ReferenceLine
                      x={cursor / 60}
                      stroke="#354a60"
                      strokeWidth={1}
                    />
                    <Tooltip content={<ChartTip unit={unit} />} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
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
      <div className="scrubber">
        <label htmlFor="session-cursor">
          Explore track <strong>{timeLabel(cursor)}</strong>
        </label>
        <input
          id="session-cursor"
          aria-valuetext={timeLabel(cursor)}
          type="range"
          min="0"
          max={Math.floor(max * 60)}
          value={cursor}
          onChange={(e) => setCursor(Number(e.target.value))}
        />
        <button className="text-button" onClick={() => onAnnotate(cursor)}>
          <NotePencil size={16} /> Note here
        </button>
      </div>
      <div className="cursor-values" aria-live="polite">
        <span>At {timeLabel(cursor)}</span>
        <strong>{fmt(mph(current?.speed_mps), 2)} mph</strong>
        <strong>{fmt(current?.heart_rate_bpm)} bpm</strong>
        <strong>{fmt(current?.cadence_raw)} spm</strong>
        {!current && <span>No sample at this time</span>}
      </div>
    </section>
  );
}
