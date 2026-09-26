import React, { useEffect, useRef, useState } from "react";
import {
  Waves,
  ChatCircleDots,
  UploadSimple,
  Info,
  X,
  Check,
  Trash,
  NotePencil,
  ArrowSquareOut,
  WarningCircle,
  ArrowClockwise,
} from "@phosphor-icons/react";
import { timeLabel, durationLabel, validRuns } from "./domain/metrics.mjs";
import { findSampleSession } from "./services/sample-import.mjs";
import {
  connect,
  subscribe,
  callTool,
  askChatGPT,
} from "./services/client.mjs";
import {
  shortDate,
  fullDate,
  fmt,
  SessionMap,
  BestWindows,
  MetricStrip,
  Timeline,
} from "./components/SessionViews.jsx";
import {
  AnnotationForm,
  ContextPanel,
  FocusPanel,
} from "./components/ReviewPanels.jsx";
import { Compare } from "./components/Compare.jsx";
import { ChatGPTPage } from "./components/ChatGPTPage.jsx";
import { Boards, SessionBoard } from "./components/Boards.jsx";
import { useNavigation } from "./services/useNavigation.jsx";

const parseTime = (value) =>
  /^\d{1,3}:[0-5]\d$/.test(value)
    ? Number(value.split(":")[0]) * 60 + Number(value.split(":")[1])
    : NaN;
const defaultDraft = (t) => ({
  start: timeLabel(t),
  end: timeLabel(t),
  kind: "condition",
  timing: "approximate",
  note: "",
});

export function App() {
  const [data, setData] = useState(null),
    [connected, setConnected] = useState(false);
  const { page, sessionId, navigate } = useNavigation();
  const setPage = (page) => navigate({ page });
  const [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(null),
    [cursor, setCursor] = useState(0),
    [draft, setDraft] = useState(null),
    [prepared, setPrepared] = useState("");
  const fileInput = useRef(null),
    toastTimer = useRef(null),
    editorRef = useRef(null),
    errorRef = useRef(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const notice = (text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 5500);
  };
  const accept = (next, id, fromHost) => {
    setData(next);
    if (id) {
      navigate({ sessionId: id, ...(fromHost ? { page: "Sessions" } : {}) });
    }
  };
  useEffect(() => {
    let active = true;
    const unsubscribe = subscribe((next, id, fromHost) => {
      if (active) accept(next, id, fromHost);
    });
    connect()
      .then(({ data: next, connected }) => {
        if (active) {
          setData(next);
          setConnected(connected);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  const session = sessionId
    ? data?.sessions.find((s) => s.id === sessionId)
    : data?.sessions[0];
  useEffect(() => {
    if (!sessionId && data?.sessions[0])
      navigate({ sessionId: data.sessions[0].id }, true);
  }, [data, sessionId, navigate]);
  useEffect(() => {
    setCursor(
      session
        ? (validRuns(session.records, session.pauses, true)[0]?.[0]
            ?.elapsed_s ?? 0)
        : 0,
    );
    setSelected(null);
    setDraft(null);
    setPrepared("");
  }, [session?.id]);
  useEffect(() => {
    if (draft) {
      editorRef.current?.querySelector("input")?.focus({ preventScroll: true });
      editorRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [Boolean(draft)]);
  const perform = async (action) => {
    setBusy(true);
    setError("");
    try {
      return await action();
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const boardAction = (name, args, message) =>
    perform(async () => {
      await callTool(name, args);
      notice(message);
      return true;
    });
  const chooseWindow = (w) => {
    if (w.start == null) return;
    setSelected(w.duration);
    setCursor(w.start);
  };
  const openSession = (id) => {
    navigate({ sessionId: id, page: "Sessions" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const annotate = (t) => setDraft(defaultDraft(t));
  const editAnnotation = (a) =>
    setDraft({
      id: a.id,
      start: timeLabel(a.start_s),
      end: timeLabel(a.end_s),
      kind: a.kind,
      timing: a.timing,
      note: a.note,
    });
  async function saveAnnotation(ask = false) {
    const start = parseTime(draft.start),
      end = parseTime(draft.end);
    if (!Number.isFinite(start) || !Number.isFinite(end))
      throw new Error("Use mm:ss for the start and end times.");
    if (!draft.note.trim()) throw new Error("Add a note before saving.");
    await callTool("upsert_annotation", {
      session_id: session.id,
      annotation_id: draft.id,
      start_s: start,
      end_s: end,
      kind: draft.kind,
      timing: draft.timing,
      note: draft.note,
    });
    setDraft(null);
    notice("Annotation saved for this prototype session.");
    if (ask)
      await prepare(
        `How does this ${draft.kind} change the interpretation of this interval? ${draft.note}`,
        {
          start_s: start,
          end_s:
            end > start ? end : Math.min(start + 300, session.elapsed * 60),
        },
      );
  }
  async function prepare(question, interval = {}) {
    const result = await callTool("prepare_analysis_context", {
      session_id: session.id,
      question,
      ...interval,
    });
    const text = await askChatGPT(result);
    if (text) {
      setPrepared(text);
      setPage("ChatGPT");
      notice("Prompt prepared. Connect the app or copy it into ChatGPT.");
    } else notice("Question sent to your ChatGPT conversation.");
  }
  async function importSample(file) {
    if (!file) return;
    const match = await findSampleSession(file, data.sessions);
    openSession(match.id);
    notice(
      `Opened ${match.title}, ${shortDate(match.date)}. This sample is already loaded.`,
    );
  }
  if (!data)
    return (
      <main className="loading-state">
        <Waves size={38} />
        <h1>SUP Training</h1>
        <p>{error || "Loading your sessions…"}</p>
        {error && (
          <button
            className="button secondary"
            onClick={() => window.location.reload()}
          >
            <ArrowClockwise size={17} /> Retry
          </button>
        )}
      </main>
    );
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="app-header">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("Home");
          }}
        >
          <Waves size={32} weight="bold" />
          <span>SUP Training</span>
        </a>
        <nav aria-label="Main navigation">
          {["Home", "Sessions", "Boards", "ChatGPT"].map((p) => (
            <button
              key={p}
              className={page === p ? "active" : ""}
              aria-current={page === p ? "page" : undefined}
              onClick={() => setPage(p)}
            >
              {p}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <button
            className="button primary small"
            onClick={() => setPage("ChatGPT")}
          >
            <ChatCircleDots size={18} />
            <span>Ask ChatGPT</span>
          </button>
          <button
            className="button plain small"
            onClick={() => fileInput.current?.click()}
          >
            <UploadSimple size={18} />
            <span>Import FIT</span>
          </button>
          <input
            ref={fileInput}
            aria-label="Import Garmin sample"
            type="file"
            accept=".fit,.zip"
            hidden
            onChange={(e) => {
              perform(() => importSample(e.target.files?.[0]));
              e.target.value = "";
            }}
          />
        </div>
      </header>
      <main id="main" className="app-main">
        {error && (
          <div
            className="error-banner"
            role="alert"
            ref={errorRef}
            tabIndex={-1}
          >
            <WarningCircle size={20} />
            <span>{error}</span>
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={18} />
            </button>
          </div>
        )}
        {page === "Sessions" && session && (
          <>
            <div className="session-heading">
              <div>
                <p className="eyebrow">SESSION REVIEW</p>
                <h1>{session.title}</h1>
                <p>
                  {fullDate(session.date)}
                  <span className="quiet-divider">·</span>
                  {session.start}–{session.end} PT
                  <span className="quiet-divider">|</span>
                  {session.records.length
                    ? "Garmin FIT + sheet snapshot"
                    : "Sheet summary only"}
                </p>
              </div>
              <label className="session-select">
                Session · distance · active time
                <select
                  aria-label="Choose session"
                  value={session.id}
                  onChange={(e) => openSession(e.target.value)}
                >
                  {data.sessions.map((s) => (
                    <option value={s.id} key={s.id}>
                      {shortDate(s.date)} · {s.title} · {fmt(s.distance, 2)} mi
                      · {durationLabel(s.active)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <MetricStrip session={session} />
            <SessionBoard
              session={session}
              boards={data.boards || []}
              defaultBoardId={data.defaultBoardId}
              busy={busy}
              onAction={boardAction}
              onManage={() => setPage("Boards")}
            />
            <div className="route-layout">
              <SessionMap
                session={session}
                selected={selected}
                onSelect={chooseWindow}
                cursor={cursor}
              />
              <BestWindows
                session={session}
                selected={selected}
                onSelect={chooseWindow}
              />
            </div>
            <Timeline
              session={session}
              selected={selected}
              cursor={cursor}
              setCursor={setCursor}
              onAnnotate={annotate}
              onEdit={editAnnotation}
            />
            {draft && (
              <div ref={editorRef}>
                <AnnotationForm
                  draft={draft}
                  setDraft={setDraft}
                  onSave={(e) => {
                    e.preventDefault();
                    perform(() => saveAnnotation());
                  }}
                  onCancel={() => setDraft(null)}
                  onAsk={() => perform(() => saveAnnotation(true))}
                  busy={busy}
                />
              </div>
            )}
            {session.annotations.length > 0 && (
              <div className="annotation-list">
                {session.annotations.map((a) => (
                  <div key={a.id}>
                    <NotePencil size={18} />
                    <button
                      className="annotation-description"
                      onClick={() => editAnnotation(a)}
                    >
                      <strong>
                        {timeLabel(a.start_s)}
                        {a.end_s > a.start_s
                          ? `–${timeLabel(a.end_s)}`
                          : ""}{" "}
                        <span>
                          {a.kind} · {a.timing}
                        </span>
                      </strong>
                      <p>{a.note}</p>
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Delete annotation: ${a.note}`}
                      disabled={busy}
                      onClick={() =>
                        perform(async () => {
                          await callTool("delete_annotation", {
                            session_id: session.id,
                            annotation_id: a.id,
                          });
                          notice("Annotation deleted.");
                        })
                      }
                    >
                      <Trash size={17} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="details-grid">
              <ContextPanel
                session={session}
                busy={busy}
                onSave={(note) =>
                  perform(async () => {
                    await callTool("update_session_context", {
                      session_id: session.id,
                      note,
                    });
                    notice("Session context saved.");
                  })
                }
                onAsk={(note) =>
                  perform(async () => {
                    await callTool("update_session_context", {
                      session_id: session.id,
                      note,
                    });
                    await prepare(
                      "Review this session with my latest notes and additional context. What should I focus on next?",
                    );
                  })
                }
              />
              <FocusPanel
                session={session}
                issues={data.issues}
                busy={busy}
                onSave={(args) =>
                  perform(async () => {
                    await callTool("update_training_focus", {
                      session_id: session.id,
                      ...args,
                    });
                    notice("Training focus saved.");
                  })
                }
              />
            </div>
            <div className="source-footer">
              <span>
                <Info size={15} /> HR: {session.hrQuality || "quality unknown"}{" "}
                · Wind: {session.weatherQuality || "quality unknown"}
              </span>
              <a href={session.sourceRef} target="_blank" rel="noreferrer">
                View source sheet <ArrowSquareOut size={14} />
              </a>
            </div>
          </>
        )}
        {page === "Home" && (
          <Compare
            sessions={data.sessions}
            boards={data.boards || []}
            onOpen={openSession}
          />
        )}
        {page === "Boards" && (
          <Boards
            boards={data.boards || []}
            defaultBoardId={data.defaultBoardId}
            busy={busy}
            onAction={boardAction}
          />
        )}
        {(page === "Sessions" || page === "ChatGPT") && !session && (
          <div role="status">
            <p>
              {sessionId
                ? `Session ${sessionId} is unavailable in this snapshot.`
                : "No sessions available in this snapshot."}
            </p>
            <button
              className="button secondary"
              onClick={() => navigate({ page: "Home", sessionId: null })}
            >
              Browse available sessions
            </button>
          </div>
        )}
        {page === "ChatGPT" && session && (
          <ChatGPTPage
            connected={connected}
            session={session}
            onPrepare={(q) => perform(() => prepare(q))}
            busy={busy}
            prepared={prepared}
            setPrepared={setPrepared}
            notice={notice}
          />
        )}
        <footer className="app-footer">
          <span>
            <Waves size={18} /> Made for the next paddle.
          </span>
          <span>
            Snapshot {data.snapshotAt?.slice(0, 10)} · edits reset on server
            restart
          </span>
        </footer>
      </main>
      {toast && (
        <div className="toast" role="status">
          <Check size={19} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}
