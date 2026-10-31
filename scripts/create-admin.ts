export {};
/**
 * npm run create-admin -- <username> <password>
 * Creates an organizer account, or resets the password of an existing one.
 */
async function main() {
  const [username, password] = process.argv.slice(2);
  if (!username || !password || password.length < 10) {
    console.error("usage: npm run create-admin -- <username> <password>   (password: at least 10 characters)");
    process.exit(1);
  }
  const { eq } = await import("drizzle-orm");
  const { bootstrapDatabase, stopEmbeddedDatabase } = await import("../server/db/bootstrap");
  const { closeDb } = await import("../server/db");
  const { admins, sessions } = await import("../server/db/schema");
  const { hashPassword } = await import("../server/auth/auth");
  const db = await bootstrapDatabase();
  const name = username.toLowerCase();
  const passwordHash = await hashPassword(password);
  const [existing] = await db.select().from(admins).where(eq(admins.username, name));
  if (existing) {
    await db.update(admins).set({ passwordHash }).where(eq(admins.id, existing.id));
    await db.delete(sessions).where(eq(sessions.adminId, existing.id));
    console.log(`[admin] password reset for "${name}" (existing sessions signed out)`);
  } else {
    await db.insert(admins).values({ username: name, passwordHash, displayName: username });
    console.log(`[admin] created organizer "${name}"`);
  }
  await closeDb();
  await stopEmbeddedDatabase();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
