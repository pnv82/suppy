import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createGarminService } from "../server/garmin/service.mjs";
import { createGarminAdapter } from "../server/garmin/adapter.mjs";
import { createHttpServer } from "../server/index.mjs";
import { openDatabase } from "../server/database.mjs";
import { createStore } from "../server/store.mjs";
import { toolSchemas } from "../server/tools.mjs";
import { fitFixture } from "./fit-fixtures.mjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const activity = (id = "123456789") => ({
  activityId: id,
  activityName: "Destination name is not a launch",
  activityType: { typeKey: "stand_up_paddleboarding" },
  startTimeGMT: "2025-01-01 10:00:00",
  distance: 1000,
  duration: 600,
});
function setup(t, overrides = {}, path = ":memory:") {
  const db = openDatabase(path);
  db.createTenant("a");
  db.createTenant("b");
  const store = createStore({
    database: db,
    tenantId: "a",
    launchLookup: null,
  });
  const other = createStore({
    database: db,
    tenantId: "b",
    launchLookup: null,
  });
  let time = Date.now(),
    closes = 0;
  const bytes = fitFixture();
  const service = createGarminService({
    now: () => time,
    adapterFactory: () => ({
      login: async () => "mfa_required",
      verify: async (code) => {
        if (code !== "123456") throw new Error("provider secret");
        return "connected";
      },
      list: async () => [activity()],
      download: async () => bytes,
      close: () => {
        closes++;
      },
      ...overrides,
    }),
  });
  t.after(() => {
    service.close();
    db.close();
  });
  return {
    db,
    store,
    other,
    bytes,
    service,
    advance: (ms) => {
      time += ms;
    },
    closes: () => closes,
  };
}
async function connect(service, store) {
  await service.authenticate(store, "login", {
    username: "synthetic@example.test",
    password: "synthetic secret",
  });
  if (service.status(store.tenantId).status === "mfa_required")
    await service.authenticate(store, "verify", { code: "123456" });
}
test("Garmin MFA, tenant isolation, reviewed import, original bytes and provenance", async (t) => {
  const path = join(mkdtempSync(join(tmpdir(), "suppy-garmin-")), "qa.sqlite");
  const { db, store, other, bytes, service } = setup(t, {}, path);
  assert.equal(
    (
      await service.authenticate(store, "login", {
        username: "a",
        password: "secret",
      })
    ).status,
    "mfa_required",
  );
  await assert.rejects(
    service.authenticate(store, "verify", { code: "000000" }),
    /verification failed/,
  );
  await service.authenticate(store, "verify", { code: "123456" });
  await assert.rejects(
    service.execute(other, "list_garmin_activities", {}),
    /Connect your Garmin/,
  );
  const page = await service.execute(store, "list_garmin_activities", {});
  assert.equal(page.activities[0].start_utc, "2025-01-01T10:00:00Z");
  const p = await service.execute(store, "preview_garmin_activity", {
    activity_id: "123456789",
    timezone: "UTC",
  });
  assert.equal(store.dashboard().sessions.length, 0);
  assert.ok(!JSON.stringify(p).includes("data_base64"));
  assert.notEqual(p.summary.title, activity().activityName);
  const args = {
    preview_id: p.preview_id,
    expected_sha256: p.sha256,
    target_session_id: null,
    board_id: null,
    launch_name: "Reviewed launch",
  };
  await connect(service, other);
  await assert.rejects(
    service.execute(other, "commit_garmin_activity", args),
    /expired/,
  );
  await assert.rejects(
    service.execute(store, "commit_garmin_activity", {
      ...args,
      expected_sha256: "0".repeat(64),
    }),
    /changed/,
  );
  const saved = await service.execute(store, "commit_garmin_activity", args);
  assert.equal(saved.status, "imported");
  const raw = new DatabaseSync(path);
  t.after(() => raw.close());
  const source = raw
    .prepare("SELECT * FROM fit_imports WHERE tenant_id = ? AND session_id = ?")
    .get("a", saved.session_id);
  assert.deepEqual(Buffer.from(source.original_bytes), bytes);
  assert.equal(
    createHash("sha256").update(source.original_bytes).digest("hex"),
    p.sha256,
  );
  const provenance = JSON.parse(source.provenance_json);
  assert.equal(provenance.import_source.activity_id, "123456789");
  assert.equal(
    (await service.execute(store, "commit_garmin_activity", args)).status,
    "duplicate",
  );
  assert.equal(store.dashboard().sessions.length, 1);
  assert.equal(other.dashboard().sessions.length, 0);
});
test("Garmin paging filters non-SUP and missing values, requires listed IDs, expires previews and disconnects", async (t) => {
  const { service, store, advance, closes } = setup(t, {
    list: async () => [
      { ...activity(), distance: null, duration: null },
      ...Array.from({ length: 19 }, () => ({
        ...activity("4"),
        activityType: { typeKey: "running" },
      })),
    ],
  });
  await connect(service, store);
  await assert.rejects(
    service.execute(store, "preview_garmin_activity", {
      activity_id: "5",
      timezone: "UTC",
    }),
    /current Garmin list/,
  );
  const page = await service.execute(store, "list_garmin_activities", {});
  assert.equal(page.next_start, 20);
  assert.equal(page.activities.length, 1);
  assert.equal(page.activities[0].distance_m, null);
  const p = await service.execute(store, "preview_garmin_activity", {
    activity_id: "123456789",
    timezone: "UTC",
  });
  advance(11 * 60_000);
  await assert.rejects(
    service.execute(store, "commit_garmin_activity", {
      preview_id: p.preview_id,
      expected_sha256: p.sha256,
      target_session_id: null,
      board_id: null,
    }),
    /expired/,
  );
  advance(20 * 60_000);
  assert.equal(service.status("a").status, "disconnected");
  assert.equal(closes(), 1);
  assert.equal(store.dashboard().sessions.length, 0);
});
test("Garmin refuses oversized downloads and concurrent requests; failure never saves a session", async (t) => {
  let release;
  const { service, store } = setup(t, {
    download: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  await connect(service, store);
  await service.execute(store, "list_garmin_activities", {});
  const pending = service.execute(store, "preview_garmin_activity", {
    activity_id: "123456789",
    timezone: "UTC",
  });
  await assert.rejects(
    service.execute(store, "list_garmin_activities", {}),
    /already running/,
  );
  release(Buffer.alloc(30_000_001));
  await assert.rejects(pending, /exceeds 30 MB/);
  assert.equal(store.dashboard().sessions.length, 0);
  await service.execute(store, "disconnect_garmin", {});
  assert.equal(service.status("a").status, "disconnected");
});
test("Garmin adapter uses bounded account-local requests, supports MFA and redacts provider errors", async () => {
  const requests = [];
  const adapter = createGarminAdapter({
    consumerLoader: async () => ({
      key: "public-key",
      secret: "public-secret",
    }),
    httpAdapter: async (config) => {
      requests.push(config);
      let data = {};
      if (config.url.endsWith("/mobile/api/login"))
        data = { responseStatus: { type: "MFA_REQUIRED" } };
      else if (config.url.endsWith("/mobile/api/mfa/verifyCode"))
        data = {
          responseStatus: { type: "SUCCESSFUL" },
          serviceTicketId: "test-ticket",
        };
      else if (config.url.includes("/preauthorized?"))
        data = "oauth_token=test-token&oauth_token_secret=test-secret";
      else if (config.url.includes("/exchange/user/2.0"))
        data = {
          access_token: "test-access",
          expires_in: 3600,
          refresh_token: "test-refresh",
          refresh_token_expires_in: 3600,
        };
      else if (config.url.includes("/activitylist-service/"))
        data = [activity()];
      else if (config.url.includes("/download-service/"))
        throw Object.assign(new Error("password=PRIVATE token=PRIVATE"), {
          response: { status: 403 },
        });
      return { data, status: 200, statusText: "OK", headers: {}, config };
    },
  });
  try {
    assert.equal(
      await adapter.login("synthetic-user", "synthetic-password"),
      "mfa_required",
    );
    assert.equal(await adapter.verify("123456"), "connected");
    assert.equal((await adapter.list(0)).length, 1);
    assert.ok(
      requests.every(
        (r) => r.timeout === 15_000 && r.maxContentLength === 30_000_000,
      ),
    );
    assert.equal(requests.at(-1).headers.Authorization, "Bearer test-access");
    assert.throws(
      () =>
        requests
          .at(-1)
          .beforeRedirect({ protocol: "https:", hostname: "outside.example" }),
      /Unexpected/,
    );
    await assert.rejects(
      adapter.download("123456789"),
      (e) => /rejected/.test(e.message) && !e.message.includes("PRIVATE"),
    );
  } finally {
    adapter.close();
  }
});
test("credentials are local same-origin REST only, never MCP tool input, with sanitized failures", async (t) => {
  const { service, store } = setup(t, {
    login: async () => {
      throw new Error("PRIVATE");
    },
  });
  const server = createHttpServer(store, { garminService: service });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function auth(headers) {
    return fetch(base + "/api/garmin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ username: "a", password: "PRIVATE" }),
    });
  }
  assert.equal((await auth({})).status, 403);
  assert.equal((await auth({ Origin: "http://localhost:1234" })).status, 403);
  assert.equal(
    (await auth({ Origin: base, "X-Forwarded-For": "127.0.0.1" })).status,
    403,
  );
  const response = await auth({ Origin: base });
  assert.equal(response.status, 400);
  assert.ok(!(await response.text()).includes("PRIVATE"));
  const malformed = await fetch(base + "/api/garmin/login", {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: '{"password":"PRIVATE", BROKEN',
  });
  assert.equal(malformed.status, 400);
  assert.ok(!(await malformed.text()).includes("PRIVATE"));
  assert.equal(toolSchemas.garmin_login, undefined);
  assert.throws(
    () =>
      toolSchemas.list_garmin_activities.parse({
        username: "a",
        password: "PRIVATE",
      }),
    /Unrecognized/,
  );
});

test("Garmin shared MCP workflow uses local connection and keeps downloaded bytes out of results", async (t) => {
  const { service, store } = setup(t, { login: async () => "connected" });
  const server = createHttpServer(store, {
    garminService: service,
    weatherService: {
      start: () => ({ status: "unavailable" }),
      idle: async () => {},
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const auth = await fetch(base + "/api/garmin/login", {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ username: "a", password: "synthetic-secret" }),
  });
  assert.equal(auth.status, 200);
  const client = new Client({ name: "synthetic-garmin-test", version: "1" });
  t.after(async () => {
    await client.close();
    await new Promise((resolve) => server.close(resolve));
  });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(base + "/mcp")),
  );
  const listed = await client.listTools();
  assert.ok(listed.tools.some((x) => x.name === "preview_garmin_activity"));
  assert.ok(!listed.tools.some((x) => /garmin.*(login|verify)/.test(x.name)));
  const call = (name, args = {}) => client.callTool({ name, arguments: args });
  assert.equal(
    (await call("get_garmin_status")).structuredContent.status,
    "connected",
  );
  await call("list_garmin_activities");
  const preview = await call("preview_garmin_activity", {
    activity_id: "123456789",
    timezone: "UTC",
  });
  assert.ok(preview._meta.importRoute.length > 0);
  assert.equal(preview.structuredContent.route, undefined);
  assert.ok(!JSON.stringify(preview).includes("data_base64"));
  const result = await call("commit_garmin_activity", {
    preview_id: preview.structuredContent.preview_id,
    expected_sha256: preview.structuredContent.sha256,
    target_session_id: null,
    board_id: null,
  });
  assert.equal(result.structuredContent.status, "imported");
  assert.equal(result._meta.sessionId, result.structuredContent.session_id);
  assert.equal(result._meta.appData.sessions.length, 1);
});
