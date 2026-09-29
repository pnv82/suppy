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
    store: createStore({ database: db, tenantId: "alice", launchLookup: null }),
    bob: createStore({ database: db, tenantId: "bob", launchLookup: null }),
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

test("temperature preserves negative values/nulls and existing uploads refresh on open without losing annotations", (t) => {
  const { db, store } = setup(t);
  const args = uploadFixture({
    record: (r, time) => ({ ...r, ...(time === 0 ? {} : { temperature: -3 }) }),
  });
  const decoded = decodeUpload(args);
  assert.equal(decoded.session.records[0].temperature_c, null);
  assert.equal(decoded.session.records[1].temperature_c, -3);
  const { session_id } = store.commitImport(commitArgs(store, args));
  const repo = db.forTenant("alice");
  const s = repo.get(session_id);
  s.annotations = [
    {
      id: "keep",
      kind: "note",
      start_s: 20,
      end_s: 20,
      note: "Keep me",
      timing: "exact",
      source: "athlete_reported",
    },
  ];
  for (const r of s.records) delete r.temperature_c;
  s.deterministic = {
    method: "obsolete",
    movement: { events: [{ type: "timer_pause" }] },
  };
  repo.save(s);
  const bytes = Buffer.from(repo.fitSource(session_id).fit_bytes);
  assert.equal(db.forTenant("bob").fitSource(session_id), null);
  const context = store.context(session_id);
  assert.equal(context.deterministic.method, "sup_deterministic_v4");
  assert.deepEqual(context.deterministic.movement.events, []);
  const refreshed = repo.get(session_id);
  assert.equal(refreshed.records[1].temperature_c, -3);
  assert.deepEqual(refreshed.annotations, s.annotations);
  assert.deepEqual(Buffer.from(repo.fitSource(session_id).fit_bytes), bytes);
  store.context(session_id);
  assert.equal(repo.get(session_id).revision, refreshed.revision);
});

// Garmin records use whole seconds, but elapsed/timer durations use milliseconds.
const fractionalEnd = {
  summary: { totalElapsedTime: 1299.494, totalTimerTime: 1299.494 },
};

test("whole-second end records preserve source timing and bound derived windows to elapsed duration", () => {
  const args = uploadFixture({
    ...fractionalEnd,
    record: (r, t) => ({ ...r, distance: 2 * t + (t * t) / 1300 }),
  });
  const { session: s, fit, original, provenance } = decodeUpload(args);
  assert.equal(s.deviceSummary.total_elapsed_time, 1299.494);
  assert.equal(s.deviceSummary.total_timer_time, 1299.494);
  assert.equal(s.records.length, 261);
  assert.equal(s.records.at(-1).elapsed_s, 1300);
  assert.equal(s.records.at(-1).timestamp_utc, "2026-09-27T14:21:40.000Z");
  assert.equal(s.records.at(-1).source_record_index, 260);
  assert.equal(s.deterministic.summary.speed_mps.covered_s, 1299.494);
  assert.ok(s.windows.every((w) => w.end <= 1299.494));
  assert.equal(s.windows[0].end, 1299.494);
  assert.deepEqual(s.quality, [
    { code: "record_timestamp_end_precision", count: 1 },
  ]);
  assert.deepEqual(original, Buffer.from(args.data_base64, "base64"));
  assert.equal(sha256(fit), provenance.fit_sha256);

  // Rounding must not create a full 300-second effort from 299.494 seconds.
  const short = decodeUpload(
    uploadFixture({
      ...fractionalEnd,
      record: (r, t) => (t < 1000 ? null : r),
    }),
  ).session;
  assert.equal(short.windows[0].start, null);
  for (const elapsed of [1299.001, 1299.999, 1300]) {
    const session = decodeUpload(
      uploadFixture({
        summary: { totalElapsedTime: elapsed, totalTimerTime: elapsed },
      }),
    ).session;
    assert.equal(session.records.at(-1).elapsed_s, 1300);
    assert.equal(session.quality.length, elapsed < 1300 ? 1 : 0);
  }
});

test("invalid record timestamps report the precise cause, record and timing", () => {
  const cases = [
    {
      record: (r, t) => {
        if (t === 20) delete r.timestamp;
        return r;
      },
      reason: /record 5.*missing or invalid timestamp/i,
    },
    {
      record: (r, t) => ({
        ...r,
        timestamp: t === 20 ? new Date("2026-09-27T14:00:15Z") : r.timestamp,
      }),
      reason: /record 5.*duplicate timestamp.*14:00:15.*record 4/i,
    },
    {
      record: (r, t) => ({
        ...r,
        timestamp: t === 20 ? new Date("2026-09-27T14:00:05Z") : r.timestamp,
      }),
      reason: /record 5.*goes backward by 10 s.*record 4/i,
    },
    {
      record: (r, t) => ({
        ...r,
        timestamp: t === 0 ? new Date("2026-09-27T13:59:59Z") : r.timestamp,
      }),
      reason: /record 1.*1 s before.*14:00:00/i,
    },
    {
      ...fractionalEnd,
      record: (r, t) => ({
        ...r,
        timestamp: t === 1300 ? new Date("2026-09-27T14:21:41Z") : r.timestamp,
      }),
      reason: /record 261.*1\.506 s after.*14:21:39\.494.*whole-second/i,
    },
    {
      summary: { totalElapsedTime: 1299, totalTimerTime: 1299 },
      timerEvents: [],
      reason: /record 261.*1 s after.*14:21:39\.000/i,
    },
  ];
  for (const { reason, ...options } of cases)
    assert.throws(() => decodeUpload(uploadFixture(options)), reason);
});

const timerEvent = (seconds, eventType) => ({
  timestamp: new Date(Date.parse("2026-09-27T14:00:00Z") + seconds * 1000),
  event: "timer",
  eventType,
});

test("a bounded final timer stop corroborates older-watch tail records without changing durations", (t) => {
  const { store } = setup(t);
  const board = store.upsertBoard({ name: "Inflatable board" });
  for (const paused of [false, true]) {
    const elapsed = 1296.271;
    const args = uploadFixture({
      paused,
      // Session save time may be much later; it is not the recording boundary.
      summary: {
        totalElapsedTime: elapsed,
        totalTimerTime: paused ? elapsed - 160 : elapsed,
        timestamp: new Date("2026-09-27T15:00:00Z"),
      },
    });
    const { session: s, provenance } = decodeUpload(args);
    assert.equal(s.deviceSummary.total_elapsed_time, elapsed);
    assert.equal(
      s.deviceSummary.total_timer_time,
      paused ? elapsed - 160 : elapsed,
    );
    assert.equal(s.records.at(-1).elapsed_s, 1300);
    assert.equal(s.records.at(-1).source_record_index, s.records.length - 1);
    assert.equal(
      provenance.raw_timer_events.at(-1).timestamp.toISOString(),
      s.records.at(-1).timestamp_utc,
    );
    const quality = s.quality.find(
      (q) => q.code === "record_after_reported_end",
    );
    assert.equal(quality.count, 1);
    assert.equal(quality.difference_s, 3.729);
    assert.equal(quality.timer_stop_utc, "2026-09-27T14:21:40.000Z");
    assert.deepEqual(s.pauses, paused ? [{ start: 500, end: 660 }] : []);
    assert.ok(s.windows.every((w) => w.end === null || w.end <= elapsed));
    assert.ok(s.deterministic.summary.speed_mps.covered_s <= elapsed);
    assert.equal(store.previewImport(args).status, "preview");
    const saved = store.commitImport(
      commitArgs(store, args, { board_id: board.id }),
    );
    assert.equal(store.get(saved.session_id).boardId, board.id);
    assert.equal(store.previewImport(args).status, "duplicate");
    executeTool(store, "delete_session", { session_id: saved.session_id });
    assert.equal(
      store.commitImport(commitArgs(store, args, { board_id: board.id }))
        .status,
      "imported",
    );
    executeTool(store, "delete_session", { session_id: saved.session_id });
  }
});

test("timer corroboration is bounded and requires ordered complete events plus a matching final record", () => {
  const summary = {
    totalElapsedTime: 1296.271,
    totalTimerTime: 1296.271,
    timestamp: new Date("2026-09-27T15:00:00Z"),
  };
  for (const timerEvents of [
    [],
    [timerEvent(0, "start")],
    [timerEvent(1300, "stopAll")],
    [timerEvent(1, "start"), timerEvent(1300, "stopAll")],
    [timerEvent(0, "start"), timerEvent(1299, "stopAll")],
    [timerEvent(0, "start"), timerEvent(1301, "stopAll")],
    [
      timerEvent(0, "start"),
      timerEvent(1300, "stopAll"),
      timerEvent(1301, "start"),
    ],
    [
      timerEvent(0, "start"),
      timerEvent(700, "stopAll"),
      timerEvent(600, "start"),
      timerEvent(1300, "stopAll"),
    ],
    [
      timerEvent(0, "start"),
      timerEvent(600, "start"),
      timerEvent(1300, "stopAll"),
    ],
  ])
    assert.throws(
      () => decodeUpload(uploadFixture({ summary, timerEvents })),
      /record 261.*after the session end/i,
    );
  assert.throws(
    () =>
      decodeUpload(
        uploadFixture({
          summary: { totalElapsedTime: 1294.999, totalTimerTime: 1294.999 },
        }),
      ),
    /record 261.*5\.001 s after/i,
  );
  const allowed = decodeUpload(
    uploadFixture({
      summary: { totalElapsedTime: 1295, totalTimerTime: 1295 },
    }),
  ).session;
  assert.equal(
    allowed.quality.find((q) => q.code === "record_after_reported_end")
      .difference_s,
    5,
  );
});

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

test("import retains profile-scaled fractional cadence and GPS accuracy without double expansion", () => {
  const decoded = decodeUpload(
    uploadFixture({
      record: (r) => ({
        ...r,
        fractionalCadence: 0.5,
        cadence256: 30.5,
        gpsAccuracy: 4,
      }),
    }),
  );
  assert.equal(decoded.session.records[0].cadence_raw, 30);
  assert.equal(decoded.session.records[0].cadence_fractional_raw, 0.5);
  assert.equal(decoded.session.records[0].cadence_256_raw, 30.5);
  assert.equal(decoded.session.records[0].gps_accuracy_m, 4);
  assert.ok(Array.isArray(decoded.provenance.raw_laps));
  assert.ok(Array.isArray(decoded.provenance.raw_device_info));
  assert.equal(decoded.provenance.raw_file_id[0].manufacturer, "development");
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
    /goes backward/,
  );
});

test("preview writes nothing; commits preserve originals, survive restart and deduplicate FIT/ZIP across tenant scopes", async (t) => {
  const path = join(mkdtempSync(join(tmpdir(), "sup-fit-")), "test.sqlite");
  const { db, store, bob } = setup(t, path);
  const args = uploadFixture(fractionalEnd);
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
  const zip = zipFixture(fitFixture(fractionalEnd));
  const zipArgs = {
    ...args,
    filename: "renamed.zip",
    data_base64: zip.toString("base64"),
  };
  assert.equal(
    store.commitImport(commitArgs(store, zipArgs)).session_id,
    saved.session_id,
  );
  assert.equal(store.previewImport(args).status, "duplicate");
  assert.equal(
    store.previewImport(zipArgs).duplicate_session_id,
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
    createStore({
      database: reopened,
      tenantId: "alice",
      launchLookup: null,
    }).get(saved.session_id).additionalContext,
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
    const invalid = uploadFixture({
      record: (r, t) => ({
        ...r,
        timestamp: t === 20 ? new Date("2026-09-27T14:00:15Z") : r.timestamp,
      }),
    });
    for (const name of ["preview_fit_import", "commit_fit_import"]) {
      const args =
        name === "preview_fit_import"
          ? invalid
          : {
              ...invalid,
              expected_sha256: sha256(
                Buffer.from(invalid.data_base64, "base64"),
              ),
              target_session_id: null,
              board_id: null,
            };
      const mcpError = await client.callTool({ name, arguments: args });
      assert.equal(mcpError.isError, true);
      assert.match(
        mcpError.content[0].text,
        /record 5.*duplicate timestamp.*record 4/i,
      );
      const response = await fetch(base + "/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, arguments: args }),
      });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, mcpError.content[0].text);
      assert.equal(store.dashboard().sessions.length, 0);
    }
    const args = uploadFixture({
      summary: { totalElapsedTime: 1296.271, totalTimerTime: 1296.271 },
    });
    const preview = await client.callTool({
      name: "preview_fit_import",
      arguments: args,
    });
    assert.equal(preview.structuredContent.status, "preview");
    assert.equal(
      preview.structuredContent.summary.quality.find(
        (q) => q.code === "record_after_reported_end",
      ).difference_s,
      3.729,
    );
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

test("session deletion preserves original bytes, isolates tenants and permits re-import", (t) => {
  const path = join(mkdtempSync(join(tmpdir(), "sup-delete-")), "test.sqlite");
  const { db, store, bob } = setup(t, path);
  const upload = uploadFixture(fractionalEnd);
  const saved = store.commitImport(commitArgs(store, upload));
  bob.commitImport(commitArgs(bob, upload));
  const result = executeTool(store, "delete_session", {
    session_id: saved.session_id,
  });
  assert.equal(result._meta.sessionId, undefined);
  assert.equal(store.dashboard().sessions.length, 0);
  assert.throws(() => store.get(saved.session_id), /not found/);
  assert.equal(bob.dashboard().sessions.length, 1);
  assert.equal(store.previewImport(upload).status, "preview");
  assert.throws(() =>
    executeTool(store, "delete_session", {
      session_id: saved.session_id,
      tenant_id: "bob",
    }),
  );
  const raw = new DatabaseSync(path);
  t.after(() => raw.close());
  const archived = raw
    .prepare("SELECT * FROM deleted_fit_archives WHERE tenant_id = ?")
    .get("alice");
  assert.deepEqual(
    Buffer.from(archived.original_bytes),
    Buffer.from(upload.data_base64, "base64"),
  );
  assert.equal(
    raw.prepare("SELECT COUNT(*) AS n FROM deleted_session_archives").get().n,
    1,
  );
  assert.equal(
    store.commitImport(commitArgs(store, upload)).status,
    "imported",
  );
  assert.equal(store.dashboard().sessions.length, 1);
  assert.deepEqual(db.integrity().foreignKeys, []);
});
