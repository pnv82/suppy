import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createStore } from "../server/store.mjs";
import { findSampleSession } from "../src/services/sample-import.mjs";
test("sample import recognizes all original FIT/ZIP bytes, even when renamed", async () => {
  const sessions = createStore().dashboard().sessions;
  for (const session of sessions.filter((s) => s.hashes)) {
    for (const type of ["fit", "archive"]) {
      const bytes = readFileSync(
        new URL("../" + session.hashes[type], import.meta.url),
      );
      const file = new File(
        [bytes],
        type === "fit" ? "renamed.fit" : "renamed.zip",
      );
      assert.equal((await findSampleSession(file, sessions)).id, session.id);
    }
  }
});
test("unsupported, oversized and unfamiliar files fail without claiming an import", async () => {
  await assert.rejects(
    () => findSampleSession(new File(["example"], "notes.txt"), []),
    /Choose a Garmin/,
  );
  await assert.rejects(
    () => findSampleSession({ name: "large.fit", size: 30_000_001 }, []),
    /30 MB/,
  );
  await assert.rejects(
    () => findSampleSession(new File(["unknown bytes"], "new.fit"), []),
    /file was not stored/,
  );
});
