import React, { useState } from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Info,
} from "@phosphor-icons/react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  WINDOW_COLORS,
  latestSessions,
  durationLabel,
} from "../domain/metrics.mjs";
import { fmt, shortDate, bearing } from "./SessionViews.jsx";

export function Compare({ sessions, boards = [], onOpen }) {
  const [metric, setMetric] = useState("avgSpeed");
  const newest = latestSessions(sessions),
    rows = [...newest]
      .reverse()
      .map((s) => ({ ...s, dateLabel: shortDate(s.date) }));
  const options = {
    avgSpeed: ["Average speed", "mph", 2, "#008996"],
    best20: ["Best 20 min", "mph", 2, "#008996"],
    best10: ["Best 10 min", "mph", 2, "#7952c7"],
    best5: ["Best 5 min", "mph", 2, "#c9790b"],
    avgHr: ["Heart rate", "bpm", 0, "#d54d72"],
    cadence: ["Cadence", "spm", 0, "#6273c9"],
    distance: ["Distance", "mi", 2, "#008996"],
    active: ["Active time", "min", 1, "#008996"],
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
            <strong>{rows.length} available</strong> in your current data.
          </p>
        </div>
        <span className="quiet-badge">Saved in your app</span>
      </div>
      <div className="compare-summary">
        {["avgSpeed", "best20", "avgHr", "cadence"].map((key) => {
          const [label, u, d] = options[key],
            first = rows[0]?.[key],
            last = rows.at(-1)?.[key],
            delta =
              rows.length < 2 || first == null || last == null
                ? null
                : last - first;
          return (
            <button
              className={`trend-summary ${metric === key ? "selected" : ""}`}
              key={key}
              aria-pressed={metric === key}
              onClick={() => setMetric(key)}
            >
              <span>{label}</span>
              <strong>
                {fmt(last, d)} <small>{u}</small>
              </strong>
              <span className="delta">
                {delta == null ? (
                  "No comparison available"
                ) : (
                  <>
                    {delta === 0 ? (
                      <Minus size={16} />
                    ) : delta > 0 ? (
                      <ArrowUpRight size={16} />
                    ) : (
                      <ArrowDownRight size={16} />
                    )}{" "}
                    {delta > 0 ? "+" : ""}
                    {fmt(delta, d)} {u} from {shortDate(rows[0].date)}
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <section className="sessions-table-section">
        <div className="section-heading">
          <h2>Your latest sessions</h2>
          <span className="caption">Most recent first</span>
        </div>
        <div className="table-scroll">
          <table className="home-sessions-table">
            <caption className="sr-only">
              Latest sessions, most recent first. Source: stored session
              summaries. Board assignments are athlete reported.
            </caption>
            <thead>
              <tr>
                {[
                  "Session",
                  "Distance",
                  "Active",
                  "Avg speed",
                  "Best 5 / 10 / 20 min",
                  "Heart rate",
                  "Cadence",
                  "Wind",
                  "Board",
                ].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {newest.map((s) => (
                <tr key={s.id}>
                  <td>
                    <button
                      className="session-link"
                      aria-label={`Open ${shortDate(s.date)} · ${s.title}`}
                      onClick={() => onOpen(s.id)}
                    >
                      <strong>{s.title}</strong>
                      <span>
                        {shortDate(s.date)} <ArrowUpRight size={13} />
                      </span>
                    </button>
                    <small>
                      {s.records?.length ? "FIT + summary" : "Summary only"}
                    </small>
                  </td>
                  <td data-label="Distance">{fmt(s.distance, 2)} mi</td>
                  <td data-label="Active time">{durationLabel(s.active)}</td>
                  <td data-label="Average speed">{fmt(s.avgSpeed, 2)} mph</td>
                  <td data-label="Best 5 / 10 / 20 min">
                    <span
                      className="table-interval"
                      style={{ color: WINDOW_COLORS[300] }}
                    >
                      {fmt(s.best5, 2)}
                    </span>{" "}
                    /{" "}
                    <span
                      className="table-interval"
                      style={{ color: WINDOW_COLORS[600] }}
                    >
                      {fmt(s.best10, 2)}
                    </span>{" "}
                    /{" "}
                    <span
                      className="table-interval"
                      style={{ color: WINDOW_COLORS[1200] }}
                    >
                      {fmt(s.best20, 2)}
                    </span>{" "}
                    mph
                  </td>
                  <td data-label="Heart rate">
                    {fmt(s.avgHr)} bpm
                    <small>
                      {/suspect/i.test(s.hrQuality || "")
                        ? "Early HR suspect"
                        : ""}
                    </small>
                  </td>
                  <td data-label="Cadence">{fmt(s.cadence)} spm</td>
                  <td
                    data-label="Wind"
                    title={s.weatherQuality || "Source quality unknown"}
                  >
                    {s.wind == null
                      ? "Unknown"
                      : `${fmt(s.wind, 2)} mph ${bearing(s.windFrom)}`}
                    {s.windSource === "athlete_reported" && (
                      <small>On-water report</small>
                    )}
                  </td>
                  <td data-label="Board" className="board-cell">
                    {boards.find((b) => b.id === s.boardId)?.name ||
                      "Not recorded"}
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
      <section className="trend-panel">
        <div className="section-heading">
          <div>
            <h2>{title} over time</h2>
            <p>Chronological order · stored summaries</p>
          </div>
          <label className="inline-label">
            Parameter
            <select
              aria-label="Comparison parameter"
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
            >
              {Object.entries(options).map(([key, [label]]) => (
                <option value={key} key={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="compare-chart">
          <ResponsiveContainer width="100%" height={270} minWidth={0}>
            <LineChart
              data={rows}
              margin={{ top: 20, right: 32, bottom: 8, left: 0 }}
            >
              <CartesianGrid vertical={false} stroke="#e8edf1" />
              <XAxis
                dataKey="dateLabel"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "#708194" }}
              />
              <YAxis
                unit={` ${unit}`}
                width={68}
                domain={["auto", "auto"]}
                allowDecimals={dp > 0}
                tickFormatter={(value) => fmt(value, dp)}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "#708194" }}
              />
              <Line
                type="linear"
                dataKey={metric}
                stroke={color}
                strokeWidth={2.5}
                dot={{ r: 5, fill: "white", strokeWidth: 2.5 }}
                activeDot={{ r: 7 }}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Tooltip formatter={(v) => [`${fmt(v, dp)} ${unit}`, title]} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="caption">
          <Info size={15} /> Conditions and session lengths vary. These are raw
          trends; a change does not by itself establish improved fitness or
          technique.
        </p>
      </section>
    </>
  );
}
