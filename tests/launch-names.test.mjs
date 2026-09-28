import test from "node:test";
import assert from "node:assert/strict";
import { launchPoint, launchSuggestions } from "../server/launch-names.mjs";
import { fixtureState, testStore } from "./fixtures.mjs";
import { executeTool } from "../server/tools.mjs";
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
