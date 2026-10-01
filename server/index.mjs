import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, extname, sep } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  authenticationConfig,
  createAuth0Resolver,
  AuthenticationError,
  authenticationChallenge,
  protectedResourceMetadata,
  accessScope,
} from "./auth.mjs";
import { createStore } from "./store.mjs";
import { openDatabase, validateTenantId } from "./database.mjs";
import { descriptions, toolSchemas } from "./tools.mjs";
import { dispatchTool } from "./operations.mjs";
import { createWeatherService } from "./weather/service.mjs";
import { createGarminService } from "./garmin/service.mjs";

const clientRoot = resolve(
  fileURLToPath(new URL("../dist/client/", import.meta.url)),
);
const resourceUri = "ui://suppy/dashboard.html";
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

export function createMcpServer(
  store,
  weatherService = createWeatherService(),
  garminService,
  options = {},
) {
  const server = new McpServer({ name: "suppy", version: "0.1.0" });
  const securitySchemes =
    options.authConfig?.mode === "auth0"
      ? [{ type: "oauth2", scopes: [accessScope] }]
      : [{ type: "noauth" }];
  const definitions = [];
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
      "set_unit_preferences",
      "set_goal_history_depth",
      "add_custom_interval",
      "delete_custom_interval",
      "upsert_goal",
      "reorder_goals",
      "set_goal_practice",
      "delete_goal",
      "set_session_summary",
      "upsert_annotation",
      "delete_annotation",
      "delete_session",
      "update_session_context",
      "update_session_details",
      "update_training_focus",
      "upsert_board",
      "delete_board",
      "set_default_board",
      "assign_session_board",
      "commit_fit_import",
      "commit_garmin_activity",
      "disconnect_garmin",
      "fetch_session_weather",
      "set_session_wind",
    ].includes(name);
    const definition = {
      title: name
        .split("_")
        .map((s) => s[0].toUpperCase() + s.slice(1))
        .join(" "),
      description: descriptions[name],
      inputSchema: toolSchemas[name],
      annotations: {
        readOnlyHint: readOnly,
        destructiveHint: [
          "delete_custom_interval",
          "delete_goal",
          "delete_annotation",
          "delete_board",
          "delete_session",
        ].includes(name),
        idempotentHint: ![
          "upsert_annotation",
          "upsert_board",
          "upsert_goal",
        ].includes(name),
        openWorldHint: [
          "suggest_launch_name",
          "fetch_session_weather",
          "commit_fit_import",
          "commit_garmin_activity",
          "preview_fit_import",
          "list_garmin_activities",
          "preview_garmin_activity",
        ].includes(name),
      },
      _meta: {
        ui: { resourceUri },
        "openai/outputTemplate": resourceUri,
        securitySchemes,
      },
    };
    definitions.push({
      name,
      ...definition,
      inputSchema: z.toJSONSchema(toolSchemas[name], { io: "input" }),
      securitySchemes,
    });
    server.registerTool(name, definition, async (args) => {
      if (options.authenticationFailure)
        return {
          isError: true,
          content: [
            { type: "text", text: options.authenticationFailure.message },
          ],
          _meta: {
            "mcp/www_authenticate": [
              authenticationChallenge(
                options.authConfig,
                options.authenticationFailure,
              ),
            ],
          },
        };
      try {
        return await dispatchTool(
          store,
          name,
          args,
          weatherService,
          garminService,
        );
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: error.message }],
        };
      }
    });
  }
  // SDK v1 preserves _meta but drops top-level securitySchemes. Its public low-level
  // handler API lets discovery advertise both locations without changing tool execution.
  server.server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: definitions,
  }));
  return server;
}

async function readJson(req, limit = 40_010_000) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > limit)
      throw new Error("Request too large (30 MB file limit)");
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

export function createHttpServer(store, options = {}) {
  const authConfig = options.authConfig ?? authenticationConfig();
  const garminService = options.garminService ?? createGarminService();
  const weatherService =
    options.weatherService ??
    createWeatherService({ provider: options.weatherProvider });
  if (store && (options.resolveTenant || authConfig.mode === "auth0"))
    throw new Error(
      "A fixed store cannot be combined with a request tenant resolver.",
    );
  // A supplied resolver must authenticate the request and fail closed. Never use
  // tenant IDs from tool arguments, query strings, or unverified client headers.
  const owned = !store && !options.database;
  const database = store
    ? null
    : (options.database ?? openDatabase(options.dbPath));
  const tenantId = options.tenantId ?? process.env.SUP_TENANT_ID ?? "local";
  const resolveTenant =
    options.resolveTenant ??
    (authConfig.mode === "auth0"
      ? createAuth0Resolver(authConfig, database, options.authOptions)
      : null);
  if (database && !resolveTenant) database.createTenant(tenantId);
  const server = http.createServer(async (req, res) => {
    try {
      const path = new URL(req.url, "http://localhost").pathname;
      if (path === "/healthz" && req.method === "GET")
        return json(res, 200, { status: "ok" });
      // Browser origins are exact. Server-to-server ChatGPT requests have no Origin.
      // A direct local-only server may use an ephemeral loopback port in tests.
      const localSameOrigin =
        authConfig.mode === "local" &&
        req.headers.origin === `http://${req.headers.host}` &&
        /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(
          req.headers.origin ?? "",
        );
      if (
        req.headers.origin &&
        !authConfig.allowedOrigins.includes(req.headers.origin) &&
        !localSameOrigin
      )
        return json(res, 403, {
          error: "Origin is not allowed.",
        });
      if (path === "/auth/config" && req.method === "GET")
        return json(
          res,
          200,
          authConfig.mode === "auth0"
            ? {
                mode: "auth0",
                domain: authConfig.domain,
                clientId: authConfig.clientId,
                audience: authConfig.audience,
                scope: accessScope,
              }
            : { mode: "local" },
        );
      if (
        [
          "/.well-known/oauth-protected-resource",
          "/.well-known/oauth-protected-resource/mcp",
        ].includes(path) &&
        authConfig.mode === "auth0" &&
        req.method === "GET"
      )
        return json(res, 200, protectedResourceMetadata(authConfig));
      let requestStore = store;
      let authenticationFailure;
      let mcpBody;
      if (path === "/mcp" && req.method === "POST")
        mcpBody = await readJson(req);
      if (path === "/mcp" || path.startsWith("/api/")) {
        if (!requestStore) {
          try {
            const identity = resolveTenant
              ? await resolveTenant(req)
              : tenantId;
            validateTenantId(identity);
            requestStore = createStore({
              database,
              tenantId: identity,
              launchLookup: options.launchLookup,
            });
          } catch (error) {
            if (!(error instanceof AuthenticationError))
              return json(res, 403, { error: "Tenant access denied." });
            authenticationFailure = error;
            res.setHeader(
              "WWW-Authenticate",
              authenticationChallenge(authConfig, error),
            );
            // Public MCP discovery contains code and schemas only. Private tool calls
            // receive a challenge in the result so the host can open account linking.
            const discovery =
              !req.headers.authorization &&
              [
                "initialize",
                "notifications/initialized",
                "ping",
                "tools/list",
                "resources/list",
                "resources/templates/list",
                "resources/read",
              ].includes(mcpBody?.method);
            if (!(
              path === "/mcp" &&
              req.method === "POST" &&
              (discovery || mcpBody?.method === "tools/call")
            ))
              return json(res, error.status, { error: error.message });
          }
        }
      }
      if (path === "/mcp") {
        if (req.method !== "POST") {
          res.setHeader("Allow", "POST");
          return json(res, 405, {
            error: "This stateless MCP endpoint accepts POST requests.",
          });
        }
        const mcp = createMcpServer(
          requestStore,
          weatherService,
          garminService,
          { authConfig, authenticationFailure },
        );
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
        res.on("close", () => {
          transport.close();
          mcp.close();
        });
        await mcp.connect(transport);
        return await transport.handleRequest(req, res, mcpBody);
      }
      if (path.startsWith("/api/garmin/")) {
        // Credentials are accepted only from the direct same-origin loopback UI.
        // The MCP tunnel has no credential tool or forwarded sign-in endpoint.
        const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
          req.socket.remoteAddress,
        );
        if (
          req.method !== "POST" ||
          !local ||
          req.headers.origin !== `http://${req.headers.host}` ||
          !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(
            req.headers.origin ?? "",
          ) ||
          Object.keys(req.headers).some(
            (key) =>
              key === "forwarded" ||
              key.startsWith("x-forwarded-") ||
              key.startsWith("cf-"),
          ) ||
          !req.headers["content-type"]?.startsWith("application/json")
        )
          return json(res, 403, {
            error:
              "Sign in through the direct local app, not ChatGPT or a tunnel.",
          });
        let credentials;
        try {
          credentials = await readJson(req, 4096);
        } catch {
          return json(res, 400, { error: "Invalid Garmin sign-in request." });
        }
        return json(
          res,
          200,
          await garminService.authenticate(
            requestStore,
            path.slice("/api/garmin/".length),
            credentials,
          ),
        );
      }
      if (path === "/api/dashboard" && req.method === "GET")
        return json(res, 200, requestStore.dashboard());
      if (path === "/api/tools" && req.method === "POST") {
        const { name, arguments: args } = await readJson(req);
        return json(
          res,
          200,
          await dispatchTool(
            requestStore,
            name,
            args,
            weatherService,
            garminService,
          ),
        );
      }
      if (path.startsWith("/api/"))
        return json(res, 404, { error: "Unknown endpoint" });
      // Discovery clients must see missing metadata, never the SPA's HTML fallback.
      // Only resource discovery is served here; Auth0 owns authorization discovery.
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
  server.on("close", () => garminService.close());
  if (owned)
    server.on("close", () =>
      weatherService.idle().then(() => database.close()),
    );
  return server;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const authConfig = authenticationConfig();
  const hosted =
    process.env.NODE_ENV === "production" || process.env.RENDER === "true";
  const port = Number(process.env.PORT || process.env.SUP_PORT || 3001);
  const server = createHttpServer();
  const host = hosted ? "0.0.0.0" : "127.0.0.1";
  server.listen(port, host, () =>
    console.log(
      `Suppy: http://${host}:${port} | MCP: /mcp | SQLite | authentication: ${authConfig.mode}`,
    ),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => server.close());
}
