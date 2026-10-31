import fs from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";

/**
 * Zero-install PostgreSQL for local runs (Windows, macOS, Linux). Uses the real PostgreSQL
 * server binaries shipped as npm packages by `embedded-postgres`. Data persists in
 * `dataDir`. Used only when DATABASE_URL is not set.
 */
export interface EmbeddedHandle {
  url: string;
  stop: () => Promise<void>;
}

const USER = "tpl";
const PASSWORD = "tpl";

export async function startEmbeddedPostgres(opts: { dataDir: string; port: number; database: string; quiet?: boolean }): Promise<EmbeddedHandle> {
  fs.mkdirSync(path.dirname(opts.dataDir), { recursive: true });
  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  const pg = new EmbeddedPostgres({
    databaseDir: opts.dataDir,
    user: USER,
    password: PASSWORD,
    port: opts.port,
    persistent: true,
    createPostgresUser: isRoot, // PostgreSQL refuses to run as root (CI containers)
    onLog: (m) => {
      if (!opts.quiet && /error|fatal/i.test(String(m))) console.log("[pg]", String(m).trim());
    },
    onError: (e) => {
      if (!opts.quiet) console.error("[pg]", String(e).trim());
    },
  });

  if (!fs.existsSync(path.join(opts.dataDir, "PG_VERSION"))) {
    console.log(`[db] initialising embedded PostgreSQL in ${opts.dataDir}`);
    await pg.initialise();
  }
  await pg.start();
  // Create the application database on first run only. Checking first keeps the server log
  // free of a harmless-but-alarming "database already exists" ERROR on every start.
  const admin = new Client({ host: "127.0.0.1", port: opts.port, user: USER, password: PASSWORD, database: "postgres" });
  await admin.connect();
  try {
    const found = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [opts.database]);
    if (found.rowCount === 0) await admin.query(`CREATE DATABASE "${opts.database.replace(/"/g, '""')}"`);
  } finally {
    await admin.end();
  }
  return {
    url: `postgres://${USER}:${PASSWORD}@127.0.0.1:${opts.port}/${opts.database}`,
    stop: () => pg.stop(),
  };
}
