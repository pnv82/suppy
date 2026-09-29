import test from "node:test";
import assert from "node:assert/strict";
import {
  bestWindows,
  latestSessions,
  interpolate,
  chartRows,
  timerPauses,
  telemetryStats,
  sessionStatistics,
  durationLabel,
  feet,
  segmentDirections,
} from "../src/domain/metrics.mjs";
import { testStore } from "./fixtures.mjs";
import { executeTool } from "../server/tools.mjs";

const track = Array.from({ length: 1301 }, (_, t) => ({
  elapsed_s: t,
  distance_m: 2 * t,
  latitude_deg: 32.7,
  longitude_deg: -117.2,
  speed_mps: 2,
  heart_rate_bpm: null,
  cadence_raw: 32,
}));
test("window arrows follow travel order on overlapping outbound and return tracks", () => {
  const route = track.slice(0, 1201).map((p) => ({
    ...p,
    longitude_deg: -117.2 + Math.min(p.elapsed_s, 1200 - p.elapsed_s) * 0.00002,
  }));
  const outward = segmentDirections(route, { start: 0, end: 600 });
  const returning = segmentDirections(route, { start: 600, end: 1200 });
  assert.equal(outward.length, 4);
  assert.equal(returning.length, 4);
  assert.equal(
    segmentDirections(
      route.map((p) => ({ ...p, distance_m: null })),
      { start: 0, end: 600 },
    ).length,
    4,
  );
  assert.ok(outward.every((p) => Math.abs(p.bearing_deg - 90) < 0.01));
  assert.ok(returning.every((p) => Math.abs(p.bearing_deg - 270) < 0.01));
  const north = route.map((p) => ({
    ...p,
    latitude_deg: 32.7 + p.elapsed_s * 0.00001,
    longitude_deg: -117.2,
  }));
  assert.ok(
    segmentDirections(north, { start: 0, end: 600 }).every(
      (p) => p.bearing_deg === 0,
    ),
  );
  const w = { start: 0, end: 1200 };
  assert.deepEqual(segmentDirections(track, w), []); // stationary GPS
  assert.deepEqual(segmentDirections(route, w, [{ start: 650, end: 655 }]), []);
  assert.deepEqual(
    segmentDirections(
      route.filter((p) => p.elapsed_s < 650 || p.elapsed_s > 680),
      w,
    ),
    [],
  );
  assert.deepEqual(
    segmentDirections(
      route.map((p) =>
        p.elapsed_s === 700 ? { ...p, latitude_deg: null } : p,
      ),
      w,
    ),
    [],
  );
  assert.deepEqual(segmentDirections(route, { start: null, end: null }), []);
});

test("board defaults never backfill history, assignments enter analysis and in-use boards are protected", (t) => {
  const store = testStore(t);
  const session_id = store.dashboard().sessions[0].id;
  const call = (name, args) => executeTool(store, name, args).structuredContent;
  assert.equal(store.context(session_id).board, null);
  const board = call("upsert_board", { name: " Race 14 × 24 " });
  assert.equal(board.name, "Race 14 × 24");
  assert.throws(
    () => call("upsert_board", { name: "race 14 × 24" }),
    /already exists/,
  );
  assert.throws(() => call("upsert_board", { name: " " }));
  assert.throws(
    () => call("assign_session_board", { session_id, board_id: "missing" }),
    /not found/,
  );
  call("set_default_board", { board_id: board.id });
  assert.ok(store.dashboard().sessions.every((s) => s.boardId === null));
  call("assign_session_board", { session_id, board_id: board.id });
  assert.equal(store.dashboard().boards[0].sessionCount, 1);
  assert.throws(
    () => call("delete_board", { board_id: board.id }),
    /assigned to a session/,
  );
  call("upsert_board", { board_id: board.id, name: "Race board" });
  const analysis = call("prepare_analysis_context", {
    session_id,
    question: "How does this board affect interpretation?",
  });
  assert.deepEqual(analysis.session.board, {
    id: board.id,
    name: "Race board",
    source: "athlete_reported",
  });
  assert.equal(analysis.session.revision, 2);
  const second = call("upsert_board", { name: "Touring board" });
  call("set_default_board", { board_id: second.id });
  assert.equal(store.context(session_id).board.id, board.id);
  call("set_default_board", { board_id: null });
  assert.equal(store.dashboard().defaultBoardId, null);
  call("assign_session_board", { session_id, board_id: null });
  assert.equal(store.context(session_id).board, null);
  call("delete_board", { board_id: board.id });
  call("set_default_board", { board_id: second.id });
  call("delete_board", { board_id: second.id });
  assert.deepEqual(store.dashboard().boards, []);
  assert.equal(store.dashboard().defaultBoardId, null);
});
test("duration display rounds minutes, carries hours and preserves missing values", () => {
  assert.equal(durationLabel(86.1), "1 hr 26 min");
  assert.equal(durationLabel(59.6), "1 hr 0 min");
  assert.equal(durationLabel(125.4), "2 hr 5 min");
  assert.equal(durationLabel(30), "30 min");
  assert.equal(durationLabel(0), "0 min");
  assert.equal(durationLabel(null), "—");
});
test("median weights covered time rather than record counts and excludes pauses/gaps", () => {
  const records = [
    { elapsed_s: 0, speed_mps: 1 },
    { elapsed_s: 10, speed_mps: 3 },
    { elapsed_s: 11, speed_mps: 5 },
    { elapsed_s: 12, speed_mps: 7 },
    { elapsed_s: 13, speed_mps: 9 },
    { elapsed_s: 50, speed_mps: 99 },
    { elapsed_s: 51, speed_mps: null },
  ];
  assert.equal(telemetryStats(records, "speed_mps").median, 1);
  assert.equal(telemetryStats(records, "speed_mps").covered_s, 13);
  assert.equal(
    telemetryStats(records, "speed_mps", [{ start: 0, end: 10 }]).median,
    5,
  );
  assert.equal(telemetryStats(records, "speed_mps").max, 99);
  const stationary = [
    { elapsed_s: 0, speed_mps: 0, heart_rate_bpm: 0 },
    { elapsed_s: 1, speed_mps: 0, heart_rate_bpm: null },
  ];
  assert.equal(telemetryStats(stationary, "speed_mps").median, 0);
  assert.equal(telemetryStats(stationary, "heart_rate_bpm").max, null);
  assert.equal(telemetryStats([], "speed_mps").median, null);
});
test("session references retain FIT maxima and only derive stroke distance from explicit SUP totals", (t) => {
  const fit = {
    sport: "stand_up_paddleboarding",
    enhanced_max_speed: 3,
    max_heart_rate: 181,
    total_distance: 1000,
    total_strokes: 250,
  };
  const stats = sessionStatistics(track, [], fit);
  assert.equal(stats.speed_mps.max, 3);
  assert.equal(stats.speed_mps.max_source, "fit_session");
  assert.equal(stats.distance_per_stroke.value_m, 4);
  assert.equal(stats.distance_per_stroke.status, "watch_estimate");
  assert.ok(Math.abs(feet(4) - 13.12335958) < 1e-7);
  for (const override of [
    { total_strokes: 0 },
    { total_strokes: null },
    { total_distance: null },
    { sport: "running" },
    { total_strokes: undefined, total_cycles: 250 },
  ]) {
    assert.equal(
      sessionStatistics(track, [], { ...fit, ...override }).distance_per_stroke
        .value_m,
      null,
    );
  }
  const missing = sessionStatistics([], [], null, 175);
  assert.equal(missing.speed_mps.max, null);
  assert.equal(missing.heart_rate_bpm.median, null);
  assert.equal(missing.heart_rate_bpm.max, 175);
  assert.equal(missing.heart_rate_bpm.max_source, "stored_summary");
  const context = testStore(t).context("24495535896");
  assert.equal(context.statistics.speed_mps.max, 2.552);
  assert.equal(context.statistics.distance_per_stroke.strokes, 2860);
});
test("continuous windows use actual elapsed duration, earliest tie, and distance interpolation", () => {
  const windows = bestWindows(track.filter((p) => p.elapsed_s % 7 === 0));
  assert.deepEqual(
    windows.map((w) => [w.duration, w.start, w.end, w.speed_mps]),
    [
      [300, 0, 300, 2],
      [600, 0, 600, 2],
      [1200, 0, 1200, 2],
    ],
  );
  assert.equal(interpolate(track, 2.5).heart_rate_bpm, null);
});
test("gaps and pauses cannot be stitched into best efforts", () => {
  const withGap = track.filter((p) => p.elapsed_s < 650 || p.elapsed_s > 680);
  assert.equal(bestWindows(withGap)[2].status, "unavailable");
  assert.equal(
    bestWindows(track, [{ start: 640, end: 645 }])[2].status,
    "unavailable",
  );
  assert.ok(chartRows(withGap).some((r) => r.speed === null));
  assert.deepEqual(
    timerPauses(
      [
        {
          timestamp: "2026-09-20T00:00:30Z",
          event: "timer",
          event_type: "stop_all",
        },
        {
          timestamp: "2026-09-20T00:00:40Z",
          event: "timer",
          event_type: "start",
        },
      ],
      "2026-09-20T00:00:00Z",
      70,
    ),
    [{ start: 30, end: 40 }],
  );
});
test("latest ten automatically excludes older sessions without inventing missing sessions", () => {
  const sessions = Array.from({ length: 12 }, (_, i) => ({
    id: String(i),
    date: `2026-09-${String(i + 1).padStart(2, "0")}`,
  }));
  const result = latestSessions(sessions);
  assert.equal(result.length, 10);
  assert.equal(result[0].id, "11");
  assert.equal(result.at(-1).id, "2");
  assert.equal(latestSessions(sessions.slice(0, 4)).length, 4);
});
test("annotations validate boundaries, survive edits, and enter fresh bounded analysis context", (t) => {
  const store = testStore(t),
    id = store.dashboard().sessions[0].id;
  const args = {
    session_id: id,
    start_s: 600,
    end_s: 720,
    kind: "condition",
    note: "More chop",
    timing: "approximate",
  };
  assert.throws(
    () => executeTool(store, "upsert_annotation", { ...args, end_s: 99999 }),
    /inside/,
  );
  const a = executeTool(store, "upsert_annotation", args).structuredContent;
  executeTool(store, "upsert_annotation", {
    ...args,
    annotation_id: a.id,
    note: "More chop, timing corrected",
  });
  executeTool(store, "update_session_context", {
    session_id: id,
    note: "Different board today",
  });
  const result = executeTool(store, "prepare_analysis_context", {
    session_id: id,
    question: "What changes?",
  }).structuredContent;
  assert.equal(result.status, "context_ready");
  assert.equal(result.session.revision, 3);
  assert.equal(result.session.annotations.length, 1);
  assert.equal(
    result.session.annotations[0].note,
    "More chop, timing corrected",
  );
  assert.equal(result.session.additionalContext, "Different board today");
  assert.ok(result.telemetry.length <= 120);
  assert.ok(result.telemetry.every((p) => !("latitude_deg" in p)));
  executeTool(store, "delete_annotation", {
    session_id: id,
    annotation_id: a.id,
  });
  assert.equal(store.get(id).annotations.length, 0);
  assert.throws(
    () => executeTool(store, "get_session_context", { session_id: "unknown" }),
    /not found/,
  );
});
test("technique focus uses dictionary IDs and is never a confirmed diagnosis", (t) => {
  const store = testStore(t),
    id = store.dashboard().sessions[0].id;
  const args = {
    session_id: id,
    goal_speed_mph: 5,
    goal_duration_min: 20,
    technique_ids: ["SUP-ENTRY-01"],
  };
  executeTool(store, "update_training_focus", args);
  assert.equal(store.get(id).goal.duration_min, 20);
  assert.deepEqual(store.get(id).technique, ["SUP-ENTRY-01"]);
  assert.throws(
    () =>
      executeTool(store, "update_training_focus", {
        ...args,
        technique_ids: ["invented"],
      }),
    /Unknown technique/,
  );
  const summary = store.dashboard().sessions.at(-1);
  assert.equal(summary.records.length, 0);
  assert.equal(summary.windows[0].start, null);
  assert.equal(
    store.dashboard().sessions.find((s) => s.id === "24249467884").wind,
    null,
  );
});
