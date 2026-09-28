import test from "node:test";
import assert from "node:assert/strict";
import { previousThreeChange } from "../src/domain/trends.mjs";
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
