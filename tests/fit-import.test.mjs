import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { decodeUpload, unpackFit, sha256 } from "../server/fit-import.mjs";
import { openDatabase } from "../server/database.mjs";
import { createStore } from "../server/store.mjs";
import { executeTool } from "../server/tools.mjs";
import { createHttpServer } from "../server/index.mjs";
import { intervalStatistics } from "../src/domain/analysis.mjs";
import { validRuns } from "../src/domain/metrics.mjs";
import { fitFixture, zipFixture, uploadFixture } from "./fit-fixtures.mjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

function setup(t, path = ":memory:") {
  const db = openDatabase(path);
  db.createTenant("alice");
  db.createTenant("bob");
  t.after(() => db.close());
  return {
    db,
    store: createStore({ database: db, tenantId: "alice" }),
    bob: createStore({ database: db, tenantId: "bob" }),
  };
}
function commitArgs(store, args = uploadFixture(), rest = {}) {
  return {
    ...args,
    expected_sha256: store.previewImport(args).sha256,
    target_session_id: null,
    board_id: null,
    ...rest,
  };
}

test("official decoder normalizes SI, UTC, nulls, strokes and deterministic best windows", () => {
  const { session: s } = decodeUpload(uploadFixture());
  assert.equal(s.startUtc, "2026-09-27T14:00:00.000Z");
  assert.equal(s.start, "07:00");
  assert.equal(s.records.length, 261);
  assert.equal(s.records[10].distance_m, 100);
  assert.equal(s.windows[2].speed_mps, 2);
  assert.equal(s.windows[2].start, 0);
  assert.equal(s.windows[2].statistics.heart_rate_bpm.mean, 140);
  assert.equal(s.statistics.distance_per_stroke.value_m, 4);
  assert.equal(s.wind, null);
  assert.equal(s.goal.speed_mph, null);
  assert.deepEqual(s.technique, []);
  assert.match(s.id, /^fit-[a-f0-9]{64}$/);
  assert.notEqual(s.id, "renamed");
  const missing = decodeUpload(
    uploadFixture({ gps: false, sensors: false }),
  ).session;
  assert.equal(missing.records[0].latitude_deg, null);
  assert.equal(missing.windows[2].speed_mps, 2);
  assert.equal(missing.deterministic.summary.heart_rate_bpm.mean, null);
  assert.equal(missing.statistics.distance_per_stroke.value_m, null);
  const summary = decodeUpload(uploadFixture({ records: false })).session;
  assert.equal(summary.distance * 1609.344, 2600);
  assert.equal(summary.windows[0].start, null);
});

test("pause, gap, reset and unresolved timer boundaries never form continuous best efforts", () => {
  const paused = decodeUpload(uploadFixture({ paused: true })).session;
  assert.deepEqual(paused.pauses, [{ start: 500, end: 660 }]);
  assert.equal(paused.windows[2].start, null);
  assert.equal(paused.active * 60, 1140);
  for (const options of [
    { record: (r, t) => (t > 500 && t < 550 ? null : r) },
    { record: (r, t) => ({ ...r, distance: t > 500 ? (t - 500) * 2 : t * 2 }) },
    { summary: { totalTimerTime: 1000 } },
  ])
    assert.equal(
      decodeUpload(uploadFixture(options)).session.windows[2].start,
      null,
    );
});

test("interval evidence weights irregular timestamps and clips boundaries before sampling", () => {
  const points = [0, 2, 10, 15].map((t, i) => ({
    elapsed_s: t,
    distance_m: t * 2,
    speed_mps: [0, 4, 2, 2][i],
    heart_rate_bpm: [100, 150, 120, 120][i],
    cadence_raw: 0,
  }));
  const result = intervalStatistics(points, [], 1, 12);
  assert.equal(result.speed_mps.mean, 36 / 11);
  assert.equal(result.speed_mps.median, 4);
  assert.equal(result.speed_mps.covered_s, 11);
  assert.equal(result.cadence_raw.mean, 0);
  assert.equal(result.distance.value_m, 22);
  assert.equal(result.distance.mean_speed_mps, 2);
  assert.equal(result.distance_per_stroke.value_m, null);
  assert.equal(
    intervalStatistics(points, [{ start: 3, end: 5 }], 0, 15).speed_mps
      .covered_s,
    7,
  );
  assert.equal(intervalStatistics(points, [], 5, 5).speed_mps.mean, null);
});

test("GPS remains drawable without distance, while distance windows remain unavailable", () => {
  const s = decodeUpload(
    uploadFixture({
      record: (r) => {
        delete r.distance;
        return r;
      },
    }),
  ).session;
  assert.equal(s.windows[0].start, null);
  assert.equal(validRuns(s.records, s.pauses, true, false)[0].length, 261);
  assert.equal(s.deterministic.summary.speed_mps.mean, 2);
});

test("source persistence failure rolls back the entire import", (t) => {
  const path = join(
    mkdtempSync(join(tmpdir(), "sup-fit-rollback-")),
    "test.sqlite",
  );
  const { store } = setup(t, path);
  const direct = new DatabaseSync(path);
  direct.exec(
    "CREATE TRIGGER reject_source BEFORE INSERT ON fit_imports BEGIN SELECT RAISE(ABORT, 'synthetic storage failure'); END;",
  );
  direct.close();
  assert.throws(() => store.commitImport(commitArgs(store)), /storage failure/);
  assert.equal(store.dashboard().sessions.length, 0);
});

test("bounded ZIP extraction verifies sizes/CRC and rejects traversal, encryption, extra files and bombs", () => {
  const fit = fitFixture();
  for (const method of [0, 8])
    assert.deepEqual(
      unpackFit(zipFixture(fit, { method }), "file.zip").fit,
      fit,
    );
  assert.throws(
    () => unpackFit(zipFixture(fit, { name: "../file.fit" }), "bad.zip"),
    /ZIP/,
  );
  for (const mutate of [
    (z) => z.writeUInt16LE(2, z.length - 12),
    (z) => z.writeUInt32LE(30_000_001, z.readUInt32LE(z.length - 6) + 24),
    (z) => z.writeUInt16LE(1, z.readUInt32LE(z.length - 6) + 8),
    (z) => {
      z[40] ^= 255;
    },
  ]) {
    const z = zipFixture(fit);
    mutate(z);
    assert.throws(() => unpackFit(z, "bad.zip"), /ZIP/);
  }
  assert.throws(
    () =>
      decodeUpload({
        ...uploadFixture(),
        data_base64: Buffer.from("broken").toString("base64"),
      }),
    /integrity/,
  );
  const corrupt = fitFixture();
  corrupt[corrupt.length - 1] ^= 255;
  assert.throws(
    () =>
      decodeUpload({
        ...uploadFixture(),
        data_base64: corrupt.toString("base64"),
      }),
    /integrity/,
  );
  assert.throws(
    () => decodeUpload(uploadFixture({ summary: { sport: "running" } })),
    /paddleboarding/,
  );
  assert.throws(
    () => decodeUpload({ ...uploadFixture(), timezone: "invented" }),
    /timezone/,
  );
  assert.throws(
    () =>
      decodeUpload(
        uploadFixture({
          record: (r, t) => ({
            ...r,
            timestamp:
              t === 20 ? new Date("2026-09-27T14:00:05Z") : r.timestamp,
          }),
        }),
      ),
    /timestamps/,
  );
});

test("preview writes nothing; commits preserve originals, survive restart and deduplicate FIT/ZIP across tenant scopes", async (t) => {
  const path = join(mkdtempSync(join(tmpdir(), "sup-fit-")), "test.sqlite");
  const { db, store, bob } = setup(t, path);
  const args = uploadFixture();
  const p = store.previewImport(args);
  assert.equal(p.status, "preview");
  assert.equal(store.dashboard().sessions.length, 0);
  const board = store.upsertBoard({ name: "Race board" });
  store.setDefaultBoard({ board_id: board.id });
  const saved = store.commitImport(commitArgs(store, args));
  assert.equal(store.get(saved.session_id).boardId, null); // defaults never silently assigned
  store.updateContext({
    session_id: saved.session_id,
    note: "keep this observation",
  });
  const zip = zipFixture(fitFixture());
  const zipArgs = {
    ...args,
    filename: "renamed.zip",
    data_base64: zip.toString("base64"),
  };
  assert.equal(
    store.commitImport(commitArgs(store, zipArgs)).session_id,
    saved.session_id,
  );
  assert.equal(store.dashboard().sessions.length, 1);
  assert.equal(
    store.get(saved.session_id).additionalContext,
    "keep this observation",
  );
  assert.equal(bob.previewImport(args).status, "preview");
  bob.commitImport(commitArgs(bob, args));
  assert.equal(bob.get(saved.session_id).additionalContext, "");
  assert.throws(
    () =>
      store.commitImport({
        ...commitArgs(store, args),
        expected_sha256: "0".repeat(64),
      }),
    /changed/,
  );
  const backup = path + ".backup";
  await db.backup(backup);
  const reopened = openDatabase(backup);
  assert.equal(
    createStore({ database: reopened, tenantId: "alice" }).get(saved.session_id)
      .additionalContext,
    "keep this observation",
  );
  reopened.close();
  const direct = new DatabaseSync(path);
  const originals = direct
    .prepare("SELECT * FROM fit_imports WHERE tenant_id = 'alice'")
    .all();
  assert.equal(originals.length, 2);
  assert.ok(
    originals.every(
      (r) =>
        sha256(r.original_bytes) === r.original_sha256 &&
        sha256(r.fit_bytes) === r.fit_sha256,
    ),
  );
  direct.close();
});

test("explicit matching attaches telemetry atomically while preserving historical facts and edits", (t) => {
  const { db, store } = setup(t);
  const source = decodeUpload(uploadFixture()).session;
  source.id = "historical-string-id";
  source.records = [];
  source.hashes = null;
  source.best20 = 7;
  source.title = "Confirmed launch";
  source.notes = "Historical note";
  source.avgSpeed = 8;
  db.importState("alice", { sessions: [source] });
  assert.equal(
    store.previewImport(uploadFixture()).candidates[0].id,
    source.id,
  );
  assert.throws(
    () =>
      store.commitImport(
        commitArgs(store, uploadFixture(), {
          target_session_id: "another-tenant",
        }),
      ),
    /does not match/,
  );
  assert.throws(
    () =>
      store.commitImport(
        commitArgs(store, uploadFixture(), { board_id: "missing" }),
      ),
    /Board not found/,
  );
  assert.equal(store.dashboard().sessions.length, 1);
  store.commitImport(
    commitArgs(store, uploadFixture(), { target_session_id: source.id }),
  );
  const actual = store.get(source.id);
  assert.equal(actual.records.length, 261);
  assert.equal(actual.title, source.title);
  assert.equal(actual.notes, source.notes);
  assert.equal(actual.best20, 7);
  assert.equal(actual.avgSpeed, 8);
  assert.equal(actual.deterministic.windows[2].speed_mps, 2);
});

test("REST and MCP expose the same import flow and calculated interval evidence, rejecting tenant arguments", async (t) => {
  const { store } = setup(t),
    server = createHttpServer(store, {
      weatherProvider: {
        retrieve: async () => ({
          status: "unavailable",
          message: "No synthetic weather.",
        }),
      },
    });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = new Client({ name: "import-test", version: "1" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(base + "/mcp")),
    );
    const args = uploadFixture();
    const preview = await client.callTool({
      name: "preview_fit_import",
      arguments: args,
    });
    assert.equal(preview.structuredContent.status, "preview");
    assert.equal(preview.structuredContent.route, undefined);
    assert.ok(preview._meta.importRoute.length);
    const res = await fetch(base + "/api/tools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "commit_fit_import",
        arguments: commitArgs(store, args),
      }),
    });
    assert.equal(res.status, 200);
    const saved = await res.json();
    const context = await client.callTool({
      name: "prepare_analysis_context",
      arguments: {
        session_id: saved.structuredContent.session_id,
        question: "Review this interval",
        start_s: 1,
        end_s: 1201,
      },
    });
    assert.equal(context.structuredContent.evidence.speed_mps.mean, 2);
    assert.equal(context.structuredContent.evidence.speed_mps.covered_s, 1200);
    assert.ok(context.structuredContent.telemetry.length <= 120);
    assert.throws(() =>
      executeTool(store, "preview_fit_import", { ...args, tenant_id: "bob" }),
    );
  } finally {
    await client.close();
    await new Promise((r) => server.close(r));
  }
});
