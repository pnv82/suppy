import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Waves,
  X,
  Check,
  Trash,
  NotePencil,
  WarningCircle,
  ArrowClockwise,
} from "@phosphor-icons/react";
import { timeLabel, validRuns } from "./domain/metrics.mjs";
import {
  detectedEventLabel,
  detectedEventDescription,
} from "./domain/events.mjs";
import { customIntervalEvidence, intervalKey } from "./domain/intervals.mjs";
import { ImportDialog } from "./components/ImportDialog.jsx";
import {
  connect,
  subscribe,
  callTool,
  askChatGPT,
  embedded,
} from "./services/client.mjs";
import {
  shortDate,
  SessionMap,
  BestWindows,
  Timeline,
} from "./components/SessionViews.jsx";
import { AnnotationForm } from "./components/ReviewPanels.jsx";
import { Compare } from "./components/Compare.jsx";
import { MetricsInspector } from "./components/MetricEvidence.jsx";
import { ChatGPTPage } from "./components/ChatGPTPage.jsx";
import { Boards } from "./components/Boards.jsx";
import { Goals } from "./components/Goals.jsx";
import { UnitsProvider } from "./components/Units.jsx";
import { Settings } from "./components/Settings.jsx";
import { NavigationRail } from "./components/NavigationRail.jsx";
import { SessionHeader } from "./components/SessionHeader.jsx";
import { useNavigation } from "./services/useNavigation.jsx";

const parseTime = (value) =>
  /^\d{1,3}:[0-5]\d$/.test(value)
    ? Number(value.split(":")[0]) * 60 + Number(value.split(":")[1])
    : NaN;
const defaultDraft = (t, end = t) => ({
  start: timeLabel(t),
  end: timeLabel(end),
  mode: end > t ? "interval" : "point",
  kind: "condition",
  timing: "approximate",
  note: "",
});

export function App({ account }) {
  const [workspace, setWorkspace] = useState(null);
  useEffect(
    () => (embedded ? subscribe((next) => setWorkspace(next)) : undefined),
    [],
  );
  return (
    <Workspace
      key={embedded ? workspace?.tenantId || "unlinked" : "standalone"}
      account={account}
      initialData={embedded ? workspace : null}
    />
  );
}

function Workspace({ account, initialData }) {
  const [data, setData] = useState(initialData),
    [connected, setConnected] = useState(false);
  const { page, sessionId, navigate } = useNavigation();
  const setPage = (page) => navigate({ page });
  const [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(null),
    [cursor, setCursor] = useState(0),
    [spot, setSpot] = useState(null),
    [rangeEnd, setRangeEnd] = useState(null),
    [draft, setDraft] = useState(null),
    [prepared, setPrepared] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const toastTimer = useRef(null),
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
        ? (validRuns(session.records, session.pauses, true, false)[0]?.[0]
            ?.elapsed_s ?? 0)
        : 0,
    );
    setSelected(null);
    setSpot(null);
    setRangeEnd(null);
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
  const manualInterval = useMemo(
    () =>
      session && spot != null && rangeEnd != null && spot !== rangeEnd
        ? customIntervalEvidence(
            {
              id: "manual",
              start: Math.min(spot, rangeEnd),
              end: Math.max(spot, rangeEnd),
            },
            session.records,
            session.pauses,
            session.annotations,
          )
        : null,
    [session?.records, session?.pauses, session?.annotations, spot, rangeEnd],
  );
  const reviewSession = manualInterval
    ? {
        ...session,
        customIntervals: [...(session.customIntervals || []), manualInterval],
      }
    : session;
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
    if (!w) {
      setSelected(null);
      return;
    }
    if (w.start == null) return;
    setSelected(intervalKey(w));
    setCursor(w.start);
    if (w.id !== "manual") {
      setSpot(null);
      setRangeEnd(null);
    }
  };
  const openSession = (id) => {
    navigate({ sessionId: id, page: "Sessions" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const annotate = (t, end = t, candidate = null) =>
    setDraft({
      ...defaultDraft(Math.min(t, end), Math.max(t, end)),
      ...(candidate
        ? {
            kind: "note",
            candidate: `${detectedEventLabel(candidate)}. ${detectedEventDescription(candidate)}`,
          }
        : {}),
    });
  const editAnnotation = (a) =>
    setDraft({
      id: a.id,
      mode: a.end_s > a.start_s ? "interval" : "point",
      start: timeLabel(a.start_s),
      end: timeLabel(a.end_s),
      kind: a.kind,
      timing: a.timing,
      note: a.note,
    });
  async function saveAnnotation(ask = false) {
    const start = parseTime(draft.start),
      end = draft.mode === "point" ? start : parseTime(draft.end);
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
  if (!data)
    return (
      <main className="loading-state">
        {account && (
          <NavigationRail account={account} page={page} onNavigate={setPage} />
        )}
        <Waves size={38} />
        <h1>Suppy</h1>
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
    <UnitsProvider value={data.units}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <NavigationRail
        account={account}
        page={page}
        onNavigate={setPage}
        onImport={() => setImportOpen(true)}
      />
      {importOpen && (
        <ImportDialog
          boards={data.boards || []}
          defaultBoardId={data.defaultBoardId}
          onClose={() => setImportOpen(false)}
          onImported={(id, status) => {
            openSession(id);
            notice(
              status === "duplicate"
                ? "Opened existing session."
                : "FIT saved. Deterministic metrics are ready.",
            );
          }}
        />
      )}
      <div className="app-workspace">
        <main id="main" className="app-main" tabIndex={-1}>
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
              <SessionHeader
                key={`header-${session.id}`}
                connected={connected}
                session={session}
                sessions={data.sessions}
                boards={data.boards || []}
                defaultBoardId={data.defaultBoardId}
                onOpen={openSession}
                onManage={() => setPage("Boards")}
                onDelete={async () => {
                  await callTool("delete_session", { session_id: session.id });
                  const remaining = data.sessions.filter(
                    (s) => s.id !== session.id,
                  );
                  navigate({
                    page: remaining.length ? "Sessions" : "Home",
                    sessionId: remaining[0]?.id ?? null,
                  });
                  notice("Session deleted. You can upload its FIT again.");
                }}
                onSave={async (args) => {
                  await callTool("update_session_details", args);
                  notice("Session details saved.");
                }}
              />
              <div className="session-overview">
                <div className="route-layout">
                  <SessionMap
                    session={reviewSession}
                    selected={selected}
                    onSelect={chooseWindow}
                    cursor={cursor}
                    spot={spot}
                  />
                  <BestWindows
                    session={session}
                    selected={selected}
                    onSelect={chooseWindow}
                    busy={busy}
                    onRemove={(interval) =>
                      perform(async () => {
                        await callTool("delete_custom_interval", {
                          session_id: session.id,
                          interval_id: interval.id,
                        });
                        if (selected === interval.id) setSelected(null);
                        notice("Custom interval removed.");
                        return true;
                      })
                    }
                  />
                </div>
                <MetricsInspector
                  key={session.id}
                  session={reviewSession}
                  goals={data.goals || []}
                  selected={selected}
                  onSelect={chooseWindow}
                  onAsk={(interval) =>
                    perform(() =>
                      prepare(
                        "Explain these metrics, their coverage and limitations.",
                        interval,
                      ),
                    )
                  }
                />
              </div>
              <Timeline
                session={reviewSession}
                selected={selected}
                cursor={cursor}
                spot={spot}
                setSpot={setSpot}
                rangeEnd={rangeEnd}
                setRangeEnd={setRangeEnd}
                setCursor={setCursor}
                onManualSelection={(hasRange) =>
                  setSelected(hasRange ? "manual" : null)
                }
                busy={busy}
                onAddInterval={() =>
                  perform(async () => {
                    if (!manualInterval) return false;
                    const result = await callTool("add_custom_interval", {
                      session_id: session.id,
                      start_s: manualInterval.start,
                      end_s: manualInterval.end,
                    });
                    chooseWindow(result.structuredContent);
                    notice("Custom interval saved.");
                    return true;
                  })
                }
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
            </>
          )}
          {page === "Home" && (
            <Compare
              homeColumns={data.homeColumns}
              sessions={data.sessions}
              boards={data.boards || []}
              onOpen={openSession}
              defaultBoardId={data.defaultBoardId}
              onAction={boardAction}
              goals={data.goals || []}
              onManage={() => setPage("Boards")}
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
          {page === "Goals" && (
            <Goals
              goals={data.goals || []}
              historyDepth={data.goalHistoryDepth}
              sessions={data.sessions}
              onOpen={openSession}
              busy={busy}
              onAction={boardAction}
            />
          )}
          {page === "Settings" && (
            <Settings
              busy={busy}
              onAction={boardAction}
              goalHistoryDepth={data.goalHistoryDepth}
            />
          )}
          {(page === "Sessions" || page === "ChatGPT") && !session && (
            <div role="status">
              <p>
                {sessionId
                  ? `Session ${sessionId} is unavailable in your stored data.`
                  : "No sessions available in your stored data."}
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
              authenticated={Boolean(account)}
              session={session}
              onPrepare={(q) => perform(() => prepare(q))}
              busy={busy}
              prepared={prepared}
              setPrepared={setPrepared}
              notice={notice}
            />
          )}
        </main>
      </div>
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
    </UnitsProvider>
  );
}
