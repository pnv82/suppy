import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
export function databasePath(env = process.env) {
  if (env.SUP_DB_PATH) return resolve(env.SUP_DB_PATH);
  if (env.NODE_ENV === "test")
    throw new Error("Tests must supply an isolated database path.");
  return resolve(
    root,
    "data",
    "storage",
    env.NODE_ENV === "development" ? "development.sqlite" : "production.sqlite",
  );
}
export function validateTenantId(id) {
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(id))
    throw new Error("Invalid tenant identity.");
  return id;
}

// Summary values are SI in SQLite; the existing presentation DTO uses imperial units.
const conversions = {
  distance: ["distance_m", 1609.344],
  active: ["active_s", 60],
  elapsed: ["elapsed_s", 60],
  avgSpeed: ["avg_speed_mps", 0.44704],
  best5: ["best5_mps", 0.44704],
  best10: ["best10_mps", 0.44704],
  best20: ["best20_mps", 0.44704],
  wind: ["wind_mps", 0.44704],
};
export function encodeSession(session) {
  const data = structuredClone(session);
  for (const [key, [si, factor]] of Object.entries(conversions)) {
    data[si] = data[key] == null ? null : data[key] * factor;
    delete data[key];
  }
  data.goal = {
    speed_mps:
      data.goal.speed_mph == null ? null : data.goal.speed_mph * 0.44704,
    duration_s: data.goal.duration_min * 60,
  };
  for (const key of ["id", "boardId", "revision", "sourceTrack", "provenance"])
    delete data[key];
  return JSON.stringify(data);
}
function decodeSession(row) {
  if (!row) throw new Error("Session not found");
  const data = JSON.parse(row.data_si);
  for (const [key, [si, factor]] of Object.entries(conversions)) {
    data[key] = data[si] == null ? null : data[si] / factor;
    delete data[si];
  }
  data.goal = {
    speed_mph:
      data.goal.speed_mps == null ? null : data.goal.speed_mps / 0.44704,
    duration_min: data.goal.duration_s / 60,
  };
  return { ...data, id: row.id, boardId: row.board_id, revision: row.revision };
}

export function openDatabase(path = databasePath()) {
  if (path !== ":memory:")
    mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path, { timeout: 5000 });
  function transaction(fn) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  try {
    db.exec(
      "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;",
    );
    transaction(() => {
      const version = db.prepare("PRAGMA user_version").get().user_version;
      if (version > 2)
        throw new Error(
          "Database schema is newer than this app. Upgrade the app before opening it.",
        );
      if (version === 0)
        db.exec(`
        CREATE TABLE tenants (id TEXT PRIMARY KEY, created_at TEXT NOT NULL) STRICT;
        CREATE TABLE boards (
          tenant_id TEXT NOT NULL REFERENCES tenants(id), id TEXT NOT NULL,
          name TEXT NOT NULL, name_key TEXT NOT NULL,
          PRIMARY KEY (tenant_id, id), UNIQUE (tenant_id, name_key)
        ) STRICT;
        CREATE TABLE sessions (
          tenant_id TEXT NOT NULL REFERENCES tenants(id), id TEXT NOT NULL,
          local_date TEXT NOT NULL, board_id TEXT, revision INTEGER NOT NULL CHECK (revision >= 0),
          data_si TEXT NOT NULL CHECK (json_valid(data_si)),
          PRIMARY KEY (tenant_id, id),
          FOREIGN KEY (tenant_id, board_id) REFERENCES boards(tenant_id, id)
        ) STRICT;
        CREATE INDEX sessions_recent ON sessions(tenant_id, local_date DESC, id);
        CREATE TABLE preferences (
          tenant_id TEXT PRIMARY KEY REFERENCES tenants(id), default_board_id TEXT,
          FOREIGN KEY (tenant_id, default_board_id) REFERENCES boards(tenant_id, id)
        ) STRICT;
        CREATE TABLE session_sources (
          tenant_id TEXT NOT NULL, session_id TEXT NOT NULL,
          data_json TEXT NOT NULL CHECK (json_valid(data_json)),
          PRIMARY KEY (tenant_id, session_id),
          FOREIGN KEY (tenant_id, session_id) REFERENCES sessions(tenant_id, id)
        ) STRICT;
        PRAGMA user_version = 1;
      `);
      if (version < 2)
        db.exec(`
        CREATE TABLE fit_imports (
          tenant_id TEXT NOT NULL, original_sha256 TEXT NOT NULL, fit_sha256 TEXT NOT NULL,
          session_id TEXT NOT NULL, provenance_json TEXT NOT NULL CHECK (json_valid(provenance_json)),
          original_bytes BLOB NOT NULL, fit_bytes BLOB NOT NULL,
          PRIMARY KEY (tenant_id, original_sha256),
          FOREIGN KEY (tenant_id, session_id) REFERENCES sessions(tenant_id, id)
        ) STRICT;
        CREATE INDEX fit_import_identity ON fit_imports(tenant_id, fit_sha256);
        PRAGMA user_version = 2;
      `);
    });
  } catch (error) {
    db.close();
    throw error;
  }

  function createTenant(id) {
    validateTenantId(id);
    transaction(() => {
      db.prepare("INSERT OR IGNORE INTO tenants VALUES (?, ?)").run(
        id,
        new Date().toISOString(),
      );
      db.prepare("INSERT OR IGNORE INTO preferences VALUES (?, NULL)").run(id);
    });
  }
  function forTenant(id) {
    validateTenantId(id);
    if (!db.prepare("SELECT id FROM tenants WHERE id = ?").get(id))
      throw new Error("Tenant not found.");
    return {
      tenantId: id,
      transaction,
      insertSession: (s, source) => {
        db.prepare("INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?)").run(
          id,
          s.id,
          s.date,
          s.boardId,
          s.revision,
          encodeSession(s),
        );
        db.prepare("INSERT INTO session_sources VALUES (?, ?, ?)").run(
          id,
          s.id,
          JSON.stringify(source),
        );
      },
      saveImport: (upload, sessionId) =>
        db
          .prepare(
            "INSERT OR IGNORE INTO fit_imports VALUES (?, ?, ?, ?, ?, ?, ?)",
          )
          .run(
            id,
            upload.provenance.original_sha256,
            upload.provenance.fit_sha256,
            sessionId,
            JSON.stringify(upload.provenance),
            upload.original,
            upload.fit,
          ),
      findImport: (fitHash) =>
        db
          .prepare(
            "SELECT session_id FROM fit_imports WHERE tenant_id = ? AND fit_sha256 = ? LIMIT 1",
          )
          .get(id, fitHash)?.session_id ?? null,
      get: (sessionId) =>
        decodeSession(
          db
            .prepare("SELECT * FROM sessions WHERE tenant_id = ? AND id = ?")
            .get(id, sessionId),
        ),
      sessions: () =>
        db
          .prepare(
            "SELECT * FROM sessions WHERE tenant_id = ? ORDER BY local_date DESC, id DESC",
          )
          .all(id)
          .map(decodeSession),
      save: (s) =>
        db
          .prepare(
            "UPDATE sessions SET board_id = ?, revision = ?, data_si = ? WHERE tenant_id = ? AND id = ?",
          )
          .run(s.boardId, s.revision, encodeSession(s), id, s.id),
      boards: () =>
        db
          .prepare(
            "SELECT id, name FROM boards WHERE tenant_id = ? ORDER BY rowid",
          )
          .all(id)
          .map((b) => ({ ...b })),
      insertBoard: (b) =>
        db
          .prepare("INSERT INTO boards VALUES (?, ?, ?, ?)")
          .run(id, b.id, b.name, b.name.toLowerCase()),
      renameBoard: (b) =>
        db
          .prepare(
            "UPDATE boards SET name = ?, name_key = ? WHERE tenant_id = ? AND id = ?",
          )
          .run(b.name, b.name.toLowerCase(), id, b.id),
      deleteBoard: (boardId) =>
        db
          .prepare("DELETE FROM boards WHERE tenant_id = ? AND id = ?")
          .run(id, boardId),
      defaultBoard: () =>
        db
          .prepare(
            "SELECT default_board_id FROM preferences WHERE tenant_id = ?",
          )
          .get(id).default_board_id,
      setDefaultBoard: (boardId) =>
        db
          .prepare(
            "UPDATE preferences SET default_board_id = ? WHERE tenant_id = ?",
          )
          .run(boardId, id),
    };
  }
  // Operator-only bootstrap/import. Never exposed as an HTTP or MCP tool.
  function importState(tenantId, state) {
    const repo = forTenant(tenantId);
    return transaction(() => {
      if (repo.sessions().length || repo.boards().length || repo.defaultBoard())
        throw new Error(
          "Import requires an empty tenant; existing data will not be overwritten.",
        );
      for (const board of state.boards ?? []) repo.insertBoard(board);
      for (const s of state.sessions) {
        if (typeof s.id !== "string" || !s.id || !s.timezone)
          throw new Error(
            "Imported sessions require a string ID and explicit timezone.",
          );
        db.prepare("INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?)").run(
          tenantId,
          s.id,
          s.date,
          s.boardId ?? null,
          s.revision ?? 0,
          encodeSession(s),
        );
        db.prepare("INSERT INTO session_sources VALUES (?, ?, ?)").run(
          tenantId,
          s.id,
          JSON.stringify({
            provenance: s.provenance ?? null,
            track: s.sourceTrack ?? null,
          }),
        );
      }
      repo.setDefaultBoard(state.defaultBoardId ?? null);
      return state.sessions.length;
    });
  }
  return {
    path,
    createTenant,
    forTenant,
    importState,
    close: () => db.close(),
    async backup(destination) {
      if (existsSync(destination))
        throw new Error("Backup destination already exists.");
      mkdirSync(dirname(resolve(destination)), { recursive: true });
      await backup(db, destination);
    },
    integrity: () => ({
      integrity: db.prepare("PRAGMA integrity_check").all(),
      foreignKeys: db.prepare("PRAGMA foreign_key_check").all(),
    }),
  };
}
