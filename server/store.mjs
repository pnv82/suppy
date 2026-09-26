import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  bestWindows,
  numeric,
  timerPauses,
  latestSessions,
} from "../src/domain/metrics.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) =>
  JSON.parse(readFileSync(root + path, "utf8").replace(/^\uFEFF/, ""));
export function createStore() {
  const snapshot = read("data/snapshots/google-sheets/source-snapshot.json");
  const manifest = read("data/samples/garmin/manifest.json");
  const inventory = read("data/derived/fit-inventory.json");
  const raw = snapshot.ranges.find((r) =>
    r.range.startsWith("Sessions!"),
  ).values;
  const sessions = raw
    .slice(1)
    .filter((r) => r[0])
    .map((row) => {
      const source = Object.fromEntries(
        raw[0].map((header, i) => [header, row[i] ?? null]),
      );
      const id = source["Session ID"];
      const file = `data/derived/${id}-track.json`;
      const track = existsSync(root + file)
        ? read(file)
        : { records: [], events: [] };
      const detail = inventory.samples.find((s) => s.session_id === id)
        ?.sessions[0];
      const elapsed =
        detail?.total_elapsed_time ?? numeric(source["Duration min"]) * 60;
      const pauses = timerPauses(track.events, track.start_time_utc, elapsed);
      return {
        id,
        date: source.Date,
        start: source.Start,
        end: source.End,
        title: source.Location.includes("Liberty")
          ? "Liberty Station"
          : "Mission Bay",
        location: source.Location,
        type: source["Session type"],
        distance: numeric(source["Distance mi"]),
        active: numeric(source["Duration min"]),
        elapsed: elapsed / 60,
        avgSpeed: numeric(source["Avg speed mph"]),
        avgHr: numeric(source["Avg HR bpm"]),
        cadence: numeric(source["Avg cadence spm"]),
        best5: numeric(source["Best 5m mph"]),
        best10: numeric(source["Best 10m mph"]),
        best20: numeric(source["Best 20m mph"]),
        wind: numeric(source["Wind mph"]),
        windFrom: numeric(source["Wind dir °"]),
        station: source["Weather station"],
        weatherQuality: source["Weather quality"],
        hrQuality: source["HR quality"],
        benchmarkQuality: source["Benchmark quality"],
        notes: source.Notes,
        paddle: source["Paddle model"],
        records: track.records,
        pauses,
        windows: bestWindows(track.records, pauses),
        annotations: [],
        additionalContext: "",
        technique: [],
        goal: { speed_mph: null, duration_min: 20 },
        revision: 0,
        sourceRef: `${snapshot.source_url}#gid=2033518345`,
        hashes: manifest.samples.find((s) => s.session_id === id) ?? null,
        startUtc: track.start_time_utc ?? null,
      };
    });
  const issues = read("data/reference/technique-issues.json").issues;
  function get(id) {
    const s = sessions.find((s) => s.id === id);
    if (!s) throw new Error("Session not found");
    return s;
  }
  function dashboard() {
    return {
      sessions: latestSessions(sessions),
      issues,
      snapshotAt: snapshot.captured_at,
      sourceUrl: snapshot.source_url,
      storage: "memory",
    };
  }
  function addAnnotation(args) {
    const session = get(args.session_id);
    if (
      args.start_s < 0 ||
      args.end_s < args.start_s ||
      args.end_s > session.elapsed * 60
    )
      throw new Error(
        "Annotation must be inside the session, with end at or after start.",
      );
    let annotation;
    if (args.annotation_id) {
      annotation = session.annotations.find((a) => a.id === args.annotation_id);
      if (!annotation) throw new Error("Annotation not found");
      Object.assign(annotation, { ...args, id: annotation.id });
    } else {
      annotation = { ...args, id: randomUUID(), source: "athlete_reported" };
      session.annotations.push(annotation);
    }
    session.revision++;
    return annotation;
  }
  function removeAnnotation({ session_id, annotation_id }) {
    const s = get(session_id),
      i = s.annotations.findIndex((a) => a.id === annotation_id);
    if (i < 0) throw new Error("Annotation not found");
    s.annotations.splice(i, 1);
    s.revision++;
    return s;
  }
  function updateContext({ session_id, note }) {
    const s = get(session_id);
    s.additionalContext = note;
    s.revision++;
    return s;
  }
  function updateFocus({
    session_id,
    goal_speed_mph,
    goal_duration_min,
    technique_ids,
  }) {
    if (technique_ids.some((id) => !issues.some((i) => i.id === id)))
      throw new Error("Unknown technique dictionary entry.");
    const s = get(session_id);
    s.goal = { speed_mph: goal_speed_mph, duration_min: goal_duration_min };
    s.technique = [...new Set(technique_ids)];
    s.revision++;
    return s;
  }
  function context(id) {
    const s = get(id);
    const { records, hashes, ...summary } = s;
    return {
      ...summary,
      units: {
        distance: "mi",
        active: "min",
        elapsed: "min",
        avgSpeed: "mph",
        best5: "mph",
        best10: "mph",
        best20: "mph",
        wind: "mph",
        windFrom: "degrees_from_north",
        avgHr: "bpm",
        cadence: "spm",
        windows: "elapsed seconds and m/s",
      },
      techniqueFocus: s.technique.map((id) => ({
        ...issues.find((i) => i.id === id),
        evidence_status: "athlete_reported",
      })),
      trackAvailable: records.length > 0,
      limitations: [
        "Local best windows are unreviewed estimates.",
        "Wind is nearby-station context, not an on-water measurement.",
        "Watch telemetry cannot diagnose stroke faults.",
        "Edits are held in this server process only.",
      ],
    };
  }
  return {
    get,
    dashboard,
    addAnnotation,
    removeAnnotation,
    updateContext,
    updateFocus,
    context,
    issues,
  };
}
