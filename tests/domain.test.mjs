import test from "node:test";
import assert from "node:assert/strict";
import {
  bestWindows,
  latestSessions,
  interpolate,
  chartRows,
  timerPauses,
} from "../src/domain/metrics.mjs";
import { createStore } from "../server/store.mjs";
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
test("annotations validate boundaries, survive edits, and enter fresh bounded analysis context", () => {
  const store = createStore(),
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
test("technique focus uses dictionary IDs and is never a confirmed diagnosis", () => {
  const store = createStore(),
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
