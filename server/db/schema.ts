import { sql } from "drizzle-orm";
import { bigserial, boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * Money columns are integers in thousands of the auction currency ("k units"):
 * 1000 = $1M. See src/shared/money.ts.
 */

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const auctionStatusEnum = pgEnum("auction_status", ["DRAFT", "LOCKED", "LIVE", "PAUSED", "COMPLETED"]);
export const playerStatusEnum = pgEnum("player_status", ["POOL", "SOLD", "UNSOLD", "DISQUALIFIED"]);
export const lotResultEnum = pgEnum("lot_result", ["OPEN", "SOLD", "UNSOLD", "SKIPPED", "DISQUALIFIED"]);
export const poolOrderEnum = pgEnum("pool_order", ["RANDOM", "SEQUENTIAL"]);
export const revealStatusEnum = pgEnum("reveal_status", ["NOT_STARTED", "IN_PROGRESS", "COMPLETE"]);

export const admins = pgTable("admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => admins.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_admin_idx").on(t.adminId)],
);

export const auctions = pgTable(
  "auctions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    status: auctionStatusEnum("status").notNull().default("DRAFT"),
    currencySymbol: text("currency_symbol").notNull().default("$"),
    purse: integer("purse").notNull().default(25_000),
    basePrice: integer("base_price").notNull().default(1_000),
    bidIncrement: integer("bid_increment").notNull().default(1_000),
    minSquad: integer("min_squad").notNull().default(3),
    maxSquad: integer("max_squad").notNull().default(9),
    timerEnabled: boolean("timer_enabled").notNull().default(false),
    timerSeconds: integer("timer_seconds").notNull().default(30),
    // Position/size of the countdown on the live screen (cosmetic; editable at any time).
    timerLayout: jsonb("timer_layout").$type<{ x: number | null; y: number | null; scale: number }>().notNull().default({ x: null, y: null, scale: 1 }),
    poolOrder: poolOrderEnum("pool_order").notNull().default("RANDOM"),
    roles: jsonb("roles").$type<string[]>().notNull(),
    round: integer("round").notNull().default(1),
    lotSequence: integer("lot_sequence").notNull().default(0),
    currentLotId: uuid("current_lot_id"),
    lastLotId: uuid("last_lot_id"),
    announcement: text("announcement"),
    announcementAt: ts("announcement_at"),
    // Final reveal (winner = combined actual annual salaries). Order is fixed when the reveal starts.
    revealStatus: revealStatusEnum("reveal_status").notNull().default("NOT_STARTED"),
    revealOrder: jsonb("reveal_order").$type<string[]>().notNull().default([]),
    revealIndex: integer("reveal_index").notNull().default(0),
    revealStep: integer("reveal_step").notNull().default(0),
    revealStartedAt: ts("reveal_started_at"),
    revealCompletedAt: ts("reveal_completed_at"),
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by").references(() => admins.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    lockedAt: ts("locked_at"),
    liveAt: ts("live_at"),
    completedAt: ts("completed_at"),
  },
  (t) => [
    check("auctions_squad_chk", sql`${t.minSquad} >= 0 AND ${t.maxSquad} >= 1 AND ${t.minSquad} <= ${t.maxSquad}`),
    check("auctions_money_chk", sql`${t.purse} > 0 AND ${t.basePrice} > 0 AND ${t.bidIncrement} > 0`),
    check("auctions_timer_chk", sql`${t.timerSeconds} BETWEEN 5 AND 600`),
    check("auctions_round_chk", sql`${t.round} >= 1`),
    check("auctions_reveal_chk", sql`${t.revealIndex} >= 0 AND ${t.revealStep} BETWEEN 0 AND 4`),
  ],
);

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    auctionId: uuid("auction_id")
      .notNull()
      .references(() => auctions.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    shortName: text("short_name").notNull(),
    color: text("color").notNull(),
    logoPath: text("logo_path"),
    members: jsonb("members").$type<string[]>().notNull(),
    purse: integer("purse").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    disqualified: boolean("disqualified").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("teams_auction_idx").on(t.auctionId),
    uniqueIndex("teams_auction_name_uq").on(t.auctionId, sql`lower(${t.name})`),
    check("teams_purse_chk", sql`${t.purse} > 0`),
  ],
);

export const players = pgTable(
  "players",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    auctionId: uuid("auction_id")
      .notNull()
      .references(() => auctions.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull(),
    description: text("description").notNull().default(""),
    photoPath: text("photo_path"),
    photoUrl: text("photo_url"),
    basePrice: integer("base_price"),
    status: playerStatusEnum("status").notNull().default("POOL"),
    soldPrice: integer("sold_price"),
    soldToTeamId: uuid("sold_to_team_id").references(() => teams.id, { onDelete: "restrict" }),
    soldRound: integer("sold_round"),
    soldAt: ts("sold_at"),
    // Hidden until the final reveal — never part of the public snapshot.
    originalName: text("original_name"),
    annualSalary: integer("annual_salary"), // whole USD, base annual salary excluding bonuses
    salaryVerified: boolean("salary_verified").notNull().default(false),
    offerLetterPath: text("offer_letter_path"), // file under UPLOAD_DIR/private/
    offerLetterType: text("offer_letter_type"), // application/pdf | image/png | image/jpeg | image/webp
    offerLetterName: text("offer_letter_name"), // original file name (organizer view only)
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("players_auction_number_uq").on(t.auctionId, t.number),
    index("players_auction_status_idx").on(t.auctionId, t.status),
    check("players_sold_consistency_chk", sql`(${t.status} = 'SOLD') = (${t.soldToTeamId} IS NOT NULL AND ${t.soldPrice} IS NOT NULL)`),
    check("players_money_chk", sql`(${t.basePrice} IS NULL OR ${t.basePrice} > 0) AND (${t.soldPrice} IS NULL OR ${t.soldPrice} > 0)`),
    check("players_salary_chk", sql`${t.annualSalary} IS NULL OR ${t.annualSalary} > 0`),
  ],
);

export const lots = pgTable(
  "lots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    auctionId: uuid("auction_id")
      .notNull()
      .references(() => auctions.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    round: integer("round").notNull(),
    result: lotResultEnum("result").notNull().default("OPEN"),
    basePrice: integer("base_price").notNull(),
    currentBid: integer("current_bid"),
    leadingTeamId: uuid("leading_team_id").references(() => teams.id, { onDelete: "cascade" }),
    finalAmount: integer("final_amount"),
    winningTeamId: uuid("winning_team_id").references(() => teams.id, { onDelete: "cascade" }),
    timerEndsAt: ts("timer_ends_at"),
    timerRemainingMs: integer("timer_remaining_ms"),
    timeUp: boolean("time_up").notNull().default(false),
    openedAt: ts("opened_at").notNull().defaultNow(),
    closedAt: ts("closed_at"),
  },
  (t) => [
    uniqueIndex("lots_one_open_per_auction_uq")
      .on(t.auctionId)
      .where(sql`${t.result} = 'OPEN'`),
    uniqueIndex("lots_auction_sequence_uq").on(t.auctionId, t.sequence),
    index("lots_player_idx").on(t.playerId),
  ],
);

export const bids = pgTable(
  "bids",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    auctionId: uuid("auction_id")
      .notNull()
      .references(() => auctions.id, { onDelete: "cascade" }),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => lots.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    placedBy: uuid("placed_by").references(() => admins.id, { onDelete: "set null" }),
    commandId: uuid("command_id").unique(),
    undoneAt: ts("undone_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("bids_lot_idx").on(t.lotId, t.id), check("bids_amount_chk", sql`${t.amount} > 0`)],
);

/** Every accepted live command, keyed by the client-generated commandId (idempotency). */
export const processedCommands = pgTable(
  "processed_commands",
  {
    commandId: uuid("command_id").primaryKey(),
    auctionId: uuid("auction_id")
      .notNull()
      .references(() => auctions.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    resultVersion: integer("result_version").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("processed_commands_auction_idx").on(t.auctionId)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    auctionId: uuid("auction_id").references(() => auctions.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => admins.id, { onDelete: "set null" }),
    actorLabel: text("actor_label").notNull(),
    action: text("action").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull(),
    ip: text("ip"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_logs_auction_idx").on(t.auctionId, t.createdAt)],
);

export type AuctionRow = typeof auctions.$inferSelect;
export type TeamRow = typeof teams.$inferSelect;
export type PlayerRow = typeof players.$inferSelect;
export type LotRow = typeof lots.$inferSelect;
export type BidRow = typeof bids.$inferSelect;
export type AdminRow = typeof admins.$inferSelect;
