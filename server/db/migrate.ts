import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Db } from "./index";

/** Applies pending SQL migrations from /drizzle (idempotent, transactional per migration). */
export async function runMigrations(db: Db) {
  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
}
