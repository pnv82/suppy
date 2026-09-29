import { createHash } from "node:crypto";
import { inflateRawSync, crc32 } from "node:zlib";
import { Decoder, Stream } from "@garmin/fitsdk";
import { sessionStatistics, timerPauses, mph } from "../src/domain/metrics.mjs";
import { analyzeTelemetry } from "../src/domain/analysis.mjs";

export const MAX_FILE_BYTES = 30_000_000;
export const DECODER_VERSION = "@garmin/fitsdk@21.217.0";
export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
const finite = (n, min = 0) => (Number.isFinite(n) && n >= min ? n : null);
const iso = (d) =>
  d instanceof Date && Number.isFinite(d.getTime()) ? d.toISOString() : null;

// Deliberately narrow ZIP adapter: one classic stored/deflated FIT, no disk
// extraction, ZIP64, encryption, paths, symlinks or additional entries.
export function unpackFit(bytes, filename) {
  if (!/\.(fit|zip)$/i.test(filename))
    throw new Error("Choose a Garmin .fit or one-FIT .zip file.");
  if (!bytes.length || bytes.length > MAX_FILE_BYTES)
    throw new Error("Choose a non-empty file up to 30 MB.");
  if (/\.fit$/i.test(filename)) return { fit: bytes, entry: null };
  const fail = () => {
    throw new Error(
      "Unsupported or corrupt ZIP. Use an unencrypted ZIP containing exactly one FIT file, or select the FIT directly.",
    );
  };
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (
      bytes.readUInt32LE(i) === 0x06054b50 &&
      i + 22 + bytes.readUInt16LE(i + 20) === bytes.length
    ) {
      end = i;
      break;
    }
  }
  if (
    end < 0 ||
    bytes.readUInt16LE(end + 4) ||
    bytes.readUInt16LE(end + 6) ||
    bytes.readUInt16LE(end + 8) !== 1 ||
    bytes.readUInt16LE(end + 10) !== 1
  )
    fail();
  const cd = bytes.readUInt32LE(end + 16),
    cdSize = bytes.readUInt32LE(end + 12);
  if (
    cd + cdSize !== end ||
    cd + 46 > end ||
    bytes.readUInt32LE(cd) !== 0x02014b50
  )
    fail();
  const flags = bytes.readUInt16LE(cd + 8),
    method = bytes.readUInt16LE(cd + 10),
    crc = bytes.readUInt32LE(cd + 16);
  const packed = bytes.readUInt32LE(cd + 20),
    size = bytes.readUInt32LE(cd + 24),
    nameLen = bytes.readUInt16LE(cd + 28);
  const offset = bytes.readUInt32LE(cd + 42);
  const entry = bytes.subarray(cd + 46, cd + 46 + nameLen).toString("utf8");
  if (
    flags & ~0x808 ||
    ![0, 8].includes(method) ||
    size === 0 ||
    size > MAX_FILE_BYTES ||
    packed > MAX_FILE_BYTES ||
    offset !== 0 ||
    bytes.readUInt16LE(cd + 34) ||
    ((bytes.readUInt32LE(cd + 38) >>> 16) & 0xf000) === 0xa000 ||
    !/^[^/\\\x00-\x1f:]+\.fit$/i.test(entry) ||
    cd +
      46 +
      nameLen +
      bytes.readUInt16LE(cd + 30) +
      bytes.readUInt16LE(cd + 32) !==
      end
  )
    fail();
  if (
    cd < 30 ||
    bytes.readUInt32LE(0) !== 0x04034b50 ||
    bytes.readUInt16LE(6) !== flags ||
    bytes.readUInt16LE(8) !== method
  )
    fail();
  const localName = bytes.readUInt16LE(26),
    start = 30 + localName + bytes.readUInt16LE(28);
  if (
    bytes.subarray(30, 30 + localName).toString("utf8") !== entry ||
    start + packed > cd
  )
    fail();
  if (
    !(flags & 8) &&
    (bytes.readUInt32LE(14) !== crc ||
      bytes.readUInt32LE(18) !== packed ||
      bytes.readUInt32LE(22) !== size ||
      start + packed !== cd)
  )
    fail();
  if (flags & 8) {
    let descriptor = start + packed;
    if (descriptor + 12 > cd) fail();
    if (bytes.readUInt32LE(descriptor) === 0x08074b50) descriptor += 4;
    if (
      descriptor + 12 !== cd ||
      bytes.readUInt32LE(descriptor) !== crc ||
      bytes.readUInt32LE(descriptor + 4) !== packed ||
      bytes.readUInt32LE(descriptor + 8) !== size
    )
      fail();
  }
  let fit;
  try {
    fit =
      method === 0
        ? bytes.subarray(start, start + packed)
        : inflateRawSync(bytes.subarray(start, start + packed), {
            maxOutputLength: MAX_FILE_BYTES,
          });
  } catch {
    fail();
  }
  if (fit.length !== size || crc32(fit) !== crc) fail();
  return { fit, entry };
}

export function decodeUpload({ filename, data_base64, timezone = "UTC" }) {
  if (
    typeof data_base64 !== "string" ||
    data_base64.length > 40_000_000 ||
    data_base64.length % 4 ||
    /[^A-Za-z0-9+/=]/.test(data_base64) ||
    /=/.test(data_base64.slice(0, -2)) ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(data_base64.slice(-4))
  )
    throw new Error("Invalid file encoding or file exceeds 30 MB.");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    throw new Error(
      "Choose a valid IANA display timezone, such as America/Los_Angeles or UTC.",
    );
  }
  const original = Buffer.from(data_base64, "base64");
  const { fit, entry } = unpackFit(original, filename);
  let decoded;
  try {
    const decoder = new Decoder(Stream.fromBuffer(fit));
    if (!decoder.isFIT() || !decoder.checkIntegrity())
      throw new Error("integrity");
    let count = 0;
    decoded = decoder.read({
      mergeHeartRates: false,
      includeUnknownData: false,
      mesgListener: () => {
        if (++count > 100_000) throw new Error("Too many FIT messages");
      },
    });
    if (decoded.errors.length) throw new Error("decode");
  } catch {
    throw new Error(
      "FIT integrity or decoding failed. Select a complete, valid FIT activity (up to 100,000 messages).",
    );
  }
  const messages = decoded.messages;
  if (
    messages.fileIdMesgs?.length !== 1 ||
    messages.fileIdMesgs[0].type !== "activity" ||
    messages.sessionMesgs?.length !== 1
  )
    throw new Error(
      "Import requires one activity with exactly one session; multisport files are unsupported.",
    );
  const fitSession = messages.sessionMesgs[0];
  if (fitSession.sport !== "standUpPaddleboarding")
    throw new Error(
      "This importer supports stand-up paddleboarding FIT activities only.",
    );
  const startUtc = iso(fitSession.startTime);
  const elapsed = finite(fitSession.totalElapsedTime);
  if (!startUtc || elapsed === null || elapsed <= 0 || elapsed > 604800)
    throw new Error(
      "FIT session needs a valid start time and elapsed duration up to seven days.",
    );
  const active = finite(fitSession.totalTimerTime);
  if (active !== null && active > elapsed + 1)
    throw new Error("FIT active duration exceeds elapsed duration.");
  const quality = new Map();
  const flag = (code) => quality.set(code, (quality.get(code) || 0) + 1);
  const startMs = Date.parse(startUtc);
  // FIT date_time has whole-second precision; total_elapsed_time has ms precision.
  // Keep the original timestamps/duration, allowing only the final partial second.
  const recordEnd = Math.ceil(elapsed);
  const endUtc = new Date(startMs + Math.round(elapsed * 1000)).toISOString();
  const secondsLabel = (seconds) => Number(seconds.toFixed(3));
  let last = -Infinity;
  const records = (messages.recordMesgs || []).map((r, index) => {
    const timestamp = iso(r.timestamp),
      t = timestamp ? (Date.parse(timestamp) - startMs) / 1000 : null;
    const reject = (reason) => {
      throw new Error(
        `FIT record ${index + 1} ${reason} Import stopped; no records were reordered or removed.`,
      );
    };
    if (t === null) reject("has a missing or invalid timestamp.");
    if (t === last)
      reject(
        `has a duplicate timestamp (${timestamp}), the same as record ${index}.`,
      );
    if (t < last)
      reject(
        `goes backward by ${secondsLabel(last - t)} s (${timestamp}; record ${index}: ${iso(messages.recordMesgs[index - 1].timestamp)}).`,
      );
    if (t < 0)
      reject(
        `is ${secondsLabel(-t)} s before the session start (${timestamp}; start: ${startUtc}).`,
      );
    if (t > recordEnd)
      reject(
        `is ${secondsLabel(t - elapsed)} s after the session end (${timestamp}; end: ${endUtc}; elapsed: ${elapsed} s), beyond FIT whole-second timestamp precision.`,
      );
    if (t > elapsed) flag("record_timestamp_end_precision");
    if (t - last > 15 && index) flag("telemetry_gap_over_15s");
    last = t;
    let lat = Number.isFinite(r.positionLat)
      ? (r.positionLat * 180) / 2 ** 31
      : null;
    let lon = Number.isFinite(r.positionLong)
      ? (r.positionLong * 180) / 2 ** 31
      : null;
    if (
      lat === null ||
      lon === null ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    ) {
      lat = lon = null;
      flag("missing_or_invalid_gps");
    }
    const distance = finite(r.distance);
    if (distance === null) flag("missing_or_invalid_distance");
    return {
      timestamp_utc: timestamp,
      elapsed_s: t,
      latitude_deg: lat,
      longitude_deg: lon,
      distance_m: distance,
      speed_mps: finite(r.enhancedSpeed) ?? finite(r.speed),
      heart_rate_bpm: finite(r.heartRate, 1),
      temperature_c: Number.isFinite(r.temperature) ? r.temperature : null,
      cadence_raw: finite(r.cadence),
      cadence_fractional_raw: finite(r.fractionalCadence),
      cadence_256_raw: finite(r.cadence256),
      gps_accuracy_m: finite(r.gpsAccuracy),
      source_record_index: index,
    };
  });
  const events = (messages.eventMesgs || [])
    .filter((e) => e.event === "timer")
    .map((e, index) => ({
      timestamp: iso(e.timestamp),
      event: "timer",
      event_type: typeof e.eventType === "string" ? e.eventType : "unknown",
      source_event_index: index,
    }));
  if (
    events.some(
      (e) =>
        !e.timestamp ||
        Date.parse(e.timestamp) < Date.parse(startUtc) ||
        Date.parse(e.timestamp) > Date.parse(startUtc) + (elapsed + 1) * 1000,
    )
  )
    throw new Error("FIT timer events have invalid session timestamps.");
  let pauses = timerPauses(events, startUtc, elapsed);
  const pauseSeconds = pauses.reduce((sum, p) => sum + p.end - p.start, 0);
  if (active !== null && Math.abs(elapsed - active - pauseSeconds) > 2) {
    flag("timer_summary_event_mismatch");
    // Unknown pause boundaries cannot support a continuous elapsed effort.
    pauses = [
      { start: 0, end: elapsed, reason: "unresolved_timer_boundaries" },
    ];
  }
  if (!events.length) flag("timer_events_unavailable");
  for (let i = 1; i < records.length; i++) {
    const a = records[i - 1],
      b = records[i];
    if (
      a.distance_m !== null &&
      b.distance_m !== null &&
      (b.distance_m < a.distance_m ||
        (b.distance_m - a.distance_m) / (b.elapsed_s - a.elapsed_s) > 8)
    )
      flag("distance_reset_or_spike");
  }
  const fitHash = sha256(fit),
    sourceRef = `fit:sha256:${fitHash}`;
  const device = {
    sport: "stand_up_paddleboarding",
    total_elapsed_time: elapsed,
    total_timer_time: active,
    avg_speed_mps: finite(fitSession.enhancedAvgSpeed ?? fitSession.avgSpeed),
    avg_heart_rate: finite(fitSession.avgHeartRate, 1),
    avg_cadence_raw: finite(fitSession.avgCadence),
    total_distance: finite(fitSession.totalDistance),
    total_strokes: finite(fitSession.totalStrokes),
    enhanced_max_speed: finite(
      fitSession.enhancedMaxSpeed ?? fitSession.maxSpeed,
    ),
    max_heart_rate: finite(fitSession.maxHeartRate, 1),
  };
  const analysis = analyzeTelemetry(records, pauses, elapsed, sourceRef);
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    local.formatToParts(new Date(startUtc)).map((p) => [p.type, p.value]),
  );
  const firstGps = records.find((r) => r.latitude_deg !== null);
  const session = {
    id: `fit-${fitHash}`,
    date: `${parts.year}-${parts.month}-${parts.day}`,
    timezone,
    timezoneSource: "import_selection",
    startUtc,
    start: `${parts.hour}:${parts.minute}`,
    end: new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(Date.parse(startUtc) + elapsed * 1000)),
    title: firstGps
      ? `Launch ${firstGps.latitude_deg.toFixed(4)}, ${firstGps.longitude_deg.toFixed(4)}`
      : "Unknown launch",
    titleSource: "coordinate_fallback",
    location: null,
    type: "SUP",
    distance:
      device.total_distance === null ? null : device.total_distance / 1609.344,
    active: active === null ? null : active / 60,
    elapsed: elapsed / 60,
    avgSpeed: mph(finite(fitSession.enhancedAvgSpeed ?? fitSession.avgSpeed)),
    avgHr: finite(fitSession.avgHeartRate, 1),
    cadence: finite(fitSession.avgCadence),
    best5: mph(analysis.windows[0].speed_mps),
    best10: mph(analysis.windows[1].speed_mps),
    best20: mph(analysis.windows[2].speed_mps),
    metricSources: {
      summary: "fit_session",
      best: "elapsed_continuous_v1",
      cadence: "raw_fit_cadence",
    },
    wind: null,
    windFrom: null,
    station: null,
    weatherQuality: null,
    hrQuality: null,
    benchmarkQuality: "deterministic_unreviewed",
    notes: "",
    paddle: null,
    boardId: null,
    records,
    pauses,
    windows: analysis.windows,
    statistics: sessionStatistics(records, pauses, device),
    deterministic: analysis,
    deviceSummary: device,
    timerEvents: events,
    quality: [...quality].map(([code, count]) => ({ code, count })),
    annotations: [],
    additionalContext: "",
    technique: [],
    goal: { speed_mph: null, duration_min: 20 },
    revision: 0,
    sourceRef,
    hashes: {
      fit_sha256: fitHash,
      archive_sha256: entry ? sha256(original) : null,
    },
  };
  return {
    session,
    original,
    fit,
    provenance: {
      filename,
      archive_entry: entry,
      original_sha256: sha256(original),
      fit_sha256: fitHash,
      decoder: DECODER_VERSION,
      fit_crc_ok: true,
      zip_crc_ok: entry ? true : null,
      imported_at_utc: new Date().toISOString(),
      id_source: "fit_sha256",
      source_ranges: {
        records: [0, records.length],
        record_range_convention: "zero_based_half_open",
      },
      raw_session: fitSession,
      raw_timer_events: messages.eventMesgs || [],
      raw_laps: messages.lapMesgs || [],
      raw_device_info: messages.deviceInfoMesgs || [],
      raw_file_id: messages.fileIdMesgs || [],
    },
  };
}

export function importMatches(session, sessions) {
  const duplicate = sessions.find(
    (s) => s.hashes?.fit_sha256 === session.hashes.fit_sha256,
  );
  const candidates = sessions
    .filter((s) => {
      const closeDistance =
        s.distance !== null &&
        session.distance !== null &&
        Math.abs(s.distance - session.distance) * 1609.344 <=
          Math.max(100, session.distance * 1609.344 * 0.02);
      if (!closeDistance) return false;
      if (s.startUtc)
        return (
          Math.abs(Date.parse(s.startUtc) - Date.parse(session.startUtc)) <=
          60_000
        );
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: s.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(new Date(session.startUtc));
      const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
      return (
        s.date === `${p.year}-${p.month}-${p.day}` &&
        s.start?.slice(0, 5) === `${p.hour}:${p.minute}`
      );
    })
    .map((s) => ({
      id: s.id,
      title: s.title,
      date: s.date,
      has_track: s.records.length > 0,
      reason:
        "Start within 60 s (or same historical local minute) and distance within 2% / 100 m.",
    }));
  return { duplicate_session_id: duplicate?.id ?? null, candidates };
}
