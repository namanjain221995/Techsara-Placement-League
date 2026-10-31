import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { eq, lt } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config";
import { getDb } from "../db";
import { admins, sessions } from "../db/schema";
import { forbidden, unauthorized } from "../util/errors";

export const SESSION_COOKIE = "tpl_session";

export interface AdminIdentity {
  id: string;
  username: string;
  displayName: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminIdentity;
    }
  }
}

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export const hashPassword = (password: string) => bcrypt.hash(password, 11);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

/** Constant-ish time login: always runs bcrypt even for unknown users. */
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", 11);

export async function authenticate(username: string, password: string): Promise<AdminIdentity | null> {
  const db = getDb();
  const [row] = await db.select().from(admins).where(eq(admins.username, username.toLowerCase())).limit(1);
  const ok = await verifyPassword(password, row?.passwordHash ?? DUMMY_HASH);
  if (!row || !ok) return null;
  return { id: row.id, username: row.username, displayName: row.displayName };
}

export async function createSession(adminId: string, userAgent?: string): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + config.sessionTtlHours * 3600_000);
  await getDb()
    .insert(sessions)
    .values({ tokenHash: sha256(token), adminId, expiresAt, userAgent: userAgent?.slice(0, 200) });
  // Opportunistic cleanup of expired sessions.
  await getDb().delete(sessions).where(lt(sessions.expiresAt, new Date()));
  return { token, expiresAt };
}

export async function adminFromToken(token: string | undefined): Promise<AdminIdentity | null> {
  if (!token || token.length > 200) return null;
  const db = getDb();
  const [row] = await db
    .select({ id: admins.id, username: admins.username, displayName: admins.displayName, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(admins, eq(admins.id, sessions.adminId))
    .where(eq(sessions.tokenHash, sha256(token)))
    .limit(1);
  if (!row || row.expiresAt.getTime() < Date.now()) return null;
  return { id: row.id, username: row.username, displayName: row.displayName };
}

export async function destroySession(token: string | undefined) {
  if (token)
    await getDb()
      .delete(sessions)
      .where(eq(sessions.tokenHash, sha256(token)));
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

/** Parse a raw Cookie header (used by the Socket.IO handshake). */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const admin = await adminFromToken(req.cookies?.[SESSION_COOKIE]);
  if (!admin) throw unauthorized();
  req.admin = admin;
  next();
}

/**
 * CSRF defence for cookie-authenticated mutations: browsers cannot send the custom
 * `x-tpl-request` header cross-site without a CORS preflight (which this server never
 * approves), and a present Origin header must match the Host.
 */
export function csrfGuard(req: Request, _res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.get("x-tpl-request") !== "1") throw forbidden("Missing request header.");
  const origin = req.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== req.get("host")) throw forbidden("Cross-site request blocked.");
    } catch {
      throw forbidden("Cross-site request blocked.");
    }
  }
  next();
}

/**
 * Creates the first organizer when none exists. There is deliberately no built-in default
 * password: without a usable ADMIN_PASSWORD (10+ characters) a random one is generated and
 * printed once, so no deployment can start with a password that is published in the source.
 */
export async function ensureInitialAdmin(): Promise<{ created: boolean; generatedPassword: string | null }> {
  const db = getDb();
  const existing = await db.select({ id: admins.id }).from(admins).limit(1);
  if (existing.length) return { created: false, generatedPassword: null };
  const username = config.adminUsername.toLowerCase();
  const usable = config.adminPassword.length >= 10;
  const password = usable ? config.adminPassword : `tpl-${crypto.randomBytes(9).toString("base64url")}`;
  await db.insert(admins).values({ username, displayName: "Organizer", passwordHash: await hashPassword(password) });
  if (usable) {
    console.log(`[auth] created initial organizer account "${username}" (password from ADMIN_PASSWORD)`);
    return { created: true, generatedPassword: null };
  }
  console.log(
    `[auth] created initial organizer account "${username}" with a generated password: ${password}\n` +
      `       ${config.adminPassword ? "ADMIN_PASSWORD is shorter than 10 characters, so it was not used. " : ""}` +
      `Note it now — change it any time with: npm run create-admin -- ${username} <new password>`,
  );
  return { created: true, generatedPassword: password };
}
