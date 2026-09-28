import React, { useEffect, useState } from "react";
import { callTool } from "../services/client.mjs";
import { observationAt, weatherInput } from "../domain/weather.mjs";
import { timeLabel, mph } from "../domain/metrics.mjs";

const value = (n, unit, digits = 1) =>
  Number.isFinite(n) ? `${n.toFixed(digits)} ${unit}` : "Unknown";
function WindAdjustment({ session }) {
  const [editing, setEditing] = useState(false),
    [speed, setSpeed] = useState(""),
    [direction, setDirection] = useState(""),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  function edit() {
    setSpeed(
      session.wind == null ? "" : String(Number(session.wind.toFixed(2))),
    );
    setDirection(
      session.windFrom == null
        ? ""
        : String(Number(session.windFrom.toFixed(1))),
    );
    setNote(session.windAdjustment?.note || "");
    setMessage("");
    setEditing(true);
  }
  async function save(wind) {
    setBusy(true);
    setMessage("");
    try {
      await callTool("set_session_wind", { session_id: session.id, wind });
      setEditing(false);
      setMessage(
        wind
          ? "On-water wind saved."
          : "Adjustment removed; original weather restored.",
      );
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="wind-adjustment">
      {session.windAdjustment && (
        <p>
          <b>On-water report · whole session:</b>{" "}
          {value(mph(session.windAdjustment.wind_speed_mps), "mph")} · from{" "}
          {value(session.windAdjustment.wind_from_deg, "°", 0)}
          {session.windAdjustment.note
            ? ` · ${session.windAdjustment.note}`
            : ""}
        </p>
      )}
      {!editing ? (
        <div className="wind-form-actions">
          <button className="text-button" onClick={edit}>
            Adjust on-water wind
          </button>
          {session.windAdjustment && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => save(null)}
            >
              Remove adjustment
            </button>
          )}
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (speed === "" && direction === "") {
              setMessage("Enter a speed or direction.");
              return;
            }
            save({
              wind_speed_mps: speed === "" ? null : Number(speed) * 0.44704,
              wind_from_deg: direction === "" ? null : Number(direction),
              note,
            });
          }}
        >
          <p>
            Athlete report for the whole session. Station data stays unchanged.
            Blank means unknown.
          </p>
          <div className="wind-form-fields">
            <label>
              Wind (mph)
              <input
                type="number"
                min="0"
                max="178"
                step="any"
                value={speed}
                onChange={(e) => setSpeed(e.target.value)}
                autoFocus
              />
            </label>
            <label>
              From (°)
              <input
                type="number"
                min="0"
                max="359.999"
                step="any"
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
              />
            </label>
          </div>
          <label>
            Note (optional)
            <input
              value={note}
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. sheltered water"
            />
          </label>
          <div className="wind-form-actions">
            <button className="text-button" disabled={busy} type="submit">
              {busy ? "Saving…" : "Save wind"}
            </button>
            <button
              className="text-button"
              disabled={busy}
              type="button"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
export function WeatherPanel({ session, cursor }) {
  const [error, setError] = useState(""),
    [sending, setSending] = useState(false);
  const weather = session.weather,
    data = weather?.data;
  const fetching = weather?.status === "fetching";
  let unavailable;
  try {
    weatherInput(session);
  } catch (e) {
    unavailable = e.message;
  }
  useEffect(() => {
    setError("");
  }, [session.id]);
  useEffect(() => {
    if (!fetching) return;
    let active = true,
      timer;
    async function poll() {
      try {
        await callTool("get_session_weather", { session_id: session.id });
        if (active) setError("");
      } catch (e) {
        if (active) setError(e.message);
      } finally {
        if (active) timer = setTimeout(poll, 2000);
      }
    }
    timer = setTimeout(poll, 1000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [session.id, fetching]);
  async function retrieve() {
    setSending(true);
    setError("");
    try {
      await callTool("fetch_session_weather", { session_id: session.id });
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }
  const observation = observationAt(
    data,
    Date.parse(session.startUtc) + cursor * 1000,
  );
  const wind = observation?.wind_speed_mps;
  return (
    <section className="weather-panel" aria-labelledby="weather-heading">
      <div className="section-heading">
        <h2 id="weather-heading">Weather</h2>
        <button
          className="text-button"
          disabled={sending || (fetching && !error) || Boolean(unavailable)}
          onClick={retrieve}
        >
          {sending || (fetching && !error)
            ? "Retrieving…"
            : error || ["error", "unavailable"].includes(weather?.status)
              ? "Retry weather"
              : data
                ? "Refresh weather"
                : "Retrieve weather"}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <WindAdjustment session={session} />
      <p role="status">
        {fetching
          ? "Retrieving historical station observations. Your session is saved."
          : unavailable ||
            weather?.message ||
            (data
              ? `${data.station.name} (${data.station.id}) · ${(data.station.distance_m / 1609.344).toFixed(1)} mi from the first recorded GPS point`
              : "No retrieved observations. Weather uses your recorded location and session time.")}
      </p>
      {data && (
        <>
          {["error", "unavailable", "fetching"].includes(weather.status) && (
            <p>
              Showing the last successful retrieval from{" "}
              {data.source.retrieved_at_utc}.
            </p>
          )}
          <div className="weather-at-time">
            <strong>Station · {timeLabel(cursor)} elapsed</strong>
            {observation ? (
              <>
                <span>
                  Wind {value(mph(wind), "mph")}
                  {wind === 0
                    ? " · calm"
                    : observation.wind_from_deg != null
                      ? ` · from ${value(observation.wind_from_deg, "°", 0)}`
                      : " · direction unknown"}
                </span>
                <span>Gust {value(mph(observation.gust_mps), "mph")}</span>
                <span>
                  Air{" "}
                  {value(
                    observation.temperature_c == null
                      ? null
                      : (observation.temperature_c * 9) / 5 + 32,
                    "°F",
                  )}
                </span>
                <span>
                  Humidity {value(observation.relative_humidity_pct, "%", 0)}
                </span>
              </>
            ) : (
              <span>No observation within 60 minutes of this point.</span>
            )}
          </div>
          <details className="weather-details">
            <summary>
              Source & observations ·{" "}
              {Math.round(data.summary.wind_speed_mps.coverage_pct)}% wind
              coverage
            </summary>
            <p>
              {observation &&
                `Observed ${observation.observed_at_utc} · ${Math.round(observation.age_s / 60)} min from cursor. `}
              Wind coverage:{" "}
              {Math.round(data.summary.wind_speed_mps.coverage_pct)}% of elapsed
              time. Move the performance cursor to inspect another time.
            </p>
            <p>
              <a
                href={data.source.documentation_url}
                target="_blank"
                rel="noreferrer"
              >
                {data.source.provider}
              </a>{" "}
              · routine and special METAR reports. Retrieved{" "}
              {data.source.retrieved_at_utc}.
            </p>
            <p>
              Session wind:{" "}
              {value(mph(data.summary.wind_speed_mps.value), "mph")} over
              covered time. Air temperature coverage:{" "}
              {Math.round(data.summary.temperature_c.coverage_pct)}%. Nearest
              observation within 60 minutes; gaps stay unknown. Refreshes are
              limited to once every 30 seconds.
            </p>
            {data.limitations.map((text) => (
              <p key={text}>{text}</p>
            ))}
            <div
              className="weather-table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Weather observations, scroll horizontally if needed"
            >
              <table>
                <caption>
                  Station observations · UTC · wind direction is from north
                </caption>
                <thead>
                  <tr>
                    <th>Observed (UTC)</th>
                    <th>Wind (mph)</th>
                    <th>From (°)</th>
                    <th>Gust (mph)</th>
                    <th>Air (°F)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.observations.map((o) => (
                    <tr key={o.observed_at_utc}>
                      <td>
                        {o.observed_at_utc
                          .replace("T", " ")
                          .replace(".000Z", "")}
                      </td>
                      <td>{value(mph(o.wind_speed_mps), "")}</td>
                      <td>{value(o.wind_from_deg, "", 0)}</td>
                      <td>{value(mph(o.gust_mps), "")}</td>
                      <td>
                        {value(
                          o.temperature_c == null
                            ? null
                            : (o.temperature_c * 9) / 5 + 32,
                          "",
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
      <p className="weather-caveat">
        Nearby station context; conditions on the water can differ.
        {!data && session.station
          ? ` Stored historical wind summary: ${session.station}.`
          : ""}
      </p>
      <p className="weather-caveat">
        HR: {session.hrQuality || "quality unknown"}
      </p>
    </section>
  );
}
