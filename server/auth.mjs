import { createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

export const accessScope = "suppy:access";
const localOrigins = [
  "http://127.0.0.1:3001",
  "http://127.0.0.1:5173",
  "http://localhost:3001",
  "http://localhost:5173",
];

export function authenticationConfig(env = process.env) {
  const hosted = env.NODE_ENV === "production" || env.RENDER === "true";
  const mode = env.SUP_AUTH_MODE || "local";
  if (!["local", "auth0"].includes(mode))
    throw new Error("SUP_AUTH_MODE must be local or auth0.");
  if (hosted && mode !== "auth0")
    throw new Error("Hosted operation requires SUP_AUTH_MODE=auth0.");
  if (mode === "local") return { mode, allowedOrigins: localOrigins };
  const domain = env.SUP_AUTH0_DOMAIN || "dev-ye73ceq0c8p2tiz8.us.auth0.com";
  const clientId =
    env.SUP_AUTH0_CLIENT_ID || "fv9qphrYRycRrMBWE3SXUmaD2r2gSVRg";
  if (!/^[a-z0-9.-]+$/.test(domain) || !clientId.trim())
    throw new Error("Invalid Auth0 domain or client ID.");
  const url = new URL(env.SUP_PUBLIC_URL || "http://127.0.0.1:3001");
  const loopback = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && loopback && !hosted))
  )
    throw new Error(
      "SUP_PUBLIC_URL must be an HTTPS origin (HTTP loopback is allowed locally).",
    );
  if (hosted && loopback)
    throw new Error("Hosted operation requires a public HTTPS origin.");
  const resource = `${url.origin}/mcp`;
  const audience = env.SUP_AUTH0_AUDIENCE || resource;
  if (audience !== resource)
    throw new Error("SUP_AUTH0_AUDIENCE must equal SUP_PUBLIC_URL + /mcp.");
  const allowedOrigin = env.SUP_ALLOWED_ORIGIN || url.origin;
  if (
    hosted &&
    (!env.SUP_PUBLIC_URL ||
      !env.SUP_ALLOWED_ORIGIN ||
      allowedOrigin !== url.origin ||
      !env.SUP_DB_PATH)
  )
    throw new Error(
      "Hosted operation requires SUP_PUBLIC_URL, matching SUP_ALLOWED_ORIGIN and SUP_DB_PATH.",
    );
  return {
    mode,
    domain,
    clientId,
    issuer: `https://${domain}/`,
    audience,
    resource,
    metadataUrl: `${url.origin}/.well-known/oauth-protected-resource`,
    allowedOrigins: hosted
      ? [allowedOrigin]
      : [...new Set([...localOrigins, allowedOrigin])],
  };
}

export class AuthenticationError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function authenticationChallenge(config, error) {
  const parts = [
    `Bearer resource_metadata="${config.metadataUrl}"`,
    `scope="${accessScope}"`,
  ];
  if (error?.code)
    parts.push(`error="${error.code}"`, `error_description="${error.message}"`);
  return parts.join(", ");
}

export function protectedResourceMetadata(config) {
  return {
    resource: config.resource,
    authorization_servers: [config.issuer],
    scopes_supported: [accessScope],
    bearer_methods_supported: ["header"],
    resource_name: "Suppy",
  };
}

export function tenantForIdentity(issuer, subject) {
  // An unambiguous JSON tuple; no email, display name or caller-selected ID.
  return `auth0_${createHash("sha256")
    .update(JSON.stringify([issuer, subject]))
    .digest("hex")}`;
}

export function createAuth0Resolver(config, database, options = {}) {
  const keySet =
    options.keySet ||
    createRemoteJWKSet(new URL(`${config.issuer}.well-known/jwks.json`));
  return async (req) => {
    const authorization = req.headers.authorization;
    if (!authorization)
      throw new AuthenticationError(401, null, "Sign in to Suppy.");
    const match = /^Bearer ([^\s,]+)$/i.exec(authorization);
    if (!match)
      throw new AuthenticationError(
        401,
        "invalid_token",
        "Invalid access token.",
      );
    let payload;
    try {
      ({ payload } = await jwtVerify(match[1], keySet, {
        issuer: config.issuer,
        audience: config.audience,
        algorithms: ["RS256"],
        requiredClaims: ["iss", "sub", "aud", "exp", "iat"],
        clockTolerance: 5,
      }));
      if (
        typeof payload.sub !== "string" ||
        !payload.sub.trim() ||
        payload.sub.length > 512 ||
        payload.iat > Math.floor(Date.now() / 1000) + 5
      )
        throw new Error("Invalid subject or issue time");
    } catch {
      throw new AuthenticationError(
        401,
        "invalid_token",
        "Invalid or expired access token. Sign in again.",
      );
    }
    // Require the granted OAuth scope, including for MCP clients. A permissions claim
    // alone does not prove that this particular token was granted access.
    if (
      typeof payload.scope !== "string" ||
      !payload.scope.split(/\s+/).includes(accessScope)
    )
      throw new AuthenticationError(
        403,
        "insufficient_scope",
        "The suppy:access permission is required.",
      );
    const tenantId = tenantForIdentity(payload.iss, payload.sub);
    database.createTenant(tenantId);
    return tenantId;
  };
}
