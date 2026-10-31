export {};
/** npm run db:migrate — apply pending migrations and exit. */
async function main() {
  const { bootstrapDatabase, stopEmbeddedDatabase } = await import("../server/db/bootstrap");
  const { closeDb } = await import("../server/db");
  await bootstrapDatabase();
  console.log("[migrate] database is up to date");
  await closeDb();
  await stopEmbeddedDatabase();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
