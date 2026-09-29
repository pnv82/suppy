import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  authenticationConfig,
  createAuth0Resolver,
  tenantForIdentity,
} from "../server/auth.mjs";
import { openDatabase } from "../server/database.mjs";
import { createHttpServer } from "../server/index.mjs";
import { createStore } from "../server/store.mjs";
import { fixtureState } from "./fixtures.mjs";
import { createRequestSession } from "../src/services/request-session.mjs";
import { createWorkspaceSession } from "../src/services/workspace-session.mjs";

const config = authenticationConfig({ SUP_AUTH_MODE: "auth0" });
const { privateKey, publicKey } = await generateKeyPair("RS256");
const keySet = createLocalJWKSet({
  keys: [{ ...(await exportJWK(publicKey)), kid: "fixture", alg: "RS256" }],
});
async function token(
  subject = "google-oauth2|alice",
  overrides = {},
  key = privateKey,
) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: config.issuer,
    aud: config.audience,
    sub: subject,
    iat: now,
    exp: now + 300,
    scope: "openid suppy:access",
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: "fixture" })
    .sign(key);
}
const headers = (value) => ({ Authorization: `Bearer ${value}` });
async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
const close = (server) => new Promise((resolve) => server.close(resolve));

test("hosted configuration fails closed and requires one canonical HTTPS resource and exact origin", () => {
  assert.throws(
    () => authenticationConfig({ NODE_ENV: "production" }),
    /requires/,
  );
  assert.throws(
    () =>
      authenticationConfig({ NODE_ENV: "production", SUP_AUTH_MODE: "auth0" }),
    /HTTPS/,
  );
  const env = {
    NODE_ENV: "production",
    SUP_AUTH_MODE: "auth0",
    SUP_PUBLIC_URL: "https://suppy.example",
    SUP_ALLOWED_ORIGIN: "https://suppy.example",
    SUP_DB_PATH: "/var/data/production.sqlite",
  };
  const hosted = authenticationConfig(env);
  assert.equal(hosted.audience, "https://suppy.example/mcp");
  assert.deepEqual(hosted.allowedOrigins, ["https://suppy.example"]);
  assert.throws(
    () => authenticationConfig({ ...env, SUP_AUTH0_AUDIENCE: config.audience }),
    /must equal/,
  );
  assert.throws(
    () =>
      authenticationConfig({
        ...env,
        SUP_ALLOWED_ORIGIN: "https://other.example",
      }),
    /matching/,
  );
  assert.throws(
    () => authenticationConfig({ ...env, SUP_DB_PATH: "" }),
    /SUP_DB_PATH/,
  );
  for (const url of [
    "https://suppy.example/path",
    "https://user:password@suppy.example",
    "https://suppy.example/?q=1",
  ])
    assert.throws(
      () => authenticationConfig({ ...env, SUP_PUBLIC_URL: url }),
      /origin/,
    );
});

test("JWT verification rejects bad signatures, issuer, audience, expiry, claims, algorithm and permission before provisioning", async () => {
  const db = openDatabase(":memory:");
  try {
    const resolve = createAuth0Resolver(config, db, { keySet });
    const request = (value) => ({
      headers: { authorization: `Bearer ${value}` },
    });
    const wrong = await generateKeyPair("RS256");
    const now = Math.floor(Date.now() / 1000);
    const invalid = [
      await token(undefined, {}, wrong.privateKey),
      await token(undefined, { iss: "https://other.example/" }),
      await token(undefined, { aud: "wrong" }),
      await token(undefined, { exp: now - 30 }),
      await token(undefined, { exp: undefined }),
      await token(""),
      await token(undefined, { iat: now + 60 }),
      await token(undefined, { nbf: now + 60 }),
      "not-a-jwt",
      await new SignJWT({ sub: "alice" })
        .setProtectedHeader({ alg: "HS256" })
        .sign(new Uint8Array(32)),
    ];
    for (const value of invalid)
      await assert.rejects(
        resolve(request(value)),
        (e) => e.status === 401 && e.code === "invalid_token",
      );
    await assert.rejects(
      resolve(
        request(
          await token(undefined, {
            scope: "openid",
            permissions: ["suppy:access"],
          }),
        ),
      ),
      (e) => e.status === 403,
    );
    await assert.rejects(resolve({ headers: {} }), (e) => e.status === 401);
    await assert.rejects(
      resolve({ headers: { authorization: "Basic abc" } }),
      (e) => e.status === 401,
    );
    const id = await resolve(request(await token()));
    assert.match(id, /^auth0_[a-f0-9]{64}$/);
    assert.equal(id, tenantForIdentity(config.issuer, "google-oauth2|alice"));
    assert.notEqual(
      id,
      tenantForIdentity("https://other.example/", "google-oauth2|alice"),
    );
    assert.deepEqual(db.forTenant(id).sessions(), []);
  } finally {
    db.close();
  }
});

test("REST and MCP share verified identity, isolate two users, preserve local history and persist after restart", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "suppy-auth-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "auth.sqlite");
  let db = openDatabase(path),
    server;
  const alice = await token(),
    bob = await token("google-oauth2|bob");
  const options = () => ({
    database: db,
    authConfig: config,
    authOptions: { keySet },
  });
  try {
    db.createTenant("local");
    db.importState("local", fixtureState());
    const local = createStore({ database: db, tenantId: "local" }).dashboard();
    server = createHttpServer(undefined, options());
    let url = await listen(server);
    const unauthenticated = await fetch(url + "/api/dashboard?tenant=local", {
      headers: { "X-Tenant-ID": "local" },
    });
    assert.equal(unauthenticated.status, 401);
    assert.match(
      unauthenticated.headers.get("www-authenticate"),
      /resource_metadata=.*oauth-protected-resource/,
    );
    const discovery = await fetch(
      url + "/.well-known/oauth-protected-resource/mcp",
    ).then((r) => r.json());
    assert.equal(discovery.resource, config.audience);
    assert.deepEqual(discovery.authorization_servers, [config.issuer]);
    assert.equal((await fetch(url + "/healthz")).status, 200);
    assert.equal(
      (
        await fetch(url + "/api/dashboard", {
          headers: { ...headers(alice), Origin: "https://evil.example" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(url + "/api/dashboard", {
          headers: headers(await token(undefined, { scope: "openid" })),
        })
      ).status,
      403,
    );
    const auth = await fetch(url + "/auth/config").then((r) => r.json());
    assert.equal(auth.audience, config.audience);
    assert.equal(auth.clientSecret, undefined);
    const read = (value) =>
      fetch(url + "/api/dashboard?tenant=local", {
        headers: { ...headers(value), "X-Tenant-ID": "local" },
      }).then((r) => r.json());
    assert.deepEqual((await read(alice)).sessions, []);
    const board = await fetch(url + "/api/tools", {
      method: "POST",
      headers: { ...headers(alice), "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "upsert_board",
        arguments: { name: "Alice private board" },
      }),
    }).then((r) => r.json());
    assert.equal(board.isError, undefined);
    assert.deepEqual((await read(bob)).boards, []);
    const client = new Client({ name: "auth-test", version: "1" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(url + "/mcp"), {
        requestInit: { headers: headers(alice) },
      }),
    );
    try {
      assert.ok((await client.listTools()).tools.length);
      // SDK v1's client schema strips unknown top-level fields; inspect wire discovery.
      const wire = await fetch(url + "/mcp", {
        method: "POST",
        headers: {
          ...headers(alice),
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {},
        }),
      }).then((r) => r.json());
      const tools = wire.result.tools;
      for (const tool of tools) {
        assert.deepEqual(tool.securitySchemes, [
          { type: "oauth2", scopes: ["suppy:access"] },
        ]);
        assert.deepEqual(tool._meta.securitySchemes, tool.securitySchemes);
      }
      const result = await client.callTool({
        name: "get_dashboard",
        arguments: {},
      });
      assert.equal(result._meta.appData.boards[0].name, "Alice private board");
    } finally {
      await client.close();
    }
    const unlinked = new Client({ name: "unlinked-test", version: "1" });
    await unlinked.connect(
      new StreamableHTTPClientTransport(new URL(url + "/mcp")),
    );
    try {
      assert.ok((await unlinked.listTools()).tools.length);
      const challenge = await unlinked.callTool({
        name: "get_dashboard",
        arguments: {},
      });
      assert.equal(challenge.isError, true);
      assert.match(
        challenge._meta["mcp/www_authenticate"][0],
        /scope="suppy:access"/,
      );
      assert.equal(challenge._meta.appData, undefined);
    } finally {
      await unlinked.close();
    }
    assert.deepEqual(
      createStore({ database: db, tenantId: "local" }).dashboard(),
      local,
    );
    await close(server);
    server = null;
    db.close();
    db = openDatabase(path);
    server = createHttpServer(undefined, options());
    url = await listen(server);
    assert.equal((await read(alice)).boards[0].name, "Alice private board");
    assert.deepEqual((await read(bob)).boards, []);
  } finally {
    if (server) await close(server);
    db.close();
  }
});

test("account changes abort requests and discard late tokens and responses", async () => {
  let finishToken,
    called = 0;
  const session = createRequestSession(async () => {
    called++;
    return Response.json({ private: "alice" });
  });
  session.reset(
    () =>
      new Promise((resolve) => {
        finishToken = resolve;
      }),
  );
  const pending = session.request("/api/dashboard");
  session.reset(async () => "bob-token");
  finishToken("alice-token");
  await assert.rejects(pending, (e) => e.name === "AbortError");
  assert.equal(called, 0);
  let finishResponse, signal;
  const slow = createRequestSession(async (url, options) => {
    signal = options.signal;
    assert.equal(options.headers.get("Authorization"), "Bearer alice-token");
    return new Promise((resolve) => {
      finishResponse = resolve;
    });
  });
  slow.reset(async () => "alice-token");
  const inflight = slow.request("/api/dashboard");
  await new Promise((resolve) => setImmediate(resolve));
  slow.reset();
  assert.equal(signal.aborted, true);
  finishResponse(Response.json({ private: "alice" }));
  await assert.rejects(inflight, (e) => e.name === "AbortError");
});

test("REST authentication failure clears the client account before surfacing an error", async () => {
  const session = createRequestSession(async () =>
    Response.json({ error: "Expired" }, { status: 401 }),
  );
  let cleared = 0;
  session.reset(
    async () => "expired",
    () => {
      cleared++;
      session.reset();
    },
  );
  await assert.rejects(session.request("/api/dashboard"), /Expired/);
  assert.equal(cleared, 1);
});

test("embedded account notifications and challenges invalidate old tool results", async () => {
  const workspace = createWorkspaceSession();
  workspace.accept({ tenantId: "alice", private: "Alice notes" });
  let finish, signal;
  const old = workspace.run((s) => {
    signal = s;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  workspace.accept({ tenantId: "bob", private: "Bob notes" });
  assert.equal(signal.aborted, true);
  finish({ private: "Alice notes" });
  await assert.rejects(old, (e) => e.name === "AbortError");
  assert.equal(workspace.data.private, "Bob notes");
  const another = workspace.run(
    (s) =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  workspace.accept(null);
  assert.equal(workspace.data, null);
  finish({ private: "Bob notes" });
  await assert.rejects(another, (e) => e.name === "AbortError");
});
