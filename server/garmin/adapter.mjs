import { GarminConnect } from "@fiddur/garmin-connect";
export const GARMIN_FILE_LIMIT = 30_000_000;
const hosts = new Set([
  "sso.garmin.com",
  "connectapi.garmin.com",
  "connect.garmin.com",
]);
// Public metadata only; account credentials/tokens never go to this endpoint.
async function publicConsumer(signal) {
  const res = await fetch(
    "https://thegarth.s3.amazonaws.com/oauth_consumer.json",
    { signal, redirect: "error" },
  );
  if (!res.ok) throw new Error("Client metadata unavailable");
  let text = "";
  for await (const chunk of res.body) {
    text += Buffer.from(chunk).toString("utf8");
    if (text.length > 4096) throw new Error("Client metadata too large");
  }
  const value = JSON.parse(text);
  if (
    typeof value.consumer_key !== "string" ||
    typeof value.consumer_secret !== "string"
  )
    throw new Error("Invalid client metadata");
  return { key: value.consumer_key, secret: value.consumer_secret };
}
export function createGarminAdapter({
  httpAdapter,
  consumerLoader = publicConsumer,
} = {}) {
  const gc = new GarminConnect({ username: "", password: "" });
  const client = gc.client,
    http = client.client,
    controller = new AbortController();
  // Upstream response refresh uses module-global state and logs errors.
  // Require reconnect instead; no shared refresh tokens or provider error logs.
  http.interceptors.response.clear();
  Object.assign(http.defaults, {
    timeout: 15_000,
    maxContentLength: GARMIN_FILE_LIMIT,
    maxBodyLength: 16_384,
    maxRedirects: 3,
    signal: controller.signal,
  });
  http.defaults.beforeRedirect = (options) => {
    if (options.protocol !== "https:" || !hosts.has(options.hostname))
      throw new Error("Unexpected Garmin redirect");
  };
  if (httpAdapter) http.defaults.adapter = httpAdapter;
  http.interceptors.request.use((config) => {
    const url = new URL(config.url);
    if (url.protocol !== "https:" || !hosts.has(url.hostname))
      throw new Error("Unexpected Garmin endpoint");
    return config;
  });
  client.fetchOauthConsumer = async () => {
    client.OAUTH_CONSUMER = await consumerLoader(
      AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
    );
  };
  // Use the same bounded cookie client instead of upstream's global Axios call.
  client.completeLogin = async (ticket) => {
    try {
      await http.get(gc.url.PORTAL_SSO_EMBED);
    } catch {
      /* optional cookie */
    }
    await client.exchange(await client.getOauth1Token(ticket), true);
    if (!client.oauth2Token?.access_token)
      throw new Error("Missing Garmin token");
  };
  async function safe(operation) {
    try {
      return await operation();
    } catch (error) {
      const status = error?.response?.status;
      throw new Error(
        status === 429
          ? "Garmin is limiting requests. Wait before trying again."
          : status === 401 || status === 403
            ? "Garmin rejected the request. Disconnect and sign in again; check your account in Garmin Connect if needed."
            : "Garmin could not complete the request. Check your sign-in or verification code and try again. Garmin may be temporarily unavailable.",
      );
    }
  }
  return {
    login: (username, password) =>
      safe(async () => {
        try {
          const result = await gc.login(username, password);
          return result.type === "mfa_required" ? "mfa_required" : "connected";
        } finally {
          gc.credentials = { username: "", password: "" };
        }
      }),
    verify: (code) =>
      safe(async () => {
        await gc.verifyMfa(code);
        return "connected";
      }),
    list: (start) =>
      safe(() =>
        client.get(gc.url.ACTIVITIES, {
          params: { start, limit: 20, activityType: "stand_up_paddleboarding" },
        }),
      ),
    download: (id) =>
      safe(async () => {
        if (!/^[0-9]{1,20}$/.test(id)) throw new Error("Invalid activity ID");
        return Buffer.from(
          await client.get(gc.url.DOWNLOAD_ZIP + id, {
            responseType: "arraybuffer",
          }),
        );
      }),
    close() {
      controller.abort();
      gc.credentials = { username: "", password: "" };
      client.oauth1Token =
        client.oauth2Token =
        client.OAUTH_CONSUMER =
          undefined;
      client._pendingLoginParams = client._pendingMfaMethod = undefined;
      http.defaults.jar.removeAllCookiesSync();
    },
  };
}
