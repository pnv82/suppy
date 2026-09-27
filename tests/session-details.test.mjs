import test from "node:test";
import assert from "node:assert/strict";
import { testStore } from "./fixtures.mjs";
import { executeTool } from "../server/tools.mjs";

test("session details save atomically, retain provenance and reach analysis context", (t) => {
  const store = testStore(t);
  const original = structuredClone(store.dashboard().sessions[0]);
  const board = store.upsertBoard({ name: "Test board" });
  const args = {
    session_id: original.id,
    name: " Confirmed launch ",
    board_id: board.id,
  };
  assert.throws(() =>
    executeTool(store, "update_session_details", {
      ...args,
      board_id: "missing",
    }),
  );
  assert.equal(store.get(original.id).title, original.title);
  assert.equal(store.get(original.id).revision, original.revision);
  assert.throws(() =>
    executeTool(store, "update_session_details", { ...args, name: " " }),
  );
  const result = executeTool(
    store,
    "update_session_details",
    args,
  ).structuredContent;
  assert.equal(result.title, "Confirmed launch");
  assert.equal(result.titleSource, "athlete_reported");
  assert.equal(result.location, original.location);
  assert.equal(result.id, original.id);
  assert.equal(result.board.id, board.id);
  assert.equal(result.revision, original.revision + 1);
  executeTool(store, "update_session_details", args);
  assert.equal(store.get(original.id).revision, result.revision);
  const analysis = executeTool(store, "prepare_analysis_context", {
    session_id: original.id,
    question: "Review",
  }).structuredContent;
  assert.equal(analysis.session.title, "Confirmed launch");
  assert.equal(analysis.session.board.id, board.id);
  executeTool(store, "update_session_details", { ...args, board_id: null });
  assert.equal(store.context(original.id).board, null);
});
