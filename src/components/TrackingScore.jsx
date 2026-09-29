import React from "react";
import { trackingBand } from "../domain/tracking-score.mjs";

export function TrackingScore({ value, label = false, detail = "" }) {
  const band = trackingBand(value);
  const available = band.key !== "unavailable";
  const text = available ? value.toFixed(1) : "—";
  return (
    <span
      className={`tracking-score tracking-score-${band.key}`}
      style={{ "--score-color": band.color }}
      title={`${band.label}${detail ? `. ${detail}` : ""}`}
      aria-label={`Tracking Control Score: ${available ? `${text} out of 100. ${band.label}` : "Unavailable"}${detail ? `. ${detail}` : ""}`}
    >
      {label && <span>TCS </span>}
      <b>{text}</b>
      <span> / 100</span>
    </span>
  );
}

export function TrackingDot({ cx, cy, value }) {
  if (!Number.isFinite(value) || !Number.isFinite(cx) || !Number.isFinite(cy))
    return null;
  const band = trackingBand(value);
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill={band.color}
      stroke="white"
      strokeWidth={1.5}
    />
  );
}
