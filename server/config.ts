import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Minimal .env loader (no dependency). Existing process.env values win. */
function loadDotEnv(file = path.resolve(process.cwd(), ".env")) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadDotEnv();

/** Express "trust proxy": a hop count ("1"), true/false, or a list such as "loopback, uniquelocal". */
const trustProxy = (v: string | undefined): boolean | number | string => {
  const s = (v ?? "").trim();
  if (!s) return "loopback";
  if (s === "true" || s === "false") return s === "true";
  return /^\d+$/.test(s) ? Number(s) : s;
};

const int = (v: string | undefined, d: number) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : d;
};

export const config = {
  dev: process.env.NODE_ENV !== "production",
  port: int(process.env.PORT, 3000),
  host: process.env.HOST || "0.0.0.0",
  databaseUrl: process.env.DATABASE_URL || "",
  embeddedPgPort: int(process.env.EMBEDDED_PG_PORT, 5433),
  // On Windows the default lives in %LOCALAPPDATA% so a project folder containing spaces
  // (e.g. "Downloads\game video\…") never ends up in PostgreSQL's data path.
  embeddedPgDir: process.env.EMBEDDED_PG_DIR
    ? path.resolve(process.cwd(), process.env.EMBEDDED_PG_DIR)
    : process.platform === "win32"
      ? path.join(process.env.LOCALAPPDATA || os.homedir(), "techsara-placement-league", "postgres")
      : path.resolve(process.cwd(), ".data/postgres"),
  adminUsername: process.env.ADMIN_USERNAME || "admin",
  /** Empty → a random password is generated for the first organizer and printed once. */
  adminPassword: (process.env.ADMIN_PASSWORD ?? "").trim(),
  sessionTtlHours: int(process.env.SESSION_TTL_HOURS, 12),
  /** Address people use to reach the app when it differs from localhost:PORT (e.g. Docker port mapping). Used for log output only. */
  publicUrl: (process.env.PUBLIC_URL ?? "").trim().replace(/\/+$/, ""),
  uploadDir: path.resolve(process.cwd(), process.env.UPLOAD_DIR || "storage/uploads"),
  cookieSecure: process.env.COOKIE_SECURE === "true",
  trustProxy: trustProxy(process.env.TRUST_PROXY),
  maxUploadBytes: 3 * 1024 * 1024,
};

export type AppConfig = typeof config;
