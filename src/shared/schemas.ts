import { z } from "zod";

/** Input validation shared by API (authoritative) and forms (instant feedback). */

const name = (max: number) => z.string().trim().min(1, "Required").max(max, `Max ${max} characters`);
const money = z.int("Must be a whole number of thousands").min(1, "Must be greater than zero").max(1_000_000_000);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #F5B83D");

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(60),
  password: z.string().min(1).max(200),
});

export const DEFAULT_ROLES = ["Batsman", "Bowler", "All-Rounder", "Wicket Keeper"];

export const auctionSettingsSchema = z
  .object({
    name: name(80),
    currencySymbol: z.string().trim().min(1).max(3).default("$"),
    purse: money,
    basePrice: money,
    bidIncrement: money,
    minSquad: z.int().min(0).max(50),
    maxSquad: z.int().min(1).max(50),
    timerEnabled: z.boolean(),
    timerSeconds: z.int().min(5).max(600),
    poolOrder: z.enum(["RANDOM", "SEQUENTIAL"]),
    roles: z.array(name(30)).min(1).max(12),
  })
  .refine((v) => v.minSquad <= v.maxSquad, { message: "Minimum squad cannot exceed maximum squad", path: ["minSquad"] })
  .refine((v) => v.purse >= v.basePrice * Math.max(v.minSquad, 1), {
    message: "Purse must cover the minimum squad at base price",
    path: ["purse"],
  });
export type AuctionSettingsInput = z.infer<typeof auctionSettingsSchema>;

export const createAuctionSchema = z.object({ name: name(80) });
export const cloneAuctionSchema = z.object({ name: name(80) });

export const teamSchema = z.object({
  name: name(60),
  shortName: z
    .string()
    .trim()
    .min(1, "Required")
    .max(6, "Max 6 characters")
    .transform((s) => s.toUpperCase()),
  color: hexColor,
  members: z.array(name(60)).max(12).default([]),
  purse: money.nullable().optional(),
});
export type TeamInput = z.infer<typeof teamSchema>;

export const playerSchema = z.object({
  name: name(80),
  role: name(30),
  description: z.string().max(4000, "Max 4000 characters").default(""),
  basePrice: money.nullable().optional(),
  photoUrl: z
    .url({ protocol: /^https?$/ })
    .max(500)
    .nullable()
    .optional(),
  number: z.int().min(1).max(9999).optional(),
});
export type PlayerInput = z.infer<typeof playerSchema>;

export const reorderSchema = z.object({ ids: z.array(z.uuid()).min(1).max(200) });

const cmd = <L extends string, T extends z.ZodRawShape>(type: L, shape: T) => z.object({ type: z.literal(type), commandId: z.uuid(), ...shape });

export const liveCommandSchema = z.discriminatedUnion("type", [
  cmd("GO_LIVE", {}),
  cmd("PAUSE", {}),
  cmd("RESUME", {}),
  cmd("NEXT_PLAYER", {}),
  cmd("PICK_PLAYER", { playerId: z.uuid() }),
  cmd("BID", { teamId: z.uuid(), amount: money.optional() }),
  cmd("UNDO_BID", {}),
  cmd("SOLD", {}),
  cmd("UNSOLD", {}),
  cmd("SKIP", {}),
  cmd("DISQUALIFY_PLAYER", {}),
  cmd("NEXT_ROUND", {}),
  cmd("RESTART_TIMER", {}),
  cmd("END_AUCTION", {}),
  cmd("ANNOUNCE", { text: z.string().trim().max(160) }),
]);
export type LiveCommand = z.infer<typeof liveCommandSchema>;

export const overrideSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ASSIGN"), teamId: z.uuid(), amount: money }),
  z.object({ action: z.literal("RETURN_TO_POOL") }),
  z.object({ action: z.literal("DISQUALIFY") }),
  z.object({ action: z.literal("REINSTATE") }),
]);
export type PlayerOverride = z.infer<typeof overrideSchema>;

export function issuesToDetails(err: z.ZodError) {
  return err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}
