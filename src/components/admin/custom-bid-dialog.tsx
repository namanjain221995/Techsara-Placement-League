"use client";

import { useMemo, useState } from "react";
import { MoneyInput } from "@/components/ui/form";
import { Dialog } from "@/components/ui/dialog";
import { TeamLogo } from "@/components/media";
import { cn } from "@/lib/cn";
import { formatMoney, parseMillions, toMillionsString } from "@/shared/money";
import { quickAmounts } from "@/shared/rules";
import type { LiveSnapshot } from "@/shared/types";

/**
 * R-BID-07/08 (client 07:43–08:56): type an amount in MILLIONS ("10" = $10M), pick the team.
 * Every team shows its MAX BID; a team whose max is below the typed amount cannot be chosen,
 * so "24" is impossible when the max is 23 while "23" works.
 */
export function CustomBidDialog({
  open,
  onOpenChange,
  snapshot,
  onBid,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  snapshot: LiveSnapshot;
  onBid: (teamId: string, amount: number) => Promise<boolean>;
}) {
  const lot = snapshot.lot;
  const sym = snapshot.auction.currencySymbol;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const amount = parseMillions(text);
  const hasBids = lot?.currentBid != null;
  const floor = lot ? (hasBids ? lot.currentBid! : lot.basePrice) : 0;
  const chips = lot ? quickAmounts(hasBids, lot.currentBid, lot.basePrice, snapshot.auction) : [];

  const problem = useMemo(() => {
    if (!lot) return "No candidate is on the block.";
    if (!text.trim()) return null;
    if (amount === null) return "Enter a number in millions — e.g. 10 for " + formatMoney(10000, sym) + ".";
    if (hasBids && amount <= lot.currentBid!) return `Must be more than the current bid ${formatMoney(lot.currentBid!, sym)}.`;
    if (!hasBids && amount < lot.basePrice) return `The opening bid must be at least the base price ${formatMoney(lot.basePrice, sym)}.`;
    return null;
  }, [lot, text, amount, hasBids, sym]);

  if (!lot) return null;

  const pick = async (teamId: string) => {
    if (amount === null || problem) return;
    setBusy(teamId);
    const ok = await onBid(teamId, amount);
    setBusy(null);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title="Custom bid"
      description={
        <>
          {lot.player.name} · Base {formatMoney(lot.basePrice, sym)} · Current {hasBids ? formatMoney(lot.currentBid!, sym) : "no bids yet"}
        </>
      }
    >
      <label htmlFor="custom-amount" className="mb-1.5 block text-xs font-semibold tracking-wide text-ink-300 uppercase">
        Amount in millions
      </label>
      <MoneyInput
        id="custom-amount"
        symbol={sym}
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={toMillionsString(floor + snapshot.auction.bidIncrement)}
        className="h-14 text-2xl font-bold"
        aria-invalid={!!problem}
        data-testid="custom-amount"
      />
      <div className="mt-1.5 min-h-5 text-xs">
        {problem ? (
          <span className="font-medium text-loss-400" role="alert">
            {problem}
          </span>
        ) : amount ? (
          <span className="text-ink-300">
            Bid of <b className="text-gold-300">{formatMoney(amount, sym)}</b> — choose the team below.
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => setText(toMillionsString(c.amount))}
            className="rounded-lg bg-ink-700 px-3 py-1.5 text-xs font-semibold text-ink-100 ring-1 ring-ink-500 hover:bg-ink-600"
          >
            {c.label}: {formatMoney(c.amount, sym)}
          </button>
        ))}
      </div>

      <div className="mt-5 mb-2 text-xs font-semibold tracking-wide text-ink-300 uppercase">Select team — click to place the bid</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {snapshot.teams.map((t) => {
          const leading = lot.leadingTeamId === t.id && hasBids;
          const full = t.squadCount >= snapshot.auction.maxSquad;
          const tooHigh = amount !== null && amount > t.maxBid;
          const disabled = !amount || !!problem || leading || full || tooHigh || busy !== null;
          const why = leading ? "Leading" : full ? "Squad full" : tooHigh ? "Above max" : null;
          return (
            <button
              key={t.id}
              type="button"
              disabled={disabled}
              onClick={() => pick(t.id)}
              data-testid={`custom-team-${t.shortName}`}
              className={cn(
                "flex items-center gap-3 rounded-xl p-3 text-left ring-1 transition",
                disabled ? "cursor-not-allowed bg-ink-850 opacity-60 ring-ink-600" : "bg-ink-800 ring-ink-500 hover:bg-ink-700 hover:ring-gold-500/70",
              )}
            >
              <TeamLogo team={t} className="size-10" />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm leading-tight font-semibold break-words text-white">{t.name}</span>
                <span className="block text-xs text-ink-300">
                  Purse {formatMoney(t.remaining, sym)} ·{" "}
                  <b className={cn("whitespace-nowrap", tooHigh ? "text-loss-400" : "text-gold-300")}>Max {formatMoney(t.maxBid, sym)}</b>
                </span>
              </span>
              {busy === t.id ? (
                <span className="text-xs text-ink-300">…</span>
              ) : why ? (
                <span className="shrink-0 text-[10px] font-bold tracking-wider whitespace-nowrap text-ink-300 uppercase">{why}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}
