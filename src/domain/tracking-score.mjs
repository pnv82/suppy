export const TRACKING_BANDS = Object.freeze([
  {
    minimum: 90,
    key: "excellent",
    label: "Very strong trajectory control",
    color: "#166534",
  },
  {
    minimum: 80,
    key: "strong",
    label: "Strong trajectory control",
    color: "#0f766e",
  },
  {
    minimum: 70,
    key: "moderate",
    label: "Moderate trajectory control",
    color: "#855600",
  },
  {
    minimum: 60,
    key: "unstable",
    label: "Significant trajectory instability",
    color: "#9a3412",
  },
  {
    minimum: 0,
    key: "poor",
    label: "Poor trajectory control",
    color: "#b42318",
  },
]);
const UNAVAILABLE = {
  key: "unavailable",
  label: "Unavailable",
  color: "#63788d",
};
// Classify the displayed precision so 80.0 never has the 70–79 color.
export function trackingBand(value) {
  if (!Number.isFinite(value) || value < 0 || value > 100) return UNAVAILABLE;
  const displayed = Math.round(value * 10) / 10;
  return TRACKING_BANDS.find((band) => displayed >= band.minimum);
}
