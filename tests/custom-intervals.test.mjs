import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../server/database.mjs";
import { createStore, compactInterval } from "../server/store.mjs";
import { executeTool } from "../server/tools.mjs";
import { metricView } from "../src/domain/metric-view.mjs";
import {
  intervalKey,
  reviewIntervals,
  pointInRuns,
} from "../src/domain/intervals.mjs";
import { validRuns } from "../src/domain/metrics.mjs";
import { fixtureState, testStore } from "./fixtures.mjs";
import { track } from "./metric-fixtures.mjs";

const bounds = (id, start = 100, end = 400) => ({
  session_id: id,
  start_s: start,
  end_s: end,
});

test("custom interval boundary markers stay absent inside recorded pauses and GPS gaps", () => {
  const records = track({ seconds: 500 }).filter(
    (p) => p.elapsed_s <= 200 || p.elapsed_s >= 240,
  );
  const runs = validRuns(records, [{ start: 90, end: 150 }], true, false);
  assert.equal(pointInRuns(runs, 100), null);
  assert.equal(pointInRuns(runs, 220), null);
  assert.equal(pointInRuns(runs, -1), null);
  assert.equal(pointInRuns(runs, 170).elapsed_s, 170);
});

test("saved analysis can reference a custom range and becomes stale when the tile is removed", (t) => {
  const store = testStore(t);
  const id = store.dashboard().sessions[0].id;
  const interval = store.addCustomInterval(bounds(id));
  const analysis = {
    schema_version: "1",
    highlight: "Synthetic interval interpretation",
    summary: "An external interpretation of the selected range.",
    model: "external-test",
    generated_at_utc: "2026-09-28T10:00:00Z",
    evidence_refs: [`interval:${interval.id}`],
  };
  const save = () =>
    executeTool(store, "set_session_summary", {
      session_id: id,
      expected_revision: store.get(id).revision,
      analysis,
    });
  save();
  assert.equal(store.context(id).llmSummary.stale, false);
  store.removeCustomInterval({ session_id: id, interval_id: interval.id });
  assert.equal(store.context(id).llmSummary.stale, true);
  assert.throws(save, /evidence reference is unavailable/);
});

test("several custom intervals persist with stable identities and remain tenant/session scoped", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "suppy-intervals-"));
  const path = join(dir, "intervals.sqlite");
  let database = openDatabase(path);
  t.after(() => {
    database.close();
    assert.ok(dir.startsWith(join(tmpdir(), "suppy-intervals-")));
    rmSync(dir, { recursive: true, force: true });
  });
  for (const tenant of ["alice", "bob"]) {
    database.createTenant(tenant);
    database.importState(tenant, fixtureState());
  }
  let alice = createStore({ database, tenantId: "alice" });
  const bob = createStore({ database, tenantId: "bob" });
  const id = alice.dashboard().sessions[0].id;
  const original = alice.get(id);
  const first = executeTool(
    alice,
    "add_custom_interval",
    bounds(id),
  ).structuredContent;
  const second = alice.addCustomInterval(bounds(id, 500, 800));
  assert.notEqual(first.id, second.id);
  assert.equal(alice.get(id).revision, original.revision + 2);
  assert.deepEqual(alice.addCustomInterval(bounds(id)), first);
  assert.equal(alice.get(id).revision, original.revision + 2);
  assert.equal(bob.dashboard().sessions[0].customIntervals.length, 0);
  assert.throws(
    () => bob.removeCustomInterval({ session_id: id, interval_id: first.id }),
    /not found/,
  );
  assert.throws(
    () =>
      alice.removeCustomInterval({
        session_id:
          original.id === "24495535896" ? "24444079580" : "24495535896",
        interval_id: first.id,
      }),
    /not found/,
  );
  database.close();
  database = openDatabase(path);
  alice = createStore({ database, tenantId: "alice" });
  const session = alice.dashboard().sessions[0];
  assert.deepEqual(
    session.customIntervals.map((w) => w.id),
    [first.id, second.id],
  );
  assert.deepEqual(
    session.customIntervals.map((w) => [w.start, w.end]),
    [
      [100, 400],
      [500, 800],
    ],
  );
  assert.equal(new Set(reviewIntervals(session).map(intervalKey)).size, 5);
  assert.equal(metricView(session, first.id).window.start, 100);
  assert.equal(metricView(session, second.id).window.start, 500);
  assert.equal(metricView(session, 300).window.duration, 300);
  executeTool(alice, "delete_custom_interval", {
    session_id: id,
    interval_id: first.id,
  });
  assert.deepEqual(
    alice.get(id).customIntervals.map((w) => w.id),
    [second.id],
  );
  assert.deepEqual(alice.get(id).records, original.records);
  assert.deepEqual(alice.get(id).pauses, original.pauses);
  assert.deepEqual(alice.get(id).annotations, original.annotations);
  assert.deepEqual(alice.get(id).windows, original.windows);
});

test("interval zig-zag uses exact selected telemetry and agrees across UI and analysis context", (t) => {
  const database = openDatabase(":memory:");
  t.after(() => database.close());
  database.createTenant("test");
  const state = fixtureState();
  state.sessions[0].records = track({ seconds: 1300, zig: 20 }).map((p) => ({
    ...p,
    longitude_deg: p.elapsed_s < 650 ? -117.2 : p.longitude_deg,
  }));
  database.importState("test", state);
  const store = createStore({ database, tenantId: "test" });
  const id = state.sessions[0].id;
  const straight = store.addCustomInterval(bounds(id));
  const oscillating = store.addCustomInterval(bounds(id, 800, 1100));
  const session = store.dashboard().sessions[0];
  const first = metricView(session, straight.id);
  const second = metricView(session, oscillating.id);
  assert.ok(first.tracking > 99.9);
  assert.ok(second.tracking < first.tracking);
  assert.notEqual(first.tracking, metricView(session).tracking);
  assert.deepEqual(second.evidence.interval, { start_s: 800, end_s: 1100 });
  const prepared = executeTool(store, "prepare_analysis_context", {
    ...bounds(id, 800, 1100),
    question: "Inspect this interval.",
  }).structuredContent;
  assert.deepEqual(prepared.evidence, compactInterval(second.evidence));
  assert.deepEqual(
    store.context(id).customIntervals[1].statistics,
    prepared.evidence,
  );
  assert.equal(
    "segments" in prepared.session.customIntervals[1].statistics.tracking,
    false,
  );
});

test("custom ranges reject points/outside bounds and preserve missing GPS, sensors, gaps and pauses", (t) => {
  const store = testStore(t);
  const id = store.dashboard().sessions[0].id;
  for (const [start, end] of [
    [100, 100],
    [400, 100],
    [-1, 100],
    [100, 1301],
    [0, Infinity],
  ])
    assert.throws(
      () => store.addCustomInterval(bounds(id, start, end)),
      /non-empty interval/,
    );
  assert.throws(
    () =>
      executeTool(store, "add_custom_interval", {
        ...bounds(id),
        tenant_id: "other",
      }),
    /Unrecognized key/,
  );
  assert.throws(
    () => store.addCustomInterval(bounds("24162211256")),
    /recorded telemetry/,
  );
  const short = store.addCustomInterval(bounds(id, 100, 110));
  assert.equal(
    metricView(store.dashboard().sessions[0], short.id).tracking,
    null,
  );

  const database = openDatabase(":memory:");
  t.after(() => database.close());
  database.createTenant("missing");
  const state = fixtureState();
  const session = state.sessions[0];
  session.records = session.records
    .filter((p) => p.elapsed_s <= 200 || p.elapsed_s >= 240)
    .map((p) => ({
      ...p,
      latitude_deg: null,
      longitude_deg: null,
      cadence_raw: null,
      heart_rate_bpm: null,
    }));
  session.pauses = [{ start: 300, end: 350 }];
  database.importState("missing", state);
  const missing = createStore({ database, tenantId: "missing" });
  const interval = missing.addCustomInterval(bounds(session.id, 100, 500));
  const view = metricView(missing.dashboard().sessions[0], interval.id);
  assert.equal(view.tracking, null);
  assert.equal(view.hr, null);
  assert.equal(view.cadence, null);
  assert.equal(view.dps, null);
  assert.equal(view.evidence.distance.covered_s, 310);
  assert.ok(view.evidence.tracking.reason);
});
