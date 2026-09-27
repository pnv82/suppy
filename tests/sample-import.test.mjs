import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { findSampleSession } from "../src/services/sample-import.mjs";
test("sample recognition matches stored checksums even when files are renamed", async () => {
  const bytes = Buffer.from(
    "Synthetic recognition fixture; decoding is not part of this operation.",
  );
  const hash = createHash("sha256").update(bytes).digest("hex");
  const sessions = [
    { id: "synthetic", hashes: { fit_sha256: hash, archive_sha256: hash } },
  ];
  for (const session of sessions.filter((s) => s.hashes)) {
    for (const type of ["fit", "archive"]) {
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
