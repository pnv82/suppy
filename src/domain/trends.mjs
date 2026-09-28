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
