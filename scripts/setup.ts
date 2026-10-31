/**
 * One-time local setup:  npm run setup
 *  1. creates .env from .env.example with a random organizer password (if .env is missing)
 *  2. starts the database (embedded PostgreSQL unless DATABASE_URL is set) and applies migrations
 *  3. creates the organizer account
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.cwd(), ".env");
let generatedPassword: string | null = null;
if (!fs.existsSync(envPath)) {
  generatedPassword = `tpl-${crypto.randomBytes(9).toString("base64url")}`;
  const template = fs.readFileSync(path.resolve(process.cwd(), ".env.example"), "utf8");
  fs.writeFileSync(envPath, template.replace(/^ADMIN_PASSWORD=.*$/m, `ADMIN_PASSWORD=${generatedPassword}`));
  console.log("[setup] created .env");
}

async function main() {
  const { config } = await import("../server/config");
  const { bootstrapDatabase, stopEmbeddedDatabase } = await import("../server/db/bootstrap");
  const { ensureInitialAdmin } = await import("../server/auth/auth");
  const { closeDb } = await import("../server/db");

  await bootstrapDatabase();
  console.log("[setup] database migrated");
  const admin = await ensureInitialAdmin();
  await closeDb();
  await stopEmbeddedDatabase();

  console.log("\n  Setup complete.");
  const login = !admin.created ? "(existing account — password unchanged)" : (admin.generatedPassword ?? generatedPassword ?? "(ADMIN_PASSWORD in .env)");
  console.log(`  Organizer login : ${config.adminUsername} / ${login}`);
  console.log("  Start the app   : npm run dev   (or: npm run build && npm start)\n");
}

main().catch((e) => {
  console.error("[setup] failed:", e);
  process.exit(1);
});
