import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, extname, sep } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createStore } from "./store.mjs";
import { descriptions, toolSchemas, executeTool } from "./tools.mjs";

const clientRoot = resolve(
  fileURLToPath(new URL("../dist/client/", import.meta.url)),
);
const resourceUri = "ui://sup-training/dashboard.html";
const mimeType = "text/html;profile=mcp-app";

// Ship the same UI in ChatGPT. Only code is embedded here; private data arrives through tools.
function widgetHtml() {
  const path = resolve(clientRoot, "index.html");
  if (!existsSync(path))
    throw new Error("Run npm run build before connecting ChatGPT.");
  return readFileSync(path, "utf8")
    .replace(
      /<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g,
      (_, src) =>
        `<script type="module">${readFileSync(resolve(clientRoot, src.replace(/^\//, "")), "utf8").replaceAll("</script", "<\\/script")}</script>`,
    )
    .replace(
      /<link\b[^>]*href="([^"]+\.css)"[^>]*>/g,
      (_, src) =>
        `<style>${readFileSync(resolve(clientRoot, src.replace(/^\//, "")), "utf8")}</style>`,
    );
}

export function createMcpServer(store) {
  const server = new McpServer({ name: "sup-training", version: "0.1.0" });
  server.registerResource(
    "sup-dashboard",
    resourceUri,
    { mimeType, description: "Interactive SUP session review" },
    async () => ({
      contents: [
        {
          uri: resourceUri,
          mimeType,
          text: widgetHtml(),
          _meta: {
            ui: {
              prefersBorder: true,
              csp: {
                resourceDomains: ["https://tile.openstreetmap.org"],
                connectDomains: [],
              },
            },
          },
        },
      ],
    }),
  );
  for (const name of Object.keys(toolSchemas)) {
    const readOnly = ![
      "upsert_annotation",
      "delete_annotation",
      "update_session_context",
      "update_session_details",
      "update_training_focus",
      "upsert_board",
      "delete_board",
      "set_default_board",
      "assign_session_board",
    ].includes(name);
    server.registerTool(
      name,
      {
        title: name
          .split("_")
          .map((s) => s[0].toUpperCase() + s.slice(1))
          .join(" "),
        description: descriptions[name],
        inputSchema: toolSchemas[name],
        annotations: {
          readOnlyHint: readOnly,
          destructiveHint: ["delete_annotation", "delete_board"].includes(name),
          idempotentHint: !["upsert_annotation", "upsert_board"].includes(name),
          openWorldHint: false,
        },
        _meta: { ui: { resourceUri }, "openai/outputTemplate": resourceUri },
      },
      async (args) => {
        try {
          return executeTool(store, name, args);
        } catch (error) {
          return {
            isError: true,
            content: [{ type: "text", text: error.message }],
          };
        }
      },
    );
  }
  return server;
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error("Request too large");
  }
  return body ? JSON.parse(body) : {};
}
function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

export function createHttpServer(store = createStore()) {
  return http.createServer(async (req, res) => {
    try {
      const path = new URL(req.url, "http://localhost").pathname;
      // Local prototype: refuse cross-site browser writes. Secure Tunnel forwards server-side MCP.
      if (
        req.headers.origin &&
        !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.origin)
      )
        return json(res, 403, {
          error: "Use the local app or the ChatGPT MCP connection.",
        });
      if (path === "/mcp") {
        if (req.method !== "POST") {
          res.setHeader("Allow", "POST");
          return json(res, 405, {
            error: "This stateless MCP endpoint accepts POST requests.",
          });
        }
        const mcp = createMcpServer(store);
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
        res.on("close", () => {
          transport.close();
          mcp.close();
        });
        await mcp.connect(transport);
        return await transport.handleRequest(req, res, await readJson(req));
      }
      if (path === "/api/dashboard" && req.method === "GET")
        return json(res, 200, store.dashboard());
      if (path === "/api/tools" && req.method === "POST") {
        const { name, arguments: args } = await readJson(req);
        return json(res, 200, executeTool(store, name, args));
      }
      if (path.startsWith("/api/"))
        return json(res, 404, { error: "Unknown endpoint" });
      // Discovery clients must see missing metadata, never the SPA's HTML fallback.
      // This local/private prototype does not implement OAuth.
      if (path === "/.well-known" || path.startsWith("/.well-known/"))
        return json(res, 404, {
          error: "Discovery metadata is not available.",
        });
      if (req.method !== "GET" && req.method !== "HEAD")
        return json(res, 405, { error: "Method not allowed" });
      let file = resolve(clientRoot, "." + decodeURIComponent(path));
      if (file !== clientRoot && !file.startsWith(clientRoot + sep))
        return json(res, 403, { error: "Invalid path" });
      if (!extname(file)) file = resolve(clientRoot, "index.html");
      if (!existsSync(file))
        return json(res, 404, { error: "Run npm run build first." });
      const types = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".woff2": "font/woff2",
      };
      res.writeHead(200, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(req.method === "HEAD" ? undefined : readFileSync(file));
    } catch (error) {
      if (!res.headersSent) json(res, 400, { error: error.message });
      else res.end();
    }
  });
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const port = Number(process.env.SUP_PORT || 3001);
  createHttpServer().listen(port, "127.0.0.1", () =>
    console.log(
      `SUP Training: http://127.0.0.1:${port} | MCP: /mcp | temporary memory`,
    ),
  );
}
