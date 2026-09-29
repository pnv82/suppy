import test from "node:test";
import assert from "node:assert/strict";
import { launchPoint, launchSuggestions } from "../server/launch-names.mjs";
import { fixtureState, testStore } from "./fixtures.mjs";
import { executeTool } from "../server/tools.mjs";
import { createStore } from "../server/store.mjs";
import { openDatabase } from "../server/database.mjs";
import { uploadFixture } from "./fit-fixtures.mjs";

test("import preview resolves launch names without persistence; reviewed import retains evidence", async (t) => {
  const database = openDatabase(":memory:");
  t.after(() => database.close());
  database.createTenant("import");
  let calls = 0;
  const store = createStore({
    database,
    tenantId: "import",
    launchLookup: async (start) => {
      calls++;
      assert.deepEqual(Object.keys(start).sort(), ["latitude", "longitude"]);
      return [
        {
          name: "Synthetic Beach",
          source: "openstreetmap",
          source_ref: "osm:node:1",
          distance_m: 12,
          status: "unconfirmed",
        },
      ];
    },
  });
  const args = uploadFixture();
  const preview = await executeTool(store, "preview_fit_import", args);
  const candidate = preview.structuredContent.launch_suggestions.candidates[0];
  assert.equal(candidate.name, "Synthetic Beach");
  assert.equal(candidate.status, "unconfirmed");
  assert.equal(store.dashboard().sessions.length, 0);
  assert.ok(preview._meta.importRoute.length);
  const commit = {
    ...args,
    expected_sha256: preview.structuredContent.sha256,
    target_session_id: null,
    board_id: null,
    launch_name: candidate.name,
    launch_source_ref: candidate.source_ref,
  };
  assert.throws(
    () => store.commitImport({ ...commit, launch_name: "Forged" }),
    /expired/,
  );
  const saved = store.commitImport(commit);
  assert.equal(store.get(saved.session_id).title, candidate.name);
  assert.equal(
    store.get(saved.session_id).launchNameProvenance.reference,
    candidate.source_ref,
  );
  const duplicate = await executeTool(store, "preview_fit_import", args);
  assert.equal(duplicate.structuredContent.status, "duplicate");
  assert.equal(duplicate.structuredContent.launch_suggestions, undefined);
  assert.equal(calls, 1);
  const missing = await executeTool(
    store,
    "preview_fit_import",
    uploadFixture({ gps: false }),
  );
  assert.equal(
    missing.structuredContent.launch_suggestions.lookup.status,
    "no_gps",
  );
  assert.equal(calls, 1);
});

test("unavailable import lookup keeps a usable preview and manual naming", async (t) => {
  const database = openDatabase(":memory:");
  t.after(() => database.close());
  database.createTenant("import");
  const store = createStore({
    database,
    tenantId: "import",
    launchLookup: async () => {
      throw new Error("offline");
    },
  });
  const args = uploadFixture();
  const preview = await executeTool(store, "preview_fit_import", args);
  assert.equal(
    preview.structuredContent.launch_suggestions.lookup.status,
    "unavailable",
  );
  const saved = store.commitImport({
    ...args,
    expected_sha256: preview.structuredContent.sha256,
    target_session_id: null,
    board_id: null,
    launch_name: "My launch",
  });
  assert.equal(store.get(saved.session_id).title, "My launch");
});
test("offline launch candidates use supported starts, never finishes or generic bays", () => {
  const s = fixtureState().sessions[0];
  const places = [
    {
      id: "MB-170",
      name: "Synthetic Cove",
      kind: "bay",
      latitude: 32.7,
      longitude: -117.2,
    },
    {
      id: "MB-160",
      name: "Mission Bay",
      kind: "bay",
      latitude: 32.7,
      longitude: -117.2,
    },
    {
      id: "MB-120",
      name: "Finish beach",
      kind: "beach",
      latitude: 32.713,
      longitude: -117.2,
    },
  ];
  assert.deepEqual(
    launchSuggestions(s, [], places).candidates.map((p) => p.name),
    ["Synthetic Cove"],
  );
  const known = {
    ...s,
    id: "known",
    title: "Confirmed start",
    titleSource: "athlete_reported",
  };
  assert.equal(
    launchSuggestions(s, [known], places).candidates[0].name,
    known.title,
  );
  assert.equal(launchPoint({ ...s, records: s.records.slice(200) }), null);
  assert.equal(
    launchPoint({
      ...s,
      records: s.records.map((p) => ({ ...p, gps_accuracy_m: 99 })),
    }),
    null,
  );
  assert.equal(
    launchSuggestions({ ...s, records: [] }, [], places).candidates.length,
    0,
  );
});
test("launch suggestions respect tenant identity and preserve selected naming provenance", async (t) => {
  const store = testStore(t),
    s = store.dashboard().sessions[0];
  const before = structuredClone(store.get(s.id));
  await executeTool(store, "suggest_launch_name", { session_id: s.id });
  assert.deepEqual(store.get(s.id), before);
  await assert.rejects(() =>
    executeTool(store, "suggest_launch_name", { session_id: "foreign" }),
  );
  executeTool(store, "update_session_details", {
    session_id: store.dashboard().sessions[1].id,
    name: "Confirmed Cove",
    board_id: null,
  });
  const reference = `session:${store.dashboard().sessions[1].id}`;
  executeTool(store, "update_session_details", {
    session_id: s.id,
    name: "Confirmed Cove",
    board_id: null,
    launch_source_ref: reference,
  });
  assert.equal(store.get(s.id).launchNameProvenance.reference, reference);
  assert.equal(store.get(s.id).location, before.location);
});
