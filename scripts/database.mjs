import { openDatabase } from "../server/database.mjs";
const [command, argument] = process.argv.slice(2);
const tenantId = process.env.SUP_TENANT_ID || "local";
const database = openDatabase();
try {
  if (command === "create-tenant" && argument) {
    database.createTenant(argument);
    console.log(`Tenant ready: ${argument}`);
  } else if (command === "backup" && argument) {
    await database.backup(argument);
    console.log(`Backup saved: ${argument}`);
  } else if (command === "check") {
    const result = database.integrity();
    console.log(JSON.stringify(result, null, 2));
    if (
      result.foreignKeys.length ||
      result.integrity.some((r) => r.integrity_check !== "ok")
    )
      process.exitCode = 1;
  } else if (
    command === "seed-demo" &&
    process.env.NODE_ENV === "development"
  ) {
    const { fixtureState } = await import("../tests/fixtures.mjs");
    database.createTenant(tenantId);
    console.log(
      `Imported ${database.importState(tenantId, fixtureState())} synthetic sessions into ${database.path}.`,
    );
  } else {
    throw new Error(
      "Usage: npm run db -- create-tenant <id> | backup <new-file> | check | seed-demo (NODE_ENV=development only)",
    );
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  database.close();
}
