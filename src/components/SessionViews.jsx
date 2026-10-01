import { Measure, useUnits } from "./Units.jsx";
import { ensureWindowStatistics } from "../domain/analysis.mjs";
import {
  detectedEventLabel,
  detectedEventDescription,
} from "../domain/events.mjs";
import { TrackingScore } from "./TrackingScore.jsx";
import { usableSpeed } from "../domain/speed-quality.mjs";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  intervalKey,
  intervalColor,
  intervalTitle,
  reviewIntervals,
  pointInRuns,
} from "../domain/intervals.mjs";
import {
  ArrowUp,
  Wind,
  CaretDown,
  Plus,
  NotePencil,
  MapPin,
  Diamond,
  X,
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
import { WeatherPanel } from "./WeatherPanel.jsx";
import { DriftDetails } from "./MetricEvidence.jsx";
import {
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

function UnitScale() {
  const map = useMap();
  const units = useUnits();
  const control = useRef(null);
  useEffect(() => {
    let frame;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const line = control.current
          ?.getContainer()
          ?.querySelector(".leaflet-control-scale-line");
        const match = line?.textContent.match(/^([\d.]+) (m|km|mi|ft)$/);
        if (!match) return;
        const metres =
          Number(match[1]) *
          { m: 1, km: 1000, mi: 1609.344, ft: 0.3048 }[match[2]];
        line.title =
          units.preferences.distance === "mi"
            ? `${(metres >= 1000 ? metres / 1000 : metres).toFixed(2)} ${metres >= 1000 ? "km" : "m"}`
            : `${(metres >= 1609.344 ? metres / 1609.344 : metres / 0.3048).toFixed(2)} ${metres >= 1609.344 ? "mi" : "ft"}`;
      });
    };
    update();
    map.on("move", update);
    return () => {
      map.off("move", update);
      cancelAnimationFrame(frame);
    };
  }, [map, units]);
  return (
    <ScaleControl
      ref={control}
      key={units.preferences.distance}
      position="bottomleft"
      imperial={units.preferences.distance === "mi"}
      metric={units.preferences.distance === "km"}
    />
  );
}
function WindDigest({ session, cursor }) {
  const units = useUnits();
  return (
    <details
      className="wind-overlay"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.currentTarget.open = false;
          e.currentTarget.querySelector("summary")?.focus();
        }
      }}
    >
      <summary className="wind-summary" aria-label="Wind and source details">
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
          <strong
            title={units.alternate(
              session.wind == null ? null : session.wind * 0.44704,
              "speed",
            )}
          >
            {session.wind == null
              ? session.windFrom == null
                ? "Wind unavailable"
                : `From ${bearing(session.windFrom)} · speed unknown`
              : session.wind === 0
                ? `Calm · ${units.format(0, "speed")}`
                : `${session.windFrom == null ? "Direction unknown" : `From ${bearing(session.windFrom)}`} · ${units.format(session.wind * 0.44704, "speed")}`}
          </strong>
          <span>
            {session.windSource === "athlete_reported"
              ? "On-water report · session summary"
              : session.wind == null
                ? "No station observation in source"
                : `${session.windSource === "athlete_reported" ? "On-water report" : session.station || "Station"} · session summary`}
          </span>
        </div>
        <CaretDown className="wind-chevron" size={16} aria-hidden="true" />
      </summary>

      <div className="wind-source-popover">
        <WeatherPanel key={session.id} session={session} cursor={cursor} />
      </div>
    </details>
  );
}

export function SessionMap({ session, selected, onSelect, cursor, spot }) {
  const [tileError, setTileError] = useState(false);
  const runs = useMemo(
    () => validRuns(session.records, session.pauses, true, false),
    [session.records, session.pauses],
  );
  const all = runs.flat();
  const cursorRun = runs.find(
    (run) => cursor >= run[0].elapsed_s && cursor <= run.at(-1).elapsed_s,
  );
  const marker = cursorRun ? interpolate(cursorRun, cursor) : null;
  const spotRun =
    spot == null
      ? null
      : runs.find(
          (run) => spot >= run[0].elapsed_s && spot <= run.at(-1).elapsed_s,
        );
  const selectedMarker = spotRun ? interpolate(spotRun, spot) : null;
  const windows = reviewIntervals(session).filter(
    (w) => w.start != null && intervalKey(w) === selected,
  );
  if (!all.length)
    return (
      <div className="map-empty">
        <WindDigest key={session.id} session={session} cursor={cursor} />
        <MapPin size={32} />
        <h3>No track for this session</h3>
        <p>
          {session.records.length
            ? "GPS is unavailable. Recorded telemetry and calculated intervals remain available below."
            : "Only a session summary is stored. Add its Garmin FIT file to locate intervals."}
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
        aria-label="GPS track with subtle arrows following recorded travel, selected interval and annotations"
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution={
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          }
          eventHandlers={{ tileerror: () => setTileError(true) }}
        />
        <FitBounds points={all} reset={session.id} />
        <UnitScale />
        {runs.map((run, i) => (
          <Polyline
            key={i}
            positions={run.map((p) => [p.latitude_deg, p.longitude_deg])}
            pathOptions={{ color: "#304d61", weight: 3, opacity: 0.55 }}
          />
        ))}
        <Pane
          name={`route-direction-${session.id}`}
          key={`route-direction-${session.id}`}
          style={{ zIndex: 405, pointerEvents: "none" }}
        >
          <RouteArrows runs={runs} />
        </Pane>
        {selected &&
          windows
            .filter((w) => intervalKey(w) === selected)
            .map((w) => (
              <Pane
                name={`selected-window-${session.id}-${selected}`}
                key={`${session.id}-${selected}`}
                style={{ zIndex: 410 }}
              >
                <Polyline
                  positions={runs
                    .filter(
                      (r) =>
                        r.at(-1).elapsed_s >= w.start &&
                        r[0].elapsed_s <= w.end,
                    )
                    .map((r) =>
                      segmentPoints(
                        r,
                        Math.max(w.start, r[0].elapsed_s),
                        Math.min(w.end, r.at(-1).elapsed_s),
                      ).map((p) => [p.latitude_deg, p.longitude_deg]),
                    )}
                  pathOptions={{ color: "#fff", weight: 11, opacity: 0.9 }}
                  interactive={false}
                />
                <Polyline
                  positions={runs
                    .filter(
                      (r) =>
                        r.at(-1).elapsed_s >= w.start &&
                        r[0].elapsed_s <= w.end,
                    )
                    .map((r) =>
                      segmentPoints(
                        r,
                        Math.max(w.start, r[0].elapsed_s),
                        Math.min(w.end, r.at(-1).elapsed_s),
                      ).map((p) => [p.latitude_deg, p.longitude_deg]),
                    )}
                  pathOptions={{
                    color: intervalColor(w),
                    weight: 6,
                    opacity: 1,
                  }}
                  interactive={false}
                />
              </Pane>
            ))}
        <TravelArrows session={session} selected={selected} />
        {windows.map((w) => {
          const p = pointInRuns(runs, w.start);
          return (
            p &&
            Number.isFinite(p.latitude_deg) &&
            Number.isFinite(p.longitude_deg) && (
              <CircleMarker
                key={intervalKey(w)}
                center={[p.latitude_deg, p.longitude_deg]}
                radius={5}
                pathOptions={{
                  color: intervalColor(w),
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
                  {intervalTitle(w)} start · {timeLabel(w.start)}
                </MapTooltip>
              </CircleMarker>
            )
          );
        })}
        {selected &&
          (() => {
            const w = windows.find((w) => intervalKey(w) === selected),
              p = w && pointInRuns(runs, w.end);
            return (
              p &&
              Number.isFinite(p.latitude_deg) &&
              Number.isFinite(p.longitude_deg) && (
                <CircleMarker
                  center={[p.latitude_deg, p.longitude_deg]}
                  radius={6}
                  pathOptions={{
                    color: intervalColor(w),
                    fillColor: intervalColor(w),
                    fillOpacity: 1,
                  }}
                >
                  <MapTooltip direction="bottom">
                    {intervalTitle(w)} end · {timeLabel(w.end)}
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
          {selectedMarker && (
            <CircleMarker
              center={[
                selectedMarker.latitude_deg,
                selectedMarker.longitude_deg,
              ]}
              radius={8}
              pathOptions={{
                color: "#082936",
                weight: 3,
                fillColor: "#fff",
                fillOpacity: 1,
                className: "selected-point",
              }}
            >
              <MapTooltip>Selected point · {timeLabel(spot)}</MapTooltip>
            </CircleMarker>
          )}
          {marker && (
            <CircleMarker
              center={[marker.latitude_deg, marker.longitude_deg]}
              radius={5}
              interactive
              pathOptions={{
                color: "#fff",
                weight: 2,
                fillColor: "#429eac",
                fillOpacity: 0.65,
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
      {!marker && (
        <div className="map-gps-status" role="status">
          GPS unavailable at {timeLabel(cursor)}
        </div>
      )}
      <WindDigest key={session.id} session={session} cursor={cursor} />
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

function RouteArrows({ runs }) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const arrows = useMemo(() => {
    const accepted = [];
    for (const run of runs) {
      if (run.length < 2) continue;
      const window = { start: run[0].elapsed_s, end: run.at(-1).elapsed_s };
      const fractions = Array.from({ length: 79 }, (_, i) => (i + 1) / 80);
      for (const p of segmentDirections(run, window, [], fractions)) {
        const pixel = map.project([p.latitude_deg, p.longitude_deg], zoom);
        if (accepted.some((a) => a.pixel.distanceTo(pixel) < 38)) continue;
        accepted.push({ ...p, pixel });
        if (accepted.length >= 160) return accepted;
      }
    }
    return accepted;
  }, [map, zoom, runs]);
  return arrows.map((p) => (
    <Marker
      key={p.elapsed_s}
      position={[p.latitude_deg, p.longitude_deg]}
      interactive={false}
      keyboard={false}
      icon={divIcon({
        className: "route-direction-marker",
        iconSize: [7, 9],
        iconAnchor: [3.5, 4.5],
        html: `<svg viewBox="0 0 7 9" aria-hidden="true" style="transform:rotate(${p.bearing_deg}deg)"><path d="M1 6 L3.5 2 L6 6" fill="none" stroke="white" stroke-opacity="0.65" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      })}
    />
  ));
}

function TravelArrows({ session, selected }) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const arrows = useMemo(() => {
    const candidates = reviewIntervals(session).filter(
      (w) => w.start != null && selected === intervalKey(w),
    );
    const accepted = [];
    for (const w of candidates) {
      const fractions = Array.from({ length: 39 }, (_, i) => (i + 1) / 40);
      for (const p of segmentDirections(
        session.records,
        w,
        session.pauses,
        fractions,
      )) {
        const pixel = map.project([p.latitude_deg, p.longitude_deg], zoom);
        if (accepted.some((a) => a.pixel.distanceTo(pixel) < 14)) continue;
        accepted.push({ ...p, interval: w, pixel });
      }
    }
    return accepted;
  }, [
    map,
    zoom,
    session.records,
    session.pauses,
    session.windows,
    session.customIntervals,
    selected,
  ]);
  return arrows.map((p) => {
    const label = `${intervalTitle(p.interval)} travel ${bearing(p.bearing_deg)} at ${timeLabel(p.elapsed_s)}`;
    return (
      <Marker
        key={`${intervalKey(p.interval)}-${p.elapsed_s}`}
        position={[p.latitude_deg, p.longitude_deg]}
        interactive={false}
        keyboard={false}
        icon={divIcon({
          className: "travel-marker",
          iconSize: [6, 10],
          iconAnchor: [3, 5],
          html: `<span class="travel-symbol" role="img" aria-label="${label}"><svg viewBox="0 0 6 10" aria-hidden="true" style="transform:rotate(${p.bearing_deg}deg)"><path d="M3 1 L5.5 8 L3 6 L0.5 8 Z" fill="white" stroke="${intervalColor(p.interval)}" stroke-width="0.6" stroke-linejoin="round"/></svg></span>`,
        })}
      />
    );
  });
}

export function BestWindows({ session, selected, onSelect, onRemove, busy }) {
  const listRef = useRef(null);
  useEffect(() => {
    listRef.current?.querySelector(".window-button.chosen")?.scrollIntoView({
      behavior: "instant",
      block: "nearest",
      inline: "nearest",
    });
  }, [selected, session.customIntervals]);
  const windows = useMemo(
    () =>
      ensureWindowStatistics(
        reviewIntervals(session),
        session.records,
        session.pauses,
        session.annotations,
      ),
    [
      session.windows,
      session.customIntervals,
      session.records,
      session.pauses,
      session.annotations,
    ],
  );
  return (
    <section
      className="best-window-bar"
      aria-label="Best windows and saved custom intervals · derived telemetry"
    >
      <div
        className={`window-list ${session.customIntervals?.length ? "has-custom-intervals" : ""}`}
        ref={listRef}
        tabIndex={session.customIntervals?.length ? 0 : -1}
        role="group"
        aria-label="Interval tiles"
      >
        {windows.map((w) => {
          const stats = w.statistics;
          const stroke = stats?.distance_per_stroke;
          const tracking = stats?.tracking;
          const trackingDetail = `Eligible coverage: ${fmt(tracking?.coverage_pct)}%. ${tracking?.reason || ""}`;
          const detail =
            stroke?.value_m == null
              ? stroke?.reason
              : `${stroke.method === "matched_distance_cadence_integral_v1" ? "Estimated from distance and integrated cadence" : "Stored interval stroke distance"}. Coverage: ${fmt(stroke.coverage_pct, 0)}%. ${stroke.assumption || ""}`;
          return (
            <div
              className={`interval-tile ${w.id ? "custom-interval-tile" : ""}`}
              key={intervalKey(w)}
            >
              <button
                type="button"
                className={`window-button ${selected === intervalKey(w) ? "chosen" : ""}`}
                style={{ "--interval": intervalColor(w) }}
                onClick={() => onSelect(w)}
                disabled={w.start == null}
                aria-pressed={selected === intervalKey(w)}
                aria-label={`${intervalTitle(w)}${w.start == null ? ", unavailable" : w.id ? `, duration ${timeLabel(w.duration)}` : `, ${timeLabel(w.start)}–${timeLabel(w.end)}`}`}
              >
                <div>
                  <span className="window-dot" />
                  <strong>{w.id ? "Custom" : `${w.duration / 60} min`}</strong>
                  <b>
                    <Measure value={w.speed_mps} group="speed" />
                  </b>
                </div>
                {w.id && (
                  <span className="custom-interval-bounds">
                    {timeLabel(w.start)}–{timeLabel(w.end)}
                  </span>
                )}
                <span
                  className="window-time"
                  title={detail}
                  aria-description={detail}
                >
                  <span>
                    @{" "}
                    {fmt(
                      stats?.speed_cadence?.coverage_pct >= 90
                        ? stats.speed_cadence.cadence_spm
                        : null,
                    )}{" "}
                    spm
                  </span>
                  <span>
                    <Measure
                      value={stats?.distance_per_stroke?.value_m}
                      group="length"
                      suffix="/stroke"
                    />
                    {stroke?.status === "cadence_estimate" &&
                    stroke?.value_m != null
                      ? " est."
                      : ""}
                    {stroke?.value_m != null &&
                    stats?.speed_cadence?.coverage_pct < 90
                      ? " · partial"
                      : ""}
                  </span>
                </span>
                <span
                  className="window-tracking"
                  title={trackingDetail}
                  aria-description={trackingDetail}
                >
                  <TrackingScore
                    value={tracking?.score}
                    label
                    detail={trackingDetail}
                  />
                </span>
              </button>
              {w.id && (
                <button
                  type="button"
                  className="custom-interval-remove icon-button"
                  aria-label={`Remove ${intervalTitle(w)}`}
                  disabled={busy}
                  onClick={async () => {
                    if (await onRemove(w))
                      (
                        listRef.current?.querySelector(
                          ".window-button:not(:disabled)",
                        ) || listRef.current
                      )?.focus();
                  }}
                >
                  <X size={16} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function Timeline({
  session,
  selected,
  cursor,
  setCursor,
  spot,
  setSpot,
  rangeEnd,
  setRangeEnd,
  onAnnotate,
  onEdit,
  onManualSelection,
  onAddInterval,
  busy,
}) {
  const units = useUnits();
  const displaySpeed = (value) => units.convert(value, "speed");
  const [hover, setHover] = useState(null);
  const [extending, setExtending] = useState(false);
  useEffect(() => {
    if (spot == null) setExtending(false);
  }, [spot]);
  const [third, setThird] = useState("cadence");
  const [driftOpen, setDriftOpen] = useState(false);
  const rows = useMemo(() => {
    const dps = new Map(
      (session.deterministic?.dps_timeline || []).map((p) => [
        p.elapsed_s / 60,
        p.value_m,
      ]),
    );
    return chartRows(session.records).map((p) => ({
      ...p,
      speed: p.speed == null ? null : units.convert(p.speed * 0.44704, "speed"),
      dps: units.convert(dps.get(p.t), "length"),
    }));
  }, [session.records, session.deterministic, units]);
  const max = session.elapsed,
    ticks = Array.from({ length: Math.floor(max / 20) + 1 }, (_, i) => i * 20);
  const w = reviewIntervals(session).find((w) => intervalKey(w) === selected);
  const manualRange = spot != null && rangeEnd != null && spot !== rangeEnd;
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
  const selectPoint = (seconds, extend) => {
    if ((extend || extending) && spot != null) {
      setRangeEnd(seconds);
      onManualSelection(seconds !== spot);
    } else {
      setSpot(seconds);
      setRangeEnd(null);
      onManualSelection(false);
    }
    setExtending(false);
  };
  const annotatePoint = (event, nativeEvent) => {
    const seconds = pointTime(event);
    if (seconds == null) return;
    setCursor(seconds);
    selectPoint(seconds, nativeEvent?.shiftKey);
  };
  const keyboardCursor = (event) => {
    if (event.key === "Escape") setHover(null);
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
      selectPoint(cursor, event.shiftKey);
    }
  };
  return (
    <section className="timeline-section" aria-labelledby="timeline-title">
      <div className="section-heading">
        <h2 id="timeline-title">Performance</h2>
        <div className="performance-actions">
          {w?.start != null && (
            <span
              className="selection-caption"
              style={{ color: intervalColor(w) }}
            >
              {w.id
                ? w.id === "manual"
                  ? "Selected"
                  : "Custom"
                : `${w.duration / 60} min`}{" "}
              · {timeLabel(w.start)}–{timeLabel(w.end)}
            </span>
          )}
          {manualRange && (
            <button
              className="text-button"
              onClick={onAddInterval}
              disabled={busy}
            >
              <Plus size={16} /> Add interval
            </button>
          )}
          {spot != null && !manualRange && (
            <button
              className="text-button"
              aria-pressed={extending}
              onClick={() => setExtending(!extending)}
            >
              Choose interval end
              <span className="sr-only">
                , then click or tap a chart, or press Enter at another time
              </span>
            </button>
          )}
          <button className="text-button" onClick={() => setDriftOpen(true)}>
            Drift details
          </button>
          <button
            className="text-button"
            onClick={() =>
              onAnnotate(
                spot ?? (rows.length ? cursor : 0),
                rangeEnd ?? spot ?? (rows.length ? cursor : 0),
              )
            }
          >
            <NotePencil size={16} />{" "}
            {rows.length
              ? "Annotate " +
                (rangeEnd != null && spot != null
                  ? timeLabel(Math.min(spot, rangeEnd)) +
                    "–" +
                    timeLabel(Math.max(spot, rangeEnd))
                  : timeLabel(spot ?? cursor))
              : "Add annotation"}
          </button>
          {spot != null && (
            <button
              className="text-button"
              onClick={() => {
                setSpot(null);
                setRangeEnd(null);
                setExtending(false);
                if (selected === "manual") onManualSelection(false);
              }}
              aria-label="Clear chart selection"
            >
              Clear selection
            </button>
          )}
        </div>
      </div>
      <p id="chart-keyboard-help" className="sr-only">
        Elapsed time. Arrow keys move one second, Shift + arrow ten seconds.
        Home/End jump to limits. Click or Enter selects a persistent point.
        Shift+Click or Shift+Enter extends to an interval. Choose interval end
        also makes the next chart click, tap or Enter extend the selection.
        Annotate uses the selection; hover only moves the current position. Add
        interval saves a non-empty selection as a reusable tile.
      </p>
      {rows.length ? (
        <div className="chart-stack">
          {[
            ["Speed", units.symbol("speed"), "speed", "#008996", [0, "auto"]],
            ["Heart rate", "bpm", "hr", "#d54d72", [60, 180]],
            third === "dps"
              ? [
                  "Distance / stroke",
                  units.symbol("length") + "/stroke · est.",
                  "dps",
                  "#6273c9",
                  [0, "auto"],
                ]
              : ["Cadence", "spm", "cadence", "#6273c9", [0, "auto"]],
          ].map(([title, unit, key, color, domain], i) => {
            const stats =
              key === "speed"
                ? session.statistics?.speed_mps
                : key === "hr"
                  ? session.statistics?.heart_rate_bpm
                  : null;
            const convert = key === "speed" ? displaySpeed : (v) => v;
            const median = convert(stats?.median),
              peak = convert(stats?.max);
            return (
              <div className="timeline-row chart-row" key={key}>
                <div className="track-label" style={{ color }}>
                  {i === 2 ? (
                    <select
                      aria-label="Third chart metric"
                      value={third}
                      onChange={(e) => setThird(e.target.value)}
                    >
                      <option value="cadence">Cadence</option>
                      <option value="dps">DPS (est.)</option>
                    </select>
                  ) : (
                    title
                  )}
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
                        ? displaySpeed(usableSpeed(current?.speed_mps))
                        : key === "hr"
                          ? current?.heart_rate_bpm
                          : key === "dps"
                            ? rows.findLast(
                                (p) =>
                                  p.t <= cursor / 60 &&
                                  p.t >= (cursor - 15) / 60,
                              )?.dps
                            : current?.cadence_raw,
                      key === "speed" || key === "dps" ? 2 : 0,
                    ) +
                    " " +
                    unit +
                    (!current ? ", no sample" : "")
                  }
                  onKeyDown={keyboardCursor}
                  onPointerMove={(e) => {
                    if (e.pointerType === "touch") return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    setHover({
                      key,
                      x: Math.max(
                        0,
                        Math.min(rect.width - 174, e.clientX - rect.left + 14),
                      ),
                      y: e.clientY - rect.top - 82,
                    });
                  }}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover({ key, x: 0, y: -60 })}
                  onBlur={() => setHover(null)}
                >
                  {hover?.key === key && (
                    <div
                      className="chart-hover-values"
                      role="tooltip"
                      style={{ left: hover.x, top: hover.y }}
                    >
                      <b>{timeLabel(cursor)}</b>
                      <span>
                        {fmt(displaySpeed(usableSpeed(current?.speed_mps)), 2)}{" "}
                        {units.symbol("speed")} · {fmt(current?.heart_rate_bpm)}{" "}
                        bpm
                      </span>
                      <span>
                        {fmt(current?.cadence_raw)} spm
                        {key === "dps" &&
                          ` · ${fmt(rows.findLast((p) => p.t <= cursor / 60 && p.t >= (cursor - 15) / 60)?.dps, 2)} ${units.symbol("length")}/stroke · trailing 30 s`}
                        {!current ? " · No sample" : ""}
                      </span>
                    </div>
                  )}
                  {(key === "speed" || key === "hr") && (
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
                          {key === "speed" ? (
                            <Measure value={stats?.median} group="speed" />
                          ) : (
                            <>
                              {fmt(median)} {unit}
                            </>
                          )}
                        </b>
                      </span>
                      <span
                        title={
                          stats?.max_source === "fit_session"
                            ? "Maximum from the FIT session summary; may exceed the peak in sampled records."
                            : key === "speed"
                              ? "Maximum of supported recorded values after the 0–6 m/s sanity filter; smaller artifacts may remain."
                              : "Maximum of supported recorded values."
                        }
                      >
                        <i className="stat-line max-line" aria-hidden="true" />
                        Max{" "}
                        <b>
                          {key === "speed" ? (
                            <Measure value={stats?.max} group="speed" />
                          ) : (
                            <>
                              {fmt(peak)} {unit}
                            </>
                          )}
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
                          fill={intervalColor(w)}
                          fillOpacity={0.11}
                          stroke={intervalColor(w)}
                          strokeDasharray="3 3"
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
                        stroke="#80a9ae"
                        strokeWidth={1}
                      />
                      {spot != null && rangeEnd != null && (
                        <ReferenceArea
                          x1={Math.min(spot, rangeEnd) / 60}
                          x2={Math.max(spot, rangeEnd) / 60}
                          fill="#183c50"
                          fillOpacity={0.09}
                          stroke="#183c50"
                          strokeDasharray="4 2"
                        />
                      )}
                      {spot != null && (
                        <ReferenceLine
                          x={spot / 60}
                          stroke="#082936"
                          strokeWidth={2}
                          strokeDasharray="4 2"
                        />
                      )}
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
          No time-series data available. Stored summary values are available in
          Metric details.
        </div>
      )}
      <div className="timeline-row annotation-track">
        <span className="track-label">Events & notes</span>
        <div className="annotation-lane">
          {!session.annotations.length &&
            !session.deterministic?.movement?.events?.length && (
              <span className="empty-annotation">
                No detected events or notes
              </span>
            )}
          {(session.deterministic?.movement?.events || [])
            .filter((event) => !event.annotation_ids?.length)
            .map((event, i) => (
              <button
                key={`detected-${i}`}
                className="annotation-marker detected-event"
                style={{ left: `${(event.start_s / 60 / max) * 100}%` }}
                disabled={busy}
                onClick={() => {
                  setCursor(event.start_s);
                  setSpot(event.start_s);
                  setRangeEnd(event.end_s > event.start_s ? event.end_s : null);
                  setExtending(false);
                  onManualSelection(event.end_s > event.start_s);
                  onAnnotate(event.start_s, event.end_s, event);
                }}
                aria-label={`Annotate ${detectedEventLabel(event)} ${timeLabel(event.start_s)} to ${timeLabel(event.end_s)}; ${detectedEventDescription(event, units.preferences)}`}
                title={`${detectedEventLabel(event)} · ${timeLabel(event.start_s)}–${timeLabel(event.end_s)} · ${detectedEventDescription(event, units.preferences)}`}
              >
                <Diamond size={14} aria-hidden="true" />
              </button>
            ))}
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
      {driftOpen && (
        <DriftDetails
          session={session}
          onClose={() => setDriftOpen(false)}
          onInspect={setCursor}
        />
      )}
    </section>
  );
}
