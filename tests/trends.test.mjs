import test from "node:test";
import assert from "node:assert/strict";
import {
  previousThreeChange,
  trendAvailability,
} from "../src/domain/trends.mjs";

test("trend availability distinguishes valid zero, missing evidence and grouped unavailable reasons", () => {
  const row = (value, reason) => ({
    value,
    goalMetrics: { economy: { value_si: value, reason } },
  });
  const goal = { id: "economy" };
  assert.deepEqual(
    trendAvailability(
      [
        row(null, "Missing HR"),
        row(null, "Missing HR"),
        row(null, "No matching pace"),
      ],
      "value",
      goal,
    ),
    {
      available: 0,
      total: 3,
      reasons: [
        { reason: "Missing HR", count: 2 },
        { reason: "No matching pace", count: 1 },
      ],
    },
  );
  assert.equal(
    trendAvailability([row(0), row(140), row(null)], "value", goal).available,
    2,
  );
  assert.deepEqual(trendAvailability([], "value", goal), {
    available: 0,
    total: 0,
    reasons: [],
  });
  assert.equal(
    trendAvailability([{}], "value", goal).reasons[0].reason,
    "Not enough supported telemetry for this metric.",
  );
});
test("change compares the previous three, excludes exactly five percent, nulls and zero baselines", () => {
  const rows = (values) => values.map((value) => ({ value }));
  assert.deepEqual(
    previousThreeChange(rows([106, 90, 100, 110, 500]), 0, "value"),
    { percent: 6, baseline: 100 },
  );
  assert.equal(
    previousThreeChange(rows([105, 100, 100, 100]), 0, "value"),
    null,
  );
  assert.equal(
    previousThreeChange(rows([94, 100, null, 100, 100]), 0, "value"),
    null,
  );
  assert.equal(previousThreeChange(rows([94, 100, 100]), 0, "value"), null);
  assert.equal(previousThreeChange(rows([1, 0, 0, 0]), 0, "value"), null);
  assert.equal(
    previousThreeChange(rows([94, 100, 100, 100]), 0, "value").percent,
    -6,
  );
  assert.equal(
    previousThreeChange(rows([null, 100, 100, 100]), 0, "value"),
    null,
  );
});
