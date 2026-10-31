/**
 * Auction rules — pure functions shared by the server engine (authoritative) and the UI
 * (hints only). Every rule cites the requirement it implements; see
 * docs/requirements/GAME_RULES.md for the evidence (video timestamps).
 */

export interface RuleConfig {
  basePrice: number; // k units
  bidIncrement: number; // k units
  minSquad: number;
  maxSquad: number;
}

export interface TeamFinance {
  purse: number; // starting budget, k units
  spent: number; // sum of sold prices, k units
  squadCount: number; // candidates bought
}

export type BidRejectCode =
  | "AUCTION_NOT_LIVE"
  | "AUCTION_PAUSED"
  | "NO_PLAYER_ON_BLOCK"
  | "TEAM_NOT_FOUND"
  | "SQUAD_FULL"
  | "ALREADY_LEADING"
  | "BELOW_BASE_PRICE"
  | "NOT_ABOVE_CURRENT_BID"
  | "EXCEEDS_MAX_BID"
  | "INVALID_AMOUNT";

export type BidCheck = { ok: true } | { ok: false; code: BidRejectCode; message: string };

/** R-PURSE-01: money left = starting purse − total spent. */
export function remainingPurse(t: TeamFinance): number {
  return t.purse - t.spent;
}

/**
 * R-MAXBID-01 (client 05:39–07:08): every team must end with at least `minSquad` candidates,
 * so a bid may never eat the money needed to buy the *other* mandatory candidates at base
 * price. Purse $25M, base $1M, min 3, nobody bought → max bid $23M; after a $2M buy
 * (purse $23M, squad 1) → $22M. Both values match the reference screen at 03:51 and 05:00.
 */
export function reservedForMandatorySlots(t: TeamFinance, cfg: RuleConfig): number {
  return cfg.basePrice * Math.max(0, cfg.minSquad - t.squadCount - 1);
}

/** R-MAXBID-01/02: the largest amount this team may bid now (0 when it cannot bid at all). */
export function maxBid(t: TeamFinance, cfg: RuleConfig): number {
  if (t.squadCount >= cfg.maxSquad) return 0;
  return Math.max(0, remainingPurse(t) - reservedForMandatorySlots(t, cfg));
}

/** Lowest legal amount for the next bid: base price for the opening bid, otherwise above current. */
export function minimumLegalBid(hasBids: boolean, currentBid: number | null, playerBase: number): number {
  if (!hasBids || currentBid === null) return playerBase;
  return currentBid + 1; // R-BID-06: a custom amount only has to be greater than the current bid
}

/** The amount the one-tap "bid" buttons use: base for the opening bid, then current + increment. */
export function suggestedNextBid(hasBids: boolean, currentBid: number | null, playerBase: number, cfg: Pick<RuleConfig, "bidIncrement">): number {
  if (!hasBids || currentBid === null) return playerBase;
  return currentBid + cfg.bidIncrement;
}

export interface BidContext {
  auctionStatus: "DRAFT" | "LOCKED" | "LIVE" | "PAUSED" | "COMPLETED";
  lotOpen: boolean;
  teamExists: boolean;
  teamName: string;
  team: TeamFinance;
  leadingTeamId: string | null;
  teamId: string;
  hasBids: boolean;
  currentBid: number | null;
  playerBase: number;
  amount: number;
  cfg: RuleConfig;
  formatMoney: (k: number) => string;
}

/** Server-authoritative bid validation (R-BID-01…08). */
export function checkBid(c: BidContext): BidCheck {
  if (c.auctionStatus === "PAUSED") return reject("AUCTION_PAUSED", "Bidding is paused. Resume the auction first.");
  if (c.auctionStatus !== "LIVE") return reject("AUCTION_NOT_LIVE", "The auction is not live.");
  if (!c.lotOpen) return reject("NO_PLAYER_ON_BLOCK", "No candidate is on the block. Bring up the next candidate first.");
  if (!c.teamExists) return reject("TEAM_NOT_FOUND", "That team does not belong to this auction.");
  if (!Number.isInteger(c.amount) || c.amount <= 0) return reject("INVALID_AMOUNT", "Enter a positive amount in millions.");
  if (c.team.squadCount >= c.cfg.maxSquad) return reject("SQUAD_FULL", `${c.teamName} already has the maximum of ${c.cfg.maxSquad} candidates.`);
  if (c.hasBids && c.leadingTeamId === c.teamId) return reject("ALREADY_LEADING", `${c.teamName} already holds the highest bid.`);
  if (!c.hasBids && c.amount < c.playerBase)
    return reject("BELOW_BASE_PRICE", `The opening bid must be at least the base price ${c.formatMoney(c.playerBase)}.`);
  if (c.hasBids && c.currentBid !== null && c.amount <= c.currentBid)
    return reject("NOT_ABOVE_CURRENT_BID", `The bid must be greater than the current bid ${c.formatMoney(c.currentBid)}.`);
  const limit = maxBid(c.team, c.cfg);
  if (c.amount > limit) {
    const reserve = reservedForMandatorySlots(c.team, c.cfg);
    const why =
      reserve > 0
        ? ` (remaining purse ${c.formatMoney(remainingPurse(c.team))} minus ${c.formatMoney(reserve)} kept for the minimum squad of ${c.cfg.minSquad})`
        : ` (remaining purse ${c.formatMoney(remainingPurse(c.team))})`;
    return reject("EXCEEDS_MAX_BID", `${c.teamName} can bid at most ${c.formatMoney(limit)}${why}.`);
  }
  return { ok: true };
}

function reject(code: BidRejectCode, message: string): BidCheck {
  return { ok: false, code, message };
}

/**
 * Quick-amount chips for the custom bid dialog, as on the reference console (07:57):
 * Base, Next, +50%, 2×, 3×, 5× — multiples are taken from "Next".
 */
export function quickAmounts(hasBids: boolean, currentBid: number | null, playerBase: number, cfg: Pick<RuleConfig, "bidIncrement">) {
  const next = suggestedNextBid(hasBids, currentBid, playerBase, cfg);
  return [
    { label: "Base", amount: playerBase },
    { label: "Next", amount: next },
    { label: "+50%", amount: Math.round(next * 1.5) },
    { label: "2×", amount: next * 2 },
    { label: "3×", amount: next * 3 },
    { label: "5×", amount: next * 5 },
  ];
}

/** R-END-02 (client 06:53–07:08): at the end, teams below the minimum squad are disqualified. */
export function isBelowMinimumSquad(t: Pick<TeamFinance, "squadCount">, cfg: Pick<RuleConfig, "minSquad">): boolean {
  return t.squadCount < cfg.minSquad;
}

/**
 * R-DISPLAY-05 (client 05:06–05:35, reference 04:18/04:33/05:15): the team holding the latest
 * (highest) bid is shown first. Remaining teams: most candidates, then most spent, then the
 * organizer's team order — the ordering observed on the reference screen.
 */
export function orderTeamsForDisplay<T extends { id: string; squadCount: number; spent: number; sortOrder: number }>(
  teams: T[],
  leadingTeamId: string | null,
): T[] {
  return [...teams].sort((a, b) => {
    if (leadingTeamId) {
      if (a.id === leadingTeamId) return -1;
      if (b.id === leadingTeamId) return 1;
    }
    return b.squadCount - a.squadCount || b.spent - a.spent || a.sortOrder - b.sortOrder;
  });
}

/** Configuration sanity checks shown before locking (warnings, not blockers unless `blocking`). */
export function setupIssues(input: { teamCount: number; playerCount: number; purse: number; cfg: RuleConfig }): { blocking: string[]; warnings: string[] } {
  const blocking: string[] = [];
  const warnings: string[] = [];
  const { cfg } = input;
  if (input.teamCount < 2) blocking.push("Add at least 2 teams.");
  if (input.playerCount < 1) blocking.push("Add at least 1 candidate.");
  if (cfg.minSquad < 0 || cfg.maxSquad < 1 || cfg.minSquad > cfg.maxSquad) blocking.push("Squad size must satisfy 0 ≤ minimum ≤ maximum and maximum ≥ 1.");
  if (cfg.basePrice <= 0) blocking.push("Base price must be greater than zero.");
  if (cfg.bidIncrement <= 0) blocking.push("Bid increment must be greater than zero.");
  if (input.purse < cfg.basePrice * Math.max(cfg.minSquad, 1)) blocking.push("Each team's purse must cover the minimum squad at base price.");
  if (input.playerCount < input.teamCount * cfg.minSquad)
    warnings.push(
      `Only ${input.playerCount} candidates for ${input.teamCount} teams × minimum ${cfg.minSquad}: some teams cannot reach the minimum and would be disqualified.`,
    );
  if (input.playerCount > input.teamCount * cfg.maxSquad)
    warnings.push(`${input.playerCount} candidates exceed total squad capacity (${input.teamCount * cfg.maxSquad}); some will stay unsold.`);
  return { blocking, warnings };
}

/**
 * Winner (client request, 1 Nov 2026): the team whose purchased profiles have the highest
 * COMBINED ACTUAL ANNUAL SALARY wins. The number of profiles does not matter and auction
 * credits are never subtracted from the salary total.
 * Ties: more auction credits remaining wins; if still tied, the teams are joint winners
 * (they share the rank — competition ranking 1, 1, 3).
 * Teams disqualified for missing the minimum squad cannot win; they are listed last, unranked.
 */
export interface StandingInput {
  teamId: string;
  profiles: number;
  total: number;
  creditsLeft: number;
  disqualified: boolean;
}

export function rankStandings<T extends StandingInput>(rows: T[]): (T & { rank: number | null; winner: boolean })[] {
  const better = (a: StandingInput, b: StandingInput) => b.total - a.total || b.creditsLeft - a.creditsLeft;
  const eligible = rows.filter((r) => !r.disqualified).sort(better);
  const out = eligible.map((r) => {
    const rank = 1 + eligible.filter((o) => better(o, r) < 0).length;
    // Nobody "wins" with nothing: a winner needs a positive combined salary.
    return { ...r, rank, winner: rank === 1 && r.total > 0 } as T & { rank: number | null; winner: boolean };
  });
  const dq = rows
    .filter((r) => r.disqualified)
    .sort(better)
    .map((r) => ({ ...r, rank: null, winner: false }) as T & { rank: number | null; winner: boolean });
  return [...out, ...dq];
}

export const REVEAL_LAST_STEP = 4;

/**
 * How much of the final reveal is public: profiles before `index` are fully revealed; the
 * current one shows fields up to `step`; everything is public once the reveal is COMPLETE.
 */
export function revealVisibility(status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE", order: string[], index: number, step: number) {
  const visibleStep = (playerId: string): number => {
    if (status === "COMPLETE") return REVEAL_LAST_STEP;
    if (status !== "IN_PROGRESS") return -1;
    const at = order.indexOf(playerId);
    if (at < 0 || at > index) return -1;
    return at < index ? REVEAL_LAST_STEP : step;
  };
  return { visibleStep };
}
