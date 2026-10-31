import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AuctionStatus, PlayerStatus } from "@/shared/types";

export function Badge({
  className,
  tone = "neutral",
  children,
}: {
  className?: string;
  tone?: "neutral" | "gold" | "green" | "red" | "blue" | "amber";
  children: React.ReactNode;
}) {
  const tones = {
    neutral: "bg-ink-700 text-ink-200 ring-ink-500/60",
    gold: "bg-gold-500/15 text-gold-300 ring-gold-500/40",
    green: "bg-win-500/15 text-win-400 ring-win-500/40",
    red: "bg-loss-500/15 text-loss-400 ring-loss-500/40",
    blue: "bg-volt-500/15 text-volt-400 ring-volt-500/40",
    amber: "bg-warn-500/15 text-amber-300 ring-warn-500/40",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wider uppercase ring-1",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const AUCTION_TONE: Record<AuctionStatus, Parameters<typeof Badge>[0]["tone"]> = {
  DRAFT: "neutral",
  LOCKED: "blue",
  LIVE: "red",
  PAUSED: "amber",
  COMPLETED: "green",
};
const AUCTION_LABEL: Record<AuctionStatus, string> = { DRAFT: "Setup", LOCKED: "Ready", LIVE: "Live", PAUSED: "Paused", COMPLETED: "Completed" };

export function AuctionStatusBadge({ status }: { status: AuctionStatus }) {
  return (
    <Badge tone={AUCTION_TONE[status]}>
      {status === "LIVE" && <span className="size-1.5 animate-live-dot rounded-full bg-loss-400" />}
      {AUCTION_LABEL[status]}
    </Badge>
  );
}

const PLAYER_TONE: Record<PlayerStatus, Parameters<typeof Badge>[0]["tone"]> = { POOL: "blue", SOLD: "green", UNSOLD: "amber", DISQUALIFIED: "red" };
const PLAYER_LABEL: Record<PlayerStatus, string> = { POOL: "In pool", SOLD: "Sold", UNSOLD: "Unsold", DISQUALIFIED: "Disqualified" };
export function PlayerStatusBadge({ status }: { status: PlayerStatus }) {
  return <Badge tone={PLAYER_TONE[status]}>{PLAYER_LABEL[status]}</Badge>;
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-2 text-ink-300", className)} role="status">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: React.ReactNode; title: string; body?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="panel flex flex-col items-center gap-3 px-6 py-14 text-center">
      {icon && <div className="text-gold-400">{icon}</div>}
      <h3 className="font-display text-xl tracking-wide text-white uppercase">{title}</h3>
      {body && <p className="max-w-md text-sm text-ink-300">{body}</p>}
      {action}
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-md bg-ink-700 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink-200 ring-1 ring-ink-500">{children}</kbd>;
}

export function Stat({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl bg-ink-850/80 px-4 py-3 ring-1 ring-ink-600/60", className)}>
      <div className="text-[11px] font-bold tracking-widest text-ink-400 uppercase">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold text-white tabular-nums">{value}</div>
    </div>
  );
}
