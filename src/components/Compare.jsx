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
import { WINDOW_COLORS, latestSessions } from "../domain/metrics.mjs";
import { fmt, shortDate, bearing } from "./SessionViews.jsx";

export function Compare({ sessions, onOpen }) {
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
          <h1>Every session, in perspective.</h1>
          <p>
            Latest 10 sessions, compared automatically.{" "}
            <strong>{rows.length} available</strong> in your current data.
          </p>
        </div>
        <span className="quiet-badge">Google Sheet snapshot</span>
      </div>
      <div className="compare-summary">
        {["avgSpeed", "best20", "avgHr", "cadence"].map((key) => {
          const [label, u, d] = options[key],
            first = rows[0]?.[key],
            last = rows.at(-1)?.[key],
            delta = first == null || last == null ? null : last - first;
          return (
            <button
              className={`trend-summary ${metric === key ? "selected" : ""}`}
              key={key}
              onClick={() => setMetric(key)}
            >
              <span>{label}</span>
              <strong>
                {fmt(last, d)} <small>{u}</small>
              </strong>
              <span className="delta">
                {delta == null ? (
                  "No comparison"
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
      <section className="trend-panel">
        <div className="section-heading">
          <div>
            <h2>{title} over time</h2>
            <p>Chronological order · sheet values</p>
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
      <section className="sessions-table-section">
        <div className="section-heading">
          <h2>The sessions behind the trend</h2>
          <span className="caption">Most recent first</span>
        </div>
        <div className="table-scroll">
          <table>
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
                      onClick={() => onOpen(s.id)}
                    >
                      <strong>{s.title}</strong>
                      <span>
                        {shortDate(s.date)} <ArrowUpRight size={13} />
                      </span>
                    </button>
                  </td>
                  <td>{fmt(s.distance, 2)} mi</td>
                  <td>{fmt(s.active, 1)} min</td>
                  <td>{fmt(s.avgSpeed, 2)} mph</td>
                  <td>
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
                  <td>
                    {fmt(s.avgHr)} bpm
                    <small>
                      {/suspect/i.test(s.hrQuality || "")
                        ? "Early HR suspect"
                        : ""}
                    </small>
                  </td>
                  <td>{fmt(s.cadence)} spm</td>
                  <td>
                    {s.wind == null
                      ? "Unknown"
                      : `${fmt(s.wind, 2)} mph ${bearing(s.windFrom)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
