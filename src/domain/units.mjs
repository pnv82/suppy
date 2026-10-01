export const UNIT_GROUPS = {
  speed: {
    label: "Speed",
    description: "Paddling pace, wind and gusts",
    options: {
      mph: { label: "Miles per hour", symbol: "mph", factor: 0.44704 },
      kmh: { label: "Kilometres per hour", symbol: "km/h", factor: 1 / 3.6 },
      mps: { label: "Metres per second", symbol: "m/s", factor: 1 },
    },
  },
  distance: {
    label: "Distance",
    description: "Sessions, station distances and map scale",
    options: {
      mi: { label: "Miles", symbol: "mi", factor: 1609.344 },
      km: { label: "Kilometres", symbol: "km", factor: 1000 },
    },
  },
  length: {
    label: "Length",
    description: "Distance per stroke and short measurements",
    options: {
      m: { label: "Metres", symbol: "m", factor: 1 },
      ft: { label: "Feet", symbol: "ft", factor: 0.3048 },
    },
  },
  temperature: {
    label: "Temperature",
    description: "Air temperature and temperature changes",
    options: {
      F: { label: "Fahrenheit", symbol: "°F", factor: 5 / 9, offset: 32 },
      C: { label: "Celsius", symbol: "°C", factor: 1 },
    },
  },
};
export const DEFAULT_UNITS = Object.freeze({
  speed: "mph",
  distance: "mi",
  length: "m",
  temperature: "F",
});
export function unitPreferences(value = {}) {
  return Object.fromEntries(
    Object.entries(DEFAULT_UNITS).map(([group, fallback]) => [
      group,
      Object.hasOwn(UNIT_GROUPS[group].options, value?.[group])
        ? value[group]
        : fallback,
    ]),
  );
}
export function validateUnits(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== Object.keys(DEFAULT_UNITS).length ||
    Object.keys(value).some(
      (group) =>
        !Object.hasOwn(UNIT_GROUPS, group) ||
        !Object.hasOwn(UNIT_GROUPS[group].options, value[group]),
    )
  )
    throw new Error("Choose a supported unit for each measurement group.");
  return { ...value };
}
export function unitDefinition(group, preferences = DEFAULT_UNITS) {
  return UNIT_GROUPS[group].options[unitPreferences(preferences)[group]];
}
export function fromSI(
  value,
  group,
  preferences = DEFAULT_UNITS,
  delta = false,
) {
  if (!Number.isFinite(value)) return null;
  const unit = unitDefinition(group, preferences);
  return value / unit.factor + (delta ? 0 : unit.offset || 0);
}
export function toSI(value, group, preferences = DEFAULT_UNITS, delta = false) {
  if (!Number.isFinite(value)) return null;
  const unit = unitDefinition(group, preferences);
  return (value - (delta ? 0 : unit.offset || 0)) * unit.factor;
}
export function formatUnit(
  value,
  group,
  preferences = DEFAULT_UNITS,
  { dp = 2, suffix = "", delta = false } = {},
) {
  const converted = fromSI(value, group, preferences, delta);
  return `${converted == null ? "—" : converted.toFixed(dp)} ${unitDefinition(group, preferences).symbol}${suffix}`;
}
export function alternateUnits(
  value,
  group,
  preferences = DEFAULT_UNITS,
  options = {},
) {
  if (!Number.isFinite(value)) return "";
  const current = unitPreferences(preferences)[group];
  return Object.keys(UNIT_GROUPS[group].options)
    .filter((key) => key !== current)
    .map((key) =>
      formatUnit(value, group, { ...preferences, [group]: key }, options),
    )
    .join(" · ");
}
