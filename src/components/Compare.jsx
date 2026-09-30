import React, { useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowUp,
  ArrowDown,
  Info,
  DotsThree,
} from "@phosphor-icons/react";
import { SessionEditDialog } from "./SessionHeader.jsx";
import { previousThreeChange } from "../domain/trends.mjs";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { latestSessions, mph, durationLabel } from "../domain/metrics.mjs";
import { metricView } from "../domain/metric-view.mjs";
import { fmt, shortDate } from "./SessionViews.jsx";
import { MetricDetails } from "./MetricEvidence.jsx";

import { TrackingScore, TrackingDot } from "./TrackingScore.jsx";

export function Compare({
  sessions,
  boards = [],
  defaultBoardId,
  goals = [],
  onOpen,
  onAction,
  onManage,
}) {
  goals = goals.filter((g) => g.active !== false && g.target_si != null);
  const [editing, setEditing] = useState(null);
  const actionTrigger = useRef(null);
  const [basis, setBasis] = useState("best20"),
    [metric, setMetric] = useState("speed"),
    [details, setDetails] = useState(null);
  const duration = basis === "best20" ? 1200 : null;
  const history = latestSessions(sessions, sessions.length).map((session) => {
    const view = metricView(session, duration);
    return {
      ...session,
      view,
      speed: mph(view.speed),
      maxSpeed: mph(session.statistics?.speed_mps?.max),
      average_speed: mph(metricView(session).speed),
      ...Object.fromEntries(
        [300, 600, 1200].map((d) => [
          `best_${d}`,
          mph(metricView(session, d).speed),
        ]),
      ),
      ...Object.fromEntries(
        goals
          .filter((g) => g.metric === "cadence_duration")
          .map((g) => [
            `goal:${g.id}`,
            session.goalMetrics?.[g.id]?.value_s == null
              ? null
              : session.goalMetrics[g.id].value_s / 60,
          ]),
      ),
      dps: view.dps,
      cadenceValue: view.cadence,
      tracking: view.tracking,
      hr: view.hr,
      dateLabel: shortDate(session.date),
    };
  });
  const newest = history.slice(0, 10);
  const change = (index, key) => {
    const delta = previousThreeChange(history, index, key);
    if (!delta) return null;
    const label = `${delta.percent > 0 ? "Up" : "Down"} ${Math.abs(delta.percent).toFixed(1)}% versus mean of previous three sessions; numerical direction, not a fitness assessment`;
    const Icon = delta.percent > 0 ? ArrowUp : ArrowDown;
    return (
      <span
        className={`metric-change ${delta.percent > 0 ? "increase" : "decrease"}`}
        title={label}
        role="img"
        aria-label={label}
      >
        <Icon size={12} weight="bold" />
      </span>
    );
  };
  const options = {
    speed: ["Speed", "mph", 2, "#008591"],
    maxSpeed: ["Session maximum speed", "mph", 2, "#327aa6"],
    average_speed: ["Whole-session average speed", "mph", 2, "#008591"],
    best_300: ["Best 5-minute speed", "mph", 2, "#c9790b"],
    best_600: ["Best 10-minute speed", "mph", 2, "#7952c7"],
    best_1200: ["Best 20-minute speed", "mph", 2, "#008591"],
    ...Object.fromEntries(
      goals
        .filter((g) => g.metric === "cadence_duration")
        .map((g) => [
          `goal:${g.id}`,
          [`Longest above ${g.cadence_threshold_spm} spm`, "min", 2, "#6273c9"],
        ]),
    ),
    dps: ["Estimated distance per stroke", "m/stroke", 2, "#7952c7"],
    cadenceValue: ["Recorded cadence", "spm", 0, "#6273c9"],
    tracking: ["Tracking Control Score", "/100", 1, "#91a3b0"],
    hr: ["Heart rate", "bpm", 0, "#d54d72"],
  };
  const effectiveMetric = options[metric] ? metric : "speed";
  const [title, unit, dp, color] = options[effectiveMetric];
  const applicableGoals = goals.filter(
    (g) =>
      effectiveMetric === `goal:${g.id}` ||
      g.metric ===
        (effectiveMetric === "maxSpeed"
          ? "max_speed"
          : effectiveMetric === "speed"
            ? basis === "best20"
              ? "best_1200"
              : "average_speed"
            : effectiveMetric),
  );
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
      <section className="trend-panel compact-metric-trend">
        <div className="section-heading">
          <div>
            <h2>{title} over time</h2>
            <p>
              {effectiveMetric === "maxSpeed"
                ? "Whole-session maximum"
                : effectiveMetric === "average_speed" ||
                    effectiveMetric.startsWith("goal:")
                  ? "Whole session"
                  : effectiveMetric.startsWith("best_")
                    ? `Best ${Number(effectiveMetric.slice(5)) / 60} min`
                    : basis === "best20"
                      ? "Best 20 min"
                      : "Whole session"}{" "}
              · chronological · derived telemetry
            </p>
          </div>
          <label className="inline-label">
            Metric
            <select
              aria-label="Comparison parameter"
              value={effectiveMetric}
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
                domain={
                  effectiveMetric === "tracking" ? [0, 100] : ["auto", "auto"]
                }
                tickFormatter={(v) => fmt(v, dp)}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "#63788d" }}
              />
              <Line
                type="linear"
                dataKey={effectiveMetric}
                stroke={color}
                strokeWidth={2}
                dot={
                  effectiveMetric === "tracking" ? (
                    <TrackingDot />
                  ) : (
                    { r: 4, fill: "white" }
                  )
                }
                connectNulls={false}
                isAnimationActive={false}
              />
              <Tooltip formatter={(v) => [fmt(v, dp) + " " + unit, title]} />
              {applicableGoals.map((g) => (
                <ReferenceLine
                  key={g.id}
                  y={
                    g.metric === "cadence_duration"
                      ? g.target_si / 60
                      : mph(g.target_si)
                  }
                  stroke="#91acb5"
                  strokeDasharray="5 5"
                  ifOverflow="extendDomain"
                  label={{
                    value: `Goal ${fmt(g.metric === "cadence_duration" ? g.target_si / 60 : mph(g.target_si), 2)} ${unit}`,
                    position: "insideTopRight",
                    fill: "#536f7a",
                    fontSize: 11,
                  }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="caption">
          {applicableGoals
            .map(
              (g) =>
                `Goal: ${fmt(g.metric === "cadence_duration" ? g.target_si / 60 : mph(g.target_si), 2)} ${unit}. `,
            )
            .join("")}
          {unit} · Conditions, boards and coverage vary. These descriptive
          trends do not establish improved fitness or technique.
        </p>
      </section>
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
                  "Session max",
                  "Distance / stroke",
                  "TCS",
                  "HR",
                  "Details",
                  "Actions",
                ].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {newest.map((s, index) => (
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
                      {fmt(s.speed, 2)} <span>mph</span>
                      {change(index, "speed")} @ {fmt(s.view.cadence)}{" "}
                      <span>spm</span>
                      {change(index, "cadenceValue")}
                    </strong>
                    <small>
                      {s.speed == null
                        ? "No supported effort"
                        : fmt(s.view.coverage) +
                          "% matched" +
                          (!s.view.paired ? " · cadence unavailable" : "")}
                    </small>
                  </td>
                  <td
                    data-label="Session max"
                    title={s.statistics?.speed_mps?.max_source || "Unavailable"}
                  >
                    <strong>
                      {fmt(s.maxSpeed, 2)} <span>mph</span>
                      {change(index, "maxSpeed")}
                    </strong>
                    <small>
                      {s.statistics?.speed_mps?.summary_max_excluded ||
                      s.statistics?.speed_mps?.quality?.excluded_sample_count
                        ? "filtered maximum · see details"
                        : "whole-session maximum"}
                    </small>
                  </td>
                  <td data-label="Distance / stroke">
                    <strong>
                      {fmt(s.dps, 2)} <span>m/stroke</span>
                      {change(index, "dps")}
                    </strong>
                    <small>
                      estimated
                      {s.dps != null && !s.view.paired ? " · partial" : ""}
                    </small>
                  </td>
                  <td data-label="TCS">
                    <TrackingScore value={s.tracking} />
                    {change(index, "tracking")}
                    <small>
                      {fmt(s.view.evidence?.tracking?.coverage_pct)}% eligible
                    </small>
                  </td>
                  <td data-label="Heart rate">
                    {fmt(s.hr)} bpm{change(index, "hr")}
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
                  <td data-label="Session actions">
                    <details
                      className="session-actions-menu"
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.currentTarget.open = false;
                          e.currentTarget.querySelector("summary").focus();
                        }
                      }}
                    >
                      <summary
                        aria-label={`Actions for ${shortDate(s.date)} · ${s.title}`}
                      >
                        <DotsThree size={24} />
                      </summary>
                      <div>
                        {[
                          "Edit",
                          "Recalculate",
                          "Refresh weather",
                          "Delete",
                        ].map((action) => (
                          <button
                            key={action}
                            onClick={async (e) => {
                              const menu = e.currentTarget.closest("details");
                              actionTrigger.current =
                                menu.querySelector("summary");
                              menu.open = false;
                              if (action === "Edit" || action === "Delete")
                                setEditing({
                                  session: s,
                                  deleting: action === "Delete",
                                });
                              else
                                await onAction(
                                  action === "Recalculate"
                                    ? "recalculate_session"
                                    : "fetch_session_weather",
                                  { session_id: s.id },
                                  action === "Recalculate"
                                    ? "Derived metrics recalculated."
                                    : "Weather retrieval requested.",
                                );
                            }}
                          >
                            {action}
                          </button>
                        ))}
                      </div>
                    </details>
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
      {details && (
        <MetricDetails
          session={details}
          duration={duration}
          onClose={() => setDetails(null)}
        />
      )}
      {editing && (
        <SessionEditDialog
          session={editing.session}
          boards={boards}
          defaultBoardId={defaultBoardId}
          deleting={editing.deleting}
          returnFocusRef={actionTrigger}
          onClose={() => setEditing(null)}
          onManage={onManage}
          onSave={async (args) => {
            if (
              !(await onAction(
                "update_session_details",
                args,
                "Session details saved.",
              ))
            )
              throw new Error("Session could not be saved.");
          }}
          onDelete={async () => {
            if (
              !(await onAction(
                "delete_session",
                { session_id: editing.session.id },
                "Session deleted. You can upload its FIT again.",
              ))
            )
              throw new Error("Session could not be deleted.");
          }}
        />
      )}
    </>
  );
}
