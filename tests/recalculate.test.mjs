import test from "node:test";
import assert from "node:assert/strict";
import { testStore } from "./fixtures.mjs";
import { executeTool } from "../server/tools.mjs";
test("recalculation uses stored telemetry without changing source facts or annotations", (t) => {
  const store = testStore(t),
    id = store.dashboard().sessions[0].id;
  const before = structuredClone(store.get(id));
  const previous = store.context(id).deterministic;
  const next = executeTool(store, "recalculate_session", {
    session_id: id,
  }).structuredContent;
  assert.deepEqual(next.deterministic.summary, previous.summary);
  assert.deepEqual(store.get(id), before);
  assert.throws(() =>
    executeTool(store, "recalculate_session", {
      session_id: "other-tenant-session",
    }),
  );
  assert.throws(() =>
    executeTool(store, "recalculate_session", {
      session_id: id,
      tenant_id: "other",
    }),
  );
});
