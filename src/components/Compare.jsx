import React, { useState } from "react";
import { ArrowUpRight, Info } from "@phosphor-icons/react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { latestSessions, mph, durationLabel } from "../domain/metrics.mjs";
import { metricView } from "../domain/metric-view.mjs";
import { fmt, shortDate } from "./SessionViews.jsx";
import { MetricDetails } from "./MetricEvidence.jsx";

export function Compare({ sessions, boards = [], onOpen }) {
  const [basis, setBasis] = useState("best20"),
    [metric, setMetric] = useState("speed"),
    [details, setDetails] = useState(null);
  const duration = basis === "best20" ? 1200 : null;
  const newest = latestSessions(sessions).map((session) => {
    const view = metricView(session, duration);
    return {
      ...session,
      view,
      speed: mph(view.speed),
      dps: view.dps,
      cadenceValue: view.cadence,
      zigzag: view.zigzag,
      hr: view.hr,
      dateLabel: shortDate(session.date),
    };
  });
  const options = {
    speed: ["Speed", "mph", 2, "#008591"],
    dps: ["Estimated distance per stroke", "m/stroke", 2, "#7952c7"],
    cadenceValue: ["Recorded cadence", "spm", 0, "#6273c9"],
    zigzag: ["Zig-zag · experimental", "/100", 1, "#008591"],
    hr: ["Heart rate", "bpm", 0, "#d54d72"],
  };
  const [title, unit, dp, color] = options[metric];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR PROGRESS</p>
          <h1>Recent sessions</h1>
          <p>
            Latest 10 sessions, compared automatically.{" "}
            <strong>{newest.length} available</strong>.
          </p>
        </div>
        <div className="metric-scope" aria-label="Comparison basis">
          <button
            aria-pressed={basis === "best20"}
            onClick={() => setBasis("best20")}
          >
            Best 20 min
          </button>
          <button
            aria-pressed={basis === "session"}
            onClick={() => setBasis("session")}
          >
            Whole session
          </button>
        </div>
      </div>
      <section className="sessions-table-section metrics-session-list">
        <div className="section-heading">
          <h2>
            {basis === "best20"
              ? "Best 20-minute metrics"
              : "Whole-session metrics"}
          </h2>
          <span className="caption">Most recent first</span>
        </div>
        <div className="table-scroll">
          <table className="home-sessions-table clean-metrics-table">
            <caption className="sr-only">
              Session metrics.{" "}
              {basis === "best20"
                ? "Exact continuous 20-minute efforts"
                : "Supported whole-session averages"}
              . Unavailable values are dashes. Open metric details for coverage
              and source.
            </caption>
            <thead>
              <tr>
                {[
                  "Session",
                  "Speed @ cadence",
                  "Distance / stroke",
                  "Zig-zag · experimental",
                  "HR",
                  "Details",
                ].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {newest.map((s) => (
                <tr key={s.id}>
                  <td>
                    <button
                      className="session-link"
                      aria-label={"Open " + shortDate(s.date) + " · " + s.title}
                      onClick={() => onOpen(s.id)}
                    >
                      <strong>{s.title}</strong>
                      <span>
                        {shortDate(s.date)} <ArrowUpRight size={13} />
                      </span>
                    </button>
                    <small>
                      {fmt(s.distance, 2)} mi · {durationLabel(s.active)} ·{" "}
                      {boards.find((b) => b.id === s.boardId)?.name ||
                        "Board unknown"}
                    </small>
                  </td>
                  <td data-label="Speed @ cadence">
                    <strong>
                      {fmt(s.speed, 2)} <span>mph</span> @ {fmt(s.view.cadence)}{" "}
                      <span>spm</span>
                    </strong>
                    <small>
                      {s.speed == null
                        ? "No supported effort"
                        : fmt(s.view.coverage) +
                          "% matched" +
                          (!s.view.paired ? " · cadence unavailable" : "")}
                    </small>
                  </td>
                  <td data-label="Distance / stroke">
                    <strong>
                      {fmt(s.dps, 2)} <span>m/stroke</span>
                    </strong>
                    <small>
                      estimated
                      {s.dps != null && !s.view.paired ? " · partial" : ""}
                    </small>
                  </td>
                  <td data-label="Zig-zag · experimental">
                    <strong>
                      {fmt(s.zigzag, 1)} <span>/ 100</span>
                    </strong>
                    <small>
                      {fmt(s.view.evidence?.zigzag?.coverage_pct)}% eligible
                    </small>
                  </td>
                  <td data-label="Heart rate">
                    {fmt(s.hr)} bpm
                    {(s.hrQuality ||
                      (s.view.evidence?.heart_rate_bpm?.coverage_pct ?? 0) <
                        90) && (
                      <small>{s.hrQuality || "Partial / unavailable"}</small>
                    )}
                  </td>
                  <td data-label="Metric details">
                    <button
                      className="text-button"
                      aria-label={"Metric details for " + shortDate(s.date)}
                      onClick={() => setDetails(s)}
                    >
                      <Info size={17} />
                      <span className="mobile-detail-label">Details</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!newest.length && (
          <p className="board-empty">
            No sessions available in your stored data.
          </p>
        )}
      </section>
      <section className="trend-panel compact-metric-trend">
        <div className="section-heading">
          <div>
            <h2>{title} over time</h2>
            <p>
              {basis === "best20" ? "Best 20 min" : "Whole session"} ·
              chronological · derived telemetry
            </p>
          </div>
          <label className="inline-label">
            Metric
            <select
              aria-label="Comparison parameter"
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
            >
              {Object.entries(options).map(([key, [label]]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="compare-chart">
          <ResponsiveContainer width="100%" height={210} minWidth={0}>
            <LineChart
              data={[...newest].reverse()}
              margin={{ top: 20, right: 24, bottom: 8, left: 0 }}
            >
              <CartesianGrid vertical={false} stroke="#e8edf1" />
              <XAxis
                dataKey="dateLabel"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "#63788d" }}
              />
              <YAxis
                width={70}
                domain={metric === "zigzag" ? [0, 100] : ["auto", "auto"]}
                tickFormatter={(v) => fmt(v, dp)}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "#63788d" }}
              />
              <Line
                type="linear"
                dataKey={metric}
                stroke={color}
                strokeWidth={2}
                dot={{ r: 4, fill: "white" }}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Tooltip formatter={(v) => [fmt(v, dp) + " " + unit, title]} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="caption">
          {unit} · Conditions, boards and coverage vary. These descriptive
          trends do not establish improved fitness or technique. Zig-zag: higher
          means a straighter eligible recorded path.
        </p>
      </section>
      {details && (
        <MetricDetails
          session={details}
          duration={duration}
          onClose={() => setDetails(null)}
        />
      )}
    </>
  );
}
