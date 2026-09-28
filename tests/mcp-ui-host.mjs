// Development-only harness; Vite serves this test file, but it is not a build entry.
import {
  AppBridge,
  PostMessageTransport,
} from "@modelcontextprotocol/ext-apps/app-bridge";
const frame = document.querySelector("iframe"),
  events = document.querySelector("#events");
const log = (text) => {
  events.textContent += "\n" + text;
};
const bridge = new AppBridge(
  null,
  { name: "SUP local QA host", version: "0.1.0" },
  { serverTools: {}, updateModelContext: {}, message: { text: {} } },
);
bridge.oncalltool = async (params) => {
  const response = await fetch("/api/tools", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  log(`Tool called: ${params.name}`);
  return result;
};
bridge.onupdatemodelcontext = async (params) => {
  const data = JSON.parse(params.content[0].text);
  log(
    `Updated model context: revision ${data.session.revision}, notes ${data.session.annotations.length}, additional context: ${data.session.additionalContext || "(none)"}`,
  );
  return {};
};
bridge.onmessage = async (params) => {
  log(`Message received by test host: ${params.content[0].text}`);
  return {};
};
bridge.oninitialized = () => log("Embedded UI handshake complete.");
bridge.onsizechange = () => {};
await bridge.connect(
  new PostMessageTransport(frame.contentWindow, frame.contentWindow),
);
const response = await fetch("/mcp", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": "2025-06-18",
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "resources/read",
    params: { uri: "ui://suppy/dashboard.html" },
  }),
});
const data = await response.json();
if (data.error) throw new Error(data.error.message);
frame.srcdoc = data.result.contents[0].text;
