import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

let pool: Pool | null = null;
let db: Db | null = null;

export function initDb(connectionString: string): Db {
  pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
  pool.on("error", (err) => console.error("[db] idle client error:", err.message));
  db = drizzle(pool, { schema });
  return db;
}

export function getDb(): Db {
  if (!db) throw new Error("Database not initialised");
  return db;
}

export async function closeDb() {
  await pool?.end();
  pool = null;
  db = null;
}

export { schema };
