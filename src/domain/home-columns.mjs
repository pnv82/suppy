export const HOME_COLUMNS = Object.freeze({
  speed: "Speed @ cadence",
  maxSpeed: "Max speed (10 s)",
  dps: "Distance / stroke",
  tracking: "TCS",
  hr: "Heart rate",
  bestWindows: "Best 5 / 10 / 20 min",
  distance: "Distance",
  active: "Active time",
  elapsed: "Elapsed time",
  board: "Board",
  type: "Session type",
  medianSpeed: "Median speed",
  cadence: "Cadence",
  wind: "Wind",
  availability: "Data availability",
});
export const DEFAULT_HOME_COLUMNS = Object.freeze([
  "speed",
  "maxSpeed",
  "dps",
  "tracking",
  "hr",
]);
export function validateHomeColumns(columns) {
  if (
    !Array.isArray(columns) ||
    columns.some((c) => !Object.hasOwn(HOME_COLUMNS, c)) ||
    new Set(columns).size !== columns.length
  )
    throw new Error("Choose unique supported Home columns.");
  // Stable display order; selecting/deselecting never unexpectedly reorders a table.
  return Object.keys(HOME_COLUMNS).filter((c) => columns.includes(c));
}
