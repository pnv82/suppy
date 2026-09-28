import { App } from "@modelcontextprotocol/ext-apps";

let bridge = null,
  connecting = null;
const listeners = new Set();
export const embedded = window.parent !== window;
export function subscribe(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
function publish(result, fromHost = false) {
  if (result?._meta?.appData)
    for (const callback of listeners)
      callback(result._meta.appData, result._meta.sessionId, fromHost);
}
export async function connect() {
  if (!embedded)
    return {
      data: await fetch("/api/dashboard").then(checkResponse),
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
      const result = await bridge.callServerTool({
        name: "get_dashboard",
        arguments: {},
      });
      if (result.isError)
        throw new Error(result.content?.[0]?.text || "Connection failed");
      publish(result);
      return { data: result._meta.appData, connected: true };
    })();
  return connecting;
}
async function checkResponse(response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}
export async function callTool(name, args = {}) {
  const result = embedded
    ? await bridge.callServerTool({ name, arguments: args })
    : await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, arguments: args }),
      }).then(checkResponse);
  if (result.isError)
    throw new Error(result.content?.[0]?.text || "Request failed");
  publish(result);
  return result;
}
export async function askChatGPT(result) {
  const context = JSON.stringify(result.structuredContent, null, 2);
  if (!embedded) return context;
  await bridge.updateModelContext({
    content: [{ type: "text", text: context }],
  });
  const sent = await bridge.sendMessage({
    role: "user",
    content: [
      {
        type: "text",
        text: `Please analyze this SUP session using the current app context, including my latest annotations and additional data. My question: ${result.structuredContent.question}`,
      },
    ],
  });
  if (sent?.isError)
    throw new Error(
      "ChatGPT did not accept the message. Copy the prepared context and send it in chat.",
    );
  return null;
}
