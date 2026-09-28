import { createHash } from "node:crypto";
import {
  distanceMetres,
  summarizeWeather,
  WEATHER_POLICY,
} from "../../src/domain/weather.mjs";

const CATALOG =
  "https://mesonet.agron.iastate.edu/geojson/network/AZOS.geojson";
const ENDPOINT = "https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py";
const hash = (text) => createHash("sha256").update(text).digest("hex");
const number = (value, min, max) => {
  if (value == null || !/^[-+]?\d+(\.\d+)?$/.test(value.trim())) return null;
  const n = Number(value);
  return n >= min && n <= max ? n : null;
};
export function parseCsv(text) {
  const rows = [];
  let row = [],
    value = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === "," || c === "\n")) {
      row.push(value.replace(/\r$/, ""));
      value = "";
      if (c === "\n") {
        if (row.length > 1) rows.push(row);
        row = [];
      }
    } else value += c;
  }
  if (quoted) throw new Error("Weather provider returned malformed CSV.");
  if (row.length || value) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}
export function normalizeObservations(text, station, start, end) {
  const rows = parseCsv(text),
    header = rows.shift() || [];
  if (
    ![
      "station",
      "valid",
      "lat",
      "lon",
      "tmpf",
      "drct",
      "sknt",
      "gust",
      "relh",
      "metar",
    ].every((k) => header.includes(k))
  )
    throw new Error(
      "Weather provider returned an unexpected observation format.",
    );
  if (rows.length > 10000)
    throw new Error("Weather response exceeds the observation limit.");
  const found = new Map();
  rows.forEach((r, index) => {
    const v = Object.fromEntries(header.map((k, i) => [k, r[i]]));
    if (v.station !== station.id) return;
    const lat = number(v.lat, -90, 90),
      lon = number(v.lon, -180, 180);
    if (
      lat === null ||
      lon === null ||
      distanceMetres(station, { latitude: lat, longitude: lon }) > 1000
    )
      return;
    if (!/^\d{4}-\d\d-\d\d \d\d:\d\d(:\d\d)?$/.test(v.valid || "")) return;
    const t = Date.parse(v.valid.replace(" ", "T") + "Z");
    if (!Number.isFinite(t) || t < start || t > end) return;
    const wind = number(v.sknt, 0, 250),
      direction = number(v.drct, 0, 360),
      gust = number(v.gust, 0, 250),
      temp = number(v.tmpf, -148, 140);
    const o = {
      observed_at_utc: new Date(t).toISOString(),
      wind_speed_mps: wind === null ? null : (wind * 1852) / 3600,
      wind_from_deg:
        wind === 0 || direction === null || /\bVRB\d/.test(v.metar || "")
          ? null
          : direction % 360,
      gust_mps: gust === null ? null : (gust * 1852) / 3600,
      temperature_c: temp === null ? null : ((temp - 32) * 5) / 9,
      relative_humidity_pct: number(v.relh, 0, 100),
      raw_metar: (v.metar || "").slice(0, 3000),
      source_row: index + 2,
    };
    if (
      [o.wind_speed_mps, o.temperature_c, o.relative_humidity_pct].every(
        (n) => n === null,
      )
    )
      return;
    // Prefer the most complete correction when a timestamp is repeated.
    const old = found.get(t),
      count = (x) => Object.values(x).filter(Number.isFinite).length;
    if (!old || count(o) >= count(old)) found.set(t, o);
  });
  return [...found.values()].sort((a, b) =>
    a.observed_at_utc.localeCompare(b.observed_at_utc),
  );
}
export function createIemProvider({
  fetchImpl = fetch,
  now = () => Date.now(),
  timeoutMs = 20000,
} = {}) {
  let catalogPromise,
    catalogAt = 0,
    queue = Promise.resolve(),
    lastRequest = 0;
  async function read(url, maxBytes) {
    // IEM requests are serialized and spaced at least one second apart.
    const operation = queue.then(async () => {
      const delay = Math.max(0, 1050 - (Date.now() - lastRequest));
      if (delay) await new Promise((r) => setTimeout(r, delay));
      lastRequest = Date.now();
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
        headers: {
          Accept: "application/json,text/csv,*/*",
          "User-Agent": "SUP-Training-local/1.0",
        },
      });
      if (!response.ok)
        throw new Error(
          `Weather provider returned HTTP ${response.status}. Retry later.`,
        );
      const reader = response.body.getReader();
      let size = 0,
        chunks = [];
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > maxBytes)
            throw new Error("Weather response exceeds the size limit.");
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      return Buffer.concat(chunks).toString("utf8");
    });
    queue = operation.catch(() => {});
    return operation;
  }
  async function stations() {
    if (!catalogPromise || now() - catalogAt > 86400000) {
      catalogAt = now();
      catalogPromise = read(CATALOG, 12000000)
        .then((text) => {
          const json = JSON.parse(text);
          if (!Array.isArray(json.features) || json.features.length > 30000)
            throw new Error("Weather station catalog is invalid.");
          return { hash: hash(text), features: json.features };
        })
        .catch((e) => {
          catalogPromise = null;
          throw e;
        });
    }
    return catalogPromise;
  }
  return {
    async retrieve(input) {
      const start = Date.parse(input.start_utc),
        end = Date.parse(input.end_utc);
      if (end > now() + 60000)
        return {
          status: "unavailable",
          message:
            "This session ends in the future. Historical observations are not available yet.",
        };
      const catalog = await stations();
      const candidates = catalog.features
        .flatMap((f) => {
          const p = f.properties || {},
            [longitude, latitude] = f.geometry?.coordinates || [];
          if (
            !/^[A-Z0-9]{2,8}$/.test(f.id) ||
            !/^[A-Z0-9_]+ASOS$/.test(p.network) ||
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude) ||
            Math.abs(latitude) > 90 ||
            Math.abs(longitude) > 180 ||
            (p.archive_begin && Date.parse(p.archive_begin) > end) ||
            (p.archive_end && Date.parse(p.archive_end) < start)
          )
            return [];
          const station = {
            id: f.id,
            name: String(p.sname || f.id).slice(0, 120),
            network: p.network,
            latitude,
            longitude,
          };
          station.distance_m = distanceMetres(input, station);
          return station.distance_m <= WEATHER_POLICY.station_radius_m
            ? [station]
            : [];
        })
        .sort((a, b) => a.distance_m - b.distance_m || a.id.localeCompare(b.id))
        .slice(0, WEATHER_POLICY.candidate_limit);
      if (!candidates.length)
        return {
          status: "unavailable",
          message:
            "No supported weather station within 50 km of the recorded launch point.",
        };
      const url = new URL(ENDPOINT);
      const queryStart = start - 3600000,
        queryEnd = Math.min(end + 3600000, now());
      for (const [key, value] of Object.entries({
        station: candidates.map((s) => s.id).join(","),
        network: [...new Set(candidates.map((s) => s.network))].join(","),
        data: "tmpf,drct,sknt,gust,relh,metar",
        sts: new Date(queryStart).toISOString(),
        ets: new Date(queryEnd).toISOString(),
        tz: "UTC",
        format: "onlycomma",
        latlon: "yes",
        missing: "M",
        report_type: "3,4",
      }))
        url.searchParams.set(key, value);
      const raw = await read(url.href, 2000000);
      const choices = candidates.map((station) => {
        const observations = normalizeObservations(
          raw,
          station,
          queryStart,
          queryEnd,
        );
        return {
          station,
          observations,
          summary: summarizeWeather(
            observations,
            input.start_utc,
            input.end_utc,
          ),
        };
      });
      choices.sort(
        (a, b) =>
          b.summary.wind_speed_mps.covered_s -
            a.summary.wind_speed_mps.covered_s ||
          b.summary.temperature_c.covered_s -
            a.summary.temperature_c.covered_s ||
          a.station.distance_m - b.station.distance_m,
      );
      const chosen = choices[0],
        source = {
          provider: "Iowa Environmental Mesonet",
          dataset: "ASOS/AWOS routine and special METAR observations",
          kind: "station_observation",
          url: url.href,
          documentation_url: `${ENDPOINT}?help`,
          catalog_url: CATALOG,
          catalog_sha256: catalog.hash,
          response_sha256: hash(raw),
          retrieved_at_utc: new Date(now()).toISOString(),
          adapter: "iem_asos_v1",
        };
      if (!chosen.observations.length)
        return {
          status: "unavailable",
          message:
            "No usable station observations were returned for this session. Recent reports may be delayed; retry later.",
          source,
          candidates,
          provenance: { source, raw_response: raw },
        };
      return {
        status:
          chosen.summary.wind_speed_mps.coverage_pct >= 99.999
            ? "ready"
            : "partial",
        data: {
          ...chosen,
          source,
          policy: WEATHER_POLICY,
          input,
          candidates,
          units: {
            wind_speed_mps: "m/s",
            gust_mps: "m/s",
            temperature_c: "°C",
            relative_humidity_pct: "%",
            wind_from_deg: "degrees clockwise from north",
            distance_m: "m",
          },
          limitations: [
            "Airport observations are nearby context, not measurements on the water.",
            "One station represents the session; route-wide wind fields and coastal shelter are not inferred.",
            "Provider observations have limited quality control; no causal speed correction is applied.",
          ],
        },
        provenance: { source, raw_response: raw },
      };
    },
  };
}
