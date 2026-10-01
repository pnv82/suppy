export function trendAvailability(rows, key, goal) {
  const available = rows.filter((row) => Number.isFinite(row[key])).length;
  const reasons = new Map();
  for (const row of rows) {
    if (Number.isFinite(row[key])) continue;
    const reason =
      (goal && row.goalMetrics?.[goal.id]?.reason) ||
      "Not enough supported telemetry for this metric.";
    reasons.set(reason, (reasons.get(reason) || 0) + 1);
  }
  return {
    available,
    total: rows.length,
    reasons: [...reasons].map(([reason, count]) => ({ reason, count })),
  };
}

// Three immediately preceding sessions; missing values never become zero or
// cause us to silently choose a different historical comparison window.
export function previousThreeChange(rows, index, key) {
  const current = rows[index]?.[key];
  const previous = rows.slice(index + 1, index + 4).map((row) => row[key]);
  if (
    !Number.isFinite(current) ||
    previous.length !== 3 ||
    previous.some((v) => !Number.isFinite(v))
  )
    return null;
  const baseline = previous.reduce((sum, v) => sum + v, 0) / 3;
  if (baseline <= 0) return null;
  const percent = ((current - baseline) / baseline) * 100;
  return Math.abs(percent) > 5 + 1e-10 ? { percent, baseline } : null;
}
