import { randomUUID } from "node:crypto";
import { weatherInput } from "../../src/domain/weather.mjs";
import { createIemProvider } from "./iem.mjs";

// Separate post-commit enrichment. No decoder dependency and no network inside a
// SQLite transaction. The last successful evidence survives a failed refresh.
export function createWeatherService({
  provider = createIemProvider(),
  now = () => Date.now(),
} = {}) {
  const jobs = new Map();
  const key = (store, id) => `${store.tenantId}/${id}`;
  const stamp = () => new Date(now()).toISOString();
  function status(store, id) {
    const weather = store.get(id).weather ?? { status: "not_requested" };
    if (weather.status === "fetching" && !jobs.has(key(store, id))) {
      // A process restart does not silently leave a session pending forever.
      return {
        ...weather,
        status: "error",
        message:
          "Weather retrieval was interrupted. Retry to fetch observations.",
      };
    }
    return weather;
  }
  function start(store, id, { force = false } = {}) {
    const session = store.get(id),
      jobKey = key(store, id);
    if (jobs.has(jobKey)) return status(store, id);
    if (!force && session.weather?.data) return status(store, id);
    if (
      session.weather?.attempt?.finished_at_utc &&
      now() - Date.parse(session.weather.attempt.finished_at_utc) < 30000
    )
      return {
        ...status(store, id),
        message:
          `${status(store, id).message || ""} Please wait 30 seconds after the last retrieval before refreshing.`.trim(),
      };
    const attempt = { id: randomUUID(), started_at_utc: stamp() };
    let input;
    try {
      input = weatherInput(session);
    } catch (error) {
      const weather = {
        ...session.weather,
        status: "unavailable",
        message: error.message,
        attempt: { ...attempt, finished_at_utc: stamp() },
      };
      store.saveWeather({ session_id: id, weather });
      return weather;
    }
    const initial = {
      ...session.weather,
      status: "fetching",
      message: null,
      attempt: { ...attempt, input },
    };
    store.saveWeather({ session_id: id, weather: initial });
    const job = Promise.resolve()
      .then(async () => {
        let result;
        try {
          result = await provider.retrieve(input);
        } catch (error) {
          result = {
            status: "error",
            message:
              error.name === "TimeoutError" || error.name === "AbortError"
                ? "Weather provider timed out. Retry later."
                : `Weather retrieval failed: ${error.message}`,
          };
        }
        const { provenance, ...evidence } = result;
        store.saveWeather({
          session_id: id,
          expected_attempt_id: attempt.id,
          provenance,
          weather: {
            ...initial,
            ...evidence,
            attempt: { ...initial.attempt, finished_at_utc: stamp() },
          },
        });
      })
      .catch((error) => {
        // Persistence failures must never surface as an unhandled rejection or an
        // upload failure. status() exposes an interrupted attempt once the job ends.
        console.error("Weather evidence could not be saved:", error.message);
      })
      .finally(() => jobs.delete(jobKey));
    jobs.set(jobKey, job);
    return initial;
  }
  return { start, status, idle: () => Promise.all([...jobs.values()]) };
}
