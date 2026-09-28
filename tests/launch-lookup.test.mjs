import test from "node:test";
import assert from "node:assert/strict";
import { mappedLaunchCandidates } from "../server/launch-map-candidates.mjs";
import { openDatabase } from "../server/database.mjs";
import { createStore } from "../server/store.mjs";
import { fixtureState } from "./fixtures.mjs";
import { executeTool } from "../server/tools.mjs";
import { createHttpServer } from "../server/index.mjs";
import {
  createLaunchLookup,
  launchQuery,
  LAUNCH_PROVIDER,
} from "../server/launch-lookup.mjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const start = { latitude: 32.7, longitude: -117.2 };
const stamp = "2026-09-28T12:00:00Z";
const node = (id, name, tags = {}, lat = 32.7, lon = -117.2) => ({
  type: "node",
  id,
  lat,
  lon,
  tags: { name, ...tags },
});

test("map names prefer shoreline evidence, reject generic bays and unrelated/distant places", () => {
  const result = mappedLaunchCandidates(
    {
      elements: [
        node(1, "Mission Bay", { natural: "bay" }),
        node(2, "Nearby cafe", { amenity: "cafe" }),
        node(3, "Faraway Beach", { natural: "beach" }, 33),
        node(4, "Inland Park", { leisure: "park" }, 32.704),
        node(5, "Waterfront Park", { leisure: "park" }),
        node(6, "Small Cove", { natural: "bay" }, 32.7001),
        node(7, "Specific launch", { waterway: "slipway" }),
        node(8, "Bad GPS Beach", { natural: "beach" }, null),
        node(9, { text: "Not a name" }, { natural: "beach" }),
      ],
    },
    start,
    stamp,
  );
  assert.deepEqual(
    result.map((c) => c.name),
    ["Specific launch", "Small Cove", "Waterfront Park"],
  );
  assert.equal(result[0].source_ref, "osm:node:7");
  assert.equal(result[0].retrieved_at_utc, stamp);
  assert.equal(result[0].status, "unconfirmed");
});

test("distance uses nearby mapped outlines, not remote polygon centres or joined relation gaps", () => {
  const result = mappedLaunchCandidates(
    {
      elements: [
        {
          type: "way",
          id: 20,
          center: { lat: 33, lon: -117.2 },
          tags: { name: "Long Beach", natural: "beach" },
          geometry: [
            { lat: 32.69, lon: -117.2 },
            { lat: 32.71, lon: -117.2 },
          ],
        },
        {
          type: "relation",
          id: 21,
          tags: { name: "Two distant beaches", natural: "beach" },
          members: [
            {
              type: "way",
              geometry: [
                { lat: 32.68, lon: -117.2 },
                { lat: 32.69, lon: -117.2 },
              ],
            },
            {
              type: "way",
              geometry: [
                { lat: 32.71, lon: -117.2 },
                { lat: 32.72, lon: -117.2 },
              ],
            },
          ],
        },
      ],
    },
    start,
    stamp,
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "Long Beach");
  assert.equal(result[0].distance_m, 0);
  assert.throws(() =>
    mappedLaunchCandidates(
      { elements: [], remark: "runtime error" },
      start,
      stamp,
    ),
  );
  assert.throws(() =>
    mappedLaunchCandidates({ elements: Array(500).fill({}) }, start, stamp),
  );
});

test("lookup deduplicates requests across request stores, preserves provenance, and isolates tenants", async (t) => {
  const db = openDatabase(":memory:");
  t.after(() => db.close());
  for (const tenant of ["alice", "bob"]) {
    db.createTenant(tenant);
    db.importState(tenant, fixtureState());
  }
  let calls = 0;
  const launchLookup = async () => {
    calls++;
    return mappedLaunchCandidates(
      { elements: [node(10, "Mapped launch", { waterway: "slipway" })] },
      start,
      stamp,
    );
  };
  const store = createStore({ database: db, tenantId: "alice", launchLookup });
  const id = store.dashboard().sessions[0].id,
    before = structuredClone(store.get(id));
  const secondRequest = createStore({
    database: db,
    tenantId: "alice",
    launchLookup,
  });
  const [a, b] = await Promise.all([
    store.suggestLaunchName({ session_id: id }),
    secondRequest.suggestLaunchName({ session_id: id }),
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(a, b);
  assert.deepEqual(store.get(id), before);
  assert.equal(a.lookup.status, "ready");
  const save = {
    session_id: id,
    name: "Mapped launch",
    board_id: null,
    launch_source_ref: "osm:node:10",
  };
  const bob = createStore({ database: db, tenantId: "bob", launchLookup });
  assert.throws(() => bob.updateDetails(save), /no longer available/);
  assert.throws(
    () => store.updateDetails({ ...save, name: "Invented name" }),
    /no longer available/,
  );
  secondRequest.updateDetails(save);
  assert.equal(
    store.get(id).launchNameProvenance.evidence.source_url,
    "https://www.openstreetmap.org/node/10",
  );
  assert.equal(
    store.get(id).launchNameProvenance.evidence.retrieved_at_utc,
    stamp,
  );
  assert.equal(store.get(id).location, before.location);
  await bob.suggestLaunchName({ session_id: id });
  assert.equal(calls, 2);
  const missing = store.dashboard().sessions.find((s) => !s.records.length);
  assert.equal(
    (await store.suggestLaunchName({ session_id: missing.id })).lookup.status,
    "no_gps",
  );
  await assert.rejects(() =>
    store.suggestLaunchName({ session_id: "foreign" }),
  );
  assert.equal(calls, 2);
  const separateDb = openDatabase(":memory:");
  t.after(() => separateDb.close());
  separateDb.createTenant("alice");
  separateDb.importState("alice", fixtureState());
  const separateStore = createStore({
    database: separateDb,
    tenantId: "alice",
    launchLookup,
  });
  assert.throws(() => separateStore.updateDetails(save), /no longer available/);
  await separateStore.suggestLaunchName({ session_id: id });
  assert.equal(calls, 3);
});

test("provider outages retain local names, cache retry cooldown, and do not rename sessions", async (t) => {
  const db = openDatabase(":memory:");
  t.after(() => db.close());
  db.createTenant("alice");
  db.importState("alice", fixtureState());
  let calls = 0;
  const store = createStore({
    database: db,
    tenantId: "alice",
    launchLookup: async () => {
      calls++;
      throw new Error("down");
    },
  });
  const sessions = store.dashboard().sessions;
  store.updateDetails({
    session_id: sessions[1].id,
    name: "Confirmed Cove",
    board_id: null,
  });
  const before = structuredClone(store.get(sessions[0].id));
  const result = await executeTool(store, "suggest_launch_name", {
    session_id: sessions[0].id,
  });
  assert.equal(result.structuredContent.lookup.status, "unavailable");
  assert.equal(result.structuredContent.candidates[0].name, "Confirmed Cove");
  await store.suggestLaunchName({ session_id: sessions[0].id });
  assert.equal(calls, 1);
  assert.deepEqual(store.get(sessions[0].id), before);
});

test("REST waits for lookup and a later request can save the returned OSM reference", async (t) => {
  const db = openDatabase(":memory:");
  t.after(() => db.close());
  db.createTenant("alice");
  db.importState("alice", fixtureState());
  const id = fixtureState().sessions[0].id;
  const server = createHttpServer(null, {
    database: db,
    tenantId: "alice",
    launchLookup: async () =>
      mappedLaunchCandidates(
        { elements: [node(10, "Mapped launch", { waterway: "slipway" })] },
        start,
        stamp,
      ),
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => server.close(r)));
  const call = async (name, args) => {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/tools`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, arguments: args }),
      },
    );
    assert.equal(response.status, 200);
    return response.json();
  };
  const result = await call("suggest_launch_name", { session_id: id });
  assert.equal(result.structuredContent.candidates[0].name, "Mapped launch");
  const client = new Client({ name: "launch-test", version: "1" });
  await client.connect(
    new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${server.address().port}/mcp`),
    ),
  );
  try {
    const definition = (await client.listTools()).tools.find(
      (tool) => tool.name === "suggest_launch_name",
    );
    assert.equal(definition.annotations.openWorldHint, true);
    assert.equal(definition.annotations.readOnlyHint, true);
    const mcp = await client.callTool({
      name: "suggest_launch_name",
      arguments: { session_id: id },
    });
    assert.deepEqual(mcp.structuredContent, result.structuredContent);
    const invalid = await client.callTool({
      name: "suggest_launch_name",
      arguments: { session_id: "foreign" },
    });
    assert.equal(invalid.isError, true);
  } finally {
    await client.close();
  }
  await call("update_session_details", {
    session_id: id,
    name: "Mapped launch",
    board_id: null,
    launch_source_ref: "osm:node:10",
  });
  assert.equal(
    createStore({ database: db, tenantId: "alice" }).get(id).title,
    "Mapped launch",
  );
});

test("Overpass adapter sends only the bounded start query to the approved endpoint", async () => {
  let calls = 0;
  const lookup = createLaunchLookup({
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url.origin + url.pathname, LAUNCH_PROVIDER);
      assert.deepEqual([...url.searchParams.keys()], ["data"]);
      assert.equal(url.searchParams.get("data"), launchQuery(start));
      assert.match(launchQuery(start), /around:750,32.7,-117.2/);
      assert.equal(options.redirect, "error");
      assert.match(options.headers["User-Agent"], /Suppy/);
      return Response.json({
        elements: [node(10, "Mapped launch", { waterway: "slipway" })],
      });
    },
  });
  const result = await lookup(start);
  assert.equal(result[0].provider_url, LAUNCH_PROVIDER);
  assert.equal(result[0].name, "Mapped launch");
  await assert.rejects(() => lookup(start), /busy/);
  assert.equal(calls, 1);
  assert.throws(() => launchQuery({ latitude: "32.7", longitude: -117.2 }));
  assert.throws(() => launchQuery({ latitude: 91, longitude: 0 }));
});

test("Overpass adapter bounds failures, response size and elapsed time without retries", async () => {
  for (const response of [
    new Response("busy", { status: 429 }),
    new Response("bad", { status: 504 }),
    new Response("not JSON"),
    Response.json({ elements: [], remark: "runtime error" }),
    new Response("x".repeat(2_000_001)),
  ]) {
    let calls = 0;
    const lookup = createLaunchLookup({
      fetchImpl: async () => {
        calls++;
        return response;
      },
    });
    await assert.rejects(() => lookup(start));
    assert.equal(calls, 1);
  }
  const lookup = createLaunchLookup({
    timeoutMs: 5,
    fetchImpl: async (url, { signal }) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      signal.throwIfAborted();
    },
  });
  await assert.rejects(() => lookup(start), { name: "TimeoutError" });
});
