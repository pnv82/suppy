import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  bestWindows,
  numeric,
  timerPauses,
  latestSessions,
  sessionStatistics,
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
        titleSource: "source_location",
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
        boardId: null,
        records: track.records,
        pauses,
        windows: bestWindows(track.records, pauses),
        statistics: sessionStatistics(
          track.records,
          pauses,
          detail,
          numeric(source["Max HR bpm"]),
        ),
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
  const boards = [];
  let defaultBoardId = null;
  function get(id) {
    const s = sessions.find((s) => s.id === id);
    if (!s) throw new Error("Session not found");
    return s;
  }
  function dashboard() {
    return {
      sessions: latestSessions(sessions),
      boards: boards.map((b) => ({
        ...b,
        sessionCount: sessions.filter((s) => s.boardId === b.id).length,
      })),
      defaultBoardId,
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
      board: s.boardId
        ? {
            ...boards.find((b) => b.id === s.boardId),
            source: "athlete_reported",
          }
        : null,
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
        statistics:
          "speed_mps in m/s; heart_rate_bpm in bpm; distance_per_stroke.value_m in m/stroke; covered_s in seconds",
      },
      techniqueFocus: s.technique.map((id) => ({
        ...issues.find((i) => i.id === id),
        evidence_status: "athlete_reported",
      })),
      trackAvailable: records.length > 0,
      limitations: [
        "Local best windows are unreviewed estimates.",
        "Medians are time-weighted display estimates over covered intervals; gaps and pauses are excluded. Maxima retain their stated source and may include sensor spikes.",
        "Distance per stroke uses FIT session distance and watch-counted strokes; it is not validated biomechanical efficiency.",
        "Wind is nearby-station context, not an on-water measurement.",
        "Watch telemetry cannot diagnose stroke faults.",
        "Edits are held in this server process only.",
      ],
    };
  }
  function requireBoard(id) {
    const board = boards.find((b) => b.id === id);
    if (!board) throw new Error("Board not found.");
    return board;
  }
  function upsertBoard({ board_id, name }) {
    const clean = name.trim();
    if (!clean || clean.length > 100)
      throw new Error("Enter a board name of 1–100 characters.");
    if (
      boards.some(
        (b) =>
          b.id !== board_id && b.name.toLowerCase() === clean.toLowerCase(),
      )
    )
      throw new Error("A board with this name already exists.");
    if (board_id) {
      const board = requireBoard(board_id);
      if (board.name !== clean) {
        board.name = clean;
        sessions
          .filter((s) => s.boardId === board_id)
          .forEach((s) => s.revision++);
      }
      return board;
    }
    const board = { id: randomUUID(), name: clean };
    boards.push(board);
    return board;
  }
  function deleteBoard({ board_id }) {
    requireBoard(board_id);
    if (sessions.some((s) => s.boardId === board_id))
      throw new Error(
        "This board is assigned to a session. Change those assignments before deleting it.",
      );
    boards.splice(
      boards.findIndex((b) => b.id === board_id),
      1,
    );
    if (defaultBoardId === board_id) defaultBoardId = null;
    return { deleted: board_id };
  }
  function setDefaultBoard({ board_id }) {
    if (board_id !== null) requireBoard(board_id);
    defaultBoardId = board_id;
    return { defaultBoardId };
  }
  function assignBoard({ session_id, board_id }) {
    const session = get(session_id);
    if (board_id !== null) requireBoard(board_id);
    if (session.boardId !== board_id) {
      session.boardId = board_id;
      session.revision++;
    }
    return context(session_id);
  }
  function updateDetails({ session_id, name, board_id }) {
    const session = get(session_id);
    const clean = name.trim();
    if (!clean || clean.length > 100)
      throw new Error("Enter a launch name of 1–100 characters.");
    if (board_id !== null) requireBoard(board_id);
    if (session.title !== clean || session.boardId !== board_id) {
      if (session.title !== clean) session.titleSource = "athlete_reported";
      session.title = clean;
      session.boardId = board_id;
      session.revision++;
    }
    return context(session_id);
  }
  return {
    get,
    dashboard,
    addAnnotation,
    removeAnnotation,
    updateContext,
    updateFocus,
    context,
    upsertBoard,
    deleteBoard,
    setDefaultBoard,
    assignBoard,
    updateDetails,
    issues,
  };
}
