import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { maxBid, type RuleConfig } from "../../src/shared/rules";
import type { AuctionSettings, AuctionStats, BidView, LastResult, LiveEvent, LiveSnapshot, LotView, PlayerView, TeamView } from "../../src/shared/types";
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
    poolOrder: a.poolOrder,
    roles: a.roles,
    round: a.round,
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
    event,
  };
}
