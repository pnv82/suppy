import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  DEFAULT_UNITS,
  UNIT_GROUPS,
  fromSI,
  toSI,
  formatUnit,
  alternateUnits,
  unitPreferences,
} from "../src/domain/units.mjs";
import {
  goalFactor,
  goalValue,
  goalUnit,
  goalScope,
} from "../src/domain/goals.mjs";
import { detectedEventDescription } from "../src/domain/events.mjs";
import { readRoute, routeUrl } from "../src/services/navigation.mjs";
import { openDatabase } from "../server/database.mjs";
import { createStore } from "../server/store.mjs";
import { createHttpServer } from "../server/index.mjs";
import { executeTool } from "../server/tools.mjs";
import { fixtureState } from "./fixtures.mjs";

const metric = { speed: "kmh", distance: "km", length: "ft", temperature: "C" };
test("unit families keep defaults, convert absolute/delta temperatures and round-trip every supported unit", () => {
  assert.deepEqual(unitPreferences(), {
    speed: "mph",
    distance: "mi",
    length: "m",
    temperature: "F",
  });
  assert.deepEqual(unitPreferences({ speed: "knots" }), DEFAULT_UNITS);
  assert.equal(formatUnit(2.2352, "speed"), "5.00 mph");
  assert.equal(formatUnit(1609.344, "distance"), "1.00 mi");
  assert.equal(
    formatUnit(4, "length", DEFAULT_UNITS, { suffix: "/stroke" }),
    "4.00 m/stroke",
  );
  assert.equal(
    formatUnit(20, "temperature", DEFAULT_UNITS, { dp: 1 }),
    "68.0 °F",
  );
  assert.equal(
    formatUnit(10, "temperature", DEFAULT_UNITS, { dp: 1, delta: true }),
    "18.0 °F",
  );
  assert.equal(formatUnit(2.2352, "speed", metric), "8.05 km/h");
  assert.equal(formatUnit(0.3048, "length", metric), "1.00 ft");
  assert.equal(alternateUnits(2.2352, "speed"), "8.05 km/h · 2.24 m/s");
  assert.equal(alternateUnits(20, "temperature", metric, { dp: 1 }), "68.0 °F");
  assert.equal(
    alternateUnits(10, "temperature", metric, { dp: 1, delta: true }),
    "18.0 °F",
  );
  for (const [group, info] of Object.entries(UNIT_GROUPS)) {
    for (const key of Object.keys(info.options)) {
      const units = { ...DEFAULT_UNITS, [group]: key };
      for (const v of [-10, 0, 0.3048, 2.2352, 12345.6789])
        assert.ok(
          Math.abs(toSI(fromSI(v, group, units), group, units) - v) < 1e-9,
        );
      for (const v of [null, undefined, NaN, Infinity]) {
        assert.equal(fromSI(v, group, units), null);
        assert.equal(toSI(v, group, units), null);
        assert.equal(alternateUnits(v, group, units), "");
        assert.match(formatUnit(v, group, units), /^— /);
      }
    }
  }
});

test("goal labels and inputs use selected units while non-speed targets retain their meaning", () => {
  for (const name of [
    "max_speed",
    "average_speed",
    "best_300",
    "best_600",
    "best_1200",
    "endurance",
    "stroke_effectiveness",
  ]) {
    const goal = { metric: name, target_si: 2.2352 };
    assert.equal(goalUnit(goal, metric), "km/h");
    assert.ok(
      Math.abs(goalValue(goal, goal.target_si, metric) - 8.04672) < 1e-10,
    );
    assert.equal(
      goalValue(goal, goal.target_si, metric) * goalFactor(goal, metric),
      goal.target_si,
    );
  }
  assert.equal(goalValue({ metric: "cadence_duration" }, 120, metric), 2);
  assert.equal(goalValue({ metric: "effort_economy" }, 130, metric), 130);
  assert.equal(goalValue({ metric: "tracking_control" }, 85, metric), 85);
  assert.equal(goalValue({ metric: "turns_footwork" }, 80, metric), 80);
  assert.match(
    goalScope({ metric: "effort_economy", pace_mps: 2.2352 }, metric),
    /8.05 km\/h/,
  );
  assert.match(
    detectedEventDescription(
      { type: "possible_fall", evidence: { temperature_drop_c: 10 } },
      metric,
    ),
    /^10.0 °C \(18.0 °F\)/,
  );
  assert.equal(
    readRoute(
      routeUrl("http://localhost/", { page: "Settings", sessionId: null }).href,
    ).page,
    "Settings",
  );
});

test("tenant preferences persist through schema upgrade/reopen without altering session SI, goals, revisions or default board", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "suppy-units-"));
  t.after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const path = join(dir, "test.sqlite");
  let db = openDatabase(path);
  db.createTenant("alice");
  db.createTenant("bob");
  db.importState("alice", fixtureState());
  db.close();
  // Exercise adding the preference column to the previous schema with existing data.
  const legacy = new DatabaseSync(path);
  legacy.exec(
    "ALTER TABLE preferences DROP COLUMN units_json; PRAGMA user_version = 5;",
  );
  legacy.close();
  db = openDatabase(path);
  let a = createStore({ database: db, tenantId: "alice" });
  const b = createStore({ database: db, tenantId: "bob" });
  assert.deepEqual(a.dashboard().units, DEFAULT_UNITS);
  const raw = new DatabaseSync(path);
  const goal = a.upsertGoal({
    goal_id: "catalog:max_speed",
    metric: "max_speed",
    target_si: 2.2352,
    cadence_threshold_spm: null,
  });
  const board = a.upsertBoard({ name: "Unit test board" });
  a.setDefaultBoard({ board_id: board.id });
  const before = raw
    .prepare("SELECT * FROM sessions WHERE tenant_id = 'alice'")
    .all();
  const result = executeTool(a, "set_unit_preferences", { units: metric });
  assert.deepEqual(result._meta.appData.units, metric);
  assert.deepEqual(b.dashboard().units, DEFAULT_UNITS);
  assert.deepEqual(
    raw.prepare("SELECT * FROM sessions WHERE tenant_id = 'alice'").all(),
    before,
  );
  raw.close();
  for (const units of [
    {},
    { ...metric, speed: "knots" },
    { ...metric, extra: "ft" },
  ]) {
    assert.throws(() => executeTool(a, "set_unit_preferences", { units }));
    assert.deepEqual(a.dashboard().units, metric);
  }
  assert.throws(() =>
    executeTool(a, "set_unit_preferences", { units: metric, tenant_id: "bob" }),
  );
  db.close();
  db = openDatabase(path);
  a = createStore({ database: db, tenantId: "alice" });
  assert.deepEqual(a.dashboard().units, metric);
  assert.equal(a.dashboard().defaultBoardId, board.id);
  assert.equal(
    a.dashboard().goals.find((g) => g.id === goal.id).target_si,
    2.2352,
  );
  executeTool(a, "set_unit_preferences", { units: DEFAULT_UNITS });
  assert.deepEqual(a.dashboard().units, DEFAULT_UNITS);
});

test("HTTP and MCP share unit preferences, expose a mutable tool and honor trusted tenant identity", async () => {
  const db = openDatabase(":memory:");
  db.createTenant("alice");
  db.createTenant("bob");
  const server = createHttpServer(undefined, {
    database: db,
    resolveTenant: (req) =>
      ({ "Bearer alice-test": "alice", "Bearer bob-test": "bob" })[
        req.headers.authorization
      ],
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = new Client({ name: "units-test", version: "1" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(base + "/mcp"), {
        requestInit: { headers: { Authorization: "Bearer alice-test" } },
      }),
    );
    const tool = (await client.listTools()).tools.find(
      (t) => t.name === "set_unit_preferences",
    );
    assert.equal(tool.annotations.readOnlyHint, false);
    const response = await fetch(base + "/api/tools", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer alice-test",
      },
      body: JSON.stringify({
        name: "set_unit_preferences",
        arguments: { units: metric },
      }),
    });
    assert.equal(response.status, 200);
    const dashboard = await client.callTool({
      name: "get_dashboard",
      arguments: {},
    });
    assert.deepEqual(dashboard._meta.appData.units, metric);
    assert.deepEqual(dashboard.structuredContent.units, metric);
    const other = await (
      await fetch(base + "/api/dashboard?tenant=alice", {
        headers: { Authorization: "Bearer bob-test", "X-Tenant-ID": "alice" },
      })
    ).json();
    assert.deepEqual(other.units, DEFAULT_UNITS);
    const result = await client.callTool({
      name: "set_unit_preferences",
      arguments: { units: DEFAULT_UNITS },
    });
    assert.notEqual(result.isError, true);
    const restored = await (
      await fetch(base + "/api/dashboard", {
        headers: { Authorization: "Bearer alice-test" },
      })
    ).json();
    assert.deepEqual(restored.units, DEFAULT_UNITS);
  } finally {
    await client.close();
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});
