import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  normalizeObservations,
  createIemProvider,
} from "../server/weather/iem.mjs";
import { createWeatherService } from "../server/weather/service.mjs";
import {
  weatherInput,
  summarizeWeather,
  observationAt,
} from "../src/domain/weather.mjs";
import { openDatabase } from "../server/database.mjs";
import { createStore } from "../server/store.mjs";
import { createHttpServer } from "../server/index.mjs";
import { dispatchTool } from "../server/operations.mjs";
import { executeTool } from "../server/tools.mjs";
import { fixtureState, testStore } from "./fixtures.mjs";
import { uploadFixture } from "./fit-fixtures.mjs";

const id = "24495535896",
  start = "2026-09-25T14:00:00Z",
  end = "2026-09-25T15:00:00Z";
const station = {
  id: "SAN",
  name: "Synthetic station",
  network: "CA_ASOS",
  latitude: 32.7339,
  longitude: -117.1845,
  distance_m: 3900,
};
const header = "station,valid,lon,lat,tmpf,drct,sknt,gust,relh,metar\n";
const csv =
  header +
  "SAN,2026-09-25 14:00,-117.1845,32.7339,68,350,10,M,70,KSAN 35010KT\nSAN,2026-09-25 15:00,-117.1845,32.7339,77,10,10,15,60,KSAN 01010G15KT\n";
const observations = normalizeObservations(
  csv,
  station,
  Date.parse(start),
  Date.parse(end),
);
const source = {
  provider: "Synthetic IEM fixture",
  retrieved_at_utc: end,
  response_sha256: "synthetic",
  documentation_url:
    "https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?help",
};
function result(input) {
  return {
    status: "ready",
    data: {
      station,
      observations,
      summary: summarizeWeather(observations, input.start_utc, input.end_utc),
      source,
      limitations: ["Synthetic airport context, not on-water measurements."],
    },
    provenance: { source, raw_response: csv },
  };
}

test("weather normalization retains UTC, SI, raw source rows and true missing/calm/variable values", () => {
  assert.equal(observations[0].temperature_c, 20);
  assert.equal(observations[0].wind_speed_mps, (10 * 1852) / 3600);
  assert.equal(observations[0].gust_mps, null);
  assert.equal(observations[0].source_row, 2);
  const raw =
    header +
    [
      'SAN,2026-09-25 14:00,-117.1845,32.7339,M,0,0,M,M,"KSAN 00000KT, calm"',
      "SAN,2026-09-25 14:30,-117.1845,32.7339,70,0,5,M,80,KSAN VRB05KT",
      "SAN,2026-09-25 15:00,-117.1845,32.7339,M,M,M,M,M,KSAN missing",
      "SAN,2026-09-25 14:40,10,20,70,100,10,20,60,wrong location",
    ].join("\n");
  const values = normalizeObservations(
    raw,
    station,
    Date.parse(start),
    Date.parse(end),
  );
  assert.equal(values.length, 2);
  assert.equal(values[0].wind_speed_mps, 0);
  assert.equal(values[0].wind_from_deg, null);
  assert.equal(values[0].temperature_c, null);
  assert.match(values[0].raw_metar, /, calm/);
  assert.equal(values[1].wind_from_deg, null);
  assert.throws(
    () => normalizeObservations("<html>Oops</html>", station, 0, Infinity),
    /format/,
  );
  assert.throws(
    () => normalizeObservations('"unfinished', station, 0, Infinity),
    /malformed/,
  );
});

test("time matching uses UTC, earlier ties, bounded age, circular direction and per-channel coverage", () => {
  const summary = summarizeWeather(observations, start, end);
  assert.ok(
    summary.wind_from_deg.value < 0.001 ||
      summary.wind_from_deg.value > 359.999,
  );
  assert.equal(summary.temperature_c.value, 22.5);
  assert.equal(summary.gust_mps.coverage_pct, 50);
  assert.equal(summary.wind_speed_mps.covered_s, 3600);
  assert.equal(
    observationAt({ observations }, "2026-09-25T14:30:00Z").wind_from_deg,
    350,
  );
  assert.equal(observationAt({ observations }, "2026-09-25T16:00:01Z"), null);
  const sparse = summarizeWeather(
    [observations[0]],
    start,
    "2026-09-25T17:00:00Z",
  );
  assert.equal(sparse.wind_speed_mps.covered_s, 3600);
  assert.equal(summarizeWeather([], start, end).wind_speed_mps.value, null);
  const opposing = summarizeWeather(
    observations.map((o, i) => ({ ...o, wind_from_deg: i * 180 })),
    start,
    end,
  );
  assert.equal(opposing.wind_from_deg.value, null);
  assert.throws(() => weatherInput(fixtureState().sessions[3]), /GPS/);
});

test("IEM adapter picks station coverage before proximity, limits query and caches public catalog", async () => {
  const catalog = {
    features: [
      {
        id: "NRS",
        properties: { network: "CA_ASOS", sname: "Near" },
        geometry: { coordinates: [-117.2, 32.7] },
      },
      {
        id: "SAN",
        properties: { network: "CA_ASOS", sname: "San Diego" },
        geometry: { coordinates: [-117.1845, 32.7339] },
      },
      {
        id: "FAR",
        properties: { network: "CA_ASOS" },
        geometry: { coordinates: [0, 0] },
      },
    ],
  };
  const urls = [];
  const provider = createIemProvider({
    now: () => Date.parse("2026-09-27T20:00:00Z"),
    fetchImpl: async (url) => {
      urls.push(url);
      return new Response(
        url.includes("geojson") ? JSON.stringify(catalog) : csv,
      );
    },
  });
  const input = weatherInput(fixtureState().sessions[0]);
  const actual = await provider.retrieve(input);
  assert.equal(actual.status, "ready");
  assert.equal(actual.data.station.id, "SAN");
  assert.equal(actual.data.candidates.length, 2);
  assert.equal(actual.provenance.raw_response, csv);
  assert.match(actual.data.source.response_sha256, /^[a-f0-9]{64}$/);
  const query = new URL(urls[1]);
  assert.equal(query.searchParams.get("tz"), "UTC");
  assert.equal(query.searchParams.get("report_type"), "3,4");
  assert.equal(query.searchParams.has("latitude"), false);
  assert.equal(query.searchParams.get("sts"), "2026-09-25T13:00:00.000Z");
  await provider.retrieve(input);
  assert.equal(urls.filter((u) => u.includes("geojson")).length, 1);
});

test("provider failures and unavailable stations stay explicit", async () => {
  const input = weatherInput(fixtureState().sessions[0]);
  const provider = createIemProvider({
    fetchImpl: async () => new Response("busy", { status: 503 }),
  });
  await assert.rejects(provider.retrieve(input), /503/);
  const empty = createIemProvider({
    fetchImpl: async () => new Response('{"features":[]}'),
  });
  assert.equal((await empty.retrieve(input)).status, "unavailable");
  assert.equal(
    (await empty.retrieve({ ...input, end_utc: "2099-01-01T00:00:00Z" }))
      .status,
    "unavailable",
  );
});

test("post-import weather never blocks FIT, deduplicates work and preserves edits on provider failure", async (t) => {
  const store = testStore(t);
  let reject,
    calls = 0;
  const service = createWeatherService({
    provider: {
      retrieve: () => {
        calls++;
        return new Promise((_, r) => {
          reject = r;
        });
      },
    },
  });
  const args = uploadFixture();
  const saved = dispatchTool(
    store,
    "commit_fit_import",
    {
      ...args,
      expected_sha256: store.previewImport(args).sha256,
      target_session_id: null,
      board_id: null,
    },
    service,
  );
  assert.equal(saved.structuredContent.status, "imported");
  assert.equal(saved.structuredContent.weather_status, "fetching");
  const sessionId = saved.structuredContent.session_id;
  assert.equal(store.get(sessionId).records.length, 261);
  service.start(store, sessionId, { force: true });
  await Promise.resolve();
  assert.equal(calls, 1);
  store.updateContext({
    session_id: sessionId,
    note: "Keep this edit during retrieval.",
  });
  reject(new Error("offline"));
  await service.idle();
  assert.equal(store.get(sessionId).weather.status, "error");
  assert.equal(
    store.get(sessionId).additionalContext,
    "Keep this edit during retrieval.",
  );
  assert.equal(store.get(sessionId).records.length, 261);
  const unavailable = service.start(store, "24162211256");
  assert.match(unavailable.message, /GPS/);
  assert.equal(calls, 1);
});

test("weather persists SI and immutable raw provenance, preserves historical summary and isolates tenants", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "sup-weather-")), "test.sqlite");
  let db = openDatabase(path);
  db.createTenant("alice");
  db.createTenant("bob");
  db.importState("alice", fixtureState());
  db.importState("bob", fixtureState());
  let store = createStore({ database: db, tenantId: "alice" });
  const bob = createStore({ database: db, tenantId: "bob" });
  let time = Date.parse("2026-09-27T20:00:00Z"),
    fail = false;
  const service = createWeatherService({
    now: () => time,
    provider: {
      retrieve: async (input) => {
        if (fail) throw new Error("offline");
        return result(input);
      },
    },
  });
  service.start(store, id);
  await service.idle();
  assert.equal(store.get(id).wind, 0); // original historical summary untouched
  assert.ok(store.context(id).wind > 11);
  const analysis = executeTool(store, "prepare_analysis_context", {
    session_id: id,
    question: "What were conditions in this interval?",
    start_s: 300,
    end_s: 600,
  });
  assert.equal(
    analysis.structuredContent.weather_evidence.summary.wind_speed_mps
      .covered_s,
    300,
  );
  assert.equal(
    analysis.structuredContent.weather_evidence.summary.interval.start_utc,
    "2026-09-25T14:05:00.000Z",
  );
  assert.equal(store.context(id).legacyWeather.wind, 0);
  assert.equal(bob.get(id).weather, undefined);
  assert.throws(() => service.start(bob, "unknown"), /not found/);
  assert.equal(service.start(store, id, { force: true }).status, "ready"); // cooldown
  time += 31000;
  fail = true;
  service.start(store, id, { force: true });
  await service.idle();
  assert.equal(store.get(id).weather.status, "error");
  assert.equal(store.get(id).weather.data.observations.length, 2);
  assert.ok(store.context(id).wind > 11);
  db.close();
  db = openDatabase(path);
  store = createStore({ database: db, tenantId: "alice" });
  assert.equal(store.get(id).weather.data.observations[0].temperature_c, 20);
  assert.equal(
    JSON.stringify(store.dashboard()).includes("raw_response"),
    false,
  );
  store.saveWeather({
    session_id: id,
    weather: { ...store.get(id).weather, status: "fetching" },
  });
  assert.equal(createWeatherService().status(store, id).status, "error");
  db.close();
  const raw = new DatabaseSync(path);
  const rows = raw.prepare("SELECT * FROM weather_sources").all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tenant_id, "alice");
  assert.equal(JSON.parse(rows[0].provenance_json).raw_response, csv);
  assert.equal(raw.prepare("PRAGMA user_version").get().user_version, 6);
  raw.close();
});

test("REST and MCP expose identical weather evidence and strict tenant-scoped tools", async (t) => {
  const store = testStore(t),
    service = createWeatherService({
      provider: { retrieve: async (input) => result(input) },
    });
  const server = createHttpServer(store, { weatherService: service });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = new Client({ name: "weather-test", version: "1" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(base + "/mcp")),
    );
    const listed = (await client.listTools()).tools;
    assert.equal(
      listed.find((t) => t.name === "fetch_session_weather").annotations
        .openWorldHint,
      true,
    );
    const res = await fetch(base + "/api/tools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "fetch_session_weather",
        arguments: { session_id: id },
      }),
    });
    assert.equal(res.status, 200);
    await service.idle();
    const read = await client.callTool({
      name: "get_session_weather",
      arguments: { session_id: id },
    });
    assert.equal(read.structuredContent.weather.status, "ready");
    assert.equal(read._meta.sessionId, undefined); // background polling must not navigate
    assert.equal(
      (
        await client.callTool({
          name: "get_session_weather",
          arguments: { session_id: id, tenant_id: "bob" },
        })
      ).isError,
      true,
    );
    assert.equal(
      (
        await client.callTool({
          name: "fetch_session_weather",
          arguments: { session_id: "unknown" },
        })
      ).isError,
      true,
    );
  } finally {
    await client.close();
    await service.idle();
    await new Promise((r) => server.close(r));
  }
});

test("athlete wind survives station refresh and reopen, is separate evidence, and can be removed", async () => {
  const path = join(
    mkdtempSync(join(tmpdir(), "sup-wind-report-")),
    "test.sqlite",
  );
  let db = openDatabase(path);
  db.createTenant("alice");
  db.createTenant("bob");
  db.importState("alice", fixtureState());
  db.importState("bob", fixtureState());
  let store = createStore({ database: db, tenantId: "alice" });
  const bob = createStore({ database: db, tenantId: "bob" });
  const service = createWeatherService({
    provider: { retrieve: async (input) => result(input) },
  });
  service.start(store, id);
  const args = {
    session_id: id,
    wind: { wind_speed_mps: 4, wind_from_deg: 90, note: "Sheltered water" },
  };
  executeTool(store, "set_session_wind", args);
  await service.idle();
  assert.equal(store.get(id).wind, 0);
  assert.equal(store.context(id).windSource, "athlete_reported");
  assert.equal(store.context(id).wind, 4 / 0.44704);
  assert.equal(store.context(id).windFrom, 90);
  assert.equal(
    store.context(id).weather.data.observations[0].wind_from_deg,
    350,
  );
  assert.equal(bob.get(id).windAdjustment, undefined);
  const prepared = executeTool(store, "prepare_analysis_context", {
    session_id: id,
    question: "Explain conditions",
  }).structuredContent;
  assert.equal(prepared.athlete_wind.source, "athlete_reported");
  assert.equal(
    prepared.weather_evidence.summary.wind_speed_mps.value,
    observations[0].wind_speed_mps,
  );
  assert.throws(() =>
    executeTool(store, "set_session_wind", { ...args, tenant_id: "bob" }),
  );
  assert.throws(() =>
    executeTool(store, "set_session_wind", {
      ...args,
      wind: { ...args.wind, wind_speed_mps: -1 },
    }),
  );
  assert.throws(() =>
    executeTool(store, "set_session_wind", {
      ...args,
      wind: { ...args.wind, wind_from_deg: 360 },
    }),
  );
  assert.throws(() =>
    executeTool(store, "set_session_wind", {
      ...args,
      wind: { ...args.wind, wind_speed_mps: null, wind_from_deg: null },
    }),
  );
  db.close();
  db = openDatabase(path);
  store = createStore({ database: db, tenantId: "alice" });
  assert.equal(store.context(id).windFrom, 90);
  executeTool(store, "set_session_wind", { session_id: id, wind: null });
  assert.equal(store.context(id).windSource, undefined);
  assert.ok(store.context(id).wind > 11);
  assert.equal(store.get(id).windAdjustmentHistory.length, 2);
  const noGps = "24162211256";
  executeTool(store, "set_session_wind", {
    session_id: noGps,
    wind: { wind_speed_mps: 0, wind_from_deg: 90, note: "" },
  });
  assert.equal(store.context(noGps).wind, 0);
  assert.equal(store.context(noGps).windFrom, null);
  assert.equal(store.context(noGps).legacyWeather.wind, 0);
  db.close();
});
