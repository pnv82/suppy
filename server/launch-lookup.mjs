import { mappedLaunchCandidates } from "./launch-map-candidates.mjs";

export const LAUNCH_PROVIDER = "https://overpass-api.de/api/interpreter";

export function launchQuery(start) {
  if (
    !Number.isFinite(start?.latitude) ||
    Math.abs(start.latitude) > 90 ||
    !Number.isFinite(start?.longitude) ||
    Math.abs(start.longitude) > 180
  )
    throw new Error("Invalid launch coordinates");
  const near = `(around:750,${start.latitude},${start.longitude})`;
  return `[out:json][timeout:15][maxsize:16777216];(nwr${near}[name][natural~"^(beach|cape|bay)$"];nwr${near}[name][leisure~"^(park|marina)$"];nwr${near}[name][waterway=slipway];nwr${near}[name][canoe~"^(put_in|egress)$"];);out geom 500;`;
}

// The user approved this exact endpoint for start-coordinate lookup. Send no
// session identity, timestamps, telemetry or files. Never follow redirects.
export function createLaunchLookup({
  fetchImpl = fetch,
  timeoutMs = 20000,
  intervalMs = 1100,
} = {}) {
  let pending = false,
    nextRequest = 0;
  return async (start) => {
    if (pending || Date.now() < nextRequest)
      throw new Error("Geographic lookup busy");
    const query = launchQuery(start);
    pending = true;
    try {
      const url = new URL(LAUNCH_PROVIDER);
      url.searchParams.set("data", query);
      const response = await fetchImpl(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Suppy/0.1 (https://github.com/pnv82/suppy)",
        },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
      });
      if (!response.ok)
        throw new Error(`Geographic provider HTTP ${response.status}`);
      const reader = response.body.getReader(),
        chunks = [];
      let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 2_000_000) {
            await reader.cancel();
            throw new Error("Geographic response too large");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      return mappedLaunchCandidates(
        JSON.parse(Buffer.concat(chunks).toString("utf8")),
        start,
        new Date().toISOString(),
      ).map((candidate) => ({ ...candidate, provider_url: LAUNCH_PROVIDER }));
    } finally {
      pending = false;
      nextRequest = Date.now() + intervalMs;
    }
  };
}

// One provider request at a time per app process. No mirror rotation or automatic retries.
export const lookupLaunchPlaces = createLaunchLookup();
