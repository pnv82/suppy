import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  configuredGoals,
  bestGoalResult,
  goalHistorySessions,
  goalProgress,
} from "../src/domain/goals.mjs";
import { openDatabase } from "../server/database.mjs";
import { createStore } from "../server/store.mjs";
import { executeTool } from "../server/tools.mjs";
import { createHttpServer } from "../server/index.mjs";
import { fixtureState, testStore } from "./fixtures.mjs";

const goals = configuredGoals().map((g) => ({
  ...g,
  cadence_threshold_spm: 30,
  target_si: g.metric === "effort_economy" ? 120 : 4,
}));
function history() {
  return Array.from({ length: 12 }, (_, i) => {
    const value = i === 0 ? 5 : 2;
    return {
      id: String(i),
      date: `2026-09-${String(i + 1).padStart(2, "0")}`,
      title: `Session ${i}`,
      records: [],
      windows: [300, 600, 1200].map((duration) => ({
        duration,
        speed_mps: value,
      })),
      statistics: { speed_mps: { max: value } },
      deterministic: { summary: { distance: { mean_speed_mps: value } } },
      goalMetrics: Object.fromEntries(
        goals.map((g) => [
          g.id,
          {
            value_si:
              g.metric === "effort_economy" ? (i === 0 ? 100 : 140) : value,
            value_s: value,
          },
        ]),
      ),
    };
  });
}

test("every goal uses the latest ten sessions by default; expanding/shrinking changes best and achievement", () => {
  const sessions = history();
  const original = structuredClone(sessions);
  assert.deepEqual(
    goalHistorySessions(sessions).map((s) => s.id),
    ["11", "10", "9", "8", "7", "6", "5", "4", "3", "2"],
  );
  for (const goal of goals) {
    const recent = bestGoalResult(sessions, goal);
    assert.equal(recent.session_id, "11");
    assert.equal(recent.value_si, goal.metric === "effort_economy" ? 140 : 2);
    assert.notEqual(goalProgress(goal, recent).state, "achieved");
    const expanded = bestGoalResult(sessions, goal, 12);
    assert.equal(expanded.session_id, "0");
    assert.equal(goalProgress(goal, expanded).state, "achieved");
    assert.equal(bestGoalResult(sessions, goal, 1).session_id, "11");
  }
  assert.deepEqual(sessions, original);
});

test("the window counts missing sessions and never backfills older results; fewer, empty, zero and same-day starts work", () => {
  const goal = goals.find((g) => g.metric === "max_speed");
  const sessions = history();
  sessions.slice(2).forEach((s) => {
    s.statistics.speed_mps.max = null;
  });
  assert.equal(bestGoalResult(sessions, goal), null);
  assert.equal(bestGoalResult(sessions, goal, 12).session_id, "0");
  assert.equal(bestGoalResult([], goal), null);
  assert.equal(bestGoalResult(sessions.slice(0, 2), goal).session_id, "0");
  const sameDay = [
    {
      id: "early",
      date: "2026-09-30",
      startUtc: "2026-09-30T08:00:00Z",
      statistics: { speed_mps: { max: 5 } },
    },
    {
      id: "late",
      date: "2026-09-30",
      startUtc: "2026-09-30T18:00:00Z",
      statistics: { speed_mps: { max: 0 } },
    },
  ];
  assert.equal(bestGoalResult(sameDay, goal, 1).value_si, 0);
  assert.equal(bestGoalResult(sameDay, goal, 1).session_id, "late");
  for (const depth of [0, -1, 1.5, NaN, 1001, "10", null])
    assert.throws(() => goalHistorySessions(sessions, depth));
});

test("history depth upgrades, persists and stays tenant scoped without changing measurements, units or targets", () => {
  const dir = mkdtempSync(join(tmpdir(), "suppy-goal-history-"));
  const path = join(dir, "test.sqlite");
  let db = openDatabase(path);
  try {
    db.createTenant("a");
    db.createTenant("b");
    db.importState("a", fixtureState());
    db.close();
    const old = new DatabaseSync(path);
    old.exec(
      "ALTER TABLE preferences DROP COLUMN home_columns_json; ALTER TABLE preferences DROP COLUMN goal_history_depth; PRAGMA user_version = 6;",
    );
    old.close();
    db = openDatabase(path);
    let a = createStore({ database: db, tenantId: "a" });
    const b = createStore({ database: db, tenantId: "b" });
    const before = a.dashboard();
    assert.equal(before.goalHistoryDepth, 10);
    const result = executeTool(a, "set_goal_history_depth", { sessions: 2 });
    assert.equal(result._meta.appData.goalHistoryDepth, 2);
    assert.equal(b.dashboard().goalHistoryDepth, 10);
    const after = a.dashboard();
    assert.deepEqual(after.goals, before.goals);
    assert.deepEqual(after.units, before.units);
    assert.deepEqual(
      after.sessions.map((s) => [s.id, s.revision, s.records]),
      before.sessions.map((s) => [s.id, s.revision, s.records]),
    );
    for (const args of [
      { sessions: 0 },
      { sessions: 2.5 },
      { sessions: "5" },
      { sessions: 1001 },
      { sessions: 5, tenantId: "b" },
    ])
      assert.throws(() => executeTool(a, "set_goal_history_depth", args));
    assert.equal(a.dashboard().goalHistoryDepth, 2);
    db.close();
    db = openDatabase(path);
    a = createStore({ database: db, tenantId: "a" });
    assert.equal(a.dashboard().goalHistoryDepth, 2);
    assert.equal(a.dashboard().sessions.length, before.sessions.length);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("HTTP and MCP share history settings and bounded best results", async (t) => {
  const store = testStore(t);
  const server = createHttpServer(store);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = new Client({ name: "history-test", version: "1" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(base + "/mcp")),
    );
    assert.equal(
      (await client.listTools()).tools.find(
        (t) => t.name === "set_goal_history_depth",
      ).annotations.readOnlyHint,
      false,
    );
    const response = await fetch(base + "/api/tools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "set_goal_history_depth",
        arguments: { sessions: 1 },
      }),
    });
    assert.equal(response.status, 200);
    const dashboard = await client.callTool({
      name: "get_dashboard",
      arguments: {},
    });
    assert.equal(dashboard.structuredContent.goalHistoryDepth, 1);
    assert.deepEqual(
      dashboard.structuredContent.goalBestResults,
      dashboard._meta.appData.goalBestResults,
    );
    assert.equal(
      dashboard.structuredContent.goalBestResults["catalog:max_speed"]
        .session_id,
      "24495535896",
    );
    const updated = await client.callTool({
      name: "set_goal_history_depth",
      arguments: { sessions: 20 },
    });
    assert.notEqual(updated.isError, true);
    const http = await (await fetch(base + "/api/dashboard")).json();
    assert.equal(http.goalHistoryDepth, 20);
  } finally {
    await client.close();
    await new Promise((r) => server.close(r));
  }
});
