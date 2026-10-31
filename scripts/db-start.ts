export {};
/** npm run db:start — run only the embedded PostgreSQL (for psql / DB tools). Ctrl+C stops it. */
async function main() {
  const { config } = await import("../server/config");
  if (config.databaseUrl) {
    console.log("[db] DATABASE_URL is set — nothing to start.");
    return;
  }
  const { bootstrapDatabase, stopEmbeddedDatabase } = await import("../server/db/bootstrap");
  await bootstrapDatabase();
  console.log(`[db] embedded PostgreSQL running: postgres://tpl:tpl@127.0.0.1:${config.embeddedPgPort}/tpl  (Ctrl+C to stop)`);
  const stop = async () => {
    await stopEmbeddedDatabase();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  setInterval(() => undefined, 1 << 30);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
