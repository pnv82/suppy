// One identity owns each request, including time spent acquiring its SDK token.
export function createRequestSession(fetcher = fetch) {
  let generation = 0,
    getToken = null,
    onUnauthorized = null;
  const pending = new Set();
  function reset(tokenGetter = null, unauthorized = null) {
    generation++;
    for (const controller of pending) controller.abort();
    pending.clear();
    getToken = tokenGetter;
    onUnauthorized = unauthorized;
  }
  async function request(url, options = {}) {
    const current = generation,
      tokenGetter = getToken;
    const controller = new AbortController();
    pending.add(controller);
    const assertCurrent = () => {
      if (current !== generation || controller.signal.aborted)
        throw new DOMException("Account changed.", "AbortError");
    };
    try {
      let token;
      try {
        token = tokenGetter ? await tokenGetter() : null;
      } catch (error) {
        assertCurrent();
        onUnauthorized?.();
        throw error;
      }
      assertCurrent();
      const headers = new Headers(options.headers);
      if (tokenGetter) {
        if (!token) throw new Error("Sign in to Suppy.");
        headers.set("Authorization", `Bearer ${token}`);
      }
      const response = await fetcher(url, {
        ...options,
        headers,
        signal: controller.signal,
        cache: "no-store",
      });
      assertCurrent();
      const data = await response.json();
      assertCurrent();
      if (!response.ok) {
        if (response.status === 401) onUnauthorized?.();
        throw new Error(data.error || "Request failed");
      }
      return data;
    } finally {
      pending.delete(controller);
    }
  }
  return { reset, request };
}
