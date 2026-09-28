import test from "node:test";
import assert from "node:assert/strict";
import { testStore } from "./fixtures.mjs";
import { executeTool } from "../server/tools.mjs";
test("external summary is validated, revision-bound, distinct from facts and invalidated by context changes", (t) => {
  const store = testStore(t),
    s = store.dashboard().sessions[0];
  const analysis = {
    schema_version: "1",
    highlight: "Synthetic highlight",
    summary: "Interpretation, not a measured fact.",
    model: "external-test",
    generated_at_utc: "2026-09-28T10:00:00Z",
    evidence_refs: ["session", "best:300"],
  };
  const save = (a) => executeTool(store, "set_session_summary", a);
  assert.throws(() =>
    save({
      session_id: s.id,
      expected_revision: s.revision,
      analysis: { ...analysis, evidence_refs: ["annotation:other"] },
    }),
  );
  save({ session_id: s.id, expected_revision: s.revision, analysis });
  assert.equal(store.context(s.id).llmSummary.source, "llm");
  assert.equal(store.context(s.id).llmSummary.stale, false);
  assert.equal(store.get(s.id).avgSpeed, s.avgSpeed);
  assert.throws(() =>
    save({ session_id: s.id, expected_revision: s.revision, analysis }),
  );
  store.updateContext({ session_id: s.id, note: "New conditions" });
  assert.equal(store.context(s.id).llmSummary.stale, true);
  assert.throws(() =>
    save({ session_id: "foreign", expected_revision: 0, analysis }),
  );
  save({
    session_id: s.id,
    expected_revision: store.get(s.id).revision,
    analysis: null,
  });
  assert.equal(store.context(s.id).llmSummary, null);
});
