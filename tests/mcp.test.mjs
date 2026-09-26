import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createHttpServer } from "../server/index.mjs";

test("MCP handshake, UI resource, tool calls and REST share temporary state", async () => {
  const server = createHttpServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = new Client({ name: "sup-contract-test", version: "1.0.0" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(base + "/mcp")),
    );
    const { tools } = await client.listTools();
    assert.equal(tools.length, 7);
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
