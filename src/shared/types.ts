/** Types shared by the server (snapshot builder) and the browser (console, display). */

export type AuctionStatus = "DRAFT" | "LOCKED" | "LIVE" | "PAUSED" | "COMPLETED";
export type PlayerStatus = "POOL" | "SOLD" | "UNSOLD" | "DISQUALIFIED";
export type LotResult = "OPEN" | "SOLD" | "UNSOLD" | "SKIPPED" | "DISQUALIFIED";
export type PoolOrder = "RANDOM" | "SEQUENTIAL";
export type RevealStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE";

export interface AuctionSettings {
  id: string;
  slug: string;
  name: string;
  status: AuctionStatus;
  currencySymbol: string;
  purse: number; // k units, default purse for new teams
  basePrice: number;
  bidIncrement: number;
  minSquad: number;
  maxSquad: number;
  timerEnabled: boolean;
  timerSeconds: number;
  poolOrder: PoolOrder;
  roles: string[];
  round: number;
  revealStatus: RevealStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  lockedAt: string | null;
  liveAt: string | null;
  completedAt: string | null;
}

export interface TeamView {
  id: string;
  name: string;
  shortName: string;
  color: string;
  logoUrl: string | null;
  members: string[];
  sortOrder: number;
  purse: number;
  spent: number;
  remaining: number;
  squadCount: number;
  maxBid: number;
  disqualified: boolean;
}

export interface PlayerView {
  id: string;
  number: number;
  name: string;
  role: string;
  description: string;
  photoUrl: string | null;
  basePrice: number | null; // null → auction base price
  status: PlayerStatus;
  soldPrice: number | null;
  soldToTeamId: string | null;
  soldRound: number | null;
}

/** Organizer-only view of a profile: adds the data that stays hidden until the final reveal. */
export interface PrivatePlayerView extends PlayerView {
  originalName: string | null;
  annualSalary: number | null; // whole USD, base annual salary excluding bonuses
  salaryVerified: boolean;
  letter: OfferLetterRef | null;
}

export interface OfferLetterRef {
  url: string;
  kind: "pdf" | "image";
  fileName: string | null;
}

export interface BidView {
  id: number;
  teamId: string;
  amount: number;
  createdAt: string;
}

export interface TimerView {
  enabled: boolean;
  durationMs: number;
  endsAt: number | null; // epoch ms (server clock) while running
  remainingMs: number | null; // frozen remaining time while paused
  timeUp: boolean;
}

export interface LotView {
  id: string;
  sequence: number;
  round: number;
  player: PlayerView;
  basePrice: number;
  currentBid: number | null;
  leadingTeamId: string | null;
  bids: BidView[]; // newest first
  openedAt: string;
  timer: TimerView;
}

export interface LastResult {
  lotId: string;
  result: Exclude<LotResult, "OPEN">;
  player: PlayerView;
  teamId: string | null;
  amount: number | null;
  at: string;
}

export interface AuctionStats {
  total: number;
  pool: number;
  sold: number;
  unsold: number;
  disqualified: number;
  totalSpent: number;
  topSale: { playerName: string; teamId: string; amount: number } | null;
  topSpender: { teamId: string; spent: number; squadCount: number } | null;
}

export type LiveEventType =
  | "SNAPSHOT"
  | "WENT_LIVE"
  | "PAUSED"
  | "RESUMED"
  | "PLAYER_UP"
  | "BID_PLACED"
  | "BID_UNDONE"
  | "SOLD"
  | "UNSOLD"
  | "SKIPPED"
  | "PLAYER_DISQUALIFIED"
  | "NEXT_ROUND"
  | "TIME_UP"
  | "ANNOUNCEMENT"
  | "AUCTION_COMPLETED"
  | "REVEAL_STARTED"
  | "REVEAL_STEP"
  | "REVEAL_COMPLETE"
  | "REVEAL_RESET"
  | "SETUP_CHANGED";

export interface LiveEvent {
  type: LiveEventType;
  at: number;
  teamId?: string | null;
  amount?: number | null;
  playerId?: string | null;
  text?: string;
}

/**
 * Winner = combined actual annual salaries of the purchased profiles. A team's standing.
 * In the public reveal view `total`/`profiles` only count profiles revealed so far.
 */
export interface TeamStanding {
  teamId: string;
  profiles: number;
  total: number; // whole USD
  creditsLeft: number; // k units of auction credits (tiebreaker)
  rank: number | null; // null = not ranked (disqualified, or reveal not finished)
  winner: boolean;
  disqualified: boolean;
}

/** One purchased profile in the final reveal; fields stay null until their step is reached. */
export interface RevealCard {
  playerId: string;
  number: number;
  name: string; // tweaked display name used during bidding
  role: string;
  photoUrl: string | null;
  originalName: string | null; // step ≥ 1
  letter: OfferLetterRef | null; // step ≥ 2
  annualSalary: number | null; // step ≥ 3
  teamId: string | null; // step ≥ 4
  soldPrice: number | null; // step ≥ 4 (auction credits)
}

/** Steps per profile: 0 display name → 1 original name → 2 offer letter → 3 annual salary → 4 purchasing team. */
export const REVEAL_STEPS = ["Display name", "Original name", "Offer letter", "Annual salary", "Purchasing team"] as const;

export interface RevealView {
  status: RevealStatus;
  index: number; // current profile (0-based)
  step: number; // 0..4 within the current profile
  count: number; // purchased profiles to reveal
  current: RevealCard | null;
  revealed: RevealCard[]; // fully revealed profiles, in reveal order
  standings: TeamStanding[]; // visible totals so far; ranks and winner only once COMPLETE
}

/** Organizer-only data: hidden salary totals during bidding and every profile's private fields. */
export interface PrivateView {
  standings: TeamStanding[]; // live hidden totals from confirmed purchases only, ranked
  profiles: PrivatePlayerView[];
  revealCheck: { blocking: string[]; warnings: string[] };
}

export interface LiveSnapshot {
  version: number;
  serverNow: number;
  auction: AuctionSettings;
  teams: TeamView[]; // organizer order (sortOrder); display order is derived client-side
  lot: LotView | null;
  lastResult: LastResult | null;
  stats: AuctionStats;
  announcement: { text: string; at: string } | null;
  reveal: RevealView;
  /** Present only in snapshots sent to signed-in organizers — stripped from every public payload. */
  private?: PrivateView;
  event: LiveEvent;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}
