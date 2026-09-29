import { randomUUID } from "node:crypto";
import { createGarminAdapter, GARMIN_FILE_LIMIT } from "./adapter.mjs";
import { garminAuthSchemas, garminSchemas } from "./schemas.mjs";
const SESSION_TTL = 30 * 60_000,
  MFA_TTL = 5 * 60_000,
  PREVIEW_TTL = 10 * 60_000;
const finite = (v) => (Number.isFinite(v) && v >= 0 ? v : null);
export function createGarminService({
  adapterFactory = createGarminAdapter,
  now = Date.now,
} = {}) {
  const accounts = new Map();
  function disconnect(tenant) {
    accounts.get(tenant)?.adapter?.close();
    accounts.delete(tenant);
  }
  function prune() {
    for (const [tenant, a] of accounts) {
      if (a.expires <= now()) disconnect(tenant);
      else if (a.preview?.expires <= now()) a.preview = null;
    }
  }
  const timer = setInterval(prune, 60_000);
  timer.unref();
  function account(tenant, connected = false) {
    prune();
    const a = accounts.get(tenant);
    if (!a || (connected && a.status !== "connected"))
      throw new Error("Connect your Garmin account in the local app first.");
    return a;
  }
  function status(tenant) {
    prune();
    const a = accounts.get(tenant);
    return {
      status: a?.status ?? "disconnected",
      expires_at_utc: a ? new Date(a.expires).toISOString() : null,
    };
  }
  async function locked(tenant, a, work) {
    if (a.busy)
      throw new Error("A Garmin request is already running. Please wait.");
    a.busy = true;
    let timeout;
    try {
      const result = await Promise.race([
        work(),
        new Promise((_, reject) => {
          timeout = setTimeout(() => {
            disconnect(tenant);
            reject(
              new Error("Garmin request timed out. Sign in again to retry."),
            );
          }, 60_000);
        }),
      ]);
      if (accounts.get(tenant) !== a)
        throw new Error("Garmin connection was closed. Sign in again.");
      return result;
    } finally {
      clearTimeout(timeout);
      a.busy = false;
    }
  }
  return {
    status,
    async authenticate(store, action, input) {
      if (!garminAuthSchemas[action])
        throw new Error("Unknown Garmin sign-in action");
      const args = garminAuthSchemas[action].parse(input),
        tenant = store.tenantId;
      let a;
      if (action === "login") {
        prune();
        const old = accounts.get(tenant);
        if (old?.busy || old?.retryAfter > now())
          throw new Error("Wait 30 seconds before signing in again.");
        disconnect(tenant);
        if (accounts.size >= 16)
          throw new Error("Too many Garmin connections. Try again later.");
        a = {
          adapter: adapterFactory(),
          status: "disconnected",
          expires: now() + MFA_TTL,
          retryAfter: now() + 30_000,
          listed: new Set(),
          preview: null,
        };
        accounts.set(tenant, a);
      } else {
        a = account(tenant);
        if (a.status !== "mfa_required")
          throw new Error("Start Garmin sign-in before entering a code.");
      }
      return locked(tenant, a, async () => {
        try {
          a.status =
            action === "login"
              ? await a.adapter.login(args.username, args.password)
              : await a.adapter.verify(args.code);
          a.expires =
            now() + (a.status === "connected" ? SESSION_TTL : MFA_TTL);
          return status(tenant);
        } catch {
          if (action === "login") {
            a.adapter.close();
            a.status = "disconnected";
          }
          throw new Error(
            action === "login"
              ? "Garmin sign-in failed. Check your credentials or Garmin account, then try again in 30 seconds."
              : "Garmin verification failed. Check the code and try again, or restart sign-in.",
          );
        }
      });
    },
    async execute(store, name, input) {
      const args = garminSchemas[name].parse(input),
        tenant = store.tenantId;
      if (name === "get_garmin_status") return status(tenant);
      if (name === "disconnect_garmin") {
        disconnect(tenant);
        return status(tenant);
      }
      const a = account(tenant, true);
      return locked(tenant, a, async () => {
        if (name === "list_garmin_activities") {
          const rows = await a.adapter.list(args.start);
          if (!Array.isArray(rows) || rows.length > 20)
            throw new Error("Garmin returned an unexpected activity list.");
          const activities = rows
            .filter(
              (r) => r.activityType?.typeKey === "stand_up_paddleboarding",
            )
            .filter(
              (r) =>
                (typeof r.activityId === "string" ||
                  Number.isSafeInteger(r.activityId)) &&
                /^[0-9]{1,20}$/.test(String(r.activityId)),
            )
            .map((r) => ({
              activity_id: String(r.activityId),
              name: String(r.activityName ?? "SUP activity").slice(0, 200),
              start_utc:
                typeof r.startTimeGMT === "string" &&
                /^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d(?:\.\d+)?Z?$/.test(
                  r.startTimeGMT,
                )
                  ? r.startTimeGMT.replace(" ", "T").replace(/Z?$/, "Z")
                  : null,
              distance_m: finite(r.distance),
              duration_s: finite(r.duration),
            }));
          for (const r of activities) a.listed.add(r.activity_id);
          while (a.listed.size > 200)
            a.listed.delete(a.listed.values().next().value);
          return {
            activities,
            start: args.start,
            next_start:
              rows.length === 20 && args.start < 10000 ? args.start + 20 : null,
          };
        }
        if (name === "preview_garmin_activity") {
          if (!a.listed.has(args.activity_id))
            throw new Error(
              "Choose an activity from the current Garmin list first.",
            );
          const bytes = await a.adapter.download(args.activity_id);
          if (
            !Buffer.isBuffer(bytes) ||
            !bytes.length ||
            bytes.length > GARMIN_FILE_LIMIT
          )
            throw new Error("Garmin file is empty or exceeds 30 MB.");
          const upload = {
            filename: `${args.activity_id}.${bytes[0] === 0x50 && bytes[1] === 0x4b ? "zip" : "fit"}`,
            data_base64: bytes.toString("base64"),
            timezone: args.timezone,
          };
          const result = await store.previewImportWithLaunch(upload);
          const preview_id = randomUUID();
          a.preview = {
            id: preview_id,
            upload,
            expires: now() + PREVIEW_TTL,
            source: {
              provider: "garmin_connect",
              activity_id: args.activity_id,
              retrieved_at_utc: new Date(now()).toISOString(),
            },
          };
          return { ...result, preview_id, import_source: a.preview.source };
        }
        if (
          !a.preview ||
          a.preview.id !== args.preview_id ||
          a.preview.expires <= now()
        )
          throw new Error(
            "Garmin preview expired. Preview the activity again.",
          );
        return store.commitImport(
          { ...a.preview.upload, ...args },
          a.preview.source,
        );
      });
    },
    close() {
      clearInterval(timer);
      for (const tenant of accounts.keys()) disconnect(tenant);
    },
  };
}
