import crypto from "node:crypto";
import { and, asc, count, desc, eq, max, sql } from "drizzle-orm";
import { DEFAULT_ROLES, type AuctionSettingsInput, type PlayerInput, type TeamInput } from "../../src/shared/schemas";
import { setupIssues } from "../../src/shared/rules";
import type { Db, Tx } from "../db";
import { auctions, bids, lots, players, processedCommands, teams, type AuctionRow } from "../db/schema";
import type { AuctionEngine } from "../engine/engine";
import { auctionView, privatePlayerView, ruleConfig, teamViews } from "../engine/snapshot";
import { conflict, notFound } from "../util/errors";
import { audit, type AuditActor } from "./audit";
import { copyImage, copyOfferLetter, deleteImage, deleteOfferLetter } from "./uploads";

// ----------------------------------------------------------------------------- helpers
export function makeSlug(name: string) {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "auction";
  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
}

function assertDraft(a: AuctionRow, what: string) {
  if (a.status === "DRAFT") return;
  throw conflict(
    "CONFIG_LOCKED",
    `${what} is only possible during setup. ${a.status === "LOCKED" ? "Unlock the configuration first." : "The auction has already started."}`,
  );
}

/** Salary, original name and offer letter are frozen once the final reveal has started. */
function assertBeforeReveal(a: AuctionRow, what: string) {
  if (a.revealStatus === "NOT_STARTED") return;
  throw conflict("REVEAL_STARTED", `${what} is locked while the final reveal is running. Restart the reveal first (live console).`);
}

/** Private (hidden-until-reveal) fields of a candidate input; undefined means "leave unchanged". */
function privateFields(input: PlayerInput) {
  return {
    ...(input.originalName !== undefined ? { originalName: input.originalName ?? null } : {}),
    ...(input.annualSalary !== undefined ? { annualSalary: input.annualSalary ?? null } : {}),
    ...(input.salaryVerified !== undefined ? { salaryVerified: input.salaryVerified } : {}),
  };
}

async function auctionOr404(db: Db | Tx, id: string) {
  const [a] = await db.select().from(auctions).where(eq(auctions.id, id)).limit(1);
  if (!a) throw notFound("Auction");
  return a;
}

async function counts(db: Db | Tx, auctionId: string) {
  const [teamCount] = await db.select({ n: count() }).from(teams).where(eq(teams.auctionId, auctionId));
  const byStatus = await db.select({ status: players.status, n: count() }).from(players).where(eq(players.auctionId, auctionId)).groupBy(players.status);
  const n = (s: string) => byStatus.find((r) => r.status === s)?.n ?? 0;
  return {
    teams: teamCount.n,
    players: byStatus.reduce((s, r) => s + r.n, 0),
    pool: n("POOL"),
    sold: n("SOLD"),
    unsold: n("UNSOLD"),
    disqualified: n("DISQUALIFIED"),
  };
}

// ---------------------------------------------------------------------------- auctions
export async function listAuctions(db: Db) {
  const rows = await db.select().from(auctions).orderBy(desc(auctions.createdAt));
  const tc = await db.select({ id: teams.auctionId, n: count() }).from(teams).groupBy(teams.auctionId);
  const pc = await db
    .select({ id: players.auctionId, n: count(), sold: sql<number>`count(*) filter (where ${players.status} = 'SOLD')::int` })
    .from(players)
    .groupBy(players.auctionId);
  return rows.map((a) => ({
    ...auctionView(a),
    teamCount: tc.find((r) => r.id === a.id)?.n ?? 0,
    playerCount: pc.find((r) => r.id === a.id)?.n ?? 0,
    soldCount: pc.find((r) => r.id === a.id)?.sold ?? 0,
  }));
}

export async function createAuction(db: Db, actor: AuditActor, name: string) {
  const [a] = await db
    .insert(auctions)
    .values({ name, slug: makeSlug(name), roles: DEFAULT_ROLES, createdBy: actor.id })
    .returning();
  await audit(db, actor, "auction.create", a.id, { name });
  return auctionView(a);
}

export async function auctionDetail(db: Db, id: string) {
  const a = await auctionOr404(db, id);
  const c = await counts(db, id);
  return {
    auction: auctionView(a),
    counts: c,
    readiness: await salaryReadiness(db, id),
    issues: setupIssues({ teamCount: c.teams, playerCount: c.players, purse: a.purse, cfg: ruleConfig(a) }),
  };
}

/** How complete the hidden winner data is (salaries, verification, letters, original names). */
export async function salaryReadiness(db: Db | Tx, auctionId: string) {
  const ps = await db
    .select({
      status: players.status,
      originalName: players.originalName,
      annualSalary: players.annualSalary,
      verified: players.salaryVerified,
      letter: players.offerLetterPath,
    })
    .from(players)
    .where(eq(players.auctionId, auctionId));
  const profiles = ps.filter((p) => p.status !== "DISQUALIFIED");
  const r = {
    profiles: profiles.length,
    withSalary: profiles.filter((p) => p.annualSalary != null).length,
    verified: profiles.filter((p) => p.annualSalary != null && p.verified).length,
    withLetter: profiles.filter((p) => !!p.letter).length,
    withOriginalName: profiles.filter((p) => !!p.originalName).length,
  };
  const warnings: string[] = [];
  const missing = (n: number, what: string) => n > 0 && warnings.push(`${n} candidate(s) ${what}.`);
  missing(r.profiles - r.withSalary, "have no annual salary yet — the final reveal cannot start until every purchased profile has one");
  missing(r.withSalary - r.verified, "have a salary not yet marked as verified against the offer letter");
  missing(r.profiles - r.withLetter, "have no offer letter uploaded");
  missing(r.profiles - r.withOriginalName, "have no original candidate name");
  return { ...r, warnings };
}

const LOCKED_FIELDS = ["currencySymbol", "purse", "basePrice", "bidIncrement", "minSquad", "maxSquad"] as const;

export async function updateSettings(engine: AuctionEngine, actor: AuditActor, id: string, input: AuctionSettingsInput) {
  return engine.mutate(id, actor, "auction.settings", { ...input }, async (tx, a) => {
    if (a.status === "COMPLETED") throw conflict("INVALID_STATE", "The auction has ended; its settings can no longer change.");
    if (a.status !== "DRAFT") {
      const changed = LOCKED_FIELDS.filter((f) => input[f] !== a[f]);
      if (changed.length) throw conflict("CONFIG_LOCKED", `Money and squad settings are locked once the configuration is locked (${changed.join(", ")}).`);
    }
    if (input.purse !== a.purse) {
      // Teams still on the old default purse follow the new default.
      await tx
        .update(teams)
        .set({ purse: input.purse, updatedAt: new Date() })
        .where(and(eq(teams.auctionId, id), eq(teams.purse, a.purse)));
    }
    await tx
      .update(auctions)
      .set({
        name: input.name,
        currencySymbol: input.currencySymbol,
        purse: input.purse,
        basePrice: input.basePrice,
        bidIncrement: input.bidIncrement,
        minSquad: input.minSquad,
        maxSquad: input.maxSquad,
        timerEnabled: input.timerEnabled,
        timerSeconds: input.timerSeconds,
        poolOrder: input.poolOrder,
        roles: input.roles,
      })
      .where(eq(auctions.id, id));
  });
}

/** R-SETUP-02 (client 00:04–00:17): duplicate an auction with its settings, teams and candidates. */
export async function cloneAuction(db: Db, actor: AuditActor, id: string, name: string) {
  return db.transaction(async (tx) => {
    const src = await auctionOr404(tx, id);
    const [copy] = await tx
      .insert(auctions)
      .values({
        name,
        slug: makeSlug(name),
        currencySymbol: src.currencySymbol,
        purse: src.purse,
        basePrice: src.basePrice,
        bidIncrement: src.bidIncrement,
        minSquad: src.minSquad,
        maxSquad: src.maxSquad,
        timerEnabled: src.timerEnabled,
        timerSeconds: src.timerSeconds,
        poolOrder: src.poolOrder,
        roles: src.roles,
        createdBy: actor.id,
      })
      .returning();
    const ts = await tx.select().from(teams).where(eq(teams.auctionId, id)).orderBy(asc(teams.sortOrder));
    for (const t of ts)
      await tx.insert(teams).values({
        auctionId: copy.id,
        name: t.name,
        shortName: t.shortName,
        color: t.color,
        logoPath: copyImage(t.logoPath),
        members: t.members,
        purse: t.purse,
        sortOrder: t.sortOrder,
      });
    const ps = await tx.select().from(players).where(eq(players.auctionId, id)).orderBy(asc(players.number));
    for (const p of ps)
      await tx.insert(players).values({
        auctionId: copy.id,
        number: p.number,
        name: p.name,
        role: p.role,
        description: p.description,
        photoPath: copyImage(p.photoPath),
        photoUrl: p.photoUrl,
        basePrice: p.basePrice,
        originalName: p.originalName,
        annualSalary: p.annualSalary,
        salaryVerified: p.salaryVerified,
        ...(p.offerLetterPath
          ? { offerLetterPath: copyOfferLetter(p.offerLetterPath), offerLetterType: p.offerLetterType, offerLetterName: p.offerLetterName }
          : {}),
      });
    await audit(tx, actor, "auction.clone", copy.id, { from: id, fromName: src.name, teams: ts.length, players: ps.length });
    return auctionView(copy);
  });
}

export async function deleteAuction(engine: AuctionEngine, db: Db, actor: AuditActor, id: string) {
  return engine.runExclusive(id, async () => {
    const a = await auctionOr404(db, id);
    if (a.status === "LIVE" || a.status === "PAUSED") throw conflict("AUCTION_LIVE", "End the auction before deleting it.");
    const ts = await db.select({ p: teams.logoPath }).from(teams).where(eq(teams.auctionId, id));
    const ps = await db.select({ p: players.photoPath, letter: players.offerLetterPath }).from(players).where(eq(players.auctionId, id));
    await db.transaction(async (tx) => {
      await tx.delete(auctions).where(eq(auctions.id, id));
      await audit(tx, actor, "auction.delete", null, { id, name: a.name, status: a.status });
    });
    [...ts, ...ps].forEach((r) => deleteImage(r.p));
    ps.forEach((r) => deleteOfferLetter(r.letter));
  });
}

/** R-FLOW-01 (client 03:22–03:31): lock the configuration before going live. */
export async function lockAuction(engine: AuctionEngine, actor: AuditActor, id: string) {
  return engine.mutate(id, actor, "auction.lock", {}, async (tx, a) => {
    if (a.status !== "DRAFT") throw conflict("INVALID_STATE", "The configuration is already locked.");
    const c = await counts(tx, id);
    const issues = setupIssues({ teamCount: c.teams, playerCount: c.players, purse: a.purse, cfg: ruleConfig(a) });
    const ts = await tx.select({ purse: teams.purse, name: teams.name }).from(teams).where(eq(teams.auctionId, id));
    for (const t of ts) if (t.purse < a.basePrice * Math.max(a.minSquad, 1)) issues.blocking.push(`${t.name}'s purse cannot cover the minimum squad.`);
    if (issues.blocking.length) throw conflict("SETUP_INCOMPLETE", issues.blocking.join(" "), issues);
    await tx.update(auctions).set({ status: "LOCKED", lockedAt: new Date() }).where(eq(auctions.id, id));
    return { ...issues, warnings: [...issues.warnings, ...(await salaryReadiness(tx, id)).warnings] };
  });
}

export async function unlockAuction(engine: AuctionEngine, actor: AuditActor, id: string) {
  return engine.mutate(id, actor, "auction.unlock", {}, async (tx, a) => {
    if (a.status !== "LOCKED") throw conflict("INVALID_STATE", "Only a locked auction that has not gone live can be unlocked.");
    await tx.update(auctions).set({ status: "DRAFT", lockedAt: null }).where(eq(auctions.id, id));
  });
}

/** Rehearsal helper: wipe every bid/result and return to the locked, ready-to-go-live state. */
export async function resetAuction(engine: AuctionEngine, actor: AuditActor, id: string) {
  return engine.mutate(id, actor, "auction.reset", {}, async (tx, a) => {
    if (a.status === "DRAFT") throw conflict("INVALID_STATE", "Nothing to reset — the auction is still in setup.");
    await tx.update(auctions).set({ currentLotId: null, lastLotId: null }).where(eq(auctions.id, id));
    await tx.delete(bids).where(eq(bids.auctionId, id));
    await tx.delete(lots).where(eq(lots.auctionId, id));
    await tx.delete(processedCommands).where(eq(processedCommands.auctionId, id));
    await tx
      .update(players)
      .set({ status: "POOL", soldPrice: null, soldToTeamId: null, soldRound: null, soldAt: null, updatedAt: new Date() })
      .where(eq(players.auctionId, id));
    await tx.update(teams).set({ disqualified: false }).where(eq(teams.auctionId, id));
    await tx
      .update(auctions)
      .set({
        status: "LOCKED",
        round: 1,
        lotSequence: 0,
        announcement: null,
        announcementAt: null,
        liveAt: null,
        completedAt: null,
        revealStatus: "NOT_STARTED",
        revealOrder: [],
        revealIndex: 0,
        revealStep: 0,
        revealStartedAt: null,
        revealCompletedAt: null,
      })
      .where(eq(auctions.id, id));
  });
}

// ------------------------------------------------------------------------------- teams
export async function listTeams(db: Db, auctionId: string) {
  const a = await auctionOr404(db, auctionId);
  const ts = await db.select().from(teams).where(eq(teams.auctionId, auctionId));
  const ps = await db.select().from(players).where(eq(players.auctionId, auctionId));
  return teamViews(a, ts, ps);
}

export async function teamOr404(db: Db, teamId: string) {
  const [t] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!t) throw notFound("Team");
  return t;
}

export async function createTeam(engine: AuctionEngine, actor: AuditActor, auctionId: string, input: TeamInput) {
  return engine.mutate(auctionId, actor, "team.create", { name: input.name }, async (tx, a) => {
    assertDraft(a, "Adding teams");
    const [{ m }] = await tx
      .select({ m: max(teams.sortOrder) })
      .from(teams)
      .where(eq(teams.auctionId, auctionId));
    const [t] = await tx
      .insert(teams)
      .values({
        auctionId,
        name: input.name,
        shortName: input.shortName,
        color: input.color,
        members: input.members ?? [],
        purse: input.purse ?? a.purse,
        sortOrder: (m ?? -1) + 1,
      })
      .returning();
    return t;
  });
}

/** R-TEAM-02 (client 00:17–00:49): name, colour and members stay editable later. */
export async function updateTeam(engine: AuctionEngine, actor: AuditActor, teamId: string, input: TeamInput, db: Db) {
  const t = await teamOr404(db, teamId);
  return engine.mutate(t.auctionId, actor, "team.update", { teamId, ...input }, async (tx, a) => {
    if (input.purse != null && input.purse !== t.purse) assertDraft(a, "Changing a team's purse");
    const [row] = await tx
      .update(teams)
      .set({
        name: input.name,
        shortName: input.shortName,
        color: input.color,
        members: input.members ?? [],
        ...(input.purse != null ? { purse: input.purse } : {}),
        updatedAt: new Date(),
      })
      .where(eq(teams.id, teamId))
      .returning();
    return row;
  });
}

export async function deleteTeam(engine: AuctionEngine, actor: AuditActor, teamId: string, db: Db) {
  const t = await teamOr404(db, teamId);
  await engine.mutate(t.auctionId, actor, "team.delete", { teamId, name: t.name }, async (tx, a) => {
    assertDraft(a, "Deleting teams");
    await tx.delete(teams).where(eq(teams.id, teamId));
  });
  deleteImage(t.logoPath);
}

export async function setTeamLogo(engine: AuctionEngine, actor: AuditActor, teamId: string, logoPath: string | null, db: Db) {
  const t = await teamOr404(db, teamId);
  await engine.mutate(t.auctionId, actor, logoPath ? "team.logo" : "team.logo.remove", { teamId }, async (tx) => {
    await tx.update(teams).set({ logoPath, updatedAt: new Date() }).where(eq(teams.id, teamId));
  });
  if (t.logoPath && t.logoPath !== logoPath) deleteImage(t.logoPath);
}

export async function reorderTeams(engine: AuctionEngine, actor: AuditActor, auctionId: string, ids: string[]) {
  return engine.mutate(auctionId, actor, "team.reorder", { ids }, async (tx) => {
    const ts = await tx.select({ id: teams.id }).from(teams).where(eq(teams.auctionId, auctionId));
    const known = new Set(ts.map((t) => t.id));
    if (ids.length !== known.size || !ids.every((i) => known.has(i))) throw conflict("BAD_ORDER", "The order must list every team exactly once.");
    for (const [i, id] of ids.entries()) await tx.update(teams).set({ sortOrder: i }).where(eq(teams.id, id));
  });
}

// ----------------------------------------------------------------------------- players
export async function listPlayers(db: Db, auctionId: string) {
  await auctionOr404(db, auctionId);
  const ps = await db.select().from(players).where(eq(players.auctionId, auctionId)).orderBy(asc(players.number));
  return ps.map(privatePlayerView);
}

export async function playerOr404(db: Db, playerId: string) {
  const [p] = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  if (!p) throw notFound("Candidate");
  return p;
}

async function nextNumber(tx: Tx, auctionId: string) {
  const [{ m }] = await tx
    .select({ m: max(players.number) })
    .from(players)
    .where(eq(players.auctionId, auctionId));
  return (m ?? 0) + 1;
}

export async function createPlayer(engine: AuctionEngine, actor: AuditActor, auctionId: string, input: PlayerInput) {
  return engine.mutate(auctionId, actor, "player.create", { name: input.name }, async (tx, a) => {
    assertDraft(a, "Adding candidates");
    const [p] = await tx
      .insert(players)
      .values({
        auctionId,
        number: input.number ?? (await nextNumber(tx, auctionId)),
        name: input.name,
        role: input.role,
        description: normaliseDescription(input.description),
        basePrice: input.basePrice ?? null,
        photoUrl: input.photoUrl ?? null,
        ...privateFields(input),
      })
      .returning();
    return privatePlayerView(p);
  });
}

/** Keep the organizer's line breaks and bullets exactly (R-PLAYER-04); only normalise CRLF and trailing spaces. */
export function normaliseDescription(s: string | undefined) {
  return (s ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/^\n+|\n+$/g, "");
}

export async function updatePlayer(engine: AuctionEngine, actor: AuditActor, playerId: string, input: PlayerInput, db: Db) {
  const p = await playerOr404(db, playerId);
  const hidden = privateFields(input);
  // Audit which private fields changed, never their values (the audit log is shown on screen).
  const changedPrivate = Object.entries(hidden)
    .filter(([k, v]) => (p as Record<string, unknown>)[k] !== v)
    .map(([k]) => k);
  const details = { playerId, name: input.name, ...(changedPrivate.length ? { privateFieldsChanged: changedPrivate } : {}) };
  return engine.mutate(p.auctionId, actor, "player.update", details, async (tx, a) => {
    const structural =
      (input.basePrice !== undefined && (input.basePrice ?? null) !== p.basePrice) || (input.number !== undefined && input.number !== p.number);
    if (structural) assertDraft(a, "Changing a candidate's number or base price");
    if (changedPrivate.length) assertBeforeReveal(a, "Changing the original name or salary");
    // A changed salary must be re-verified against the letter unless the same request confirms it.
    const salaryChanged = changedPrivate.includes("annualSalary");
    const verified = input.salaryVerified !== undefined ? input.salaryVerified : salaryChanged ? false : undefined;
    const [row] = await tx
      .update(players)
      .set({
        name: input.name,
        role: input.role,
        description: normaliseDescription(input.description),
        ...(input.photoUrl !== undefined ? { photoUrl: input.photoUrl } : {}),
        ...(input.basePrice !== undefined ? { basePrice: input.basePrice ?? null } : {}),
        ...(input.number !== undefined ? { number: input.number } : {}),
        ...hidden,
        ...(verified !== undefined ? { salaryVerified: verified } : {}),
        updatedAt: new Date(),
      })
      .where(eq(players.id, playerId))
      .returning();
    return privatePlayerView(row);
  });
}

export async function deletePlayer(engine: AuctionEngine, actor: AuditActor, playerId: string, db: Db) {
  const p = await playerOr404(db, playerId);
  await engine.mutate(p.auctionId, actor, "player.delete", { playerId, name: p.name }, async (tx, a) => {
    assertDraft(a, "Deleting candidates");
    await tx.delete(players).where(eq(players.id, playerId));
  });
  deleteImage(p.photoPath);
  deleteOfferLetter(p.offerLetterPath);
}

/** R-PLAYER-02 (client 01:07): candidate photo upload. Allowed at any time (cosmetic). */
export async function setPlayerPhoto(engine: AuctionEngine, actor: AuditActor, playerId: string, photoPath: string | null, db: Db) {
  const p = await playerOr404(db, playerId);
  await engine.mutate(p.auctionId, actor, photoPath ? "player.photo" : "player.photo.remove", { playerId }, async (tx) => {
    await tx
      .update(players)
      .set({ photoPath, ...(photoPath ? {} : { photoUrl: null }), updatedAt: new Date() })
      .where(eq(players.id, playerId));
  });
  if (p.photoPath && p.photoPath !== photoPath) deleteImage(p.photoPath);
}

/** The actual offer letter (PDF or image). Organizer-only until its step in the final reveal. */
export async function setOfferLetter(
  engine: AuctionEngine,
  actor: AuditActor,
  playerId: string,
  letter: { path: string; type: string; name: string } | null,
  db: Db,
) {
  const p = await playerOr404(db, playerId);
  try {
    await engine.mutate(p.auctionId, actor, letter ? "player.offer_letter" : "player.offer_letter.remove", { playerId }, async (tx, a) => {
      assertBeforeReveal(a, "Changing the offer letter");
      await tx
        .update(players)
        .set({ offerLetterPath: letter?.path ?? null, offerLetterType: letter?.type ?? null, offerLetterName: letter?.name ?? null, updatedAt: new Date() })
        .where(eq(players.id, playerId));
    });
  } catch (e) {
    if (letter) deleteOfferLetter(letter.path); // nothing references the new file
    throw e;
  }
  if (p.offerLetterPath && p.offerLetterPath !== letter?.path) deleteOfferLetter(p.offerLetterPath);
}

export async function insertPlayers(engine: AuctionEngine, actor: AuditActor, auctionId: string, rows: PlayerInput[]) {
  return engine.mutate(auctionId, actor, "player.import", { count: rows.length }, async (tx, a) => {
    assertDraft(a, "Importing candidates");
    let n = await nextNumber(tx, auctionId);
    for (const r of rows)
      await tx.insert(players).values({
        auctionId,
        number: r.number ?? n++,
        name: r.name,
        role: r.role,
        description: normaliseDescription(r.description),
        basePrice: r.basePrice ?? null,
        photoUrl: r.photoUrl ?? null,
        ...privateFields(r),
      });
    return rows.length;
  });
}
