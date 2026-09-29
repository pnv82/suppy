import React, { useEffect, useLayoutEffect, useState } from "react";
import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import { Waves } from "@phosphor-icons/react";
import { App } from "../App.jsx";
import { embedded, setAccountSession } from "../services/client.mjs";

function AuthScreen({ message, onLogin, onLogout, busy = false }) {
  return (
    <main className="loading-state auth-screen">
      <Waves size={38} aria-hidden="true" />
      <h1>Suppy</h1>
      <p role="status">{message}</p>
      {onLogin && (
        <button className="button primary" disabled={busy} onClick={onLogin}>
          Continue with Google
        </button>
      )}
      {onLogout && (
        <button className="button plain" onClick={onLogout}>
          Sign out
        </button>
      )}
    </main>
  );
}

function restoreLocation(appState) {
  const target = appState?.returnTo;
  // The SDK round trip restores only an app-relative route.
  const url =
    typeof target === "string" ? new URL(target, window.location.origin) : null;
  window.history.replaceState(
    {},
    "",
    url?.origin === window.location.origin && url.pathname !== "/auth/callback"
      ? url.pathname + url.search + url.hash
      : "/",
  );
}

function AuthenticatedWorkspace() {
  const {
    isLoading,
    isAuthenticated,
    user,
    error,
    loginWithRedirect,
    logout,
    getAccessTokenSilently,
  } = useAuth0();
  const identity = isAuthenticated ? user?.sub : null;
  const [ready, setReady] = useState(null),
    [blocked, setBlocked] = useState(false);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    // A failed callback is single-use too. Remove stale OAuth parameters before retry.
    if (error && window.location.pathname === "/auth/callback")
      restoreLocation(error.appState);
  }, [error]);
  useLayoutEffect(() => {
    setReady(null);
    if (identity && !blocked) {
      setAccountSession(getAccessTokenSilently, () => {
        setAccountSession();
        setBlocked(true);
        setMessage(
          "Your session ended. Continue with Google to sign in again.",
        );
      });
      setReady(identity);
    } else setAccountSession();
    return () => setAccountSession();
  }, [identity, blocked, getAccessTokenSilently]);

  async function signIn(switchAccount = false) {
    setAccountSession();
    setBlocked(true);
    setBusy(true);
    setMessage("");
    try {
      if (isAuthenticated) await logout({ openUrl: false });
      await loginWithRedirect({
        appState: {
          returnTo:
            window.location.pathname === "/auth/callback"
              ? "/"
              : window.location.pathname +
                window.location.search +
                window.location.hash,
        },
        authorizationParams: {
          connection: "google-oauth2",
          ...(switchAccount ? { prompt: "select_account" } : {}),
        },
      });
    } catch (e) {
      setMessage(e.message);
      setBusy(false);
    }
  }
  async function signOut() {
    setAccountSession();
    setBlocked(true);
    try {
      await logout({
        logoutParams: { returnTo: window.location.origin + "/" },
      });
    } catch (e) {
      setMessage(e.message);
    }
  }
  if (!isLoading && identity && !blocked && ready === identity)
    return (
      <App
        key={identity}
        account={{
          label: user.name || user.email || "Google account",
          email: user.email,
          onLogout: signOut,
          onSwitch: () => signIn(true),
        }}
      />
    );
  const cancelled = error?.error === "access_denied";
  const expired = ["state_mismatch", "missing_transaction"].includes(
    error?.error,
  );
  return (
    <AuthScreen
      busy={busy}
      message={
        isLoading
          ? "Checking your account…"
          : message ||
            (cancelled
              ? "Sign-in was cancelled. Your workspace is still private."
              : expired
                ? "Sign-in expired. Continue with Google to try again."
                : error?.message) ||
            "Sign in to review your SUP sessions."
      }
      onLogin={isLoading ? null : () => signIn()}
      onLogout={identity ? signOut : null}
    />
  );
}

export function AuthBoundary() {
  const [config, setConfig] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (embedded) return;
    const controller = new AbortController();
    fetch("/auth/config", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Authentication configuration is unavailable.");
        return response.json();
      })
      .then(setConfig)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, []);
  if (embedded || config?.mode === "local") return <App />;
  if (!config) return <AuthScreen message={error || "Loading Suppy…"} />;
  return (
    <Auth0Provider
      domain={config.domain}
      clientId={config.clientId}
      cacheLocation="memory"
      useRefreshTokens={false}
      authorizationParams={{
        redirect_uri: window.location.origin + "/auth/callback",
        audience: config.audience,
        scope: `openid profile email ${config.scope}`,
      }}
      onRedirectCallback={restoreLocation}
    >
      <AuthenticatedWorkspace />
    </Auth0Provider>
  );
}
