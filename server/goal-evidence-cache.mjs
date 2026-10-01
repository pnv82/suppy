import {
  extendedGoalEvidence,
  GOAL_METHOD,
} from "../src/domain/goal-evidence.mjs";

function resolved(result) {
  return (
    typeof result?.method === "string" &&
    result.method.length > 0 &&
    (Number.isFinite(result.value_si) ||
      (result.value_si === null &&
        typeof result.reason === "string" &&
        result.reason.length > 0))
  );
}

// Called on session/dashboard reads. A supported null with a reason is a
// completed calculation, not a reason to retry on every render/request.
// The owner scopes this cache to one database, tenant and session.
export function resolveGoalEvidence(
  cache,
  session,
  goals,
  inputHash,
  calculate = extendedGoalEvidence,
) {
  const ids = new Set(goals.map((goal) => goal.id));
  for (const id of cache.keys()) if (!ids.has(id)) cache.delete(id);
  return Object.fromEntries(
    goals.map((goal) => {
      const signature = JSON.stringify([GOAL_METHOD, inputHash, goal]);
      let entry = cache.get(goal.id);
      if (entry?.signature !== signature || !resolved(entry.result)) {
        entry = { signature, result: calculate(session, goal) };
        cache.set(goal.id, entry);
      }
      return [goal.id, entry.result];
    }),
  );
}
