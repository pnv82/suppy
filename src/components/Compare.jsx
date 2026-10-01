import { HOME_COLUMNS, DEFAULT_HOME_COLUMNS } from "../domain/home-columns.mjs";
import { HomeColumns } from "./HomeColumns.jsx";
import React, { useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowUp,
  ArrowDown,
  Info,
  DotsThree,
} from "@phosphor-icons/react";
import { SessionEditDialog } from "./SessionHeader.jsx";
import { previousThreeChange, trendAvailability } from "../domain/trends.mjs";
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
import { latestSessions, durationLabel } from "../domain/metrics.mjs";
import { metricView } from "../domain/metric-view.mjs";
import {
  EXTENDED_GOALS,
  GOAL_METRICS,
  goalValue,
  goalUnit,
  goalScope,
  goalLowerIsBetter,
  sessionGoalProgress,
} from "../domain/goals.mjs";
import { Measure, useUnits } from "./Units.jsx";
import { GoalMetric } from "./GoalTrophy.jsx";
import { fmt, shortDate } from "./SessionViews.jsx";
import { MetricDetails } from "./MetricEvidence.jsx";

import { TrackingScore, TrackingDot } from "./TrackingScore.jsx";

export function Compare({
  sessions,
  homeColumns = DEFAULT_HOME_COLUMNS,
  boards = [],
  defaultBoardId,
  goals = [],
  onOpen,
  onAction,
  onManage,
}) {
  const units = useUnits();
  const [choosingColumns, setChoosingColumns] = useState(false);
  const columns = Object.keys(HOME_COLUMNS).filter((c) =>
    homeColumns.includes(c),
  );
  const displaySpeed = (value) => units.convert(value, "speed");
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
      goalProgress: sessionGoalProgress(session, goals, duration),
      speed: displaySpeed(view.speed),
      maxSpeed: displaySpeed(session.statistics?.speed_mps?.max),
      average_speed: displaySpeed(metricView(session).speed),
      ...Object.fromEntries(
        [300, 600, 1200].map((d) => [
          `best_${d}`,
          displaySpeed(metricView(session, d).speed),
        ]),
      ),
      ...Object.fromEntries(
        goals
          .filter(
            (g) =>
              g.metric === "cadence_duration" ||
              EXTENDED_GOALS.includes(g.metric),
          )
          .map((g) => [
            `goal:${g.id}`,
            goalValue(
              g,
              g.metric === "cadence_duration"
                ? session.goalMetrics?.[g.id]?.value_s
                : session.goalMetrics?.[g.id]?.value_si,
              units.preferences,
            ),
          ]),
      ),
      dps: units.convert(view.dps, "length"),
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
    speed: ["Speed", units.symbol("speed"), 2, "#008591"],
    maxSpeed: ["Max speed (10 s)", units.symbol("speed"), 2, "#327aa6"],
    average_speed: [
      "Whole-session average speed",
      units.symbol("speed"),
      2,
      "#008591",
    ],
    best_300: ["Best 5-minute speed", units.symbol("speed"), 2, "#c9790b"],
    best_600: ["Best 10-minute speed", units.symbol("speed"), 2, "#7952c7"],
    best_1200: ["Best 20-minute speed", units.symbol("speed"), 2, "#008591"],
    ...Object.fromEntries(
      goals
        .filter(
          (g) =>
            g.metric === "cadence_duration" ||
            EXTENDED_GOALS.includes(g.metric),
        )
        .map((g) => [
          `goal:${g.id}`,
          [
            g.metric === "cadence_duration"
              ? `Longest above ${g.cadence_threshold_spm} spm`
              : `${GOAL_METRICS[g.metric]} · ${goalScope(g, units.preferences)}`,
            goalUnit(g, units.preferences),
            2,
            "#6273c9",
          ],
        ]),
    ),
    dps: [
      "Estimated distance per stroke",
      units.symbol("length") + "/stroke",
      2,
      "#7952c7",
    ],
    cadenceValue: ["Recorded cadence", "spm", 0, "#6273c9"],
    tracking: ["Tracking Control Score", "/100", 1, "#91a3b0"],
    hr: ["Heart rate", "bpm", 0, "#d54d72"],
  };
  const effectiveMetric = options[metric] ? metric : "speed";
  const selectedGoal = goals.find((g) => `goal:${g.id}` === effectiveMetric);
  const availability = trendAvailability(newest, effectiveMetric, selectedGoal);
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
              {selectedGoal
                ? goalScope(selectedGoal, units.preferences)
                : effectiveMetric === "maxSpeed"
                  ? "Fastest continuous 10 seconds"
                  : effectiveMetric === "average_speed"
                    ? "Whole session"
                    : effectiveMetric.startsWith("best_")
                      ? `Best ${Number(effectiveMetric.slice(5)) / 60} min`
                      : basis === "best20"
                        ? "Best 20 min"
                        : "Whole session"}{" "}
              · chronological ·{" "}
              {selectedGoal?.metric === "turns_footwork"
                ? "athlete-reported practice"
                : "derived telemetry"}
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
          {availability.available === 0 ? (
            <div className="compare-chart-empty" role="status" tabIndex={0}>
              <strong>
                {availability.total
                  ? "No qualifying results in these sessions"
                  : "No sessions yet"}
              </strong>
              {availability.total ? (
                <ul>
                  {availability.reasons.map(({ reason, count }) => (
                    <li key={reason}>
                      <span>
                        {count} {count === 1 ? "session" : "sessions"}
                      </span>{" "}
                      · {reason}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Import a session to see this trend.</p>
              )}
            </div>
          ) : (
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
                    y={goalValue(g, g.target_si, units.preferences)}
                    stroke="#91acb5"
                    strokeDasharray="5 5"
                    ifOverflow="extendDomain"
                    label={{
                      value: `Goal ${goalLowerIsBetter(g) ? "≤ " : ""}${fmt(goalValue(g, g.target_si, units.preferences), 2)} ${unit}`,
                      position: "insideTopRight",
                      fill: "#536f7a",
                      fontSize: 11,
                    }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <p className="caption">
          {applicableGoals.map((g) => (
            <span
              key={g.id}
              title={
                unit === units.symbol("speed")
                  ? units.alternate(g.target_si, "speed")
                  : undefined
              }
            >
              {`Goal: ${goalLowerIsBetter(g) ? "at most " : ""}${fmt(goalValue(g, g.target_si, units.preferences), 2)} ${unit}. `}
            </span>
          ))}
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
          <div className="home-list-actions">
            <span className="caption">Most recent first</span>
            <button
              className="text-button"
              onClick={() => setChoosingColumns(true)}
            >
              Columns
            </button>
          </div>
        </div>
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Session columns; scroll horizontally for more metrics"
        >
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
                  ...columns.map((c) => HOME_COLUMNS[c]),
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
                      <Measure
                        value={
                          s.distance == null ? null : s.distance * 1609.344
                        }
                        group="distance"
                      />{" "}
                      · {durationLabel(s.active)} ·{" "}
                      {boards.find((b) => b.id === s.boardId)?.name ||
                        "Board unknown"}
                    </small>
                  </td>
                  {columns.includes("speed") && (
                    <td data-label="Speed @ cadence">
                      <strong>
                        <GoalMetric progress={s.goalProgress.speed}>
                          <Measure value={s.view.speed} group="speed" />
                        </GoalMetric>
                        {change(index, "speed")}{" "}
                        <span className="metric-cadence-value">
                          @ {fmt(s.view.cadence)} <span>spm</span>
                          {change(index, "cadenceValue")}
                        </span>
                      </strong>
                      <small>
                        {s.speed == null
                          ? "No supported effort"
                          : fmt(s.view.coverage) +
                            "% matched" +
                            (!s.view.paired ? " · cadence unavailable" : "")}
                      </small>
                    </td>
                  )}
                  {columns.includes("maxSpeed") && (
                    <td
                      data-label="Max speed (10 s)"
                      title={
                        s.statistics?.speed_mps?.max_source || "Unavailable"
                      }
                    >
                      <strong>
                        <GoalMetric progress={s.goalProgress.maxSpeed}>
                          <Measure
                            value={s.statistics?.speed_mps?.max}
                            group="speed"
                          />
                        </GoalMetric>
                        {change(index, "maxSpeed")}
                      </strong>
                      <small>
                        {s.statistics?.speed_mps?.summary_max_excluded ||
                        s.statistics?.speed_mps?.quality?.excluded_sample_count
                          ? "filtered 10 s average · see details"
                          : "continuous 10 s average"}
                      </small>
                    </td>
                  )}
                  {columns.includes("dps") && (
                    <td data-label="Distance / stroke">
                      <strong>
                        <Measure
                          value={s.view.dps}
                          group="length"
                          suffix="/stroke"
                        />
                        {change(index, "dps")}
                      </strong>
                      <small>
                        estimated
                        {s.dps != null && !s.view.paired ? " · partial" : ""}
                      </small>
                    </td>
                  )}
                  {columns.includes("tracking") && (
                    <td data-label="TCS">
                      <GoalMetric progress={s.goalProgress.tracking}>
                        <TrackingScore value={s.tracking} />
                      </GoalMetric>
                      {change(index, "tracking")}
                      <small>
                        {fmt(s.view.evidence?.tracking?.coverage_pct)}% eligible
                      </small>
                    </td>
                  )}
                  {columns.includes("hr") && (
                    <td data-label="Heart rate">
                      {fmt(s.hr)} bpm{change(index, "hr")}
                      {(s.hrQuality ||
                        (s.view.evidence?.heart_rate_bpm?.coverage_pct ?? 0) <
                          90) && (
                        <small>{s.hrQuality || "Partial / unavailable"}</small>
                      )}
                    </td>
                  )}
                  {columns
                    .filter(
                      (c) =>
                        ![
                          "speed",
                          "maxSpeed",
                          "dps",
                          "tracking",
                          "hr",
                        ].includes(c),
                    )
                    .map((c) => (
                      <td key={c} data-label={HOME_COLUMNS[c]}>
                        {c === "bestWindows" ? (
                          <div className="home-best-windows">
                            {[300, 600, 1200].map((d) => {
                              const v = metricView(s, d),
                                w = v.window;
                              return (
                                <span
                                  key={d}
                                  title={
                                    w?.start != null
                                      ? "Continuous " +
                                        d / 60 +
                                        " min; " +
                                        Math.round(w.start) +
                                        "–" +
                                        Math.round(w.end) +
                                        " elapsed seconds"
                                      : "No supported continuous effort"
                                  }
                                >
                                  <b>{d / 60} min</b>
                                  <GoalMetric
                                    progress={
                                      sessionGoalProgress(s, goals, d).speed
                                    }
                                  >
                                    <Measure value={v.speed} group="speed" />
                                  </GoalMetric>
                                </span>
                              );
                            })}
                          </div>
                        ) : c === "distance" ? (
                          <Measure
                            value={
                              s.distance == null ? null : s.distance * 1609.344
                            }
                            group="distance"
                          />
                        ) : c === "active" ? (
                          durationLabel(s.active)
                        ) : c === "elapsed" ? (
                          durationLabel(s.elapsed)
                        ) : c === "board" ? (
                          boards.find((b) => b.id === s.boardId)?.name ||
                          "Not recorded"
                        ) : c === "type" ? (
                          s.type || "Not recorded"
                        ) : c === "medianSpeed" ? (
                          <>
                            <Measure
                              value={s.statistics?.speed_mps?.median}
                              group="speed"
                            />
                            <small>whole session</small>
                          </>
                        ) : c === "cadence" ? (
                          <>{fmt(s.view.cadence)} spm</>
                        ) : c === "wind" ? (
                          <>
                            <Measure
                              value={s.wind == null ? null : s.wind * 0.44704}
                              group="speed"
                            />
                            <small>
                              {s.weatherQuality || "Source unavailable"}
                            </small>
                          </>
                        ) : c === "availability" ? (
                          <>
                            {s.records.length
                              ? "Recorded telemetry"
                              : "Summary only"}
                            <small>
                              {s.records.some(
                                (r) =>
                                  Number.isFinite(r.latitude_deg) &&
                                  Number.isFinite(r.longitude_deg),
                              )
                                ? "GPS route"
                                : "No GPS route"}
                              {s.hrQuality ? " · " + s.hrQuality : ""}
                            </small>
                          </>
                        ) : null}
                      </td>
                    ))}
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
                      onToggle={(e) => {
                        const menu = e.currentTarget;
                        if (!menu.open) return;
                        const anchor = menu
                          .querySelector("summary")
                          .getBoundingClientRect();
                        const panel = menu.querySelector("div");
                        panel.style.position = "fixed";
                        panel.style.right = "auto";
                        panel.style.left = `${Math.max(8, Math.min(anchor.right - 180, window.innerWidth - 188))}px`;
                        panel.style.top = `${Math.max(8, Math.min(anchor.bottom + 4, window.innerHeight - panel.offsetHeight - 8))}px`;
                      }}
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
      {choosingColumns && (
        <HomeColumns
          columns={columns}
          onClose={() => setChoosingColumns(false)}
          onAction={onAction}
        />
      )}
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
