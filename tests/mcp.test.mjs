import { testStore } from "./fixtures.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createHttpServer } from "../server/index.mjs";
import { toolSchemas } from "../server/tools.mjs";

test("goal reorder is registered and shared by the HTTP and MCP handlers", async (t) => {
  const server = createHttpServer(testStore(t));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = new Client({ name: "goals-reorder-test", version: "1.0.0" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(base + "/mcp")),
    );
    const { tools } = await client.listTools();
    assert.equal(
      tools.find((tool) => tool.name === "reorder_goals").annotations
        .readOnlyHint,
      false,
    );
    const initial = await (await fetch(base + "/api/dashboard")).json();
    const ids = initial.goals.map((goal) => goal.id);
    const order = {
      active_ids: [ids.at(-1), ids[0]],
      inactive_ids: ids.slice(1, -1),
    };
    const response = await fetch(base + "/api/tools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "reorder_goals", arguments: order }),
    });
    assert.equal(response.status, 200);
    assert.notEqual((await response.json()).isError, true);
    const dashboard = await client.callTool({
      name: "get_dashboard",
      arguments: {},
    });
    assert.deepEqual(
      dashboard._meta.appData.goals
        .filter((goal) => goal.active)
        .map((goal) => goal.id),
      order.active_ids,
    );
    const moved = await client.callTool({
      name: "reorder_goals",
      arguments: { active_ids: [], inactive_ids: [...ids].reverse() },
    });
    assert.notEqual(moved.isError, true);
    const saved = await (await fetch(base + "/api/dashboard")).json();
    assert.ok(saved.goals.every((goal) => !goal.active));
    assert.deepEqual(
      saved.goals.map((goal) => goal.id),
      [...ids].reverse(),
    );
  } finally {
    await client.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("local app serves its home page, assets and routes within the build directory", async (t) => {
  const server = createHttpServer(testStore(t));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const home = await fetch(base + "/");
    assert.equal(home.status, 200);
    assert.match(home.headers.get("content-type"), /text\/html/);
    const html = await home.text();
    assert.match(html, /<div id="root">/);
    const assetPath = html.match(/<script\b[^>]*src="([^"]+)"/)[1];
    const asset = await fetch(base + assetPath);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("content-type"), /javascript/);
    assert.equal((await fetch(base + "/sessions/latest")).status, 200);
    assert.equal((await fetch(base + "/missing.js")).status, 404);
    assert.equal((await fetch(base + "/..%2f..%2fpackage.json")).status, 403);
    const head = await fetch(base + "/", { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("MCP handshake, UI resource, tool calls and REST share persistent tenant state", async (t) => {
  const server = createHttpServer(testStore(t));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = new Client({ name: "sup-contract-test", version: "1.0.0" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(base + "/mcp")),
    );
    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map((t) => t.name).sort(),
      Object.keys(toolSchemas).sort(),
    );
    const read = tools.find((t) => t.name === "get_dashboard");
    assert.equal(read.annotations.readOnlyHint, true);
    assert.equal(
      tools.find((t) => t.name === "upsert_annotation").annotations
        .readOnlyHint,
      false,
    );
    const resource = await client.readResource({
      uri: read._meta.ui.resourceUri,
    });
    assert.equal(resource.contents[0].mimeType, "text/html;profile=mcp-app");
    assert.match(resource.contents[0].text, /<script type="module">/);
    assert.doesNotMatch(resource.contents[0].text, /<script[^>]*src=/);
    const dashboard = await client.callTool({
      name: "get_dashboard",
      arguments: {},
    });
    assert.equal(dashboard.structuredContent.availableCount, 4);
    const id = dashboard.structuredContent.sessions[0].id;
    for (const name of ["add_custom_interval", "delete_custom_interval"])
      assert.equal(
        tools.find((tool) => tool.name === name).annotations.readOnlyHint,
        false,
      );
    const custom = await client.callTool({
      name: "add_custom_interval",
      arguments: { session_id: id, start_s: 100, end_s: 400 },
    });
    const savedId = custom.structuredContent.id;
    const intervalRest = await fetch(base + "/api/dashboard").then((r) =>
      r.json(),
    );
    assert.equal(intervalRest.sessions[0].customIntervals[0].id, savedId);
    assert.ok(
      intervalRest.sessions[0].customIntervals[0].statistics.tracking.score >
        99.9,
    );
    await client.callTool({
      name: "delete_custom_interval",
      arguments: { session_id: id, interval_id: savedId },
    });
    assert.deepEqual(dashboard.structuredContent.boards, []);
    assert.equal(
      tools.find((t) => t.name === "assign_session_board").annotations
        .readOnlyHint,
      false,
    );
    assert.equal(
      tools.find((t) => t.name === "delete_board").annotations.destructiveHint,
      true,
    );
    const board = await client.callTool({
      name: "upsert_board",
      arguments: { name: "MCP test board" },
    });
    const boardId = board.structuredContent.id;
    await client.callTool({
      name: "set_default_board",
      arguments: { board_id: boardId },
    });
    await client.callTool({
      name: "assign_session_board",
      arguments: { session_id: id, board_id: boardId },
    });
    const note = await client.callTool({
      name: "upsert_annotation",
      arguments: {
        session_id: id,
        start_s: 300,
        end_s: 330,
        kind: "note",
        note: "MCP test",
        timing: "exact",
      },
    });
    assert.equal(note.isError, undefined);
    assert.equal(note.structuredContent.note, "MCP test");
    const rest = await fetch(base + "/api/dashboard").then((r) => r.json());
    assert.equal(rest.sessions[0].annotations[0].note, "MCP test");
    assert.equal(rest.sessions[0].boardId, boardId);
    assert.equal(rest.defaultBoardId, boardId);
    const invalid = await client.callTool({
      name: "upsert_annotation",
      arguments: {
        session_id: id,
        start_s: 9000,
        end_s: 9300,
        kind: "note",
        note: "Invalid",
        timing: "exact",
      },
    });
    assert.equal(invalid.isError, true);
    const analysis = await client.callTool({
      name: "prepare_analysis_context",
      arguments: { session_id: id, question: "Review the latest annotation" },
    });
    assert.equal(
      analysis.structuredContent.session.board.name,
      "MCP test board",
    );
    assert.equal(
      analysis.structuredContent.session.annotations[0].note,
      "MCP test",
    );
    assert.equal(
      (
        await fetch(base + "/api/tools", {
          method: "POST",
          headers: {
            Origin: "https://unrelated.example",
            "Content-Type": "application/json",
          },
          body: "{}",
        })
      ).status,
      403,
    );
  } finally {
    await client.close();
    await new Promise((r) => server.close(r));
  }
});

test("OAuth discovery is absent rather than a successful HTML app response", async (t) => {
  const server = createHttpServer(testStore(t));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const path of [
      "/.well-known/oauth-protected-resource/mcp",
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-authorization-server",
      "/.well-known/openid-configuration",
      "/.well-known/unknown-discovery-document",
    ]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 404, path);
      assert.match(response.headers.get("content-type"), /application\/json/);
      assert.equal(response.headers.get("www-authenticate"), null);
      assert.equal(
        (await response.json()).error,
        "Discovery metadata is not available.",
      );
    }
    const mcp = await fetch(base + "/mcp");
    assert.equal(mcp.status, 405);
    assert.equal(mcp.headers.get("allow"), "POST");
    assert.equal((await fetch(base + "/")).status, 200);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
