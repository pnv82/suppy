import { executeTool, toolSchemas } from "./tools.mjs";

// Application orchestration only: FIT commit remains synchronous and offline.
export function dispatchTool(store, name, input, weatherService) {
  if (name === "fetch_session_weather" || name === "get_session_weather") {
    const { session_id } = toolSchemas[name].parse(input);
    const weather =
      name === "fetch_session_weather"
        ? weatherService.start(store, session_id, { force: true })
        : weatherService.status(store, session_id);
    const appData = store.dashboard();
    appData.sessions = appData.sessions.map((s) =>
      s.id === session_id ? { ...s, weather } : s,
    );
    return {
      content: [
        {
          type: "text",
          text: `Weather: ${weather.status}. Station observations are context, not on-water measurements.`,
        },
      ],
      structuredContent: { session_id, weather },
      _meta: { appData },
    };
  }
  const result = executeTool(store, name, input);
  if (name === "commit_fit_import") {
    try {
      result.structuredContent.weather_status = weatherService.start(
        store,
        result.structuredContent.session_id,
      ).status;
      result._meta.appData = store.dashboard();
    } catch {
      // The FIT transaction has already succeeded. A separate retry is available.
      result.structuredContent.weather_status = "error";
    }
  }
  return result;
}
