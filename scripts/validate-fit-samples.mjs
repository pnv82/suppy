// Opt-in, read-only integration check against locally supplied private samples.
// Normal npm tests use synthetic fixtures and never require these files.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, resolve } from "node:path";
import { decodeUpload, sha256 } from "../server/fit-import.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(
  readFileSync(resolve(root, "data/samples/garmin/manifest.json"), "utf8"),
);
let failed = 0;
for (const sample of manifest.samples) {
  try {
    const bytes = {};
    for (const kind of ["archive", "fit"]) {
      bytes[kind] = readFileSync(resolve(root, sample[kind]));
      assert.equal(bytes[kind].length, sample[`${kind}_bytes`], `${kind} size`);
      assert.equal(
        sha256(bytes[kind]),
        sample[`${kind}_sha256`],
        `${kind} checksum`,
      );
    }
    const decoded = decodeUpload({
      filename: basename(sample.archive),
      data_base64: bytes.archive.toString("base64"),
      timezone: "UTC",
    });
    assert.deepEqual(
      decoded.fit,
      bytes.fit,
      "Extracted FIT differs from archived bytes",
    );
    assert.deepEqual(decoded.original, bytes.archive, "Original ZIP changed");
    const { session } = decoded;
    assert.ok(
      session.windows.every(
        (w) =>
          w.end === null || w.end <= session.deviceSummary.total_elapsed_time,
      ),
    );
    const tail = session.quality.find(
      (q) => q.code === "record_after_reported_end",
    );
    console.log(
      `${sample.session_id}: PASS; ${session.records.length} records${tail ? `; timer/summary difference ${tail.difference_s} s` : ""}`,
    );
  } catch (error) {
    failed++;
    console.error(`${sample.session_id}: FAIL; ${error.message}`);
  }
}
console.log(
  `${manifest.samples.length - failed}/${manifest.samples.length} supplied FIT/ZIP samples passed; no database writes.`,
);
process.exitCode = failed ? 1 : 0;
