"use client";

import {
  Ban,
  Gavel,
  Hand,
  ListRestart,
  Megaphone,
  Minus,
  MonitorPlay,
  Pause,
  Play,
  Plus,
  Rocket,
  Search,
  SkipForward,
  Square,
  Timer,
  Undo2,
  UserRoundX,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuction } from "@/components/admin/auction-context";
import { CustomBidDialog } from "@/components/admin/custom-bid-dialog";
import { Description } from "@/components/description";
import { PlayerPhoto, TeamLogo } from "@/components/media";
import { Button } from "@/components/ui/button";
import { Dialog, useConfirm } from "@/components/ui/dialog";
import { Input } from "@/components/ui/form";
import { AuctionStatusBadge, Badge, Kbd, PlayerStatusBadge, Spinner } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { sendCommand, useCountdown, type CommandInput } from "@/lib/live";
import { formatMoney, multipleOfBase } from "@/shared/money";
import { suggestedNextBid } from "@/shared/rules";
import type { LiveSnapshot, PlayerView, TeamView } from "@/shared/types";

export default function LiveConsolePage() {
  const { id, snapshot, accept, clockOffset } = useAuction();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [stakeState, setStakeState] = useState<{ key: string; amount: number } | null>(null);
  const [announce, setAnnounce] = useState("");

  const run = useCallback(
    async (cmd: CommandInput, label: string = cmd.type): Promise<boolean> => {
      setBusy(label);
      try {
        const r = await sendCommand(id, cmd);
        accept(r.snapshot);
        return true;
      } catch (e) {
        toast.error(errorMessage(e));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [id, accept],
  );

  const s = snapshot!;
  const a = s.auction;
  const lot = s.lot;
  const sym = a.currencySymbol;
  const money = (k: number | null | undefined) => formatMoney(k ?? null, sym);
  const hasBids = lot?.currentBid != null;
  const suggested = lot ? suggestedNextBid(hasBids, lot.currentBid, lot.basePrice, a) : 0;

  // The staged amount follows the suggestion until the organizer changes it; it resets on every new bid/lot.
  const stakeKey = `${lot?.id}:${lot?.currentBid}`;
  const staged = stakeState?.key === stakeKey ? stakeState.amount : suggested;
  const setStake = (amount: number) => setStakeState({ key: stakeKey, amount });

  const live = a.status === "LIVE";
  const paused = a.status === "PAUSED";
  const running = live || paused;

  const bidFor = useCallback((t: TeamView, amount: number) => run({ type: "BID", teamId: t.id, amount }, `bid:${t.id}`), [run]);

  const endAuction = async () => {
    const below = s.teams.filter((t) => t.squadCount < a.minSquad);
    const ok = await confirm({
      title: "End the auction?",
      tone: "danger",
      confirmLabel: "End auction",
      body: (
        <div className="space-y-2">
          <p>Final squads are published on the display and no more bids are possible.</p>
          {below.length > 0 ? (
            <p className="rounded-lg bg-loss-500/10 p-3 text-loss-400 ring-1 ring-loss-500/30">
              {below.map((t) => t.name).join(", ")} {below.length === 1 ? "has" : "have"} fewer than {a.minSquad} candidates and will be <b>disqualified</b>.
            </p>
          ) : (
            <p className="text-win-400">Every team has reached the minimum of {a.minSquad}.</p>
          )}
          {s.stats.pool > 0 && <p className="text-amber-300">{s.stats.pool} candidate(s) are still in the pool.</p>}
        </div>
      ),
    });
    if (ok) run({ type: "END_AUCTION" });
  };

  const unsold = async () => {
    if (
      hasBids &&
      !(await confirm({
        title: "Mark unsold?",
        tone: "danger",
        confirmLabel: "Mark unsold",
        body: `There are bids on ${lot!.player.name}. Marking unsold discards them (they stay in the bid history).`,
      }))
    )
      return;
    run({ type: "UNSOLD" });
  };
  const disqualify = async () => {
    if (
      await confirm({
        title: `Disqualify ${lot!.player.name}?`,
        tone: "danger",
        confirmLabel: "Disqualify",
        body: "The candidate leaves the auction. You can reinstate them later from the Candidates page.",
      })
    )
      run({ type: "DISQUALIFY_PLAYER" });
  };

  // Keyboard shortcuts for a fast auctioneer.
  const keyState = useRef({ s, staged, busy, customOpen, pickOpen, setStake });
  useEffect(() => {
    keyState.current = { s, staged, busy, customOpen, pickOpen, setStake };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { s, staged, busy, customOpen, pickOpen, setStake } = keyState.current;
      const tag = (e.target as HTMLElement)?.tagName;
      if (customOpen || pickOpen || busy || e.metaKey || e.ctrlKey || e.altKey || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (document.querySelector("[role=dialog]")) return;
      const k = e.key.toLowerCase();
      const lot = s.lot;
      if (k === "n" && !lot && s.auction.status === "LIVE") run({ type: "NEXT_PLAYER" });
      else if (k === "s" && lot?.currentBid != null) run({ type: "SOLD" });
      else if (k === "z" && lot?.currentBid != null) run({ type: "UNDO_BID" });
      else if (k === "c" && lot) setCustomOpen(true);
      else if (k === "p" && s.auction.status === "LIVE") run({ type: "PAUSE" });
      else if (k === "r" && s.auction.status === "PAUSED") run({ type: "RESUME" });
      else if ((k === "+" || k === "=") && lot) setStake(staged + s.auction.bidIncrement);
      else if (k === "-" && lot) setStake(Math.max(staged - s.auction.bidIncrement, lot.currentBid != null ? lot.currentBid + 1 : lot.basePrice));
      else if (/^[1-9]$/.test(k) && lot) {
        const t = s.teams[Number(k) - 1];
        if (t) bidFor(t, staged);
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run, bidFor]);

  const countdown = useCountdown(lot?.timer, clockOffset);

  if (!snapshot) return <Spinner className="py-20" />;

  return (
    <div className="space-y-5" data-testid="live-console">
      {/* ---------------------------------------------------------------- status bar */}
      <div className="panel flex flex-wrap items-center gap-3 p-3">
        <AuctionStatusBadge status={a.status} />
        <Chip label="Round" value={a.round} />
        <Chip label="Pool" value={s.stats.pool} />
        <Chip label="Sold" value={s.stats.sold} tone="text-win-400" />
        <Chip label="Unsold" value={s.stats.unsold} tone="text-amber-300" />
        <Chip label="Spent" value={money(s.stats.totalSpent)} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <a href={`/display/${a.slug}`} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm">
              <MonitorPlay className="size-4" /> Live screen
            </Button>
          </a>
          {a.status === "LOCKED" && (
            <Button variant="success" size="sm" loading={busy === "GO_LIVE"} onClick={() => run({ type: "GO_LIVE" })} data-testid="go-live">
              <Rocket className="size-4" /> Go live
            </Button>
          )}
          {live && (
            <Button size="sm" onClick={() => run({ type: "PAUSE" })} loading={busy === "PAUSE"}>
              <Pause className="size-4" /> Pause <Kbd>P</Kbd>
            </Button>
          )}
          {paused && (
            <Button variant="success" size="sm" onClick={() => run({ type: "RESUME" })} loading={busy === "RESUME"} data-testid="resume">
              <Play className="size-4" /> Resume <Kbd>R</Kbd>
            </Button>
          )}
          {running && (
            <Button
              variant="danger"
              size="sm"
              onClick={endAuction}
              disabled={!!lot}
              title={lot ? "Close the current candidate first" : undefined}
              data-testid="end-auction"
            >
              <Square className="size-4" /> End auction
            </Button>
          )}
        </div>
      </div>

      {a.status === "DRAFT" && (
        <Notice>
          The configuration is not locked yet. Finish the setup and lock it on the{" "}
          <Link className="font-semibold text-gold-300 underline" href={`/admin/auctions/${id}`}>
            Overview
          </Link>{" "}
          page, then go live here.
        </Notice>
      )}
      {a.status === "LOCKED" && (
        <Notice>
          Everything is locked and ready. Open the live screen on the projector, then press <b>Go live</b>.
        </Notice>
      )}
      {a.status === "COMPLETED" && (
        <Notice tone="green">
          The auction is complete. See the final squads on{" "}
          <Link className="font-semibold underline" href={`/admin/auctions/${id}/results`}>
            Results
          </Link>{" "}
          — the display shows the final board.
        </Notice>
      )}
      {paused && <Notice tone="amber">Paused — bidding is blocked and the countdown is frozen until you resume.</Notice>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          {/* ------------------------------------------------------------ the block */}
          {lot ? (
            <div className="panel overflow-hidden" data-testid="lot-panel">
              <div className="grid gap-5 p-5 md:grid-cols-[170px_minmax(0,1fr)]">
                <div className="relative">
                  <PlayerPhoto name={lot.player.name} url={lot.player.photoUrl} className="aspect-[3/4] w-full" />
                  <span className="absolute top-2 left-2 rounded-lg bg-ink-950/80 px-2 py-0.5 font-display text-sm font-semibold text-white">
                    #{lot.player.number}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="blue">{lot.player.role}</Badge>
                    <Badge>Base {money(lot.basePrice)}</Badge>
                    <Badge>
                      Lot {lot.sequence} · Round {lot.round}
                    </Badge>
                    {countdown && <TimerBadge remainingMs={countdown.remainingMs} timeUp={countdown.timeUp} running={countdown.running} />}
                  </div>
                  <h2 className="mt-2 font-display text-3xl leading-tight font-semibold tracking-wide text-white uppercase" data-testid="lot-player-name">
                    {lot.player.name}
                  </h2>
                  <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
                    <div>
                      <div className="text-[11px] font-bold tracking-widest text-ink-400 uppercase">Current bid</div>
                      <div className="font-display text-5xl font-bold text-gold tabular-nums" data-testid="current-bid">
                        {hasBids ? money(lot.currentBid) : "—"}
                      </div>
                      {hasBids && <div className="text-xs text-ink-300">{multipleOfBase(lot.currentBid!, lot.basePrice)} base</div>}
                    </div>
                    <div className="pb-1">
                      <div className="text-[11px] font-bold tracking-widest text-ink-400 uppercase">Leading</div>
                      {lot.leadingTeamId ? (
                        <TeamChip team={s.teams.find((t) => t.id === lot.leadingTeamId)!} />
                      ) : (
                        <div className="text-sm text-ink-300">Awaiting the opening bid ({money(lot.basePrice)})</div>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 max-h-56 overflow-y-auto rounded-xl bg-ink-900/70 p-3 text-sm text-ink-100 ring-1 ring-ink-600/60">
                    <Description text={lot.player.description} />
                  </div>
                </div>
              </div>

              {/* bid controls */}
              <div className="border-t border-ink-600/60 bg-ink-900/40 p-5">
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <span className="text-xs font-bold tracking-widest text-ink-300 uppercase">Next bid</span>
                  <div className="flex items-center rounded-xl bg-ink-850 ring-1 ring-ink-600">
                    <button
                      type="button"
                      aria-label="Lower the next bid"
                      className="p-2.5 text-ink-200 hover:text-white disabled:opacity-40"
                      disabled={staged - a.bidIncrement < (hasBids ? lot.currentBid! + 1 : lot.basePrice)}
                      onClick={() => setStake(staged - a.bidIncrement)}
                    >
                      <Minus className="size-4" />
                    </button>
                    <span className="min-w-24 text-center font-display text-2xl font-semibold text-white tabular-nums" data-testid="staged-bid">
                      {money(staged)}
                    </span>
                    <button
                      type="button"
                      aria-label="Raise the next bid"
                      className="p-2.5 text-ink-200 hover:text-white"
                      onClick={() => setStake(staged + a.bidIncrement)}
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                  <span className="text-xs text-ink-400">step {money(a.bidIncrement)}</span>
                  <Button size="sm" variant="outline" className="ml-auto" onClick={() => setCustomOpen(true)} disabled={!running} data-testid="open-custom-bid">
                    <Hand className="size-4" /> Custom amount <Kbd>C</Kbd>
                  </Button>
                </div>
                <div className="mb-2 text-xs font-semibold tracking-wide text-ink-300 uppercase">Tap the team that bid</div>
                <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
                  {s.teams.map((t, i) => {
                    const leading = lot.leadingTeamId === t.id;
                    const full = t.squadCount >= a.maxSquad;
                    const cant = staged > t.maxBid;
                    const disabled = !live || leading || full || cant || busy !== null;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => bidFor(t, staged)}
                        data-testid={`bid-${t.shortName}`}
                        className={cn(
                          "group flex items-center gap-3 rounded-xl p-3 text-left ring-1 transition",
                          leading ? "bg-gold-500/10 ring-gold-500/60" : "bg-ink-800 ring-ink-600",
                          !disabled && "hover:-translate-y-0.5 hover:bg-ink-700 hover:ring-gold-500/70",
                          disabled && !leading && "opacity-55",
                        )}
                        style={leading ? ({ "--glow": t.color } as React.CSSProperties) : undefined}
                      >
                        <TeamLogo team={t} className="size-11" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-white">{t.name}</span>
                            {i < 9 && <Kbd>{i + 1}</Kbd>}
                          </span>
                          <span className="block text-xs text-ink-300">
                            Purse {money(t.remaining)} · <b className={cn(cant ? "text-loss-400" : "text-gold-300")}>Max {money(t.maxBid)}</b> · {t.squadCount}/
                            {a.maxSquad}
                          </span>
                        </span>
                        <span className="text-[10px] font-bold tracking-wider uppercase">
                          {busy === `bid:${t.id}` ? (
                            "…"
                          ) : leading ? (
                            <span className="text-gold-300">Leading</span>
                          ) : full ? (
                            "Full"
                          ) : cant ? (
                            <span className="text-loss-400">Too high</span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* outcome */}
              <div className="flex flex-wrap gap-2 border-t border-ink-600/60 p-5">
                <Button
                  variant="success"
                  size="xl"
                  className="min-w-48 flex-1"
                  disabled={!hasBids || busy !== null}
                  loading={busy === "SOLD"}
                  onClick={() => run({ type: "SOLD" })}
                  data-testid="sold"
                >
                  <Gavel className="size-5" /> Sold {hasBids && `· ${money(lot.currentBid)}`} <Kbd>S</Kbd>
                </Button>
                <Button size="xl" className="text-amber-300" disabled={busy !== null} onClick={unsold} data-testid="unsold">
                  <X className="size-5" /> Unsold
                </Button>
                <Button
                  size="xl"
                  disabled={!hasBids || busy !== null}
                  loading={busy === "UNDO_BID"}
                  onClick={() => run({ type: "UNDO_BID" })}
                  data-testid="undo"
                >
                  <Undo2 className="size-5" /> Undo bid <Kbd>Z</Kbd>
                </Button>
                <div className="flex gap-2">
                  <Button variant="ghost" disabled={busy !== null} onClick={() => run({ type: "SKIP" })} title="Back to the pool without a result">
                    <SkipForward className="size-4" /> Skip
                  </Button>
                  <Button variant="ghost" className="text-loss-400" disabled={busy !== null} onClick={disqualify}>
                    <UserRoundX className="size-4" /> Disqualify
                  </Button>
                  {a.timerEnabled && live && (
                    <Button variant="ghost" onClick={() => run({ type: "RESTART_TIMER" })}>
                      <Timer className="size-4" /> Restart timer
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <IdleBlock
              snapshot={s}
              running={running}
              busy={busy}
              onNext={() => run({ type: "NEXT_PLAYER" })}
              onPick={() => setPickOpen(true)}
              onNextRound={() => run({ type: "NEXT_ROUND" })}
            />
          )}
        </div>

        {/* ----------------------------------------------------------------- side */}
        <div className="space-y-5">
          <div className="panel p-4">
            <h3 className="mb-3 text-xs font-bold tracking-widest text-ink-300 uppercase">Bid history {lot && `· ${lot.player.name}`}</h3>
            {lot && lot.bids.length ? (
              <ol className="space-y-1.5" data-testid="bid-history">
                {lot.bids.map((b, i) => {
                  const t = s.teams.find((x) => x.id === b.teamId);
                  return (
                    <li
                      key={b.id}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm",
                        i === 0 ? "bg-gold-500/10 ring-1 ring-gold-500/30" : "bg-ink-850",
                      )}
                    >
                      {t && <TeamLogo team={t} className="size-6 rounded-md" />}
                      <span className="flex-1 truncate text-ink-100">{t?.name ?? "?"}</span>
                      <span className="font-display font-semibold text-white tabular-nums">{money(b.amount)}</span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="text-sm text-ink-400">{lot ? "No bids yet." : "Bids for the candidate on the block appear here."}</p>
            )}
          </div>

          <div className="panel p-4">
            <h3 className="mb-3 text-xs font-bold tracking-widest text-ink-300 uppercase">Teams</h3>
            <ul className="space-y-1.5">
              {s.teams.map((t) => (
                <li key={t.id} className="flex items-center gap-2.5 text-sm">
                  <TeamLogo team={t} className="size-7 rounded-lg" />
                  <span className="min-w-0 flex-1 truncate text-ink-100">{t.name}</span>
                  <span className={cn("tabular-nums", t.squadCount < a.minSquad ? "text-amber-300" : "text-win-400")} title={`minimum ${a.minSquad}`}>
                    {t.squadCount}/{a.maxSquad}
                  </span>
                  <span className="w-16 text-right text-ink-300 tabular-nums">{money(t.remaining)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-ink-400">Amber squad count = still below the minimum of {a.minSquad} (disqualified if the auction ends now).</p>
          </div>

          <div className="panel p-4">
            <h3 className="mb-2 flex items-center gap-2 text-xs font-bold tracking-widest text-ink-300 uppercase">
              <Megaphone className="size-4" /> Announcement on the screen
            </h3>
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await run({ type: "ANNOUNCE", text: announce })) setAnnounce("");
              }}
            >
              <Input
                value={announce}
                onChange={(e) => setAnnounce(e.target.value)}
                maxLength={160}
                placeholder="e.g. 5-minute break"
                disabled={a.status === "DRAFT" || a.status === "COMPLETED"}
              />
              <Button type="submit" disabled={!announce.trim()}>
                Send
              </Button>
            </form>
            {s.announcement && (
              <div className="mt-2 flex items-center gap-2 text-xs text-ink-300">
                <span className="truncate">Showing: “{s.announcement.text}”</span>
                <button type="button" className="ml-auto text-loss-400 hover:underline" onClick={() => run({ type: "ANNOUNCE", text: "" })}>
                  Clear
                </button>
              </div>
            )}
          </div>

          <div className="panel p-4 text-xs text-ink-300">
            <h3 className="mb-2 font-bold tracking-widest uppercase">Shortcuts</h3>
            <div className="grid grid-cols-2 gap-1.5">
              <span>
                <Kbd>N</Kbd> next candidate
              </span>
              <span>
                <Kbd>1</Kbd>–<Kbd>9</Kbd> team bids
              </span>
              <span>
                <Kbd>+</Kbd>/<Kbd>-</Kbd> next bid
              </span>
              <span>
                <Kbd>C</Kbd> custom amount
              </span>
              <span>
                <Kbd>S</Kbd> sold
              </span>
              <span>
                <Kbd>Z</Kbd> undo bid
              </span>
              <span>
                <Kbd>P</Kbd>/<Kbd>R</Kbd> pause / resume
              </span>
            </div>
          </div>
        </div>
      </div>

      {lot && customOpen && (
        <CustomBidDialog
          open={customOpen}
          onOpenChange={setCustomOpen}
          snapshot={s}
          onBid={(teamId, amount) => run({ type: "BID", teamId, amount }, `bid:${teamId}`)}
        />
      )}
      <PickPlayerDialog
        open={pickOpen}
        onOpenChange={setPickOpen}
        auctionId={id}
        version={s.version}
        onPick={async (p) => (await run({ type: "PICK_PLAYER", playerId: p.id })) && setPickOpen(false)}
      />
    </div>
  );
}

function Chip({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <span className="rounded-lg bg-ink-850 px-2.5 py-1 text-xs ring-1 ring-ink-600">
      <span className="text-ink-400">{label} </span>
      <b className={cn("text-white tabular-nums", tone)}>{value}</b>
    </span>
  );
}

function Notice({ children, tone = "blue" }: { children: React.ReactNode; tone?: "blue" | "amber" | "green" }) {
  const c = {
    blue: "bg-volt-500/10 text-volt-400 ring-volt-500/30",
    amber: "bg-warn-500/10 text-amber-300 ring-warn-500/30",
    green: "bg-win-500/10 text-win-400 ring-win-500/30",
  }[tone];
  return <div className={cn("rounded-xl px-4 py-3 text-sm ring-1", c)}>{children}</div>;
}

function TeamChip({ team }: { team: TeamView }) {
  return (
    <span
      className="mt-1 inline-flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm font-semibold text-white ring-1"
      style={{ background: `color-mix(in oklab, ${team.color} 22%, transparent)`, borderColor: team.color }}
      data-testid="leading-team"
    >
      <TeamLogo team={team} className="size-7 rounded-full" />
      {team.name}
    </span>
  );
}

function TimerBadge({ remainingMs, timeUp, running }: { remainingMs: number; timeUp: boolean; running: boolean }) {
  const secs = Math.ceil(remainingMs / 1000);
  return (
    <Badge tone={timeUp ? "red" : secs <= 5 ? "amber" : "neutral"}>
      <Timer className="size-3" /> {timeUp ? "Time up — your call" : `${secs}s${running ? "" : " (paused)"}`}
    </Badge>
  );
}

function IdleBlock({
  snapshot: s,
  running,
  busy,
  onNext,
  onPick,
  onNextRound,
}: {
  snapshot: LiveSnapshot;
  running: boolean;
  busy: string | null;
  onNext: () => void;
  onPick: () => void;
  onNextRound: () => void;
}) {
  const sym = s.auction.currencySymbol;
  const last = s.lastResult;
  const lastTeam = last?.teamId ? s.teams.find((t) => t.id === last.teamId) : null;
  const poolEmpty = s.stats.pool === 0;
  return (
    <div className="panel p-6" data-testid="idle-block">
      {last && (
        <div
          className={cn(
            "mb-5 flex items-center gap-4 rounded-xl p-4 ring-1",
            last.result === "SOLD" ? "bg-win-500/10 ring-win-500/30" : "bg-warn-500/10 ring-warn-500/30",
          )}
          data-testid="last-result"
        >
          <PlayerPhoto name={last.player.name} url={last.player.photoUrl} className="size-14" rounded="rounded-xl" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold tracking-widest text-ink-300 uppercase">Last result</div>
            <div className="truncate font-semibold text-white">
              {last.player.name} —{" "}
              {last.result === "SOLD" ? (
                <>
                  sold to {lastTeam?.name} for {formatMoney(last.amount, sym)}
                </>
              ) : (
                "unsold"
              )}
            </div>
          </div>
          {last.result === "SOLD" ? <Gavel className="size-6 text-win-400" /> : <Ban className="size-6 text-amber-300" />}
        </div>
      )}
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <h2 className="font-display text-2xl tracking-wide text-white uppercase">
          {poolEmpty ? (s.stats.unsold ? `Round ${s.auction.round} finished` : "Every candidate has been auctioned") : "No candidate on the block"}
        </h2>
        <p className="max-w-lg text-sm text-ink-300">
          {!running
            ? "Bidding opens after Go live."
            : poolEmpty
              ? s.stats.unsold
                ? `${s.stats.unsold} unsold candidate(s) can be re-auctioned in round ${s.auction.round + 1}, or end the auction.`
                : "End the auction to publish the final squads."
              : `${s.stats.pool} candidate(s) waiting in the pool. Bring up the next one (random order is set in Settings) or pick a specific candidate.`}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {!poolEmpty && (
            <Button
              variant="primary"
              size="xl"
              onClick={onNext}
              disabled={s.auction.status !== "LIVE" || busy !== null}
              loading={busy === "NEXT_PLAYER"}
              data-testid="next-player"
            >
              <SkipForward className="size-5" /> Next candidate <Kbd>N</Kbd>
            </Button>
          )}
          <Button size="xl" onClick={onPick} disabled={s.auction.status !== "LIVE" || busy !== null} data-testid="pick-player">
            <Search className="size-5" /> Pick candidate
          </Button>
          {poolEmpty && s.stats.unsold > 0 && (
            <Button variant="volt" size="xl" onClick={onNextRound} disabled={!running || busy !== null} data-testid="next-round">
              <ListRestart className="size-5" /> Start round {s.auction.round + 1}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function PickPlayerDialog({
  open,
  onOpenChange,
  auctionId,
  version,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  auctionId: string;
  version: number;
  onPick: (p: PlayerView) => void;
}) {
  const [players, setPlayers] = useState<PlayerView[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!open) return;
    api
      .get<{ players: PlayerView[] }>(`/auctions/${auctionId}/players`)
      .then((r) => setPlayers(r.players))
      .catch(() => setPlayers([]));
  }, [open, auctionId, version]);
  const list = useMemo(
    () =>
      (players ?? []).filter(
        (p) => (p.status === "POOL" || p.status === "UNSOLD") && (p.name.toLowerCase().includes(q.toLowerCase()) || String(p.number) === q.trim()),
      ),
    [players, q],
  );
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Pick a candidate"
      description="Candidates in the pool and unsold candidates can be brought to the block."
      size="md"
    >
      <Input autoFocus placeholder="Search by name or number…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-3" />
      {!players ? (
        <Spinner />
      ) : list.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-400">No available candidates match.</p>
      ) : (
        <ul className="space-y-1.5">
          {list.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onPick(p)}
                className="flex w-full items-center gap-3 rounded-xl bg-ink-850 p-2.5 text-left ring-1 ring-ink-600 hover:bg-ink-700 hover:ring-gold-500/60"
              >
                <PlayerPhoto name={p.name} url={p.photoUrl} className="size-11" rounded="rounded-lg" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-white">
                    #{p.number} {p.name}
                  </span>
                  <span className="block truncate text-xs text-ink-300">{p.description.split("\n")[0]}</span>
                </span>
                <Badge tone="blue">{p.role}</Badge>
                <PlayerStatusBadge status={p.status} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
