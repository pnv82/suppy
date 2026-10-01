import "./Units.css";
import React, { createContext, useContext, useMemo } from "react";
import {
  DEFAULT_UNITS,
  unitPreferences,
  unitDefinition,
  fromSI,
  toSI,
  formatUnit,
  alternateUnits,
} from "../domain/units.mjs";
const UnitsContext = createContext(DEFAULT_UNITS);
export function UnitsProvider({ value, children }) {
  const preferences = useMemo(() => unitPreferences(value), [value]);
  return (
    <UnitsContext.Provider value={preferences}>
      {children}
    </UnitsContext.Provider>
  );
}
export function useUnits() {
  const preferences = useContext(UnitsContext);
  return useMemo(
    () => ({
      preferences,
      symbol: (group) => unitDefinition(group, preferences).symbol,
      convert: (value, group, delta = false) =>
        fromSI(value, group, preferences, delta),
      toSI: (value, group, delta = false) =>
        toSI(value, group, preferences, delta),
      format: (value, group, options) =>
        formatUnit(value, group, preferences, options),
      alternate: (value, group, options) =>
        alternateUnits(value, group, preferences, options),
    }),
    [preferences],
  );
}
export function Measure({
  value,
  group,
  dp = 2,
  suffix = "",
  delta = false,
  showUnit = true,
  children,
}) {
  const units = useUnits();
  const alternate = units.alternate(value, group, { dp, suffix, delta });
  const number = units.convert(value, group, delta);
  return (
    <span className="unit-value" title={alternate || undefined}>
      {children ?? (
        <>
          {number == null ? "—" : number.toFixed(dp)}
          {showUnit && (
            <>
              {" "}
              <span className="unit-symbol">
                {units.symbol(group)}
                {suffix}
              </span>
            </>
          )}
        </>
      )}
      {alternate && <span className="sr-only"> ({alternate})</span>}
    </span>
  );
}
