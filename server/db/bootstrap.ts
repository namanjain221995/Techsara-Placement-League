import { config } from "../config";
import { startEmbeddedPostgres, type EmbeddedHandle } from "./embedded";
import { initDb, type Db } from "./index";
import { runMigrations } from "./migrate";

let embedded: EmbeddedHandle | null = null;

/** Resolve the database (external DATABASE_URL or embedded), connect and migrate. */
export async function bootstrapDatabase(opts: { database?: string; quiet?: boolean } = {}): Promise<Db> {
  let url = config.databaseUrl;
  if (!url) {
    embedded = await startEmbeddedPostgres({
      dataDir: config.embeddedPgDir,
      port: config.embeddedPgPort,
      database: opts.database ?? "tpl",
      quiet: opts.quiet,
    });
    url = embedded.url;
    console.log(`[db] embedded PostgreSQL ready on port ${config.embeddedPgPort}`);
  }
  const db = initDb(url);
  await runMigrations(db);
  return db;
}

export async function stopEmbeddedDatabase() {
  if (embedded) {
    await embedded.stop().catch(() => undefined);
    embedded = null;
  }
}
