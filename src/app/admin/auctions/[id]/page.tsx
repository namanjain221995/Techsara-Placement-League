"use client";

import { AlertTriangle, CheckCircle2, Circle, ClipboardCopy, ExternalLink, Lock, LockOpen, Radio, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { useAuction } from "@/components/admin/auction-context";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { Spinner, Stat } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/shared/money";
import { maxBid } from "@/shared/rules";

export default function OverviewPage() {
  const { id, snapshot, detail, refreshDetail } = useAuction();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  if (!snapshot || !detail) return <Spinner className="py-20" />;
  const a = snapshot.auction;
  const money = (k: number) => formatMoney(k, a.currencySymbol);
  const displayUrl = typeof window !== "undefined" ? `${window.location.origin}/display/${a.slug}` : `/display/${a.slug}`;
  const locked = a.status !== "DRAFT";

  const act = async (path: string, label: string, ok: string) => {
    setBusy(label);
    try {
      const r = await api.post<{ warnings?: string[] }>(`/auctions/${id}/${path}`);
      toast.success(ok);
      r.warnings?.forEach((w) => toast.warning(w));
      await refreshDetail();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const steps = [
    {
      done: true,
      title: "Rules & money",
      body: `Purse ${money(a.purse)} · base ${money(a.basePrice)} · step ${money(a.bidIncrement)} · squad ${a.minSquad}–${a.maxSquad}`,
      href: "settings",
    },
    { done: detail.counts.teams >= 2, title: "Teams", body: `${detail.counts.teams} team(s) — names, colours, logos and members`, href: "teams" },
    {
      done: detail.counts.players >= 1,
      title: "Candidates",
      body: `${detail.counts.players} candidate(s) — tweaked name, photo, role and point-wise clues`,
      href: "players",
    },
    {
      done:
        detail.readiness.profiles > 0 && detail.readiness.verified === detail.readiness.profiles && detail.readiness.withLetter === detail.readiness.profiles,
      title: "Offer letters & salaries (hidden)",
      body: `${detail.readiness.withSalary}/${detail.readiness.profiles} annual salaries · ${detail.readiness.verified} verified · ${detail.readiness.withLetter} offer letters · ${detail.readiness.withOriginalName} original names — they decide the winner and stay hidden until the final reveal`,
      href: "players",
    },
    { done: locked, title: "Lock configuration", body: "Freezes money and squad rules so the live auction is fair", href: null },
    {
      done: a.status === "LIVE" || a.status === "PAUSED" || a.status === "COMPLETED",
      title: "Go live",
      body: "Open the live screen on the projector, then start from the live console",
      href: "live",
    },
  ];

  return (
    <div className="space-y-5">
      <div className="panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.25em] text-gold-400 uppercase">Placement League auction</p>
            <h1 className="mt-1 font-display text-3xl font-semibold tracking-wide text-white uppercase">{a.name}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {a.status === "DRAFT" && (
              <Button
                variant="primary"
                loading={busy === "lock"}
                onClick={() => act("lock", "lock", "Configuration locked — ready to go live")}
                data-testid="lock"
              >
                <Lock className="size-4" /> Lock configuration
              </Button>
            )}
            {a.status === "LOCKED" && (
              <>
                <Button variant="ghost" loading={busy === "unlock"} onClick={() => act("unlock", "unlock", "Unlocked — setup is editable again")}>
                  <LockOpen className="size-4" /> Unlock
                </Button>
                <Link href={`/admin/auctions/${id}/live`}>
                  <Button variant="success" data-testid="open-live-console">
                    <Radio className="size-4" /> Open live console
                  </Button>
                </Link>
              </>
            )}
            {(a.status === "LIVE" || a.status === "PAUSED") && (
              <Link href={`/admin/auctions/${id}/live`}>
                <Button variant="danger">
                  <Radio className="size-4" /> Back to the live console
                </Button>
              </Link>
            )}
            {a.status === "COMPLETED" && (
              <Link href={`/admin/auctions/${id}/live`}>
                <Button variant="primary" data-testid="open-reveal">
                  <Radio className="size-4" /> {a.revealStatus === "COMPLETE" ? "Final leaderboard" : "Final Reveal"}
                </Button>
              </Link>
            )}
            {a.status !== "DRAFT" && (
              <Button
                variant="ghost"
                loading={busy === "reset"}
                onClick={async () => {
                  if (
                    await confirm({
                      title: "Reset this auction?",
                      tone: "danger",
                      confirmLabel: "Reset",
                      body: "Deletes every bid and result, returns all candidates to the pool and resets the final reveal. Teams, candidates (including salaries, original names and offer letters) and settings stay. Use it after a rehearsal.",
                    })
                  )
                    act("reset", "reset", "Auction reset to ready");
                }}
              >
                <RotateCcw className="size-4" /> Reset
              </Button>
            )}
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Teams" value={detail.counts.teams} />
          <Stat label="Candidates" value={detail.counts.players} />
          <Stat label="Max bid (empty team)" value={money(maxBid({ purse: a.purse, spent: 0, squadCount: 0 }, a))} />
          <Stat label="Countdown" value={a.timerEnabled ? `${a.timerSeconds}s` : "Off"} />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <div className="panel p-6">
          <h2 className="mb-4 text-xs font-bold tracking-widest text-ink-300 uppercase">Setup checklist</h2>
          <ol className="space-y-3">
            {steps.map((s, i) => (
              <li
                key={s.title}
                className={cn("flex items-start gap-3 rounded-xl p-3 ring-1", s.done ? "bg-win-500/5 ring-win-500/25" : "bg-ink-850 ring-ink-600")}
              >
                {s.done ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-win-400" /> : <Circle className="mt-0.5 size-5 shrink-0 text-ink-400" />}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-white">
                    {i + 1}. {s.title}
                  </div>
                  <div className="text-sm text-ink-300">{s.body}</div>
                </div>
                {s.href && (
                  <Link href={`/admin/auctions/${id}/${s.href}`}>
                    <Button size="sm" variant="ghost">
                      Open
                    </Button>
                  </Link>
                )}
              </li>
            ))}
          </ol>
          {a.revealStatus === "NOT_STARTED" && detail.readiness.warnings.length > 0 && (
            <div className="mt-5 space-y-2" data-testid="readiness-warnings">
              {detail.readiness.warnings.map((m) => (
                <p key={m} className="flex gap-2 rounded-lg bg-warn-500/10 p-3 text-sm text-amber-300 ring-1 ring-warn-500/30">
                  <AlertTriangle className="size-4 shrink-0" /> {m}
                </p>
              ))}
            </div>
          )}
          {(detail.issues.blocking.length > 0 || detail.issues.warnings.length > 0) && a.status === "DRAFT" && (
            <div className="mt-5 space-y-2">
              {detail.issues.blocking.map((m) => (
                <p key={m} className="flex gap-2 rounded-lg bg-loss-500/10 p-3 text-sm text-loss-400 ring-1 ring-loss-500/30">
                  <AlertTriangle className="size-4 shrink-0" /> {m}
                </p>
              ))}
              {detail.issues.warnings.map((m) => (
                <p key={m} className="flex gap-2 rounded-lg bg-warn-500/10 p-3 text-sm text-amber-300 ring-1 ring-warn-500/30">
                  <AlertTriangle className="size-4 shrink-0" /> {m}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="panel p-6">
            <h2 className="mb-1 text-xs font-bold tracking-widest text-ink-300 uppercase">Live screen link</h2>
            <p className="mb-3 text-sm text-ink-300">Open this on the projector / LED wall (and share it with spectators). It is read-only.</p>
            <div className="flex gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-ink-950 px-3 py-2 text-xs text-volt-400 ring-1 ring-ink-600" data-testid="display-url">
                {displayUrl}
              </code>
              <Button
                size="icon"
                aria-label="Copy link"
                onClick={() =>
                  navigator.clipboard.writeText(displayUrl).then(
                    () => toast.success("Link copied"),
                    () => toast.error("Copy failed"),
                  )
                }
              >
                <ClipboardCopy className="size-4" />
              </Button>
              <a href={`/display/${a.slug}`} target="_blank" rel="noreferrer">
                <Button size="icon" aria-label="Open display">
                  <ExternalLink className="size-4" />
                </Button>
              </a>
            </div>
            <p className="mt-3 text-xs text-ink-400">
              Tip: on another computer use this computer&apos;s network address instead of localhost (shown in the server console).
            </p>
          </div>
          <div className="panel p-6 text-sm text-ink-300">
            <h2 className="mb-3 text-xs font-bold tracking-widest text-ink-300 uppercase">How the money rule works</h2>
            <p>
              Each team must finish with at least <b className="text-white">{a.minSquad}</b> candidates. A team&apos;s <b className="text-gold-300">max bid</b>{" "}
              keeps {money(a.basePrice)} (the base price) aside for every other candidate it still has to buy: purse {money(a.purse)} − {money(a.basePrice)} ×{" "}
              {Math.max(0, a.minSquad - 1)} = <b className="text-gold-300">{money(maxBid({ purse: a.purse, spent: 0, squadCount: 0 }, a))}</b> for an empty
              team. Teams below the minimum when the auction ends are disqualified.
            </p>
          </div>
          <div className="panel p-6 text-sm text-ink-300">
            <h2 className="mb-3 text-xs font-bold tracking-widest text-ink-300 uppercase">How the winner is decided</h2>
            <p>
              The team whose purchased profiles have the highest <b className="text-gold-300">combined actual annual salary</b> (from the original offer
              letters, USD, excluding bonuses) wins. The number of profiles does not matter and auction credits are never deducted. Tie → more credits remaining
              wins; still tied → joint winners. Salaries, original names and offer letters stay hidden from the audience until the{" "}
              <b className="text-white">Final Reveal</b> in the live console.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
