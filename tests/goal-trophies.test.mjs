import test from "node:test";
import assert from "node:assert/strict";
import { sessionGoalAchievements } from "../src/domain/goals.mjs";

const goal = (metric, target_si, overrides = {}) => ({
  id: metric,
  metric,
  target_si,
  active: true,
  ...overrides,
});
const session = {
  statistics: { speed_mps: { max: 3 } },
  deterministic: {
    summary: {
      speed_cadence: { speed_mps: 2, cadence_spm: 30, coverage_pct: 100 },
      distance: { mean_speed_mps: 2.1 },
      tracking: { score: 85 },
      heart_rate_bpm: { mean: 130 },
      distance_per_stroke: { value_m: 4 },
    },
  },
  windows: [300, 600, 1200].map((duration) => ({
    duration,
    start: 0,
    end: duration,
    speed_mps: 2.5,
    statistics: { tracking: { score: 95 } },
  })),
  customIntervals: [{ id: "custom", duration: 1200, speed_mps: 4 }],
};

test("session trophies match displayed whole-session values, including exact equality", () => {
  const goals = [
    goal("max_speed", 3),
    goal("average_speed", 2),
    goal("tracking_control", 85),
  ];
  const result = sessionGoalAchievements(session, goals);
  assert.equal(result.maxSpeed, goals[0]);
  assert.equal(result.speed, goals[1]);
  assert.equal(result.tracking, goals[2]);
  // The displayed paired average is lower than the unpaired distance mean.
  assert.equal(
    sessionGoalAchievements(session, [goal("average_speed", 2.05)]).speed,
    null,
  );
  assert.equal(
    sessionGoalAchievements(session, [goal("max_speed", 3.00001)]).maxSpeed,
    null,
  );
});

test("interval trophies match only the corresponding best-duration speed goal", () => {
  const goals = [
    goal("average_speed", 1),
    goal("max_speed", 2),
    goal("tracking_control", 80),
    ...[300, 600, 1200].map((duration) => goal(`best_${duration}`, 2.5)),
  ];
  for (const duration of [300, 600, 1200]) {
    const result = sessionGoalAchievements(session, goals, duration);
    assert.equal(result.speed.metric, `best_${duration}`);
    assert.equal(result.tracking, null);
    assert.equal(result.maxSpeed.metric, "max_speed");
  }
  assert.equal(
    sessionGoalAchievements(session, [goal("best_300", 1)], 1200).speed,
    null,
  );
  assert.equal(sessionGoalAchievements(session, goals, "custom").speed, null);
  assert.equal(sessionGoalAchievements(session, goals, "manual").speed, null);
});

test("trophies ignore inactive, unset, missing and non-finite values without borrowing other sessions", () => {
  for (const overrides of [
    { active: false },
    { target_si: null },
    { target_si: 0 },
    { target_si: NaN },
  ]) {
    assert.equal(
      sessionGoalAchievements(session, [goal("max_speed", 2, overrides)])
        .maxSpeed,
      null,
    );
  }
  const goals = [
    goal("max_speed", 2),
    goal("average_speed", 1),
    goal("best_1200", 2),
    goal("tracking_control", 80),
  ];
  const empty = { ...session, statistics: {}, deterministic: {}, windows: [] };
  assert.deepEqual(sessionGoalAchievements(empty, goals), {
    speed: null,
    maxSpeed: null,
    tracking: null,
  });
  assert.equal(sessionGoalAchievements(empty, goals, 1200).speed, null);
  assert.equal(
    sessionGoalAchievements(
      { ...session, statistics: { speed_mps: { max: Infinity } } },
      goals,
    ).maxSpeed,
    null,
  );
});

test("ordinary metrics cannot earn cadence-duration, stroke, economy, endurance or practice trophies", () => {
  const goals = [
    "cadence_duration",
    "stroke_effectiveness",
    "effort_economy",
    "endurance",
    "turns_footwork",
  ].map((metric) => goal(metric, 1));
  for (const scope of [null, 300, 1200, "custom"])
    assert.deepEqual(sessionGoalAchievements(session, goals, scope), {
      speed: null,
      maxSpeed: null,
      tracking: null,
    });
});
