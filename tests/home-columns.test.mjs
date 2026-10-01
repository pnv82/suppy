import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../server/database.mjs";
import { createStore } from "../server/store.mjs";
import { createHttpServer } from "../server/index.mjs";
import { executeTool } from "../server/tools.mjs";
import {
  DEFAULT_HOME_COLUMNS,
  validateHomeColumns,
} from "../src/domain/home-columns.mjs";
import { fixtureState, testStore } from "./fixtures.mjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

test("Home columns persist independently per tenant and accept an empty list", () => {
  const path = join(
    mkdtempSync(join(tmpdir(), "suppy-columns-")),
    "test.sqlite",
  );
  let db = openDatabase(path);
  try {
    db.createTenant("a");
    db.createTenant("b");
    db.importState("a", fixtureState());
    let a = createStore({ database: db, tenantId: "a" });
    const b = createStore({ database: db, tenantId: "b" });
    const before = a.get("24495535896");
    assert.deepEqual(a.dashboard().homeColumns, DEFAULT_HOME_COLUMNS);
    const result = executeTool(a, "set_home_columns", {
      columns: ["bestWindows", "distance"],
    });
    assert.deepEqual(result._meta.appData.homeColumns, [
      "bestWindows",
      "distance",
    ]);
    assert.deepEqual(b.dashboard().homeColumns, DEFAULT_HOME_COLUMNS);
    assert.deepEqual(a.get(before.id), before);
    for (const columns of [["bogus"], ["speed", "speed"], null, "speed"])
      assert.throws(() => executeTool(a, "set_home_columns", { columns }));
    assert.throws(() =>
      executeTool(a, "set_home_columns", { columns: [], tenantId: "b" }),
    );
    db.close();
    db = openDatabase(path);
    a = createStore({ database: db, tenantId: "a" });
    assert.deepEqual(a.dashboard().homeColumns, ["bestWindows", "distance"]);
    executeTool(a, "set_home_columns", { columns: [] });
    assert.deepEqual(a.dashboard().homeColumns, []);
    assert.deepEqual(validateHomeColumns(["hr", "speed"]), ["speed", "hr"]);
  } finally {
    db.close();
  }
});

test("HTTP and MCP share Home column settings and mutation metadata", async (t) => {
  const store = testStore(t),
    server = createHttpServer(store);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = new Client({ name: "columns-test", version: "1" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(base + "/mcp")),
    );
    assert.equal(
      (await client.listTools()).tools.find(
        (t) => t.name === "set_home_columns",
      ).annotations.readOnlyHint,
      false,
    );
    const response = await fetch(base + "/api/tools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "set_home_columns",
        arguments: { columns: ["bestWindows", "wind"] },
      }),
    });
    assert.equal(response.status, 200);
    const result = await client.callTool({
      name: "get_dashboard",
      arguments: {},
    });
    assert.deepEqual(result.structuredContent.homeColumns, [
      "bestWindows",
      "wind",
    ]);
    const saved = await client.callTool({
      name: "set_home_columns",
      arguments: { columns: [...DEFAULT_HOME_COLUMNS] },
    });
    assert.notEqual(saved.isError, true);
    assert.deepEqual(
      (await (await fetch(base + "/api/dashboard")).json()).homeColumns,
      DEFAULT_HOME_COLUMNS,
    );
  } finally {
    await client.close();
    await new Promise((r) => server.close(r));
  }
});
