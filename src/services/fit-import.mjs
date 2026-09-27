export async function uploadArguments(file, timezone) {
  if (!file || !/\.(fit|zip)$/i.test(file.name))
    throw new Error("Choose a Garmin .fit or one-FIT .zip file.");
  if (!file.size || file.size > 30_000_000)
    throw new Error("Choose a non-empty file up to 30 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 16384)
    binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return { filename: file.name, data_base64: btoa(binary), timezone };
}
