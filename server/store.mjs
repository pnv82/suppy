import { readFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { openDatabase } from "./database.mjs";
import { decodeUpload, importMatches } from "./fit-import.mjs";
import { analyzeTelemetry, ANALYSIS_METHOD } from "../src/domain/analysis.mjs";
import { validRuns } from "../src/domain/metrics.mjs";
import { presentWeather } from "../src/domain/weather.mjs";
import { launchPoint, launchSuggestions } from "./launch-names.mjs";
import { lookupLaunchPlaces } from "./launch-lookup.mjs";
import { longestCadenceRun } from "../src/domain/goals.mjs";
import { customIntervalEvidence } from "../src/domain/intervals.mjs";
// Reuse calculations across request-scoped stores, never across database or tenant boundaries.
const databaseAnalysisCaches = new WeakMap();
const databaseLaunchCaches = new WeakMap();

export function createStore({
  database,
  dbPath,
  tenantId = process.env.SUP_TENANT_ID || "local",
  launchLookup = lookupLaunchPlaces,
} = {}) {
  const owned = !database;
  database ??= openDatabase(dbPath);
  if (owned) database.createTenant(tenantId);
  const repo = database.forTenant(tenantId);
  const launchCatalog = JSON.parse(
    readFileSync(
      new URL("../data/reference/launch-places.json", import.meta.url),
      "utf8",
    ),
  );
  const issues = JSON.parse(
    readFileSync(
      new URL("../data/reference/technique-issues.json", import.meta.url),
      "utf8",
    ),
  ).issues;
  const get = repo.get;
  if (!databaseAnalysisCaches.has(database))
    databaseAnalysisCaches.set(database, new Map());
  const tenantCaches = databaseAnalysisCaches.get(database);
  if (!tenantCaches.has(tenantId)) tenantCaches.set(tenantId, new Map());
  const analysisCache = tenantCaches.get(tenantId);
  if (!databaseLaunchCaches.has(database))
    databaseLaunchCaches.set(database, new Map());
  const launchTenants = databaseLaunchCaches.get(database);
  if (!launchTenants.has(tenantId)) launchTenants.set(tenantId, new Map());
  const launchCache = launchTenants.get(tenantId);
  const launchKey = (session) => JSON.stringify(launchPoint(session));
  const cachedLaunches = (session) => {
    const entry = launchCache.get(launchKey(session));
    return entry?.expires > Date.now() ? (entry.candidates ?? []) : [];
  };
  function withMetrics(session) {
    const cadenceGoals = repo
      .goals()
      .filter((g) => g.metric === "cadence_duration");
    session = {
      ...session,
      goalMetrics: Object.fromEntries(
        cadenceGoals.map((g) => [
          g.id,
          longestCadenceRun(
            session.records,
            session.pauses,
            g.cadence_threshold_spm,
          ),
        ]),
      ),
    };
    session = {
      ...session,
      llmSummary: session.llmSummary
        ? {
            ...session.llmSummary,
            stale: session.llmSummary.context_revision !== session.revision,
          }
        : null,
    };
    if (!Number.isFinite(session.elapsed))
      return {
        ...session,
        deterministic: null,
        windows: (session.windows || []).map((w) => ({
          ...w,
          start: null,
          end: null,
          speed_mps: null,
          statistics: null,
          reason: "Session elapsed duration is unavailable.",
        })),
      };
    const signature = createHash("sha256")
      .update(
        JSON.stringify([
          ANALYSIS_METHOD,
          session.elapsed,
          session.records,
          session.pauses,
          session.boardId,
          session.hrQuality,
          session.annotations,
          session.sourceRef,
          session.revision,
        ]),
      )
      .digest("hex");
    let cached = analysisCache.get(session.id);
    if (!cached || cached.signature !== signature) {
      cached = {
        signature,
        value: analyzeTelemetry(
          session.records,
          session.pauses,
          session.elapsed * 60,
          session.sourceRef,
          session,
        ),
      };
      cached.value.input_hash = signature;
      cached.value.context_revision = session.revision;
      cached.customIntervals = (session.customIntervals || []).map((interval) =>
        customIntervalEvidence(interval, session.records, session.pauses),
      );
      analysisCache.set(session.id, cached);
      if (analysisCache.size > 30)
        analysisCache.delete(analysisCache.keys().next().value);
    }
    return {
      ...session,
      deterministic: cached.value,
      windows: cached.value.windows,
      customIntervals: cached.customIntervals,
    };
  }
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
    const sessions = repo.sessions().map(withMetrics).map(presentWeather);
    return {
      sessions,
      boards: repo.boards().map((b) => ({
        ...b,
        sessionCount: sessions.filter((s) => s.boardId === b.id).length,
      })),
      defaultBoardId: repo.defaultBoard(),
      issues,
      storage: "sqlite",
      goals: repo.goals(),
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
  function addCustomInterval({ session_id, start_s, end_s }) {
    return changeSession(session_id, (session) => {
      if (
        !Number.isFinite(start_s) ||
        !Number.isFinite(end_s) ||
        session.elapsed == null ||
        start_s < 0 ||
        end_s <= start_s ||
        end_s > session.elapsed * 60
      )
        throw new Error("Select a non-empty interval inside the session.");
      if (!session.records.length)
        throw new Error("Import recorded telemetry before saving an interval.");
      const intervals = (session.customIntervals ??= []);
      const existing = intervals.find(
        (interval) => interval.start === start_s && interval.end === end_s,
      );
      if (existing) return existing;
      const interval = {
        id: randomUUID(),
        start: start_s,
        end: end_s,
        source: "athlete_selected",
        created_at_utc: new Date().toISOString(),
      };
      intervals.push(interval);
      session.revision++;
      return interval;
    });
  }
  function removeCustomInterval({ session_id, interval_id }) {
    return changeSession(session_id, (session) => {
      const intervals = session.customIntervals || [];
      const index = intervals.findIndex(
        (interval) => interval.id === interval_id,
      );
      if (index < 0) throw new Error("Custom interval not found.");
      intervals.splice(index, 1);
      session.revision++;
      return { deleted: interval_id };
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
    const s = presentWeather(withMetrics(get(id)));
    const { records, hashes, ...summary } = s;
    const deterministic = compactAnalysis(s.deterministic);
    return {
      ...summary,
      goals: repo.goals(),
      windows: (s.windows || []).map((w) => ({
        ...w,
        statistics: compactInterval(w.statistics),
      })),
      customIntervals: (s.customIntervals || []).map((interval) => ({
        ...interval,
        statistics: compactInterval(interval.statistics),
      })),
      deterministic,
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
        customIntervals:
          "athlete-selected elapsed seconds; derived speed in m/s",
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
        "Session stroke distance uses FIT totals; interval stroke distance may be a cadence-integral estimate with explicit coverage and assumptions. Neither is validated biomechanical efficiency.",
        "Wind is nearby-station context, not an on-water measurement.",
        "Watch telemetry cannot diagnose stroke faults.",
        "Zig-zag is experimental local GPS straightness; inspect eligible coverage and underlying deviations. Higher is not proof of better technique.",
        "Matched-window changes are descriptive, with independent pairs and no normalization for current, chop or local wind.",
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
  function updateDetails({
    session_id,
    name,
    board_id,
    note,
    launch_source_ref,
  }) {
    const clean = name.trim();
    if (!clean || clean.length > 100)
      throw new Error("Enter a launch name of 1–100 characters.");
    if (board_id !== null) requireBoard(board_id);
    const selectedLaunch = launch_source_ref
      ? launchSuggestions(
          get(session_id),
          repo.sessions(),
          launchCatalog.places,
          cachedLaunches(get(session_id)),
        ).candidates.find(
          (c) => c.source_ref === launch_source_ref && c.name === clean,
        )
      : null;
    if (launch_source_ref && !selectedLaunch)
      throw new Error(
        "Launch suggestion is no longer available. Search again or enter the name manually.",
      );
    changeSession(session_id, (s) => {
      if (
        s.title !== clean ||
        selectedLaunch ||
        s.boardId !== board_id ||
        (note !== undefined && note !== s.additionalContext)
      ) {
        if (s.title !== clean || selectedLaunch) {
          s.titleSource = "athlete_reported";
          s.launchNameProvenance = {
            source: "athlete_reported",
            reference: launch_source_ref ?? null,
            evidence: selectedLaunch ?? null,
            confirmed_at_utc: new Date().toISOString(),
          };
        }
        s.title = clean;
        if (note !== undefined) s.additionalContext = note;
        s.boardId = board_id;
        s.revision++;
      }
    });
    return context(session_id);
  }
  const writes = {
    upsertGoal({ goal_id, ...goal }) {
      const existing = repo.goals();
      if (goal_id && !existing.some((g) => g.id === goal_id))
        throw new Error("Goal not found.");
      if (!goal_id && existing.length >= 20)
        throw new Error("Keep at most 20 goals.");
      if (
        existing.some(
          (g) =>
            g.id !== goal_id &&
            g.metric === goal.metric &&
            g.cadence_threshold_spm === goal.cadence_threshold_spm,
        )
      )
        throw new Error(
          "A goal for this metric and threshold already exists. Edit it instead.",
        );
      const result = {
        ...goal,
        id: goal_id || randomUUID(),
        source: "athlete_reported",
        updated_at_utc: new Date().toISOString(),
      };
      repo.saveGoal(result);
      for (const s of repo.sessions()) {
        s.revision++;
        repo.save(s);
      }
      return result;
    },
    deleteGoal({ goal_id }) {
      if (!repo.goals().some((g) => g.id === goal_id))
        throw new Error("Goal not found.");
      repo.deleteGoal(goal_id);
      for (const s of repo.sessions()) {
        s.revision++;
        repo.save(s);
      }
      return { deleted: goal_id };
    },
    setSessionSummary({ session_id, expected_revision, analysis }) {
      return changeSession(session_id, (s) => {
        if (s.revision !== expected_revision)
          throw new Error(
            "Session changed. Read fresh context before saving a summary.",
          );
        const refs = new Set([
          "session",
          ...withMetrics(s)
            .windows.filter((w) => w.start != null)
            .map((w) => `best:${w.duration}`),
          ...s.annotations.map((a) => `annotation:${a.id}`),
          ...(s.customIntervals || []).map(
            (interval) => `interval:${interval.id}`,
          ),
        ]);
        if (analysis?.evidence_refs.some((ref) => !refs.has(ref)))
          throw new Error(
            "Summary evidence reference is unavailable in this session.",
          );
        s.revision++;
        s.llmSummary = analysis
          ? {
              ...analysis,
              source: "llm",
              review_status: "unreviewed",
              context_revision: s.revision,
              saved_at_utc: new Date().toISOString(),
            }
          : null;
        return s.llmSummary;
      });
    },
    deleteSession({ session_id }) {
      repo.deleteSession(session_id);
      return { deleted: session_id };
    },
    updateWind({ session_id, wind }) {
      return changeSession(session_id, (s) => {
        const direction =
          wind?.wind_speed_mps === 0 ? null : wind?.wind_from_deg;
        if (
          (!wind && !s.windAdjustment) ||
          (wind &&
            s.windAdjustment &&
            wind.wind_speed_mps === s.windAdjustment.wind_speed_mps &&
            direction === s.windAdjustment.wind_from_deg &&
            wind.note === s.windAdjustment.note)
        )
          return { session_id, windAdjustment: s.windAdjustment ?? null };
        const reported_at_utc = new Date().toISOString();
        const adjustment = wind
          ? {
              ...wind,
              wind_from_deg:
                wind.wind_speed_mps === 0 ? null : wind.wind_from_deg,
              source: "athlete_reported",
              scope: "session",
              reported_at_utc,
            }
          : null;
        s.windAdjustment = adjustment;
        (s.windAdjustmentHistory ??= []).push({
          reported_at_utc,
          wind: adjustment,
        });
        s.revision++;
        return { session_id, windAdjustment: adjustment };
      });
    },
    saveWeather({ session_id, weather, expected_attempt_id, provenance }) {
      const s = get(session_id);
      if (expected_attempt_id && s.weather?.attempt?.id !== expected_attempt_id)
        return false;
      s.weather = weather;
      s.revision++;
      if (provenance)
        repo.saveWeatherSource(s.id, weather.attempt.id, provenance);
      repo.save(s);
      return true;
    },
    commitImport,
    addAnnotation,
    removeAnnotation,
    addCustomInterval,
    removeCustomInterval,
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
    async suggestLaunchName({ session_id }) {
      const session = get(session_id),
        start = launchPoint(session),
        key = launchKey(session);
      let lookup = { status: start ? "disabled" : "no_gps", candidates: [] };
      if (start && launchLookup) {
        let entry = launchCache.get(key);
        if (!entry || entry.expires <= Date.now()) {
          entry = { expires: Infinity };
          entry.promise = Promise.resolve()
            .then(() => launchLookup(start))
            .then(
              (candidates) => ({
                candidates,
                status: "ready",
                expires: Date.now() + 86400000,
              }),
              () => ({
                candidates: [],
                status: "unavailable",
                expires: Date.now() + 60000,
              }),
            )
            .then((value) => {
              Object.assign(entry, value);
              delete entry.promise;
              return entry;
            });
          launchCache.set(key, entry);
          if (launchCache.size > 100)
            launchCache.delete(launchCache.keys().next().value);
        }
        lookup = entry.promise ? await entry.promise : entry;
        // A deleted session cannot be revived by a late provider response.
        get(session_id);
      }
      return {
        session_id,
        ...launchSuggestions(
          session,
          repo.sessions(),
          launchCatalog.places,
          lookup.candidates,
        ),
        lookup: {
          status: lookup.status,
          message:
            lookup.status === "unavailable"
              ? "Online lookup is temporarily unavailable. Showing local suggestions; try again in a minute."
              : null,
        },
        catalog: {
          scope: launchCatalog.scope,
          source: launchCatalog.source,
          source_date: launchCatalog.source_date,
          source_url: launchCatalog.source_url,
          limitations: launchCatalog.limitations,
        },
      };
    },
    recalculateSession({ session_id }) {
      get(session_id);
      analysisCache.delete(session_id);
      return context(session_id);
    },
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

export function compactInterval(evidence) {
  if (!evidence?.zigzag) return evidence;
  const { segments, ...zigzag } = evidence.zigzag;
  return { ...evidence, zigzag };
}

function compactAnalysis(evidence) {
  if (!evidence) return null;
  const { dps_timeline, ...rest } = evidence;
  return {
    ...rest,
    summary: compactInterval(rest.summary),
    windows: rest.windows.map((w) => ({
      ...w,
      statistics: compactInterval(w.statistics),
    })),
    movement: {
      ...rest.movement,
      events: rest.movement.events.slice(0, 100),
      omitted_event_count: Math.max(0, rest.movement.events.length - 100),
    },
    drift: {
      ...rest.drift,
      modes: Object.fromEntries(
        Object.entries(rest.drift.modes).map(([key, value]) => [
          key,
          {
            ...value,
            pairs: value.pairs.slice(0, 12),
            omitted_pair_count: Math.max(0, value.pairs.length - 12),
          },
        ]),
      ),
    },
  };
}
