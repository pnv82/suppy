import { App } from "@modelcontextprotocol/ext-apps";
import { createRequestSession } from "./request-session.mjs";
import { createWorkspaceSession } from "./workspace-session.mjs";
import { sendAnalysisToHost } from "./session-analysis.mjs";

const requests = createRequestSession();
const workspace = createWorkspaceSession();
export const setAccountSession = requests.reset;

let bridge = null,
  connecting = null;
const listeners = new Set();
export const embedded = window.parent !== window;
export function subscribe(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
function publish(result, fromHost = false) {
  if (embedded && result?._meta?.["mcp/www_authenticate"]) {
    workspace.accept(null);
    for (const callback of listeners) callback(null);
    return;
  }
  if (result?._meta?.appData) {
    if (embedded) workspace.accept(result._meta.appData);
    for (const callback of listeners)
      callback(result._meta.appData, result._meta.sessionId, fromHost);
  }
}
export async function connect() {
  if (!embedded)
    return {
      data: await requests.request("/api/dashboard"),
      connected: false,
    };
  if (!connecting)
    connecting = (async () => {
      bridge = new App(
        { name: "Suppy", version: "0.1.0" },
        {},
        { autoResize: true },
      );
      bridge.ontoolresult = (result) => publish(result, true);
      let timer;
      try {
        await Promise.race([
          bridge.connect(),
          new Promise((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  new Error(
                    "The ChatGPT host did not respond. Open this UI through the Suppy connection, or use the standalone app.",
                  ),
                ),
              12000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    })();
  await connecting;
  // Cache the current workspace, never a promise holding a previous account's data.
  if (workspace.data) return { data: workspace.data, connected: true };
  const result = await workspace.run((signal) =>
    bridge.callServerTool({ name: "get_dashboard", arguments: {} }, { signal }),
  );
  publish(result);
  if (result.isError)
    throw new Error(result.content?.[0]?.text || "Connection failed");
  return { data: result._meta.appData, connected: true };
}
export async function callTool(name, args = {}) {
  const result = embedded
    ? await workspace.run((signal) =>
        bridge.callServerTool({ name, arguments: args }, { signal }),
      )
    : await requests.request("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, arguments: args }),
      });
  if (embedded && result?._meta?.["mcp/www_authenticate"]) publish(result);
  if (result.isError)
    throw new Error(result.content?.[0]?.text || "Request failed");
  publish(result);
  return result;
}
export async function askChatGPT(result, message) {
  const context = JSON.stringify(result.structuredContent, null, 2);
  if (!embedded) return context;
  await workspace.run((signal) =>
    sendAnalysisToHost(
      bridge,
      result,
      message ??
        `Please analyze this SUP session using the current app context, including my latest annotations and additional data. My question: ${result.structuredContent.question}`,
      signal,
    ),
  );
  return null;
}
