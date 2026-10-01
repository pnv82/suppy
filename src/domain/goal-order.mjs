// Insert before a goal in the destination bucket; null appends, including to an empty bucket.
// Return null for invalid or unchanged drops, so they never write to storage.
export function goalDropOrder(goals, id, active, beforeId = null) {
  if (!goals.some((goal) => goal.id === id) || typeof active !== "boolean")
    return null;
  const original = {
    active_ids: goals.filter((goal) => goal.active).map((goal) => goal.id),
    inactive_ids: goals.filter((goal) => !goal.active).map((goal) => goal.id),
  };
  const order = {
    active_ids: original.active_ids.filter((goalId) => goalId !== id),
    inactive_ids: original.inactive_ids.filter((goalId) => goalId !== id),
  };
  const bucket = active ? order.active_ids : order.inactive_ids;
  const index = beforeId == null ? bucket.length : bucket.indexOf(beforeId);
  if (index < 0) return null;
  bucket.splice(index, 0, id);
  return JSON.stringify(order) === JSON.stringify(original) ? null : order;
}
