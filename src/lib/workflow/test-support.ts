import { Pool } from "pg";
import { createDb, runMigrations } from "../db/client";
import { runEvents, approvals, proposals, runs } from "../db/schema";

/** Creates (if needed) and migrates a scratch Postgres database next to the app database. */
export async function createTestDb(baseUrl: string, name = "copilot_test") {
  const admin = new Pool({ connectionString: baseUrl });
  const exists = await admin.query("select 1 from pg_database where datname = $1", [name]);
  if (exists.rowCount === 0) await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  const handle = createDb(url.toString());
  await runMigrations(handle.db);
  return handle;
}

export async function resetTestDb(db: ReturnType<typeof createDb>["db"]) {
  await db.delete(runEvents);
  await db.delete(approvals);
  await db.delete(proposals);
  await db.delete(runs);
}
