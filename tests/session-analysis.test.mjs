import test from "node:test";
import assert from "node:assert/strict";
import {
  requestSessionSummary,
  sendAnalysisToHost,
} from "../src/services/session-analysis.mjs";
import { testStore } from "./fixtures.mjs";
import { executeTool } from "../server/tools.mjs";

test("summary request supplies fresh whole-session evidence before the host message", async (t) => {
  const store = testStore(t),
    id = store.dashboard().sessions[0].id;
  store.updateContext({ session_id: id, note: "New athlete context" });
  store.addAnnotation({
    session_id: id,
    kind: "note",
    start_s: 60,
    end_s: 90,
    timing: "approximate",
    note: "Observed chop",
  });
  store.addCustomInterval({ session_id: id, start_s: 100, end_s: 400 });
  const calls = [];
  let context, message;
  const host = {
    updateModelContext: async (value) => {
      calls.push("context");
      context = JSON.parse(value.content[0].text);
      return {};
    },
    sendMessage: async (value) => {
      calls.push("message");
      message = value.content[0].text;
      return {};
    },
  };
  const status = await requestSessionSummary(id, {
    callTool: async (name, args) => {
      calls.push(name);
      return executeTool(store, name, args);
    },
    askChatGPT: (result, prompt) => sendAnalysisToHost(host, result, prompt),
  });
  assert.equal(status, "sent");
  assert.deepEqual(calls, [
    "get_session_context",
    "prepare_analysis_context",
    "context",
    "message",
  ]);
  assert.deepEqual(context.interval, { start_s: 0, end_s: 1300 });
  assert.equal(context.session.additionalContext, "New athlete context");
  assert.equal(context.session.notes, "Synthetic test data");
  assert.equal(context.session.annotations[0].note, "Observed chop");
  assert.equal(context.session.customIntervals.length, 1);
  assert.ok(context.session.deterministic.summary);
  assert.ok(context.session.windows.length);
  assert.ok(context.telemetry.length <= 120);
  assert.ok(context.telemetry.every((r) => !("latitude_deg" in r)));
  assert.equal(context._meta, undefined);
  assert.match(message, /set_session_summary/);
  assert.ok(message.includes(`expected_revision ${store.get(id).revision}`));
  assert.equal(store.context(id).llmSummary, null);
});

test("summary request handles missing duration and avoids duplicate analysis of an existing summary", async () => {
  let sends = 0;
  const context = {
    id: "summary-only",
    revision: 2,
    elapsed: null,
    notes: "Source note",
    llmSummary: null,
  };
  const deps = {
    callTool: async (name) => {
      assert.equal(name, "get_session_context");
      return { structuredContent: context };
    },
    askChatGPT: async (result) => {
      sends++;
      assert.equal(result.structuredContent.evidence, null);
      assert.equal(result.structuredContent.session.notes, "Source note");
    },
  };
  assert.equal(await requestSessionSummary(context.id, deps), "sent");
  context.llmSummary = { highlight: "Already saved" };
  assert.equal(await requestSessionSummary(context.id, deps), "saved");
  assert.equal(sends, 1);
});

test("context rejection stops follow-up; message rejection and transport failures surface for retry", async () => {
  const result = {
    structuredContent: { question: "Review" },
    _meta: { private: "never model-visible" },
  };
  let messages = 0;
  await assert.rejects(
    sendAnalysisToHost(
      {
        updateModelContext: async () => ({ isError: true }),
        sendMessage: async () => {
          messages++;
        },
      },
      result,
      "Review",
    ),
    /context/,
  );
  assert.equal(messages, 0);
  await assert.rejects(
    sendAnalysisToHost(
      {
        updateModelContext: async () => ({}),
        sendMessage: async () => ({ isError: true }),
      },
      result,
      "Review",
    ),
    /not accept/,
  );
  await assert.rejects(
    sendAnalysisToHost(
      {
        updateModelContext: async () => {
          throw new Error("Disconnected");
        },
      },
      result,
      "Review",
    ),
    /Disconnected/,
  );
});
