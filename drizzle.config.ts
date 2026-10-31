import { defineConfig } from "drizzle-kit";

// Used only for `npm run db:generate` (SQL migration authoring). Runtime migrations are
// applied by server/db/migrate.ts, so no database connection is needed here.
export default defineConfig({
  dialect: "postgresql",
  schema: "./server/db/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
});
