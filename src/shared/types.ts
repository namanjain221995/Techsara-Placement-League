/** Types shared by the server (snapshot builder) and the browser (console, display). */

export type AuctionStatus = "DRAFT" | "LOCKED" | "LIVE" | "PAUSED" | "COMPLETED";
export type PlayerStatus = "POOL" | "SOLD" | "UNSOLD" | "DISQUALIFIED";
export type LotResult = "OPEN" | "SOLD" | "UNSOLD" | "SKIPPED" | "DISQUALIFIED";
export type PoolOrder = "RANDOM" | "SEQUENTIAL";

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
  | "SETUP_CHANGED";

export interface LiveEvent {
  type: LiveEventType;
  at: number;
  teamId?: string | null;
  amount?: number | null;
  playerId?: string | null;
  text?: string;
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
  event: LiveEvent;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}
