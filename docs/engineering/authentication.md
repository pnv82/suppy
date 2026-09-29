# Auth0 authentication

Authentication is delegated to Auth0. Suppy has no passwords, user directory, identity linking, roles or session-token issuer. The standalone React app uses `@auth0/auth0-react` (authorization code + PKCE); the Node server uses `jose` to verify RS256 access tokens against Auth0's cached, rotating JWKS. The embedded UI continues to use the MCP Apps bridge and never starts its own browser login.

## Local configuration

The user selected local operation until a hosting URL is known. The configured Auth0 tenant is `dev-ye73ceq0c8p2tiz8.us.auth0.com`, application Client ID `fv9qphrYRycRrMBWE3SXUmaD2r2gSVRg`. The dedicated **Suppy** API Identifier is `http://127.0.0.1:3001/mcp`, with RS256 and the single permission `suppy:access`. These values are public. No client secret belongs in the app, environment example or browser.

Copy `.env.example` to `.env`, then `npm run build` and `npm start`. Node loads `.env` on startup. `npm run dev` uses the same server configuration with a separate development database. `/auth/config` supplies the browser's domain, Client ID, audience and scope at runtime; the build does not contain a second independent configuration. Local callback routes are `/auth/callback` on `http://127.0.0.1:3001`, `http://127.0.0.1:5173`, `http://localhost:3001`, and `http://localhost:5173`. Register the exact four URLs. Logout URLs are those four origins plus `/`; Allowed Web Origins are those four origins without a path. Enable `google-oauth2` only for Suppy. Grant the SPA `suppy:access` under API → Application Access → User-delegated Access. No client-credentials grant is needed.

`SUP_AUTH_MODE=local` is an explicit operator choice for the previous private, loopback-only workspace (default tenant `local`). With no `.env` or authentication setting, loopback operation retains that mode. `NODE_ENV=production` or `RENDER=true` requires `SUP_AUTH_MODE=auth0`; startup fails rather than exposing the local tenant. CLI startup always binds local mode to loopback. Do not expose local mode through a public proxy or tunnel accessible to other people.

Auth0 developer Google keys support local exploration. Production needs your own Google OAuth credentials, configured directly in Auth0, including Auth0's Google callback. Memory-only tokens disappear on refresh; the SDK attempts to restore the Auth0 session using silent authentication. If browser privacy settings or developer keys prevent this, the user sees Continue with Google again. Reauthentication returns to the same stored workspace; Suppy does not store tokens in localStorage to work around it. [Auth0 Google setup](https://auth0.com/docs/authenticate/identity-providers/social-identity-providers/google).

## Trusted identity and private state

Every REST request and every private stateless MCP tool call verifies the signature, exact issuer, audience, `exp`, `iat`, optional `nbf`, non-empty subject and granted `suppy:access` scope. Scope in `permissions` alone is insufficient. Missing/invalid tokens produce 401; insufficient permission produces 403. Query parameters, tool arguments and tenant headers cannot choose an identity.

The tenant is `auth0_` plus SHA-256 of the JSON tuple `[verified issuer, verified subject]`. It is a valid storage ID and is stable across browser and ChatGPT access for the same Auth0 account. Email/name changes do not move data. After verification and permission checks, an idempotent transaction provisions empty tenant/preferences rows. Existing `local` history is preserved and never automatically attached to a signed-in account. Changing the issuer or linking identities in Auth0 can change the subject and therefore the workspace; automated identity migration is outside scope.

Standalone REST sends the SDK access token only in the Authorization header. Signing out, switching accounts or receiving an authentication failure unmounts all private UI state and aborts outstanding requests. Generation checks discard late token acquisition and responses even if cancellation is ignored. Switching requests Google's account selection; sign-out clears SDK state and ends the Auth0 session, without signing out of Google itself. Auth0-issued tokens can remain valid until expiry; there is no home-grown revocation store.

Account actions open from the Suppy icon in the existing rail. The popover contains the account name, Switch Google account and Sign out; it adds no persistent page row. Escape/light dismissal closes the native popover. Account actions remain available if initial private data loading fails.

## MCP account linking

Both `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp` publish the canonical resource, Auth0 issuer and `suppy:access`. Unauthorized private HTTP requests include `WWW-Authenticate: Bearer resource_metadata="…", scope="suppy:access"`; invalid tokens and insufficient scopes add the standard error. Unknown discovery paths return JSON 404, never HTML.

MCP initialization, public tool discovery and the UI code resource are available without a token. Every tool declares OAuth and its required scope in top-level `securitySchemes` and `_meta.securitySchemes`. Unauthenticated tool results contain `isError` and `_meta["mcp/www_authenticate"]`, with no app data. The host can prompt account linking and retry. Embedded API calls stay on `bridge.callServerTool`, so ChatGPT supplies the bearer token to the server.

The tenant's **Resource Parameter Compatibility Profile** and **Include Issuer in Authorization Responses** were already enabled when inspected. For a **future HTTPS connection**, allow the Google connection for third-party clients as a domain-level connection. Register ChatGPT's client using an Auth0-supported client-registration method and its exact callback URL from the ChatGPT connection setup; grant only the Suppy API's user-delegated `suppy:access` scope. Do not invent a callback or enable a password database for the ChatGPT client. CIMD and dynamic client registration are currently disabled; choose the supported registration method at hosting time. [Auth0 MCP configuration](https://auth0.com/ai/docs/mcp/get-started/authorization-for-your-mcp-server), [ChatGPT authentication contract](https://developers.openai.com/plugins/build/auth).

The embedded client also discards outstanding bridge results after a changed tenant notification or OAuth challenge. A changed tenant remounts the workspace to clear selections, drafts and prepared private prompts; reconnect uses the current workspace rather than a cached promise containing another account's data. Host account-linking lifecycle notifications are host-dependent: the app clears when the bridge delivers the new identity or challenge.

Live ChatGPT linking is deferred until an accessible HTTPS MCP URL and client registration exist. Local MCP protocol/challenge tests are not a live account-linking check.

## Render preparation (unpublished)

`render.yaml` prepares one native Node web service with Node 24 (`.node-version`), `npm ci && npm run build`, `npm start`, `/healthz`, manual deploys and a 1 GB persistent disk mounted at `/var/data`. SQLite and original upload blobs live at `/var/data/production.sqlite`. Native Node is required; `dist/server/index.js` is the retained static Sites starter and is not this backend. Persistent disks require a paid Render service and constrain this SQLite design to one instance. [Render disks](https://render.com/docs/disks).

Before publication, choose the final HTTPS origin and create a new RS256 Auth0 API with Identifier `{origin}/mcp` and `suppy:access` (Auth0 Identifiers are immutable). Set `SUP_PUBLIC_URL` and `SUP_ALLOWED_ORIGIN` to that exact origin, `SUP_AUTH0_AUDIENCE` to `{origin}/mcp`, `SUP_AUTH_MODE=auth0`, `NODE_ENV=production`, and `SUP_DB_PATH=/var/data/production.sqlite`. Register its callback/logout/origin in the SPA; configure the ChatGPT client against this new API. Hosted startup rejects HTTP/loopback, mismatched audience/origin, missing storage path, or local mode.

Render supplies `PORT`; the service listens on `0.0.0.0` in hosted mode. Health checks and OAuth discovery are public but do not read private state. Browser origins are matched exactly; server-to-server requests with no Origin still require authentication for private data. REST is same-origin, with no wildcard CORS. Start the disk empty: do not seed or copy the local database. Use the existing SQLite online backup command for private off-host backups; do not rely on copying a live SQLite main file or restoring a disk snapshot over live WAL files. Publication and any paid resource creation remain separate actions.

## Validation

`tests/auth.test.mjs` signs synthetic JWTs using isolated keys and databases: signature/algorithm/issuer/audience/time/subject/scope rejection, HTTP/MCP challenges and discovery, exact origin policy, empty provisioning, two-user isolation, unchanged local history, restart persistence and late-request invalidation. Tests never use production data or require live Auth0 tokens. Run `npm test` and `npm run build`; record desktop/phone, keyboard, cancellation, logout/refresh and provider-specific observations in `design-qa.md`.
