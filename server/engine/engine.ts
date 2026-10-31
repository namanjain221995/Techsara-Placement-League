import crypto from "node:crypto";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { formatMoney } from "../../src/shared/money";
import { checkBid, maxBid, REVEAL_LAST_STEP, suggestedNextBid } from "../../src/shared/rules";
import type { LiveCommand, PlayerOverride } from "../../src/shared/schemas";
import type { AuctionStatus, LiveEvent, LiveEventType, LiveSnapshot } from "../../src/shared/types";
import type { Db, Tx } from "../db";
import { auctions, bids, lots, players, processedCommands, teams, type AuctionRow } from "../db/schema";
import { audit, SYSTEM_ACTOR, type AuditActor } from "../services/audit";
import { AppError, conflict, notFound } from "../util/errors";
import { buildSnapshot, privateView, ruleConfig, teamViews } from "./snapshot";

export interface Broadcaster {
  publish(snapshot: LiveSnapshot): void;
}

export interface CommandResult {
  snapshot: LiveSnapshot;
  duplicate: boolean;
}

const ev = (type: LiveEventType, extra: Partial<LiveEvent> = {}): LiveEvent => ({ type, at: Date.now(), ...extra });

function requireStatus(a: AuctionRow, allowed: AuctionStatus[], what: string) {
  if (allowed.includes(a.status)) return;
  const hint: Record<AuctionStatus, string> = {
    DRAFT: "The auction is still in setup. Lock the configuration and go live first.",
    LOCKED: "The auction has not started. Press Go Live first.",
    LIVE: "The auction is live.",
    PAUSED: "The auction is paused. Resume it first.",
    COMPLETED: "The auction has ended.",
  };
  throw conflict("INVALID_STATE", `Cannot ${what}: ${hint[a.status]}`);
}

/**
 * Server-authoritative auction engine.
 *
 * Concurrency model: every mutation of one auction runs inside `runExclusive` (an in-process
 * promise chain per auction) AND inside one PostgreSQL transaction that row-locks the auction
 * (`SELECT … FOR UPDATE`). Two operators tapping at the same instant are therefore applied one
 * after the other, each validated against the state the previous one produced. Every command
 * carries a client-generated UUID stored in `processed_commands`, so a retried or double-sent
 * request is applied at most once.
 */
export class AuctionEngine {
  private chains = new Map<string, Promise<unknown>>();
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private db: Db,
    private broadcaster: Broadcaster,
  ) {}

  runExclusive<T>(auctionId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(auctionId) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    this.chains.set(auctionId, tail);
    void tail.then(() => {
      if (this.chains.get(auctionId) === tail) this.chains.delete(auctionId);
    });
    return run;
  }

  snapshot(auctionId: string, type: LiveEventType = "SNAPSHOT") {
    return buildSnapshot(this.db, auctionId, ev(type));
  }

  private publish(snap: LiveSnapshot) {
    this.broadcaster.publish(snap);
    this.armTimer(snap);
  }

  // ------------------------------------------------------------------ live commands
  async execute(auctionId: string, cmd: LiveCommand, actor: AuditActor): Promise<CommandResult> {
    return this.runExclusive(auctionId, async () => {
      const outcome = await this.db.transaction(async (tx) => {
        const [dup] = await tx.select().from(processedCommands).where(eq(processedCommands.commandId, cmd.commandId)).limit(1);
        if (dup) {
          if (dup.auctionId !== auctionId) throw conflict("COMMAND_ID_REUSED", "Command id already used for another auction.");
          return { duplicate: true, event: ev("SNAPSHOT") };
        }
        const [a] = await tx.select().from(auctions).where(eq(auctions.id, auctionId)).for("update");
        if (!a) throw notFound("Auction");
        const event = await this.apply(tx, a, cmd, actor);
        const version = a.version + 1;
        await tx.update(auctions).set({ version, updatedAt: new Date() }).where(eq(auctions.id, auctionId));
        await tx.insert(processedCommands).values({ commandId: cmd.commandId, auctionId, type: cmd.type, resultVersion: version });
        const { commandId: _ignored, ...payload } = cmd;
        await audit(tx, actor, `live.${cmd.type.toLowerCase()}`, auctionId, {
          ...payload,
          event: event.type,
          teamId: event.teamId,
          amount: event.amount,
          playerId: event.playerId,
        });
        return { duplicate: false, event };
      });
      const snap = await buildSnapshot(this.db, auctionId, outcome.event);
      if (!outcome.duplicate) this.publish(snap);
      return { snapshot: snap, duplicate: outcome.duplicate };
    });
  }

  private async openLot(tx: Tx, a: AuctionRow) {
    if (!a.currentLotId) return null;
    const [lot] = await tx.select().from(lots).where(eq(lots.id, a.currentLotId)).for("update");
    return lot && lot.result === "OPEN" ? lot : null;
  }

  private async finances(tx: Tx, auctionId: string) {
    const rows = await tx
      .select({
        teamId: players.soldToTeamId,
        spent: sql<number>`coalesce(sum(${players.soldPrice}), 0)::int`,
        squadCount: sql<number>`count(*)::int`,
      })
      .from(players)
      .where(and(eq(players.auctionId, auctionId), eq(players.status, "SOLD")))
      .groupBy(players.soldToTeamId);
    return new Map(rows.filter((r) => r.teamId).map((r) => [r.teamId as string, { spent: r.spent, squadCount: r.squadCount }]));
  }

  private async team(tx: Tx, auctionId: string, teamId: string) {
    const [t] = await tx
      .select()
      .from(teams)
      .where(and(eq(teams.id, teamId), eq(teams.auctionId, auctionId)))
      .limit(1);
    return t ?? null;
  }

  private timerFields(a: AuctionRow) {
    return a.timerEnabled
      ? { timerEndsAt: new Date(Date.now() + a.timerSeconds * 1000), timerRemainingMs: null, timeUp: false }
      : { timerEndsAt: null, timerRemainingMs: null, timeUp: false };
  }

  private money(a: AuctionRow) {
    return (k: number) => formatMoney(k, a.currencySymbol);
  }

  private async apply(tx: Tx, a: AuctionRow, cmd: LiveCommand, actor: AuditActor): Promise<LiveEvent> {
    const now = new Date();
    const setAuction = (v: Partial<typeof auctions.$inferInsert>) => tx.update(auctions).set(v).where(eq(auctions.id, a.id));

    switch (cmd.type) {
      case "GO_LIVE": {
        if (a.status === "DRAFT") throw conflict("INVALID_STATE", "Lock the configuration before going live.");
        requireStatus(a, ["LOCKED"], "go live");
        await setAuction({ status: "LIVE", liveAt: a.liveAt ?? now });
        return ev("WENT_LIVE");
      }

      case "PAUSE": {
        requireStatus(a, ["LIVE"], "pause");
        const lot = await this.openLot(tx, a);
        if (lot?.timerEndsAt && !lot.timeUp) {
          const remaining = Math.max(0, lot.timerEndsAt.getTime() - Date.now());
          await tx.update(lots).set({ timerRemainingMs: remaining, timerEndsAt: null }).where(eq(lots.id, lot.id));
        }
        await setAuction({ status: "PAUSED" });
        return ev("PAUSED");
      }

      case "RESUME": {
        requireStatus(a, ["PAUSED"], "resume");
        const lot = await this.openLot(tx, a);
        if (lot && lot.timerRemainingMs !== null && a.timerEnabled && !lot.timeUp) {
          await tx
            .update(lots)
            .set({ timerEndsAt: new Date(Date.now() + lot.timerRemainingMs), timerRemainingMs: null })
            .where(eq(lots.id, lot.id));
        }
        await setAuction({ status: "LIVE" });
        return ev("RESUMED");
      }

      case "NEXT_PLAYER":
      case "PICK_PLAYER": {
        requireStatus(a, ["LIVE"], "bring up a candidate");
        if (await this.openLot(tx, a)) throw conflict("LOT_OPEN", "Close the current candidate first (Sold, Unsold or Skip).");
        let player;
        if (cmd.type === "PICK_PLAYER") {
          [player] = await tx
            .select()
            .from(players)
            .where(and(eq(players.id, cmd.playerId), eq(players.auctionId, a.id)))
            .for("update");
          if (!player) throw notFound("Candidate");
          if (player.status !== "POOL" && player.status !== "UNSOLD")
            throw conflict("PLAYER_NOT_AVAILABLE", `${player.name} is ${player.status.toLowerCase()} and cannot be auctioned.`);
        } else {
          const pool = await tx
            .select()
            .from(players)
            .where(and(eq(players.auctionId, a.id), eq(players.status, "POOL")))
            .orderBy(asc(players.number))
            .for("update");
          if (!pool.length) {
            const [{ n }] = await tx
              .select({ n: sql<number>`count(*)::int` })
              .from(players)
              .where(and(eq(players.auctionId, a.id), eq(players.status, "UNSOLD")));
            throw conflict(
              "POOL_EMPTY",
              n > 0
                ? `The pool is empty. Start round ${a.round + 1} to re-auction ${n} unsold candidate(s), or end the auction.`
                : "Every candidate has been auctioned. End the auction to publish the results.",
            );
          }
          player = a.poolOrder === "RANDOM" ? pool[crypto.randomInt(pool.length)] : pool[0];
        }
        const sequence = a.lotSequence + 1;
        const [lot] = await tx
          .insert(lots)
          .values({
            auctionId: a.id,
            playerId: player.id,
            sequence,
            round: a.round,
            basePrice: player.basePrice ?? a.basePrice,
            openedAt: now,
            ...this.timerFields(a),
          })
          .returning();
        if (player.status !== "POOL") await tx.update(players).set({ status: "POOL", updatedAt: now }).where(eq(players.id, player.id));
        await setAuction({ currentLotId: lot.id, lotSequence: sequence });
        return ev("PLAYER_UP", { playerId: player.id });
      }

      case "BID": {
        const lot = a.status === "LIVE" || a.status === "PAUSED" ? await this.openLot(tx, a) : null;
        const team = await this.team(tx, a.id, cmd.teamId);
        const fin = (await this.finances(tx, a.id)).get(cmd.teamId) ?? { spent: 0, squadCount: 0 };
        const hasBids = lot?.currentBid != null;
        const base = lot?.basePrice ?? a.basePrice;
        const cfg = ruleConfig(a);
        const amount = cmd.amount ?? suggestedNextBid(hasBids, lot?.currentBid ?? null, base, cfg);
        const check = checkBid({
          auctionStatus: a.status,
          lotOpen: !!lot,
          teamExists: !!team,
          teamName: team?.name ?? "This team",
          team: { purse: team?.purse ?? 0, ...fin },
          leadingTeamId: lot?.leadingTeamId ?? null,
          teamId: cmd.teamId,
          hasBids,
          currentBid: lot?.currentBid ?? null,
          playerBase: base,
          amount,
          cfg,
          formatMoney: this.money(a),
        });
        if (!check.ok) throw new AppError(409, check.code, check.message);
        await tx.insert(bids).values({ auctionId: a.id, lotId: lot!.id, teamId: cmd.teamId, amount, placedBy: actor.id, commandId: cmd.commandId });
        await tx
          .update(lots)
          .set({ currentBid: amount, leadingTeamId: cmd.teamId, ...this.timerFields(a) })
          .where(eq(lots.id, lot!.id));
        return ev("BID_PLACED", { teamId: cmd.teamId, amount, playerId: lot!.playerId });
      }

      case "UNDO_BID": {
        requireStatus(a, ["LIVE", "PAUSED"], "undo a bid");
        const lot = await this.openLot(tx, a);
        if (!lot) throw conflict("NO_PLAYER_ON_BLOCK", "No candidate is on the block.");
        const active = await tx
          .select()
          .from(bids)
          .where(and(eq(bids.lotId, lot.id), isNull(bids.undoneAt)))
          .orderBy(desc(bids.id))
          .limit(2);
        if (!active.length) throw conflict("NO_BIDS", "There is no bid to undo.");
        await tx.update(bids).set({ undoneAt: now }).where(eq(bids.id, active[0].id));
        const prev = active[1];
        await tx
          .update(lots)
          .set({
            currentBid: prev?.amount ?? null,
            leadingTeamId: prev?.teamId ?? null,
            ...(a.status === "LIVE" ? this.timerFields(a) : {}),
          })
          .where(eq(lots.id, lot.id));
        return ev("BID_UNDONE", { teamId: active[0].teamId, amount: active[0].amount, playerId: lot.playerId });
      }

      case "SOLD": {
        requireStatus(a, ["LIVE", "PAUSED"], "sell");
        const lot = await this.openLot(tx, a);
        if (!lot) throw conflict("NO_PLAYER_ON_BLOCK", "No candidate is on the block.");
        if (lot.currentBid == null || !lot.leadingTeamId) throw conflict("NO_BIDS", "No bids yet. Use Unsold or Skip instead.");
        const team = await this.team(tx, a.id, lot.leadingTeamId);
        if (!team) throw notFound("Team");
        const fin = (await this.finances(tx, a.id)).get(team.id) ?? { spent: 0, squadCount: 0 };
        const limit = maxBid({ purse: team.purse, ...fin }, ruleConfig(a));
        if (fin.squadCount >= a.maxSquad) throw conflict("SQUAD_FULL", `${team.name} already has ${a.maxSquad} candidates.`);
        if (lot.currentBid > limit)
          throw conflict("EXCEEDS_MAX_BID", `${team.name} can no longer afford ${this.money(a)(lot.currentBid)} (max ${this.money(a)(limit)}). Undo the bid.`);
        await tx
          .update(players)
          .set({ status: "SOLD", soldPrice: lot.currentBid, soldToTeamId: team.id, soldRound: lot.round, soldAt: now, updatedAt: now })
          .where(eq(players.id, lot.playerId));
        await tx
          .update(lots)
          .set({ result: "SOLD", finalAmount: lot.currentBid, winningTeamId: team.id, closedAt: now, timerEndsAt: null, timerRemainingMs: null })
          .where(eq(lots.id, lot.id));
        await setAuction({ currentLotId: null, lastLotId: lot.id });
        return ev("SOLD", { teamId: team.id, amount: lot.currentBid, playerId: lot.playerId });
      }

      case "UNSOLD":
      case "SKIP":
      case "DISQUALIFY_PLAYER": {
        const verb = cmd.type === "UNSOLD" ? "mark unsold" : cmd.type === "SKIP" ? "skip" : "disqualify";
        requireStatus(a, ["LIVE", "PAUSED"], verb);
        const lot = await this.openLot(tx, a);
        if (!lot) throw conflict("NO_PLAYER_ON_BLOCK", "No candidate is on the block.");
        const status = cmd.type === "UNSOLD" ? "UNSOLD" : cmd.type === "SKIP" ? "POOL" : "DISQUALIFIED";
        const result = cmd.type === "UNSOLD" ? "UNSOLD" : cmd.type === "SKIP" ? "SKIPPED" : "DISQUALIFIED";
        await tx.update(players).set({ status, updatedAt: now }).where(eq(players.id, lot.playerId));
        await tx.update(lots).set({ result, closedAt: now, timerEndsAt: null, timerRemainingMs: null }).where(eq(lots.id, lot.id));
        await setAuction({ currentLotId: null, ...(cmd.type === "UNSOLD" ? { lastLotId: lot.id } : {}) });
        const type: LiveEventType = cmd.type === "UNSOLD" ? "UNSOLD" : cmd.type === "SKIP" ? "SKIPPED" : "PLAYER_DISQUALIFIED";
        return ev(type, { playerId: lot.playerId });
      }

      case "NEXT_ROUND": {
        requireStatus(a, ["LIVE", "PAUSED"], "start the next round");
        if (await this.openLot(tx, a)) throw conflict("LOT_OPEN", "Close the current candidate first.");
        const counts = await tx
          .select({ status: players.status, n: sql<number>`count(*)::int` })
          .from(players)
          .where(eq(players.auctionId, a.id))
          .groupBy(players.status);
        const n = (s: string) => counts.find((c) => c.status === s)?.n ?? 0;
        if (n("POOL") > 0) throw conflict("POOL_NOT_EMPTY", `${n("POOL")} candidate(s) are still in the pool for round ${a.round}.`);
        if (n("UNSOLD") === 0) throw conflict("NOTHING_TO_REAUCTION", "There are no unsold candidates to re-auction.");
        await tx
          .update(players)
          .set({ status: "POOL", updatedAt: now })
          .where(and(eq(players.auctionId, a.id), eq(players.status, "UNSOLD")));
        await setAuction({ round: a.round + 1 });
        return ev("NEXT_ROUND");
      }

      case "RESTART_TIMER": {
        requireStatus(a, ["LIVE"], "restart the countdown");
        if (!a.timerEnabled) throw conflict("TIMER_DISABLED", "The countdown is turned off in the auction settings.");
        const lot = await this.openLot(tx, a);
        if (!lot) throw conflict("NO_PLAYER_ON_BLOCK", "No candidate is on the block.");
        await tx.update(lots).set(this.timerFields(a)).where(eq(lots.id, lot.id));
        return ev("SNAPSHOT");
      }

      case "END_AUCTION": {
        requireStatus(a, ["LIVE", "PAUSED"], "end the auction");
        if (await this.openLot(tx, a)) throw conflict("LOT_OPEN", "Close the current candidate before ending the auction.");
        const fin = await this.finances(tx, a.id);
        const ts = await tx.select().from(teams).where(eq(teams.auctionId, a.id));
        for (const t of ts) {
          const squad = fin.get(t.id)?.squadCount ?? 0;
          await tx
            .update(teams)
            .set({ disqualified: squad < a.minSquad, updatedAt: now })
            .where(eq(teams.id, t.id));
        }
        await setAuction({ status: "COMPLETED", completedAt: now, currentLotId: null });
        return ev("AUCTION_COMPLETED");
      }

      case "ANNOUNCE": {
        requireStatus(a, ["LOCKED", "LIVE", "PAUSED"], "post an announcement");
        await setAuction({ announcement: cmd.text || null, announcementAt: now });
        return ev("ANNOUNCEMENT", { text: cmd.text });
      }

      // ------------------------------------------------------------- final reveal
      // Profiles are revealed in purchase order, one step at a time:
      // display name → original name → offer letter → annual salary → purchasing team.
      case "START_REVEAL": {
        requireStatus(a, ["COMPLETED"], "start the final reveal");
        if (a.revealStatus !== "NOT_STARTED") throw conflict("REVEAL_ALREADY_STARTED", "The final reveal has already started.");
        const [ts, ps] = await Promise.all([
          tx.select().from(teams).where(eq(teams.auctionId, a.id)),
          tx.select().from(players).where(eq(players.auctionId, a.id)),
        ]);
        const check = privateView(a, ps, teamViews(a, ts, ps)).revealCheck;
        if (check.blocking.length) throw conflict("REVEAL_NOT_READY", `Cannot start the final reveal: ${check.blocking.join("; ")}.`, check);
        const order = ps
          .filter((p) => p.status === "SOLD")
          .sort((x, y) => (x.soldAt?.getTime() ?? 0) - (y.soldAt?.getTime() ?? 0) || x.number - y.number)
          .map((p) => p.id);
        await setAuction({ revealStatus: "IN_PROGRESS", revealOrder: order, revealIndex: 0, revealStep: 0, revealStartedAt: now, revealCompletedAt: null });
        return ev("REVEAL_STARTED", { playerId: order[0] });
      }

      case "REVEAL_NEXT": {
        requireStatus(a, ["COMPLETED"], "continue the final reveal");
        if (a.revealStatus === "NOT_STARTED") throw conflict("REVEAL_NOT_STARTED", "Start the final reveal first.");
        if (a.revealStatus === "COMPLETE") throw conflict("REVEAL_COMPLETE", "The final leaderboard is already shown.");
        const last = a.revealOrder.length - 1;
        if (a.revealStep < REVEAL_LAST_STEP) {
          await setAuction({ revealStep: a.revealStep + 1 });
          return ev("REVEAL_STEP", { playerId: a.revealOrder[a.revealIndex] });
        }
        if (a.revealIndex < last) {
          await setAuction({ revealIndex: a.revealIndex + 1, revealStep: 0 });
          return ev("REVEAL_STEP", { playerId: a.revealOrder[a.revealIndex + 1] });
        }
        await setAuction({ revealStatus: "COMPLETE", revealCompletedAt: now });
        return ev("REVEAL_COMPLETE");
      }

      case "REVEAL_BACK": {
        requireStatus(a, ["COMPLETED"], "go back in the final reveal");
        if (a.revealStatus === "NOT_STARTED") throw conflict("REVEAL_NOT_STARTED", "Start the final reveal first.");
        if (a.revealStatus === "COMPLETE") {
          await setAuction({
            revealStatus: "IN_PROGRESS",
            revealIndex: Math.max(0, a.revealOrder.length - 1),
            revealStep: REVEAL_LAST_STEP,
            revealCompletedAt: null,
          });
        } else if (a.revealStep > 0) {
          await setAuction({ revealStep: a.revealStep - 1 });
        } else if (a.revealIndex > 0) {
          await setAuction({ revealIndex: a.revealIndex - 1, revealStep: REVEAL_LAST_STEP });
        } else {
          throw conflict("REVEAL_AT_START", "Already at the first step of the reveal.");
        }
        return ev("REVEAL_STEP");
      }

      case "RESTART_REVEAL": {
        requireStatus(a, ["COMPLETED"], "restart the final reveal");
        if (a.revealStatus === "NOT_STARTED") throw conflict("REVEAL_NOT_STARTED", "The final reveal has not started.");
        await setAuction({ revealStatus: "NOT_STARTED", revealOrder: [], revealIndex: 0, revealStep: 0, revealStartedAt: null, revealCompletedAt: null });
        return ev("REVEAL_RESET");
      }

      default: {
        const unknown: never = cmd;
        throw conflict("UNKNOWN_COMMAND", `Unknown command ${(unknown as { type: string }).type}.`);
      }
    }
  }

  // --------------------------------------------------------------- setup / corrections
  /** Run a setup mutation under the auction lock, bump the version and broadcast. */
  async mutate<T>(
    auctionId: string,
    actor: AuditActor,
    action: string,
    details: Record<string, unknown>,
    fn: (tx: Tx, a: AuctionRow) => Promise<T>,
  ): Promise<T> {
    return this.runExclusive(auctionId, async () => {
      const result = await this.db.transaction(async (tx) => {
        const [a] = await tx.select().from(auctions).where(eq(auctions.id, auctionId)).for("update");
        if (!a) throw notFound("Auction");
        const r = await fn(tx, a);
        await tx
          .update(auctions)
          .set({ version: sql`${auctions.version} + 1`, updatedAt: new Date() })
          .where(eq(auctions.id, auctionId));
        await audit(tx, actor, action, auctionId, details);
        return r;
      });
      const [still] = await this.db.select({ id: auctions.id }).from(auctions).where(eq(auctions.id, auctionId)).limit(1);
      if (still) this.publish(await buildSnapshot(this.db, auctionId, ev("SETUP_CHANGED")));
      return result;
    });
  }

  /** Manual corrections from the candidate editor (assign / return to pool / DQ / reinstate). */
  async override(auctionId: string, playerId: string, o: PlayerOverride, actor: AuditActor) {
    return this.mutate(auctionId, actor, `player.override.${o.action.toLowerCase()}`, { playerId, ...o }, async (tx, a) => {
      if (!["LOCKED", "LIVE", "PAUSED", "COMPLETED"].includes(a.status))
        throw conflict("INVALID_STATE", "Manual corrections are available once the configuration is locked.");
      if (a.revealStatus !== "NOT_STARTED") throw conflict("REVEAL_STARTED", "The final reveal has started. Restart the reveal before correcting purchases.");
      const [p] = await tx
        .select()
        .from(players)
        .where(and(eq(players.id, playerId), eq(players.auctionId, auctionId)))
        .for("update");
      if (!p) throw notFound("Candidate");
      const lot = await this.openLot(tx, a);
      if (lot?.playerId === p.id) throw conflict("PLAYER_ON_BLOCK", "This candidate is on the block. Use the live console controls.");
      const now = new Date();
      const clearSale = { soldPrice: null, soldToTeamId: null, soldRound: null, soldAt: null, updatedAt: now };
      // Once the auction is over there is no pool any more: a cancelled purchase becomes unsold.
      const backTo = a.status === "COMPLETED" ? ("UNSOLD" as const) : ("POOL" as const);
      switch (o.action) {
        case "ASSIGN": {
          if (p.status !== "POOL" && p.status !== "UNSOLD") throw conflict("PLAYER_NOT_AVAILABLE", `${p.name} is ${p.status.toLowerCase()}.`);
          const team = await this.team(tx, auctionId, o.teamId);
          if (!team) throw notFound("Team");
          const fin = (await this.finances(tx, auctionId)).get(team.id) ?? { spent: 0, squadCount: 0 };
          if (fin.squadCount >= a.maxSquad) throw conflict("SQUAD_FULL", `${team.name} already has ${a.maxSquad} candidates.`);
          const limit = maxBid({ purse: team.purse, ...fin }, ruleConfig(a));
          if (o.amount > limit) throw conflict("EXCEEDS_MAX_BID", `${team.name} can pay at most ${this.money(a)(limit)}.`);
          await tx
            .update(players)
            .set({ status: "SOLD", soldPrice: o.amount, soldToTeamId: team.id, soldRound: a.round, soldAt: now, updatedAt: now })
            .where(eq(players.id, p.id));
          await this.refreshDisqualification(tx, a);
          return;
        }
        case "RETURN_TO_POOL":
          if (p.status === backTo) throw conflict("ALREADY_IN_POOL", `${p.name} is already ${backTo === "POOL" ? "in the pool" : "unsold"}.`);
          await tx
            .update(players)
            .set({ status: backTo, ...clearSale })
            .where(eq(players.id, p.id));
          await this.refreshDisqualification(tx, a);
          return;
        case "DISQUALIFY":
          if (p.status !== "POOL" && p.status !== "UNSOLD") throw conflict("PLAYER_NOT_AVAILABLE", "Return the candidate to the pool first.");
          await tx
            .update(players)
            .set({ status: "DISQUALIFIED", ...clearSale })
            .where(eq(players.id, p.id));
          return;
        case "REINSTATE":
          if (p.status !== "DISQUALIFIED") throw conflict("NOT_DISQUALIFIED", `${p.name} is not disqualified.`);
          await tx
            .update(players)
            .set({ status: backTo, ...clearSale })
            .where(eq(players.id, p.id));
          return;
      }
    });
  }

  /** After the auction has ended, a correction can change who reaches the minimum squad. */
  private async refreshDisqualification(tx: Tx, a: AuctionRow) {
    if (a.status !== "COMPLETED") return;
    const fin = await this.finances(tx, a.id);
    const ts = await tx.select().from(teams).where(eq(teams.auctionId, a.id));
    for (const t of ts)
      await tx
        .update(teams)
        .set({ disqualified: (fin.get(t.id)?.squadCount ?? 0) < a.minSquad, updatedAt: new Date() })
        .where(eq(teams.id, t.id));
  }

  // ------------------------------------------------------------------------ countdown
  /**
   * Optional per-candidate countdown (setting "timer"). The deadline lives in the database
   * (lots.timer_ends_at) so it survives restarts; every bid restarts it. At zero the lot is
   * flagged "time up" for the auctioneer — it is never sold automatically (open question Q-04).
   */
  private armTimer(snap: LiveSnapshot) {
    const id = snap.auction.id;
    const existing = this.timers.get(id);
    if (existing) clearTimeout(existing);
    this.timers.delete(id);
    const lot = snap.lot;
    if (!lot || snap.auction.status !== "LIVE" || !lot.timer.enabled || !lot.timer.endsAt || lot.timer.timeUp) return;
    const delay = Math.max(0, lot.timer.endsAt - Date.now()) + 20;
    const handle = setTimeout(() => {
      this.timers.delete(id);
      this.onTimer(id, lot.id, lot.timer.endsAt!).catch((e) => console.error("[engine] timer error", e));
    }, delay);
    handle.unref?.();
    this.timers.set(id, handle);
  }

  private async onTimer(auctionId: string, lotId: string, endsAt: number) {
    await this.runExclusive(auctionId, async () => {
      const outcome = await this.db.transaction(async (tx) => {
        const [a] = await tx.select().from(auctions).where(eq(auctions.id, auctionId)).for("update");
        if (!a || a.status !== "LIVE" || a.currentLotId !== lotId) return "stale";
        const [lot] = await tx.select().from(lots).where(eq(lots.id, lotId)).for("update");
        if (!lot || lot.result !== "OPEN" || lot.timeUp || lot.timerEndsAt?.getTime() !== endsAt) return "stale";
        if (Date.now() < endsAt) return "early";
        await tx.update(lots).set({ timeUp: true }).where(eq(lots.id, lotId));
        await tx
          .update(auctions)
          .set({ version: a.version + 1, updatedAt: new Date() })
          .where(eq(auctions.id, auctionId));
        await audit(tx, SYSTEM_ACTOR, "live.time_up", auctionId, { lotId });
        return "fired";
      });
      if (outcome === "stale") return;
      const snap = await buildSnapshot(this.db, auctionId, ev(outcome === "fired" ? "TIME_UP" : "SNAPSHOT"));
      if (outcome === "fired") this.broadcaster.publish(snap);
      else this.armTimer(snap); // woke up a little early: re-arm for the remainder
    });
  }

  /** After a restart, re-arm countdowns of live auctions from the persisted deadlines. */
  async recover() {
    const live = await this.db.select({ id: auctions.id }).from(auctions).where(eq(auctions.status, "LIVE"));
    for (const { id } of live) this.armTimer(await buildSnapshot(this.db, id, ev("SNAPSHOT")));
    return live.length;
  }

  shutdown() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }
}
