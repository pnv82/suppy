import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { openDatabase } from "./database.mjs";
import { decodeUpload, importMatches } from "./fit-import.mjs";
import { analyzeTelemetry } from "../src/domain/analysis.mjs";
import { validRuns } from "../src/domain/metrics.mjs";

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
  function inspectImport(args) {
    const upload = decodeUpload(args);
    const matches = importMatches(upload.session, repo.sessions());
    matches.duplicate_session_id =
      repo.findImport(upload.provenance.fit_sha256) ??
      matches.duplicate_session_id;
    return { upload, matches };
  }
  function previewImport(args) {
    const { upload, matches } = inspectImport(args);
    const { records, ...summary } = upload.session;
    const stride = Math.max(1, Math.ceil(records.length / 400));
    const route = validRuns(records, upload.session.pauses, true, false)
      .flatMap((run) =>
        run.length < 2
          ? []
          : [
              run
                .filter(
                  (_, i) => i === 0 || i === run.length - 1 || i % stride === 0,
                )
                .map((p) => [p.latitude_deg, p.longitude_deg]),
            ],
      )
      .slice(0, 500);
    return {
      status: matches.duplicate_session_id ? "duplicate" : "preview",
      sha256: upload.provenance.original_sha256,
      summary,
      record_count: records.length,
      gps_count: records.filter((p) => p.latitude_deg !== null).length,
      route,
      ...matches,
    };
  }
  function commitImport(args) {
    const { upload, matches } = inspectImport(args);
    if (args.expected_sha256 !== upload.provenance.original_sha256)
      throw new Error("File changed since preview. Preview it again.");
    if (matches.duplicate_session_id) {
      repo.saveImport(upload, matches.duplicate_session_id);
      return { status: "duplicate", session_id: matches.duplicate_session_id };
    }
    if (args.target_session_id) {
      if (!matches.candidates.some((s) => s.id === args.target_session_id))
        throw new Error(
          "Selected session does not match this FIT's time and distance. Preview again.",
        );
      const target = get(args.target_session_id);
      if (target.records.length || target.hashes?.fit_sha256)
        throw new Error(
          "This session already has a FIT. Existing telemetry will not be replaced.",
        );
      // Keep historical summaries, names, boards, annotations, goals and source
      // provenance intact. Attach measured telemetry and derived evidence only.
      if (
        target.elapsed !== null &&
        Math.abs(target.elapsed * 60 - upload.session.elapsed * 60) > 60
      )
        throw new Error(
          "Historical elapsed duration differs by more than 60 s; review the session match.",
        );
      if (target.annotations.some((a) => a.end_s > upload.session.elapsed * 60))
        throw new Error(
          "Existing annotations exceed the imported duration; review the session match.",
        );
      for (const key of [
        "records",
        "pauses",
        "windows",
        "statistics",
        "deterministic",
        "deviceSummary",
        "timerEvents",
        "quality",
        "hashes",
        "startUtc",
        "elapsed",
      ])
        target[key] = upload.session[key];
      target.fitSourceRef = upload.session.sourceRef;
      target.revision++;
      repo.save(target);
      repo.saveImport(upload, target.id);
      return { status: "attached", session_id: target.id };
    }
    if (args.board_id !== null) requireBoard(args.board_id);
    const session = upload.session;
    session.boardId = args.board_id;
    if (args.launch_name?.trim()) {
      session.title = args.launch_name.trim();
      session.titleSource = "athlete_reported";
    }
    repo.insertSession(session, { provenance: upload.provenance });
    repo.saveImport(upload, session.id);
    return { status: "imported", session_id: session.id };
  }
  function dashboard() {
    const sessions = repo.sessions();
    return {
      sessions,
      boards: repo.boards().map((b) => ({
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
      deterministic:
        s.deterministic ??
        (s.elapsed == null
          ? null
          : analyzeTelemetry(records, s.pauses, s.elapsed * 60, s.sourceRef)),
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
    commitImport,
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
    previewImport,
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
