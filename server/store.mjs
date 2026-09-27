import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { openDatabase } from "./database.mjs";

export function createStore({
  database,
  dbPath,
  tenantId = process.env.SUP_TENANT_ID || "local",
} = {}) {
  const owned = !database;
  database ??= openDatabase(dbPath);
  if (owned) database.createTenant(tenantId);
  const repo = database.forTenant(tenantId);
  const issues = JSON.parse(
    readFileSync(
      new URL("../data/reference/technique-issues.json", import.meta.url),
      "utf8",
    ),
  ).issues;
  const get = repo.get;
  function dashboard() {
    const sessions = repo.sessions();
    return {
      sessions,
      boards: repo
        .boards()
        .map((b) => ({
          ...b,
          sessionCount: sessions.filter((s) => s.boardId === b.id).length,
        })),
      defaultBoardId: repo.defaultBoard(),
      issues,
      storage: "sqlite",
      tenantId,
    };
  }
  function changeSession(id, change) {
    const session = get(id);
    const result = change(session);
    repo.save(session);
    return result ?? session;
  }
  function addAnnotation(args) {
    return changeSession(args.session_id, (session) => {
      if (
        !Number.isFinite(args.start_s) ||
        !Number.isFinite(args.end_s) ||
        session.elapsed == null ||
        args.start_s < 0 ||
        args.end_s < args.start_s ||
        args.end_s > session.elapsed * 60
      )
        throw new Error(
          "Annotation must be inside the session, with end at or after start.",
        );
      let annotation;
      if (args.annotation_id) {
        annotation = session.annotations.find(
          (a) => a.id === args.annotation_id,
        );
        if (!annotation) throw new Error("Annotation not found");
        Object.assign(annotation, { ...args, id: annotation.id });
      } else {
        annotation = { ...args, id: randomUUID(), source: "athlete_reported" };
        session.annotations.push(annotation);
      }
      session.revision++;
      return annotation;
    });
  }
  function removeAnnotation({ session_id, annotation_id }) {
    return changeSession(session_id, (s) => {
      const i = s.annotations.findIndex((a) => a.id === annotation_id);
      if (i < 0) throw new Error("Annotation not found");
      s.annotations.splice(i, 1);
      s.revision++;
    });
  }
  function updateContext({ session_id, note }) {
    return changeSession(session_id, (s) => {
      s.additionalContext = note;
      s.revision++;
    });
  }
  function updateFocus({
    session_id,
    goal_speed_mph,
    goal_duration_min,
    technique_ids,
  }) {
    if (technique_ids.some((id) => !issues.some((i) => i.id === id)))
      throw new Error("Unknown technique dictionary entry.");
    return changeSession(session_id, (s) => {
      s.goal = { speed_mph: goal_speed_mph, duration_min: goal_duration_min };
      s.technique = [...new Set(technique_ids)];
      s.revision++;
    });
  }
  function context(id) {
    const s = get(id);
    const { records, hashes, ...summary } = s;
    return {
      ...summary,
      board: s.boardId
        ? {
            ...repo.boards().find((b) => b.id === s.boardId),
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
      ],
    };
  }

  function requireBoard(id) {
    const board = repo.boards().find((b) => b.id === id);
    if (!board) throw new Error("Board not found.");
    return board;
  }
  function upsertBoard({ board_id, name }) {
    const clean = name.trim();
    if (!clean || clean.length > 100)
      throw new Error("Enter a board name of 1–100 characters.");
    if (
      repo
        .boards()
        .some(
          (b) =>
            b.id !== board_id && b.name.toLowerCase() === clean.toLowerCase(),
        )
    )
      throw new Error("A board with this name already exists.");
    if (board_id) {
      const board = requireBoard(board_id);
      if (board.name !== clean) {
        board.name = clean;
        repo.renameBoard(board);
        for (const session of repo
          .sessions()
          .filter((s) => s.boardId === board_id)) {
          session.revision++;
          repo.save(session);
        }
      }
      return board;
    }
    const board = { id: randomUUID(), name: clean };
    repo.insertBoard(board);
    return board;
  }
  function deleteBoard({ board_id }) {
    requireBoard(board_id);
    if (repo.sessions().some((s) => s.boardId === board_id))
      throw new Error(
        "This board is assigned to a session. Change those assignments before deleting it.",
      );
    if (repo.defaultBoard() === board_id) repo.setDefaultBoard(null);
    repo.deleteBoard(board_id);
    return { deleted: board_id };
  }
  function setDefaultBoard({ board_id }) {
    if (board_id !== null) requireBoard(board_id);
    repo.setDefaultBoard(board_id);
    return { defaultBoardId: board_id };
  }
  function assignBoard({ session_id, board_id }) {
    if (board_id !== null) requireBoard(board_id);
    changeSession(session_id, (s) => {
      if (s.boardId !== board_id) {
        s.boardId = board_id;
        s.revision++;
      }
    });
    return context(session_id);
  }
  function updateDetails({ session_id, name, board_id }) {
    const clean = name.trim();
    if (!clean || clean.length > 100)
      throw new Error("Enter a launch name of 1–100 characters.");
    if (board_id !== null) requireBoard(board_id);
    changeSession(session_id, (s) => {
      if (s.title !== clean || s.boardId !== board_id) {
        if (s.title !== clean) s.titleSource = "athlete_reported";
        s.title = clean;
        s.boardId = board_id;
        s.revision++;
      }
    });
    return context(session_id);
  }
  const writes = {
    addAnnotation,
    removeAnnotation,
    updateContext,
    updateFocus,
    upsertBoard,
    deleteBoard,
    setDefaultBoard,
    assignBoard,
    updateDetails,
  };
  return {
    get,
    dashboard,
    context,
    issues,
    tenantId,
    close: () => {
      if (owned) database.close();
    },
    ...Object.fromEntries(
      Object.entries(writes).map(([name, fn]) => [
        name,
        (args) => repo.transaction(() => fn(args)),
      ]),
    ),
  };
}
