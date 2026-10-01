import React, { useEffect, useState } from "react";
import { callTool, embedded } from "../services/client.mjs";
import { Measure } from "./Units.jsx";
import { durationLabel } from "../domain/metrics.mjs";

export function GarminPicker({ timezone, busy, setBusy, onPreview }) {
  const [status, setStatus] = useState("loading"),
    [error, setError] = useState("");
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState("");
  const [page, setPage] = useState(null);
  async function run(work) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function load(start = 0) {
    const result = await callTool("list_garmin_activities", { start });
    setPage(result.structuredContent);
  }
  useEffect(() => {
    let active = true;
    callTool("get_garmin_status")
      .then(async (result) => {
        if (!active) return;
        setStatus(result.structuredContent.status);
        if (result.structuredContent.status === "connected")
          await run(() => load());
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setStatus("disconnected");
        }
      });
    return () => {
      active = false;
    };
  }, []);
  async function signIn() {
    await run(async () => {
      const action = status === "mfa_required" ? "verify" : "login";
      const body = action === "verify" ? { code } : { username, password };
      // Credentials never enter callTool / the ChatGPT bridge.
      setPassword("");
      setCode("");
      const response = await fetch(`/api/garmin/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Garmin sign-in failed.");
      setStatus(result.status);
      if (result.status === "connected") {
        setUsername("");
        await load();
      }
    });
  }
  return (
    <section className="garmin-picker" aria-label="Garmin Connect import">
      <p>
        Connect your personal Garmin account, choose a SUP activity, then review
        before saving.
      </p>
      <p className="caption">
        On-demand import using an unofficial Garmin client. Sign-in lasts up to
        30 minutes or until the app server restarts. Passwords are not saved.
      </p>
      {status === "loading" ? (
        <p role="status">Checking Garmin connection…</p>
      ) : status !== "connected" ? (
        embedded ? (
          <>
            <p>
              Sign in from Import → Garmin Connect in the local Suppy app, then
              return here. Do not enter your password in chat.
            </p>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const r = await callTool("get_garmin_status");
                  setStatus(r.structuredContent.status);
                  if (r.structuredContent.status === "connected") await load();
                })
              }
            >
              Check connection
            </button>
          </>
        ) : (
          <fieldset
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                signIn();
              }
            }}
          >
            <legend>
              {status === "mfa_required"
                ? "Verify Garmin sign-in"
                : "Garmin sign-in"}
            </legend>
            {status === "mfa_required" ? (
              <label>
                Verification code
                <input
                  value={code}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={10}
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
            ) : (
              <>
                <label>
                  Garmin email
                  <input
                    type="email"
                    autoComplete="username"
                    value={username}
                    maxLength={320}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </label>
                <label>
                  Garmin password
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    maxLength={1024}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
              </>
            )}
            <button
              type="button"
              className="button primary"
              disabled={
                status === "mfa_required"
                  ? !/^\d{4,10}$/.test(code)
                  : !username || !password
              }
              onClick={signIn}
            >
              {status === "mfa_required" ? "Verify code" : "Connect Garmin"}
            </button>
          </fieldset>
        )
      ) : (
        <>
          <div className="garmin-toolbar">
            <strong>Garmin connected</strong>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => run(() => load(page?.start ?? 0))}
            >
              Refresh activities
            </button>
          </div>
          {!page ? (
            <p>No activities loaded yet.</p>
          ) : (
            <>
              {!page.activities.length && (
                <p>
                  No SUP activities on this page. Try an older page or import a
                  FIT file.
                </p>
              )}
              <ul className="garmin-activities">
                {page.activities.map((a) => (
                  <li key={a.activity_id}>
                    <div>
                      <strong>{a.name}</strong>
                      <span className="caption">
                        {a.start_utc
                          ? new Date(a.start_utc).toLocaleString(undefined, {
                              timeZone: "UTC",
                            }) + " UTC"
                          : "Start time unavailable"}{" "}
                        · <Measure value={a.distance_m} group="distance" /> ·{" "}
                        {durationLabel(
                          a.duration_s == null ? null : a.duration_s / 60,
                        )}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="button secondary"
                      aria-label={`Preview activity ${a.activity_id}`}
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          const result = await callTool(
                            "preview_garmin_activity",
                            { activity_id: a.activity_id, timezone },
                          );
                          onPreview(result);
                        })
                      }
                    >
                      Preview
                    </button>
                  </li>
                ))}
              </ul>
              <div className="garmin-toolbar">
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy || page.start === 0}
                  onClick={() => run(() => load(Math.max(0, page.start - 20)))}
                >
                  Newer activities
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy || page.next_start == null}
                  onClick={() => run(() => load(page.next_start))}
                >
                  Older activities
                </button>
              </div>
            </>
          )}
        </>
      )}
      {(status === "connected" || status === "mfa_required") && (
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await callTool("disconnect_garmin");
              setStatus("disconnected");
              setPage(null);
              setCode("");
            })
          }
        >
          Disconnect Garmin
        </button>
      )}
      {busy && <p role="status">Contacting Garmin…</p>}
      {error && (
        <p role="alert" className="dialog-error">
          {error}
        </p>
      )}
    </section>
  );
}
