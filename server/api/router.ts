import { eq } from "drizzle-orm";
import express, { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  auctionSettingsSchema,
  cloneAuctionSchema,
  createAuctionSchema,
  liveCommandSchema,
  loginSchema,
  overrideSchema,
  playerSchema,
  reorderSchema,
  teamSchema,
} from "../../src/shared/schemas";
import { authenticate, clearSessionCookie, createSession, csrfGuard, destroySession, requireAdmin, SESSION_COOKIE, setSessionCookie } from "../auth/auth";
import { getDb } from "../db";
import { auctions, players } from "../db/schema";
import { getEngine } from "../engine/instance";
import { publicSnapshot } from "../engine/snapshot";
import { revealVisibility } from "../../src/shared/rules";
import type { AuditActor } from "../services/audit";
import * as catalog from "../services/catalog";
import * as sheets from "../services/spreadsheets";
import { imageUpload, letterUpload, saveImage, saveOfferLetter, sendOfferLetter, serveUpload } from "../services/uploads";
import { badRequest, notFound } from "../util/errors";

const uuid = z.uuid();
const param = (req: Request, name: string) => {
  const v = uuid.safeParse(req.params[name]);
  if (!v.success) throw notFound();
  return v.data;
};
const actor = (req: Request): AuditActor => ({ id: req.admin!.id, label: req.admin!.username, ip: req.ip ?? null });
const upload = (req: Request, res: Response) =>
  new Promise<void>((resolve, reject) =>
    imageUpload(req, res, (err: unknown) => {
      if (!err) return resolve();
      const code = (err as { code?: string }).code;
      reject(code === "LIMIT_FILE_SIZE" ? badRequest("FILE_TOO_LARGE", "Images must be 3 MB or smaller.") : badRequest("UPLOAD_FAILED", "Upload failed."));
    }),
  );

const uploadLetter = (req: Request, res: Response) =>
  new Promise<void>((resolve, reject) =>
    letterUpload(req, res, (err: unknown) => {
      if (!err) return resolve();
      const code = (err as { code?: string }).code;
      reject(
        code === "LIMIT_FILE_SIZE" ? badRequest("FILE_TOO_LARGE", "Offer letters must be 10 MB or smaller.") : badRequest("UPLOAD_FAILED", "Upload failed."),
      );
    }),
  );

export function apiRouter(): Router {
  const r = Router();
  r.use(express.json({ limit: "256kb" }));

  // ------------------------------------------------------------------ public endpoints
  r.get("/health", async (_req, res) => {
    await getDb().execute("select 1");
    res.json({ ok: true, time: new Date().toISOString() });
  });

  r.get("/uploads/:file", serveUpload);

  /** Read-only snapshot for the public display (projector / spectators). */
  r.get("/public/auctions/:slug", async (req, res) => {
    const slug = String(req.params.slug).slice(0, 120);
    const [a] = await getDb().select({ id: auctions.id }).from(auctions).where(eq(auctions.slug, slug)).limit(1);
    if (!a) throw notFound("Auction");
    // Never the organizer snapshot: original names, salaries and letters stay hidden until revealed.
    res.set("Cache-Control", "no-store").json(publicSnapshot(await getEngine().snapshot(a.id)));
  });

  /** An offer letter, only once the final reveal has reached its "offer letter" step for that profile. */
  r.get("/public/auctions/:slug/reveal/:playerId/offer-letter", async (req, res) => {
    const slug = String(req.params.slug).slice(0, 120);
    const playerId = param(req, "playerId");
    const [a] = await getDb().select().from(auctions).where(eq(auctions.slug, slug)).limit(1);
    if (!a || a.status !== "COMPLETED") throw notFound("Offer letter");
    if (revealVisibility(a.revealStatus, a.revealOrder, a.revealIndex, a.revealStep).visibleStep(playerId) < 2) throw notFound("Offer letter");
    const [p] = await getDb().select().from(players).where(eq(players.id, playerId)).limit(1);
    if (!p || p.auctionId !== a.id || p.status !== "SOLD") throw notFound("Offer letter");
    sendOfferLetter(res, { path: p.offerLetterPath, type: p.offerLetterType, name: null });
  });

  /** Bought candidates per team for the public final board (names + prices only). */
  r.get("/public/auctions/:slug/squads", async (req, res) => {
    const slug = String(req.params.slug).slice(0, 120);
    const [a] = await getDb().select({ id: auctions.id }).from(auctions).where(eq(auctions.slug, slug)).limit(1);
    if (!a) throw notFound("Auction");
    res.set("Cache-Control", "no-store").json({ squads: await sheets.publicSquads(getDb(), a.id) });
  });

  // ---------------------------------------------------------------------------- auth
  const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false });
  r.post("/auth/login", csrfGuard, loginLimiter, async (req, res) => {
    const { username, password } = loginSchema.parse(req.body);
    const admin = await authenticate(username, password);
    if (!admin) {
      res.status(401).json({ error: { code: "BAD_CREDENTIALS", message: "Wrong username or password." } });
      return;
    }
    const { token, expiresAt } = await createSession(admin.id, req.get("user-agent"));
    setSessionCookie(res, token, expiresAt);
    res.json({ admin });
  });
  r.post("/auth/logout", csrfGuard, async (req, res) => {
    await destroySession(req.cookies?.[SESSION_COOKIE]);
    clearSessionCookie(res);
    res.json({ ok: true });
  });
  r.get("/auth/me", requireAdmin, (req, res) => {
    res.json({ admin: req.admin });
  });

  // ------------------------------------------------------------ organizer (protected)
  const a = Router();
  a.use(requireAdmin, csrfGuard);

  a.get("/players-template.xlsx", async (_req, res) => {
    res.set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.set("Content-Disposition", 'attachment; filename="candidates-template.xlsx"');
    res.send(await sheets.playersTemplate());
  });

  a.get("/auctions", async (_req, res) => {
    res.json({ auctions: await catalog.listAuctions(getDb()) });
  });
  a.post("/auctions", async (req, res) => {
    const { name } = createAuctionSchema.parse(req.body);
    res.status(201).json({ auction: await catalog.createAuction(getDb(), actor(req), name) });
  });
  a.get("/auctions/:id", async (req, res) => {
    res.json(await catalog.auctionDetail(getDb(), param(req, "id")));
  });
  a.put("/auctions/:id/settings", async (req, res) => {
    const input = auctionSettingsSchema.parse(req.body);
    const id = param(req, "id");
    await catalog.updateSettings(getEngine(), actor(req), id, input);
    res.json(await catalog.auctionDetail(getDb(), id));
  });
  a.post("/auctions/:id/clone", async (req, res) => {
    const { name } = cloneAuctionSchema.parse(req.body);
    res.status(201).json({ auction: await catalog.cloneAuction(getDb(), actor(req), param(req, "id"), name) });
  });
  a.delete("/auctions/:id", async (req, res) => {
    await catalog.deleteAuction(getEngine(), getDb(), actor(req), param(req, "id"));
    res.json({ ok: true });
  });
  a.post("/auctions/:id/lock", async (req, res) => {
    const issues = await catalog.lockAuction(getEngine(), actor(req), param(req, "id"));
    res.json({ ok: true, warnings: issues.warnings });
  });
  a.post("/auctions/:id/unlock", async (req, res) => {
    await catalog.unlockAuction(getEngine(), actor(req), param(req, "id"));
    res.json({ ok: true });
  });
  a.post("/auctions/:id/reset", async (req, res) => {
    await catalog.resetAuction(getEngine(), actor(req), param(req, "id"));
    res.json({ ok: true });
  });

  // live
  a.get("/auctions/:id/snapshot", async (req, res) => {
    res.set("Cache-Control", "no-store").json(await getEngine().snapshot(param(req, "id")));
  });
  a.post("/auctions/:id/commands", async (req, res) => {
    const cmd = liveCommandSchema.parse(req.body);
    const result = await getEngine().execute(param(req, "id"), cmd, actor(req));
    res.json(result);
  });

  // teams
  a.get("/auctions/:id/teams", async (req, res) => {
    res.json({ teams: await catalog.listTeams(getDb(), param(req, "id")) });
  });
  a.post("/auctions/:id/teams", async (req, res) => {
    const input = teamSchema.parse(req.body);
    res.status(201).json({ team: await catalog.createTeam(getEngine(), actor(req), param(req, "id"), input) });
  });
  a.post("/auctions/:id/teams/reorder", async (req, res) => {
    const { ids } = reorderSchema.parse(req.body);
    await catalog.reorderTeams(getEngine(), actor(req), param(req, "id"), ids);
    res.json({ ok: true });
  });
  a.put("/teams/:teamId", async (req, res) => {
    const input = teamSchema.parse(req.body);
    res.json({ team: await catalog.updateTeam(getEngine(), actor(req), param(req, "teamId"), input, getDb()) });
  });
  a.delete("/teams/:teamId", async (req, res) => {
    await catalog.deleteTeam(getEngine(), actor(req), param(req, "teamId"), getDb());
    res.json({ ok: true });
  });
  a.post("/teams/:teamId/logo", async (req, res) => {
    const id = param(req, "teamId");
    await catalog.teamOr404(getDb(), id);
    await upload(req, res);
    await catalog.setTeamLogo(getEngine(), actor(req), id, saveImage(req.file), getDb());
    res.json({ ok: true });
  });
  a.delete("/teams/:teamId/logo", async (req, res) => {
    await catalog.setTeamLogo(getEngine(), actor(req), param(req, "teamId"), null, getDb());
    res.json({ ok: true });
  });

  // players (candidates)
  a.get("/auctions/:id/players", async (req, res) => {
    res.json({ players: await catalog.listPlayers(getDb(), param(req, "id")) });
  });
  a.post("/auctions/:id/players", async (req, res) => {
    const input = playerSchema.parse(req.body);
    res.status(201).json({ player: await catalog.createPlayer(getEngine(), actor(req), param(req, "id"), input) });
  });
  a.post("/auctions/:id/players/import", async (req, res) => {
    const id = param(req, "id");
    const detail = await catalog.auctionDetail(getDb(), id);
    await upload(req, res);
    const { rows, errors } = await sheets.parsePlayersFile(req.file, detail.auction.roles);
    if (errors.length) throw badRequest("IMPORT_INVALID", `${errors.length} row(s) need fixing. Nothing was imported.`, errors);
    const imported = await catalog.insertPlayers(getEngine(), actor(req), id, rows);
    res.json({ imported });
  });
  a.put("/players/:playerId", async (req, res) => {
    const input = playerSchema.parse(req.body);
    res.json({ player: await catalog.updatePlayer(getEngine(), actor(req), param(req, "playerId"), input, getDb()) });
  });
  a.delete("/players/:playerId", async (req, res) => {
    await catalog.deletePlayer(getEngine(), actor(req), param(req, "playerId"), getDb());
    res.json({ ok: true });
  });
  a.post("/players/:playerId/photo", async (req, res) => {
    const id = param(req, "playerId");
    await catalog.playerOr404(getDb(), id);
    await upload(req, res);
    await catalog.setPlayerPhoto(getEngine(), actor(req), id, saveImage(req.file), getDb());
    res.json({ ok: true });
  });
  a.delete("/players/:playerId/photo", async (req, res) => {
    await catalog.setPlayerPhoto(getEngine(), actor(req), param(req, "playerId"), null, getDb());
    res.json({ ok: true });
  });
  a.get("/players/:playerId/offer-letter", async (req, res) => {
    const p = await catalog.playerOr404(getDb(), param(req, "playerId"));
    sendOfferLetter(res, { path: p.offerLetterPath, type: p.offerLetterType, name: p.offerLetterName });
  });
  a.post("/players/:playerId/offer-letter", async (req, res) => {
    const id = param(req, "playerId");
    await catalog.playerOr404(getDb(), id);
    await uploadLetter(req, res);
    await catalog.setOfferLetter(getEngine(), actor(req), id, saveOfferLetter(req.file), getDb());
    res.json({ ok: true });
  });
  a.delete("/players/:playerId/offer-letter", async (req, res) => {
    await catalog.setOfferLetter(getEngine(), actor(req), param(req, "playerId"), null, getDb());
    res.json({ ok: true });
  });
  a.post("/players/:playerId/override", async (req, res) => {
    const id = param(req, "playerId");
    const o = overrideSchema.parse(req.body);
    const p = await catalog.playerOr404(getDb(), id);
    await getEngine().override(p.auctionId, id, o, actor(req));
    res.json({ ok: true });
  });

  // results & reports
  a.get("/auctions/:id/results", async (req, res) => {
    res.json(await sheets.resultsData(getDb(), param(req, "id")));
  });
  a.get("/auctions/:id/bids", async (req, res) => {
    res.json({ lots: await sheets.bidHistory(getDb(), param(req, "id")) });
  });
  a.get("/auctions/:id/audit", async (req, res) => {
    res.json({ entries: await sheets.auditLog(getDb(), param(req, "id")) });
  });
  a.get("/auctions/:id/export.xlsx", async (req, res) => {
    const { filename, buffer } = await sheets.exportResults(getDb(), param(req, "id"));
    res.set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.set("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  });

  r.use(a);
  r.use((_req, _res) => {
    throw notFound("Endpoint");
  });
  return r;
}
