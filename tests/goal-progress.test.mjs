import test from "node:test";
import assert from "node:assert/strict";
import { goalProgress, sessionGoalProgress } from "../src/domain/goals.mjs";

test("goal colors use the target as denominator and exact 10/20 percent boundaries", () => {
  const goal = { metric: "max_speed", target_si: 5 };
  for (const [value_si, state] of [
    [0, "far"],
    [3.9999, "far"],
    [4, "neutral"],
    [4.25, "neutral"],
    [4.4999, "neutral"],
    [4.5, "near"],
    [4.9999, "near"],
    [5, "achieved"],
    [8, "achieved"],
  ])
    assert.equal(
      goalProgress(goal, { value_si }).state,
      state,
      String(value_si),
    );
  assert.equal(goalProgress(goal, { value_si: 3 }).gapPercent, 40);
  assert.match(goalProgress(goal, { value_si: 3 }).label, /40.0% below target/);
  // Unit conversion must not tip mathematically exact boundaries into a different color.
  const converted = { ...goal, target_si: 5 * 0.44704 };
  assert.equal(
    goalProgress(converted, { value_si: 4.5 * 0.44704 }).state,
    "near",
  );
  assert.equal(
    goalProgress(converted, { value_si: 4 * 0.44704 }).state,
    "neutral",
  );
});

test("lower-is-better economy colors reverse direction, including overachievement", () => {
  const goal = { metric: "effort_economy", target_si: 100 };
  for (const [value_si, state] of [
    [70, "achieved"],
    [100, "achieved"],
    [105, "near"],
    [110, "near"],
    [110.001, "neutral"],
    [120, "neutral"],
    [120.001, "far"],
  ])
    assert.equal(
      goalProgress(goal, { value_si }).state,
      state,
      String(value_si),
    );
  assert.match(
    goalProgress(goal, { value_si: 130 }).label,
    /30.0% above target · lower is better/,
  );
});

test("missing and unset goal results stay uncolored", () => {
  const goal = { metric: "tracking_control", target_si: 90 };
  for (const value_si of [undefined, null, NaN, Infinity])
    assert.equal(goalProgress(goal, { value_si }), null);
  for (const target_si of [undefined, null, 0, NaN, Infinity])
    assert.equal(goalProgress({ ...goal, target_si }, { value_si: 80 }), null);
  assert.equal(goalProgress(null, { value_si: 80 }), null);
  assert.equal(goalProgress(goal, null), null);
});

test("session progress uses only the matching active metric and scope", () => {
  const session = {
    statistics: { speed_mps: { max: 3 } },
    deterministic: {
      summary: { distance: { mean_speed_mps: 2 }, tracking: { score: 90 } },
    },
    windows: [{ duration: 1200, speed_mps: 2.3 }],
    customIntervals: [{ id: "custom", duration: 1200, speed_mps: 2.3 }],
  };
  const goals = [
    { id: "max", metric: "max_speed", target_si: 4, active: true },
    { id: "avg", metric: "average_speed", target_si: 2.3, active: true },
    { id: "best", metric: "best_1200", target_si: 2.5, active: true },
    { id: "tcs", metric: "tracking_control", target_si: 100, active: true },
  ];
  const whole = sessionGoalProgress(session, goals);
  assert.equal(whole.maxSpeed.state, "far");
  assert.equal(whole.speed.state, "neutral");
  assert.equal(whole.tracking.state, "near");
  const interval = sessionGoalProgress(session, goals, 1200);
  assert.equal(interval.speed.state, "near");
  assert.equal(interval.speed.goal.id, "best");
  assert.equal(interval.tracking, null);
  assert.equal(sessionGoalProgress(session, goals, "custom").speed, null);
  assert.equal(
    sessionGoalProgress(
      session,
      goals.map((g) => ({ ...g, active: false })),
    ).maxSpeed,
    null,
  );
});
