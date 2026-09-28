import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openDatabase, databasePath } from "../server/database.mjs";
import { createStore } from "../server/store.mjs";
import { createHttpServer } from "../server/index.mjs";
import { executeTool } from "../server/tools.mjs";
import { fixtureState } from "./fixtures.mjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

function directory(t) {
  const dir = mkdtempSync(join(tmpdir(), "sup-storage-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function seed(db, tenant) {
  db.createTenant(tenant);
  db.importState(tenant, fixtureState());
  return createStore({ database: db, tenantId: tenant });
}
// Recomputed evidence has a new computation timestamp after reopening; persisted
// source facts, method, dependency hash and all numeric results must be identical.
const withoutComputationTime = (value) =>
  JSON.parse(
    JSON.stringify(value, (key, v) =>
      key === "computed_at_utc" ? undefined : v,
    ),
  );
const note = (id) => ({
  session_id: id,
  start_s: 10,
  end_s: 20,
  kind: "note",
  note: "Persistent note",
  timing: "approximate",
});

test("SQLite preserves all edits, SI data, provenance and deletions after reopen; backup is usable", async (t) => {
  const dir = directory(t),
    path = join(dir, "app.sqlite");
  let db = openDatabase(path);
  let store = seed(db, "alice");
  const id = store.dashboard().sessions[0].id;
  const board = store.upsertBoard({ name: "Race board" });
  store.setDefaultBoard({ board_id: board.id });
  store.updateDetails({
    session_id: id,
    name: "Confirmed launch",
    board_id: board.id,
  });
  const annotation = store.addAnnotation(note(id));
  store.addAnnotation({
    ...note(id),
    annotation_id: annotation.id,
    note: "Edited note",
  });
  store.updateContext({ session_id: id, note: "New context" });
  store.updateFocus({
    session_id: id,
    goal_speed_mph: 5,
    goal_duration_min: 20,
    technique_ids: ["SUP-ENTRY-01"],
  });
  store.upsertBoard({ board_id: board.id, name: "Race renamed" });
  const expected = store.dashboard();
  await db.backup(join(dir, "backup.sqlite"));
  await assert.rejects(
    () => db.backup(join(dir, "backup.sqlite")),
    /already exists/,
  );
  db.close();
  db = openDatabase(path);
  store = createStore({ database: db, tenantId: "alice" });
  assert.deepEqual(
    withoutComputationTime(store.dashboard()),
    withoutComputationTime(expected),
  );
  assert.equal(store.context(id).board.name, "Race renamed");
  assert.equal(store.context(id).annotations[0].note, "Edited note");
  assert.equal(store.context(id).goal.speed_mph, 5);
  const direct = new DatabaseSync(path);
  const raw = JSON.parse(
    direct
      .prepare("SELECT data_si FROM sessions WHERE tenant_id = ? AND id = ?")
      .get("alice", id).data_si,
  );
  assert.equal(raw.distance_m, 1.6 * 1609.344);
  assert.equal(raw.avgSpeed, undefined);
  assert.equal(raw.goal.speed_mps, 5 * 0.44704);
  assert.equal(raw.timezone, "America/Los_Angeles");
  direct.close();
  store.removeAnnotation({ session_id: id, annotation_id: annotation.id });
  store.assignBoard({ session_id: id, board_id: null });
  store.deleteBoard({ board_id: board.id });
  db.close();
  db = openDatabase(path);
  store = createStore({ database: db, tenantId: "alice" });
  assert.deepEqual(store.get(id).annotations, []);
  assert.deepEqual(store.dashboard().boards, []);
  assert.equal(store.dashboard().defaultBoardId, null);
  assert.deepEqual(db.integrity().foreignKeys, []);
  db.close();
  const restored = openDatabase(join(dir, "backup.sqlite"));
  assert.deepEqual(
    withoutComputationTime(
      createStore({ database: restored, tenantId: "alice" }).dashboard(),
    ),
    withoutComputationTime(expected),
  );
  restored.close();
});

test("tenant isolation, composite foreign keys and rollback cover identical session IDs", (t) => {
  const path = join(directory(t), "tenants.sqlite"),
    db = openDatabase(path);
  const alice = seed(db, "alice"),
    bob = seed(db, "bob");
  const id = alice.dashboard().sessions[0].id;
  const board = alice.upsertBoard({ name: "Private board" });
  alice.setDefaultBoard({ board_id: board.id });
  const annotation = alice.addAnnotation(note(id));
  alice.updateContext({ session_id: id, note: "Alice private context" });
  assert.equal(bob.get(id).additionalContext, "");
  assert.deepEqual(bob.get(id).annotations, []);
  assert.deepEqual(bob.dashboard().boards, []);
  assert.equal(bob.dashboard().defaultBoardId, null);
  for (const attempt of [
    () => bob.assignBoard({ session_id: id, board_id: board.id }),
    () => bob.setDefaultBoard({ board_id: board.id }),
    () => bob.deleteBoard({ board_id: board.id }),
    () => bob.upsertBoard({ board_id: board.id, name: "Stolen" }),
    () =>
      bob.updateDetails({
        session_id: id,
        name: "Partial edit",
        board_id: board.id,
      }),
    () =>
      bob.removeAnnotation({ session_id: id, annotation_id: annotation.id }),
    () => bob.addAnnotation({ ...note(id), annotation_id: annotation.id }),
  ])
    assert.throws(attempt, /not found/i);
  assert.equal(bob.get(id).title, "Synthetic launch");
  assert.equal(bob.get(id).revision, 0);
  assert.throws(() =>
    executeTool(bob, "get_dashboard", { tenant_id: "alice" }),
  );
  const direct = new DatabaseSync(path);
  direct.exec("PRAGMA foreign_keys = ON");
  assert.throws(
    () =>
      direct
        .prepare(
          "UPDATE sessions SET board_id = ? WHERE tenant_id = ? AND id = ?",
        )
        .run(board.id, "bob", id),
    /FOREIGN KEY/,
  );
  direct.close();
  db.createTenant("empty");
  const empty = createStore({ database: db, tenantId: "empty" });
  assert.deepEqual(empty.dashboard().sessions, []);
  assert.throws(() => empty.context(id), /not found/);
  assert.throws(() => db.importState("alice", fixtureState()), /empty tenant/);
  const malformed = fixtureState();
  malformed.sessions[1].id = malformed.sessions[0].id;
  assert.throws(() => db.importState("empty", malformed));
  assert.deepEqual(empty.dashboard().sessions, []);
  db.close();
});

test("independent connections read fresh state and schema versions fail safely", (t) => {
  const path = join(directory(t), "concurrent.sqlite"),
    a = openDatabase(path);
  const first = seed(a, "local"),
    b = openDatabase(path);
  const second = createStore({ database: b, tenantId: "local" });
  const id = first.dashboard().sessions[0].id;
  first.updateContext({ session_id: id, note: "Written by A" });
  second.addAnnotation(note(id));
  assert.equal(first.get(id).additionalContext, "Written by A");
  assert.equal(first.get(id).annotations.length, 1);
  assert.equal(first.get(id).revision, 2);
  a.close();
  b.close();
  const raw = new DatabaseSync(path);
  raw.exec("PRAGMA user_version = 999");
  raw.close();
  assert.throws(() => openDatabase(path), /newer than this app/);
  assert.notEqual(
    databasePath({ NODE_ENV: "development" }),
    databasePath({ NODE_ENV: "production" }),
  );
  assert.throws(() => databasePath({ NODE_ENV: "test" }), /isolated/);
});

test("REST and MCP resolve tenant on every request, reject spoofing, and persist across server restart", async (t) => {
  const path = join(directory(t), "http.sqlite"),
    db = openDatabase(path);
  seed(db, "alice");
  db.createTenant("bob");
  const resolver = (req) =>
    ({ "Bearer alice-test": "alice", "Bearer bob-test": "bob" })[
      req.headers.authorization
    ];
  const server = createHttpServer(undefined, {
    database: db,
    resolveTenant: resolver,
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const client = new Client({ name: "tenant-test", version: "1" });
  try {
    assert.equal(
      (
        await fetch(url + "/api/dashboard?tenant=alice", {
          headers: { "X-Tenant-ID": "alice" },
        })
      ).status,
      403,
    );
    assert.equal((await fetch(url + "/mcp", { method: "POST" })).status, 403);
    const headers = {
      Authorization: "Bearer bob-test",
      "X-Tenant-ID": "alice",
    };
    const empty = await fetch(url + "/api/dashboard?tenant=alice", {
      headers,
    }).then((r) => r.json());
    assert.equal(empty.tenantId, "bob");
    assert.deepEqual(empty.sessions, []);
    await client.connect(
      new StreamableHTTPClientTransport(new URL(url + "/mcp"), {
        requestInit: { headers: { Authorization: "Bearer alice-test" } },
      }),
    );
    const dashboard = await client.callTool({
      name: "get_dashboard",
      arguments: {},
    });
    const id = dashboard.structuredContent.sessions[0].id;
    await client.callTool({
      name: "update_session_context",
      arguments: { session_id: id, note: "Survives HTTP restart" },
    });
    const cross = await fetch(url + "/api/tools", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "get_session_context",
        arguments: { session_id: id },
      }),
    });
    assert.equal(cross.status, 400);
    const bobClient = new Client({ name: "bob-test", version: "1" });
    try {
      await bobClient.connect(
        new StreamableHTTPClientTransport(new URL(url + "/mcp"), {
          requestInit: { headers },
        }),
      );
      const bobDashboard = await bobClient.callTool({
        name: "get_dashboard",
        arguments: {},
      });
      assert.deepEqual(bobDashboard._meta.appData.sessions, []);
      assert.equal(
        (
          await bobClient.callTool({
            name: "get_session_context",
            arguments: { session_id: id },
          })
        ).isError,
        true,
      );
    } finally {
      await bobClient.close();
    }
  } finally {
    await client.close();
    await new Promise((r) => server.close(r));
    db.close();
  }
  const restarted = createHttpServer(undefined, {
    dbPath: path,
    tenantId: "alice",
  });
  await new Promise((r) => restarted.listen(0, "127.0.0.1", r));
  try {
    const state = await fetch(
      `http://127.0.0.1:${restarted.address().port}/api/dashboard`,
    ).then((r) => r.json());
    assert.equal(state.sessions[0].additionalContext, "Survives HTTP restart");
    assert.equal(state.storage, "sqlite");
  } finally {
    await new Promise((r) => restarted.close(r));
  }
});
