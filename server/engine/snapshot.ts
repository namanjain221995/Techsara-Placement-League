import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { maxBid, rankStandings, REVEAL_LAST_STEP, revealVisibility, type RuleConfig } from "../../src/shared/rules";
import type {
  AuctionSettings,
  AuctionStats,
  BidView,
  LastResult,
  LiveEvent,
  LiveSnapshot,
  LotView,
  OfferLetterRef,
  PlayerView,
  PrivatePlayerView,
  PrivateView,
  RevealCard,
  RevealView,
  TeamStanding,
  TeamView,
} from "../../src/shared/types";
import { DEFAULT_TIMER_LAYOUT } from "../../src/shared/types";
import type { DbOrTx } from "../db";
import { auctions, bids, lots, players, teams, type AuctionRow, type LotRow, type PlayerRow, type TeamRow } from "../db/schema";
import { notFound } from "../util/errors";

export const uploadUrl = (p: string | null) => (p ? `/api/uploads/${encodeURIComponent(p)}` : null);

export function ruleConfig(a: Pick<AuctionRow, "basePrice" | "bidIncrement" | "minSquad" | "maxSquad">): RuleConfig {
  return { basePrice: a.basePrice, bidIncrement: a.bidIncrement, minSquad: a.minSquad, maxSquad: a.maxSquad };
}

export function auctionView(a: AuctionRow): AuctionSettings {
  return {
    id: a.id,
    slug: a.slug,
    name: a.name,
    status: a.status,
    currencySymbol: a.currencySymbol,
    purse: a.purse,
    basePrice: a.basePrice,
    bidIncrement: a.bidIncrement,
    minSquad: a.minSquad,
    maxSquad: a.maxSquad,
    timerEnabled: a.timerEnabled,
    timerSeconds: a.timerSeconds,
    timerLayout: { ...DEFAULT_TIMER_LAYOUT, ...(a.timerLayout ?? {}) },
    poolOrder: a.poolOrder,
    roles: a.roles,
    round: a.round,
    revealStatus: a.revealStatus,
    version: a.version,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    lockedAt: a.lockedAt?.toISOString() ?? null,
    liveAt: a.liveAt?.toISOString() ?? null,
    completedAt: a.completedAt?.toISOString() ?? null,
  };
}

export function playerView(p: PlayerRow): PlayerView {
  return {
    id: p.id,
    number: p.number,
    name: p.name,
    role: p.role,
    description: p.description,
    photoUrl: uploadUrl(p.photoPath) ?? p.photoUrl ?? null,
    basePrice: p.basePrice,
    status: p.status,
    soldPrice: p.soldPrice,
    soldToTeamId: p.soldToTeamId,
    soldRound: p.soldRound,
  };
}

const letterKind = (type: string | null): OfferLetterRef["kind"] => (type === "application/pdf" ? "pdf" : "image");

/** Organizer-only profile view (hidden data included). Never put this in a public payload. */
export function privatePlayerView(p: PlayerRow): PrivatePlayerView {
  return {
    ...playerView(p),
    originalName: p.originalName,
    annualSalary: p.annualSalary,
    salaryVerified: p.salaryVerified,
    letter: p.offerLetterPath
      ? { url: `/api/players/${p.id}/offer-letter?v=${p.updatedAt.getTime()}`, kind: letterKind(p.offerLetterType), fileName: p.offerLetterName }
      : null,
  };
}

/** Public URL of an offer letter during the reveal (the endpoint re-checks the reveal step). */
const publicLetterUrl = (a: AuctionRow, p: PlayerRow) =>
  `/api/public/auctions/${encodeURIComponent(a.slug)}/reveal/${p.id}/offer-letter?v=${p.updatedAt.getTime()}`;

/** A purchased profile as the audience may see it, given how far its reveal has progressed. */
function revealCard(a: AuctionRow, p: PlayerRow, step: number): RevealCard {
  return {
    playerId: p.id,
    number: p.number,
    name: p.name,
    role: p.role,
    photoUrl: uploadUrl(p.photoPath) ?? p.photoUrl ?? null,
    originalName: step >= 1 ? p.originalName : null,
    letter: step >= 2 && p.offerLetterPath ? { url: publicLetterUrl(a, p), kind: letterKind(p.offerLetterType), fileName: null } : null,
    annualSalary: step >= 3 ? p.annualSalary : null,
    teamId: step >= REVEAL_LAST_STEP ? p.soldToTeamId : null,
    soldPrice: step >= REVEAL_LAST_STEP ? p.soldPrice : null,
  };
}

/**
 * Salary standings from a set of (profile → team) pairs. Credits remaining come from the
 * team views (public information). Ranked only when `ranked` (final or organizer view).
 */
function standings(tv: TeamView[], counted: PlayerRow[], ranked: boolean): TeamStanding[] {
  const rows = tv.map((t) => {
    const mine = counted.filter((p) => p.soldToTeamId === t.id);
    return {
      teamId: t.id,
      profiles: mine.length,
      total: mine.reduce((s, p) => s + (p.annualSalary ?? 0), 0),
      creditsLeft: t.remaining,
      disqualified: t.disqualified,
    };
  });
  if (ranked) return rankStandings(rows);
  return rows.map((r) => ({ ...r, rank: null, winner: false })).sort((x, y) => y.total - x.total || y.creditsLeft - x.creditsLeft);
}

/** The audience's view of the final reveal (sanitized: nothing beyond the current step). */
export function revealView(a: AuctionRow, ps: PlayerRow[], tv: TeamView[]): RevealView {
  const byId = new Map(ps.map((p) => [p.id, p]));
  // The order is fixed at START_REVEAL and purchases are frozen while it runs; the SOLD filter is a safety net.
  const order = (a.revealOrder ?? []).map((id) => byId.get(id)).filter((p): p is PlayerRow => !!p && p.status === "SOLD");
  const base = { status: a.revealStatus, index: a.revealIndex, step: a.revealStep, count: (a.revealOrder ?? []).length };
  if (a.revealStatus === "NOT_STARTED") return { ...base, index: 0, step: 0, current: null, revealed: [], standings: [] };
  const { visibleStep } = revealVisibility(a.revealStatus, a.revealOrder, a.revealIndex, a.revealStep);
  const revealed = order.filter((p) => visibleStep(p.id) >= REVEAL_LAST_STEP);
  const currentRow = a.revealStatus === "IN_PROGRESS" ? order.find((p) => p.id === a.revealOrder[a.revealIndex]) : undefined;
  return {
    ...base,
    current: currentRow ? revealCard(a, currentRow, visibleStep(currentRow.id)) : null,
    revealed: revealed.map((p) => revealCard(a, p, REVEAL_LAST_STEP)),
    standings: standings(tv, revealed, a.revealStatus === "COMPLETE"),
  };
}

/** Organizer-only: hidden live totals (confirmed purchases only) and every profile's private data. */
export function privateView(a: AuctionRow, ps: PlayerRow[], tv: TeamView[]): PrivateView {
  const sold = ps.filter((p) => p.status === "SOLD" && p.soldToTeamId);
  const scope = a.status === "COMPLETED" ? sold : ps.filter((p) => p.status !== "DISQUALIFIED");
  const label = (p: PlayerRow) => `#${p.number} ${p.name}`;
  const blocking: string[] = [];
  const warnings: string[] = [];
  if (a.status === "COMPLETED" && sold.length === 0) blocking.push("No profile was purchased, so there is nothing to reveal");
  for (const p of scope) {
    if (p.annualSalary == null) (a.status === "COMPLETED" ? blocking : warnings).push(`${label(p)}: annual salary missing`);
    if (!p.originalName) warnings.push(`${label(p)}: original candidate name missing`);
    if (!p.offerLetterPath) warnings.push(`${label(p)}: offer letter not uploaded`);
    if (p.annualSalary != null && !p.salaryVerified) warnings.push(`${label(p)}: salary not yet verified against the letter`);
  }
  return { standings: standings(tv, sold, true), profiles: ps.map(privatePlayerView), revealCheck: { blocking, warnings } };
}

/** Strip everything organizer-only. Every snapshot that leaves for a public client goes through this. */
export function publicSnapshot(s: LiveSnapshot): LiveSnapshot {
  const { private: _hidden, ...rest } = s;
  return rest;
}

/** Spent and squad size per team, derived from SOLD candidates (single source of truth). */
export function teamFinances(ps: PlayerRow[]) {
  const m = new Map<string, { spent: number; squadCount: number }>();
  for (const p of ps) {
    if (p.status !== "SOLD" || !p.soldToTeamId) continue;
    const f = m.get(p.soldToTeamId) ?? { spent: 0, squadCount: 0 };
    f.spent += p.soldPrice ?? 0;
    f.squadCount += 1;
    m.set(p.soldToTeamId, f);
  }
  return m;
}

export function teamViews(a: AuctionRow, ts: TeamRow[], ps: PlayerRow[]): TeamView[] {
  const fin = teamFinances(ps);
  const cfg = ruleConfig(a);
  return [...ts]
    .sort((x, y) => x.sortOrder - y.sortOrder || x.createdAt.getTime() - y.createdAt.getTime())
    .map((t) => {
      const f = fin.get(t.id) ?? { spent: 0, squadCount: 0 };
      const finance = { purse: t.purse, spent: f.spent, squadCount: f.squadCount };
      return {
        id: t.id,
        name: t.name,
        shortName: t.shortName,
        color: t.color,
        logoUrl: uploadUrl(t.logoPath),
        members: t.members,
        sortOrder: t.sortOrder,
        purse: t.purse,
        spent: f.spent,
        remaining: t.purse - f.spent,
        squadCount: f.squadCount,
        maxBid: maxBid(finance, cfg),
        disqualified: t.disqualified,
      };
    });
}

function lotView(a: AuctionRow, lot: LotRow, player: PlayerRow, lotBids: BidView[]): LotView {
  const durationMs = a.timerSeconds * 1000;
  return {
    id: lot.id,
    sequence: lot.sequence,
    round: lot.round,
    player: playerView(player),
    basePrice: lot.basePrice,
    currentBid: lot.currentBid,
    leadingTeamId: lot.leadingTeamId,
    bids: lotBids,
    openedAt: lot.openedAt.toISOString(),
    timer: {
      enabled: a.timerEnabled,
      durationMs,
      endsAt: lot.timerEndsAt ? lot.timerEndsAt.getTime() : null,
      remainingMs: lot.timerRemainingMs,
      timeUp: lot.timeUp,
    },
  };
}

function stats(ps: PlayerRow[], tv: TeamView[], onBlockId: string | null): AuctionStats {
  let top: AuctionStats["topSale"] = null;
  for (const p of ps) {
    if (p.status === "SOLD" && p.soldPrice && p.soldToTeamId && (!top || p.soldPrice > top.amount))
      top = { playerName: p.name, teamId: p.soldToTeamId, amount: p.soldPrice };
  }
  const spender = [...tv].sort((x, y) => y.spent - x.spent)[0];
  return {
    total: ps.length,
    pool: ps.filter((p) => p.status === "POOL" && p.id !== onBlockId).length, // the candidate on the block is not "in the pool"
    sold: ps.filter((p) => p.status === "SOLD").length,
    unsold: ps.filter((p) => p.status === "UNSOLD").length,
    disqualified: ps.filter((p) => p.status === "DISQUALIFIED").length,
    totalSpent: tv.reduce((s, t) => s + t.spent, 0),
    topSale: top,
    topSpender: spender && spender.spent > 0 ? { teamId: spender.id, spent: spender.spent, squadCount: spender.squadCount } : null,
  };
}

async function loadLot(db: DbOrTx, lotId: string | null) {
  if (!lotId) return null;
  const [lot] = await db.select().from(lots).where(eq(lots.id, lotId)).limit(1);
  return lot ?? null;
}

export async function buildSnapshot(db: DbOrTx, auctionId: string, event: LiveEvent): Promise<LiveSnapshot> {
  const [a] = await db.select().from(auctions).where(eq(auctions.id, auctionId)).limit(1);
  if (!a) throw notFound("Auction");
  const [ts, ps] = await Promise.all([
    db.select().from(teams).where(eq(teams.auctionId, auctionId)).orderBy(asc(teams.sortOrder)),
    db.select().from(players).where(eq(players.auctionId, auctionId)).orderBy(asc(players.number)),
  ]);
  const byId = new Map(ps.map((p) => [p.id, p]));
  const tv = teamViews(a, ts, ps);

  let lot: LotView | null = null;
  const current = await loadLot(db, a.currentLotId);
  if (current && current.result === "OPEN") {
    const rows = await db
      .select()
      .from(bids)
      .where(and(eq(bids.lotId, current.id), isNull(bids.undoneAt)))
      .orderBy(desc(bids.id))
      .limit(50);
    const p = byId.get(current.playerId);
    if (p)
      lot = lotView(
        a,
        current,
        p,
        rows.map((b) => ({ id: b.id, teamId: b.teamId, amount: b.amount, createdAt: b.createdAt.toISOString() })),
      );
  }

  let lastResult: LastResult | null = null;
  const last = await loadLot(db, a.lastLotId);
  if (last && last.result !== "OPEN" && last.closedAt) {
    const p = byId.get(last.playerId);
    if (p)
      lastResult = {
        lotId: last.id,
        result: last.result,
        player: playerView(p),
        teamId: last.winningTeamId,
        amount: last.finalAmount,
        at: last.closedAt.toISOString(),
      };
  }

  return {
    version: a.version,
    serverNow: Date.now(),
    auction: auctionView(a),
    teams: tv,
    lot,
    lastResult,
    stats: stats(ps, tv, lot?.player.id ?? null),
    announcement: a.announcement ? { text: a.announcement, at: (a.announcementAt ?? a.updatedAt).toISOString() } : null,
    reveal: revealView(a, ps, tv),
    private: privateView(a, ps, tv),
    event,
  };
}
