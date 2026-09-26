// A truthful sample-only import boundary. General FIT decoding is deferred.
export async function findSampleSession(file, sessions) {
  if (!/\.(fit|zip)$/i.test(file.name))
    throw new Error("Choose a Garmin .fit or .zip file.");
  if (file.size > 30_000_000)
    throw new Error("This prototype accepts sample files up to 30 MB.");
  const digest = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const match = sessions.find(
    (s) =>
      s.hashes?.fit_sha256 === digest || s.hashes?.archive_sha256 === digest,
  );
  if (!match)
    throw new Error(
      "New FIT decoding is on the to-do list. This preview opens the three supplied sample FIT or ZIP files. Your file was not stored.",
    );
  return match;
}
