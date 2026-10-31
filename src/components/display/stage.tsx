"use client";

import confetti from "canvas-confetti";
import { gsap } from "gsap";
import { Expand, Gavel, Megaphone, Radio, Timer, Trophy, Volume2, VolumeX, WifiOff } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AutoFitDescription } from "@/components/description";
import { PlayerPhoto, TeamLogo } from "@/components/media";
import { cn } from "@/lib/cn";
import { useCountdown, type ConnState } from "@/lib/live";
import { formatMoney, formatUsd, multipleOfBase } from "@/shared/money";
import { orderTeamsForDisplay } from "@/shared/rules";
import type { LiveSnapshot, TeamView } from "@/shared/types";
import { FinalLeaderboard, RevealComingUp, RevealStage } from "./reveal";

const vw = (min: number, v: number, max: number) => `clamp(${min}rem, ${v}vw, ${max}rem)`;

export function DisplayStage({ snapshot: s, conn, clockOffset }: { snapshot: LiveSnapshot; conn: ConnState; clockOffset: number }) {
  const a = s.auction;
  const money = (k: number | null | undefined) => formatMoney(k ?? null, a.currencySymbol);
  const teamById = useMemo(() => new Map(s.teams.map((t) => [t.id, t])), [s.teams]);
  const [sound, setSound] = useState(false);
  const live = a.status === "LIVE" || a.status === "PAUSED";

  return (
    <div className="stage-bg fixed inset-0 flex flex-col overflow-hidden text-white select-none" data-testid="display" data-status={a.status}>
      <div className="grid-lines pointer-events-none absolute inset-0 opacity-60" />
      <Header s={s} sound={sound} setSound={setSound} />

      <main className="relative flex min-h-0 flex-1 flex-col gap-[1.2vw] px-[2vw] pb-[1vw] lg:grid lg:grid-cols-[1.5fr_1fr]">
        {a.status === "DRAFT" || a.status === "LOCKED" ? (
          <PreLive s={s} money={money} />
        ) : a.status === "COMPLETED" ? (
          s.reveal.status === "IN_PROGRESS" ? (
            <RevealStage s={s} money={money} teamById={teamById} />
          ) : s.reveal.status === "COMPLETE" ? (
            <FinalLeaderboard s={s} money={money} teamById={teamById} />
          ) : (
            <FinalBoard s={s} money={money} />
          )
        ) : (
          <>
            <AnimatePresence mode="wait">
              {s.lot ? (
                <PlayerStage key={s.lot.id} s={s} money={money} teamById={teamById} clockOffset={clockOffset} />
              ) : (
                <Waiting key="waiting" s={s} money={money} teamById={teamById} />
              )}
            </AnimatePresence>
            <TeamBoard s={s} money={money} />
          </>
        )}
        {a.status === "PAUSED" && (
          <div
            className="pointer-events-none absolute inset-x-[2vw] top-[38%] z-20 rounded-2xl bg-ink-950/85 py-[1.6vw] text-center ring-1 ring-warn-500/50 backdrop-blur"
            data-testid="paused-banner"
          >
            <span className="font-display tracking-[0.3em] text-amber-300 uppercase" style={{ fontSize: vw(1.6, 3.4, 5) }}>
              Auction paused
            </span>
          </div>
        )}
      </main>

      <Ticker s={s} money={money} teamById={teamById} />
      {live && <ResultOverlay s={s} money={money} teamById={teamById} sound={sound} />}
      {conn !== "live" && (
        <div
          className="absolute top-[1vw] left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-loss-500/90 px-4 py-1.5 text-sm font-semibold"
          role="status"
        >
          <WifiOff className="size-4" /> Reconnecting…
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------ header
function Header({ s, sound, setSound }: { s: LiveSnapshot; sound: boolean; setSound: (v: boolean) => void }) {
  const a = s.auction;
  const badge =
    a.status === "LIVE"
      ? { text: "On air", cls: "bg-loss-500/20 text-loss-400 ring-loss-500/50", dot: true }
      : a.status === "PAUSED"
        ? { text: "Paused", cls: "bg-warn-500/15 text-amber-300 ring-warn-500/50", dot: false }
        : a.status === "COMPLETED"
          ? s.reveal.status === "IN_PROGRESS"
            ? { text: "Final reveal", cls: "bg-gold-500/15 text-gold-300 ring-gold-500/50", dot: true }
            : s.reveal.status === "COMPLETE"
              ? { text: "Final results", cls: "bg-win-500/15 text-win-400 ring-win-500/50", dot: false }
              : { text: "Bidding closed", cls: "bg-win-500/15 text-win-400 ring-win-500/50", dot: false }
          : { text: "Starting soon", cls: "bg-volt-500/15 text-volt-400 ring-volt-500/50", dot: false };
  const full = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => undefined);
  return (
    <header className="relative z-10 flex items-center gap-[1.2vw] px-[2vw] py-[1vw]">
      <span
        className={cn("inline-flex shrink-0 items-center gap-2 rounded-full px-[1vw] py-[0.35vw] font-bold tracking-[0.2em] uppercase ring-1", badge.cls)}
        style={{ fontSize: vw(0.7, 0.85, 1.2) }}
      >
        {badge.dot && <span className="size-[0.6vw] min-h-2 min-w-2 animate-live-dot rounded-full bg-loss-400" />}
        {badge.text}
      </span>
      <h1
        className="line-clamp-2 min-w-0 flex-1 text-center font-display leading-tight font-bold tracking-wide uppercase lg:truncate"
        style={{ fontSize: vw(1.2, 2.6, 4.2) }}
      >
        <span className="text-gold">{a.name}</span>
      </h1>
      <div className="flex shrink-0 items-center gap-[0.6vw]">
        <Counter label="Round" value={a.round} />
        <Counter label="Pool" value={s.stats.pool} />
        <Counter label="Sold" value={s.stats.sold} accent />
        <button
          type="button"
          onClick={() => setSound(!sound)}
          className="rounded-lg p-2 text-ink-300 opacity-60 hover:opacity-100"
          aria-label={sound ? "Mute" : "Enable sound"}
        >
          {sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
        </button>
        <button type="button" onClick={full} className="rounded-lg p-2 text-ink-300 opacity-60 hover:opacity-100" aria-label="Full screen">
          <Expand className="size-5" />
        </button>
      </div>
    </header>
  );
}

function Counter({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-ink-850/80 px-[0.9vw] py-[0.3vw] text-center ring-1 ring-ink-600/70">
      <div className="font-bold tracking-widest text-ink-400 uppercase" style={{ fontSize: vw(0.5, 0.6, 0.9) }}>
        {label}
      </div>
      <div
        className={cn("font-display leading-none font-semibold tabular-nums", accent ? "text-win-400" : "text-white")}
        style={{ fontSize: vw(1, 1.5, 2.4) }}
        data-testid={`counter-${label.toLowerCase()}`}
      >
        {value}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------ player stage
type Money = (k: number | null | undefined) => string;

function PlayerStage({ s, money, teamById, clockOffset }: { s: LiveSnapshot; money: Money; teamById: Map<string, TeamView>; clockOffset: number }) {
  const lot = s.lot!;
  const p = lot.player;
  const leader = lot.leadingTeamId ? teamById.get(lot.leadingTeamId) : null;
  const hasBids = lot.currentBid != null;
  const countdown = useCountdown(lot.timer, clockOffset);
  return (
    <motion.section
      initial={{ opacity: 0, x: -50, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 50 }}
      transition={{ type: "spring", stiffness: 220, damping: 26 }}
      className="panel relative flex min-h-0 flex-col gap-[1vw] overflow-hidden p-[1.3vw]"
      data-testid="display-lot"
    >
      <div className="flex min-h-0 gap-[1.4vw]">
        <div className="relative w-[24%] shrink-0">
          <PlayerPhoto name={p.name} url={p.photoUrl} className="aspect-[3/4] w-full ring-2 ring-white/10" rounded="rounded-[1.1vw]" />
          <span
            className="absolute top-[0.6vw] left-[0.6vw] rounded-lg bg-ink-950/85 px-[0.6vw] py-[0.1vw] font-display font-semibold"
            style={{ fontSize: vw(0.9, 1.4, 2.2) }}
          >
            #{p.number}
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start gap-[1vw]">
            <div className="min-w-0 flex-1">
              <span
                className="inline-flex items-center rounded-full bg-volt-500/15 px-[0.8vw] py-[0.2vw] font-semibold tracking-wide text-volt-400 uppercase ring-1 ring-volt-500/40"
                style={{ fontSize: vw(0.7, 0.95, 1.4) }}
              >
                {p.role}
              </span>
              <h2
                className="mt-[0.5vw] font-display leading-[0.95] font-bold tracking-wide break-words uppercase"
                style={{ fontSize: vw(1.6, 3.6, 6) }}
                data-testid="display-player-name"
              >
                {p.name}
              </h2>
              <div className="mt-[0.4vw] text-ink-300" style={{ fontSize: vw(0.8, 1.05, 1.6) }}>
                Base price <b className="text-white">{money(lot.basePrice)}</b>
              </div>
            </div>
            <BidBox amount={lot.currentBid} base={lot.basePrice} money={money} timeUp={!!countdown?.timeUp} />
          </div>
          <div className="mt-auto pt-[0.8vw]">
            <BiddingBar leader={leader ?? null} hasBids={hasBids} base={money(lot.basePrice)} />
          </div>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col rounded-[1vw] bg-ink-950/55 p-[1vw] ring-1 ring-white/10">
        <div className="mb-[0.4vw] font-bold tracking-[0.25em] text-gold-400 uppercase" style={{ fontSize: vw(0.6, 0.75, 1.1) }}>
          Description
        </div>
        <AutoFitDescription text={p.description} maxPx={46} minPx={12} className="flex-1 text-ink-50" />
      </div>
      {countdown && <TimerRing c={countdown} />}
    </motion.section>
  );
}

function BidBox({ amount, base, money, timeUp }: { amount: number | null; base: number; money: Money; timeUp: boolean }) {
  return (
    <div
      className={cn(
        "shrink-0 rounded-[1vw] px-[1.4vw] py-[0.8vw] text-right ring-1",
        timeUp ? "bg-loss-500/15 ring-loss-500/60" : "bg-ink-950/60 ring-gold-500/40",
      )}
    >
      <div className="font-bold tracking-[0.25em] text-gold-400 uppercase" style={{ fontSize: vw(0.6, 0.8, 1.2) }}>
        {timeUp ? "Time up" : "Current bid"}
      </div>
      {/* Keyed enter-only animation: the previous amount is removed instantly, so two values can never overlap. */}
      <motion.div
        key={amount ?? "none"}
        initial={{ y: 24, opacity: 0, scale: 1.25 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 22 }}
        className="font-display leading-none font-bold text-gold tabular-nums"
        style={{ fontSize: vw(2.2, 5.4, 9) }}
        data-testid="display-current-bid"
      >
        {amount != null ? money(amount) : money(base)}
      </motion.div>
      <div className="mt-[0.3vw] font-semibold text-ink-300" style={{ fontSize: vw(0.7, 0.9, 1.3) }}>
        {amount != null ? `${multipleOfBase(amount, base)} base` : "opening price"}
      </div>
    </div>
  );
}

function BiddingBar({ leader, hasBids, base }: { leader: TeamView | null; hasBids: boolean; base: string }) {
  if (!hasBids || !leader)
    return (
      <div className="rounded-[0.9vw] bg-ink-850/80 px-[1vw] py-[0.7vw] text-ink-300 ring-1 ring-ink-600" style={{ fontSize: vw(0.9, 1.3, 2) }}>
        Awaiting the opening bid at <b className="text-white">{base}</b>
      </div>
    );
  return (
    <motion.div
      key={leader.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-[0.8vw] rounded-[0.9vw] px-[1vw] py-[0.6vw] ring-2"
      style={{
        background: `linear-gradient(90deg, color-mix(in oklab, ${leader.color} 38%, transparent), transparent)`,
        borderColor: leader.color,
        ["--tw-ring-color" as string]: leader.color,
      }}
      data-testid="display-leading-team"
    >
      <TeamLogo team={leader} className="size-[3.2vw] min-h-9 min-w-9" />
      <div className="min-w-0">
        <div className="font-bold tracking-[0.25em] text-ink-200 uppercase" style={{ fontSize: vw(0.55, 0.7, 1) }}>
          Bidding now
        </div>
        <div className="truncate font-display font-semibold tracking-wide uppercase" style={{ fontSize: vw(1, 1.9, 3) }}>
          {leader.name}
        </div>
      </div>
    </motion.div>
  );
}

function TimerRing({ c }: { c: NonNullable<ReturnType<typeof useCountdown>> }) {
  const secs = Math.ceil(c.remainingMs / 1000);
  const r = 26;
  const circ = 2 * Math.PI * r;
  const danger = secs <= 5;
  return (
    <div
      className={cn("absolute top-[1vw] right-[1vw] size-[5vw] min-h-12 min-w-12", c.timeUp && "animate-pulse")}
      aria-label={c.timeUp ? "Time up" : `${secs} seconds left`}
    >
      <svg viewBox="0 0 64 64" className="size-full -rotate-90">
        <circle cx="32" cy="32" r={r} stroke="currentColor" strokeWidth="6" fill="none" className="text-ink-700" />
        <circle
          cx="32"
          cy="32"
          r={r}
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
          stroke={danger ? "#ef4444" : "#f5b83d"}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - c.fraction)}
          style={{ transition: "stroke-dashoffset 0.1s linear" }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-display font-bold tabular-nums" style={{ fontSize: vw(0.9, 1.5, 2.4) }}>
        {c.timeUp ? <Timer className="size-1/2 text-loss-400" /> : secs}
      </span>
    </div>
  );
}

// -------------------------------------------------------------------------- waiting
function Waiting({ s, money, teamById }: { s: LiveSnapshot; money: Money; teamById: Map<string, TeamView> }) {
  const last = s.lastResult;
  const lastTeam = last?.teamId ? teamById.get(last.teamId) : null;
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="panel relative flex min-h-0 flex-col items-center justify-center gap-[1.5vw] overflow-hidden p-[2vw] text-center"
      data-testid="display-waiting"
    >
      <div className="shimmer absolute inset-0 opacity-40" />
      <Radio className="size-[4vw] min-h-10 min-w-10 text-gold-400" />
      <div className="font-display font-semibold tracking-[0.12em] uppercase" style={{ fontSize: vw(1.4, 3, 5) }}>
        {s.stats.pool > 0 ? "Next candidate coming up…" : s.stats.unsold > 0 ? `Round ${s.auction.round} complete` : "All candidates auctioned"}
      </div>
      {last && last.result === "SOLD" && lastTeam && (
        <div className="flex items-center gap-[1vw] rounded-2xl bg-ink-950/60 px-[1.4vw] py-[0.8vw] ring-1 ring-white/10" style={{ fontSize: vw(0.9, 1.3, 2) }}>
          <span className="text-ink-300">Last sold</span>
          <b>{last.player.name}</b>
          <span className="text-ink-300">to</span>
          <TeamLogo team={lastTeam} className="size-[2.4vw] min-h-8 min-w-8" />
          <b>{lastTeam.name}</b>
          <span className="font-display font-bold text-gold">{money(last.amount)}</span>
        </div>
      )}
      <div className="grid grid-cols-4 gap-[0.8vw]">
        {[
          ["Sold", s.stats.sold],
          ["Unsold", s.stats.unsold],
          ["In pool", s.stats.pool],
          ["Total", s.stats.total],
        ].map(([l, v]) => (
          <div key={l} className="rounded-xl bg-ink-950/60 px-[1.2vw] py-[0.6vw] ring-1 ring-white/10">
            <div className="font-bold tracking-widest text-ink-400 uppercase" style={{ fontSize: vw(0.55, 0.7, 1) }}>
              {l}
            </div>
            <div className="font-display font-semibold tabular-nums" style={{ fontSize: vw(1.2, 2.2, 3.5) }}>
              {v}
            </div>
          </div>
        ))}
      </div>
    </motion.section>
  );
}

// ------------------------------------------------------------------------- team board
function TeamBoard({ s, money }: { s: LiveSnapshot; money: Money }) {
  const leading = s.lot?.currentBid != null ? s.lot.leadingTeamId : null;
  const ordered = orderTeamsForDisplay(s.teams, leading);
  const cols = "grid grid-cols-[minmax(0,1fr)_4.4rem_4.2rem_2.4rem] lg:grid-cols-[minmax(0,1fr)_7.5vw_6.5vw_4.5vw] items-center gap-2 lg:gap-[0.6vw]";
  return (
    <section className="panel flex min-h-0 flex-col p-[1vw]" data-testid="display-teams">
      <div
        className={cn(cols, "px-[0.8vw] pb-[0.6vw] font-bold tracking-[0.08em] text-ink-300 uppercase lg:tracking-[0.2em]")}
        style={{ fontSize: vw(0.55, 0.75, 1.1) }}
      >
        <span>Team</span>
        <span className="text-right">Max bid</span>
        <span className="text-right">Purse</span>
        <span className="text-right">Squad</span>
      </div>
      <LayoutGroup>
        <div className="flex min-h-0 flex-1 flex-col gap-[0.5vw]">
          {ordered.map((t) => {
            const lead = t.id === leading;
            return (
              <motion.div
                layout
                key={t.id}
                transition={{ type: "spring", stiffness: 380, damping: 34 }}
                className={cn(
                  cols,
                  "relative max-h-[9vw] min-h-0 flex-1 rounded-[0.9vw] px-[0.8vw] ring-1",
                  lead ? "animate-glow" : "bg-ink-850/70 ring-ink-600/60",
                )}
                style={
                  lead
                    ? ({
                        "--glow": t.color,
                        background: `linear-gradient(90deg, color-mix(in oklab, ${t.color} 32%, transparent), color-mix(in oklab, ${t.color} 8%, transparent))`,
                        borderColor: t.color,
                        ["--tw-ring-color" as string]: t.color,
                      } as React.CSSProperties)
                    : undefined
                }
                data-testid={`display-team-${t.shortName}`}
                data-leading={lead || undefined}
              >
                <div className="flex min-w-0 items-center gap-[0.7vw]">
                  <TeamLogo team={t} className="size-[3vw] min-h-8 min-w-8" />
                  <div className="min-w-0">
                    <div
                      className="line-clamp-2 font-display leading-[1.05] font-semibold tracking-wide break-words uppercase"
                      style={{ fontSize: vw(0.85, 1.3, 2.1) }}
                    >
                      {t.name}
                    </div>
                    {t.members.length > 0 && (
                      <div className="truncate text-ink-300" style={{ fontSize: vw(0.6, 0.75, 1.1) }}>
                        {t.members.join(" & ")}
                      </div>
                    )}
                  </div>
                  {lead && (
                    <span
                      className="ml-auto rounded-md bg-gold-500 px-[0.4vw] py-[0.1vw] font-bold tracking-widest text-ink-950 uppercase"
                      style={{ fontSize: vw(0.5, 0.6, 0.9) }}
                    >
                      Bid
                    </span>
                  )}
                </div>
                <span className="text-right font-display font-bold text-gold-300 tabular-nums" style={{ fontSize: vw(0.9, 1.5, 2.4) }}>
                  {money(t.maxBid)}
                </span>
                <span className="text-right font-display font-semibold tabular-nums" style={{ fontSize: vw(0.9, 1.5, 2.4) }}>
                  {money(t.remaining)}
                </span>
                <span className="text-right font-display font-semibold tabular-nums" style={{ fontSize: vw(0.9, 1.5, 2.4) }}>
                  {t.squadCount}
                </span>
              </motion.div>
            );
          })}
        </div>
      </LayoutGroup>
      <div className="pt-[0.6vw] text-center text-ink-400" style={{ fontSize: vw(0.55, 0.7, 1) }}>
        Minimum {s.auction.minSquad} · maximum {s.auction.maxSquad} candidates per team
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------- ticker
function Ticker({ s, money, teamById }: { s: LiveSnapshot; money: Money; teamById: Map<string, TeamView> }) {
  const items = useMemo(() => {
    const out: { tag: string; text: string; hot?: boolean }[] = [];
    if (s.announcement) out.push({ tag: "Announcement", text: s.announcement.text, hot: true });
    if (s.lot) {
      const leader = s.lot.leadingTeamId ? teamById.get(s.lot.leadingTeamId) : null;
      out.push({
        tag: "Live",
        text: leader
          ? `${s.lot.player.name} — current bid ${money(s.lot.currentBid)} by ${leader.name}`
          : `${s.lot.player.name} on the block — base ${money(s.lot.basePrice)}`,
      });
    }
    if (s.lastResult) {
      const t = s.lastResult.teamId ? teamById.get(s.lastResult.teamId) : null;
      out.push({
        tag: s.lastResult.result === "SOLD" ? "Sold" : "Unsold",
        text: s.lastResult.result === "SOLD" && t ? `${s.lastResult.player.name} to ${t.name} for ${money(s.lastResult.amount)}` : s.lastResult.player.name,
      });
    }
    if (s.stats.topSale)
      out.push({
        tag: "Top sale",
        text: `${s.stats.topSale.playerName} — ${money(s.stats.topSale.amount)} to ${teamById.get(s.stats.topSale.teamId)?.name ?? ""}`,
      });
    if (s.stats.topSpender)
      out.push({
        tag: "Top spender",
        text: `${teamById.get(s.stats.topSpender.teamId)?.name ?? ""} — ${money(s.stats.topSpender.spent)} on ${s.stats.topSpender.squadCount} candidate(s)`,
      });
    if (s.auction.status === "COMPLETED") {
      const r = s.reveal;
      if (r.status === "NOT_STARTED")
        out.unshift({ tag: "Up next", text: "Final reveal — real candidates, actual offer letters and annual salaries", hot: true });
      else if (r.status === "IN_PROGRESS") out.unshift({ tag: "Final reveal", text: `Profile ${r.index + 1} of ${r.count}`, hot: true });
      else {
        const w = r.standings.filter((x) => x.winner);
        if (w.length)
          out.unshift({
            tag: w.length > 1 ? "Joint winners" : "Winner",
            text: `${w.map((x) => teamById.get(x.teamId)?.name ?? "").join(" & ")} — ${formatUsd(w[0].total)} combined annual offers`,
            hot: true,
          });
      }
    }
    out.push({ tag: "Overview", text: `Sold ${s.stats.sold} · Unsold ${s.stats.unsold} · In pool ${s.stats.pool} · Total ${s.stats.total}` });
    return out;
  }, [s, money, teamById]);
  const length = items.reduce((n, i) => n + i.text.length + i.tag.length, 0);
  const row = (
    <div className="flex shrink-0 items-center gap-[2.5vw] pr-[2.5vw]">
      {items.map((i, k) => (
        <span key={k} className="flex items-center gap-[0.7vw] whitespace-nowrap">
          <span
            className={cn(
              "rounded-md px-[0.5vw] py-[0.1vw] font-bold tracking-widest uppercase",
              i.hot ? "bg-gold-500 text-ink-950" : "bg-ink-700 text-gold-300",
            )}
            style={{ fontSize: vw(0.55, 0.7, 1) }}
          >
            {i.hot && <Megaphone className="mr-1 inline size-[0.9em]" />}
            {i.tag}
          </span>
          <span className="font-semibold">{i.text}</span>
        </span>
      ))}
    </div>
  );
  return (
    <footer
      className="relative z-10 flex items-center border-t border-ink-600/60 bg-ink-950/80"
      style={{ fontSize: vw(0.75, 1.05, 1.6) }}
      data-testid="display-ticker"
    >
      <span className="z-10 flex shrink-0 items-center gap-2 self-stretch bg-loss-500 px-[1.2vw] py-[0.6vw] font-bold tracking-[0.25em] uppercase">
        <span className="size-2 animate-live-dot rounded-full bg-white" /> Ticker
      </span>
      <div className="min-w-0 flex-1 overflow-hidden py-[0.6vw]">
        <div className="flex w-max animate-ticker" style={{ ["--ticker-duration" as string]: `${Math.max(18, length * 0.22)}s` }}>
          {row}
          {row}
        </div>
      </div>
    </footer>
  );
}

// ------------------------------------------------------------------- sold / unsold
function ResultOverlay({ s, money, teamById, sound }: { s: LiveSnapshot; money: Money; teamById: Map<string, TeamView>; sound: boolean }) {
  const [shown, setShown] = useState<{ kind: "SOLD" | "UNSOLD"; at: number } | null>(null);
  const [seenAt, setSeenAt] = useState(s.event.at);
  const reduce = useReducedMotion();
  const stamp = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);

  // React to each NEW server event exactly once ("adjust state when an input changes").
  const e = s.event;
  if (e.at !== seenAt) {
    setSeenAt(e.at);
    if ((e.type === "SOLD" || e.type === "UNSOLD") && s.serverNow - e.at < 4000) setShown({ kind: e.type, at: e.at });
    else if (e.type === "PLAYER_UP" || e.type === "BID_PLACED") setShown(null);
  }

  useEffect(() => {
    if (!shown) return;
    if (sound) playGavel(shown.kind === "SOLD");
    const h = setTimeout(() => setShown(null), shown.kind === "SOLD" ? 6500 : 3000);
    return () => clearTimeout(h);
  }, [shown, sound]);

  useEffect(() => {
    if (sound && s.event.type === "BID_PLACED") playTick();
  }, [s.event, sound]);

  const team = shown?.kind === "SOLD" && s.lastResult?.teamId ? teamById.get(s.lastResult.teamId) : null;

  useEffect(() => {
    if (!shown || reduce) return;
    const ctx = gsap.context(() => {
      if (stamp.current)
        gsap.fromTo(
          stamp.current,
          { scale: 3, rotate: -24, opacity: 0 },
          { scale: 1, rotate: -9, opacity: 1, duration: 0.5, ease: "back.out(2.4)", delay: 0.15 },
        );
      if (card.current) gsap.fromTo(card.current, { x: 0 }, { x: 10, duration: 0.06, repeat: 5, yoyo: true, delay: 0.62, ease: "none" });
    });
    if (shown.kind === "SOLD") {
      const colors = [team?.color ?? "#f5b83d", "#ffd05a", "#ffffff"];
      confetti({ particleCount: 160, spread: 90, startVelocity: 55, origin: { x: 0.3, y: 0.7 }, colors, disableForReducedMotion: true });
      confetti({ particleCount: 160, spread: 90, startVelocity: 55, origin: { x: 0.7, y: 0.7 }, colors, disableForReducedMotion: true });
    }
    return () => ctx.revert();
  }, [shown, reduce, team?.color]);

  return (
    <AnimatePresence>
      {shown && s.lastResult && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-40 flex items-center justify-center bg-ink-950/80 backdrop-blur-md"
          data-testid={`overlay-${shown.kind.toLowerCase()}`}
        >
          <div
            ref={card}
            className="relative flex w-[min(80vw,1100px)] items-center gap-[2.5vw] rounded-[1.6vw] p-[2.2vw] ring-2"
            style={{
              background: `linear-gradient(135deg, color-mix(in oklab, ${team?.color ?? "#334"} 35%, #070b17), #070b17)`,
              borderColor: team?.color ?? "#555",
              ["--tw-ring-color" as string]: team?.color ?? "#555",
            }}
          >
            <PlayerPhoto
              name={s.lastResult.player.name}
              url={s.lastResult.player.photoUrl}
              className="aspect-[3/4] w-[18vw] shrink-0"
              rounded="rounded-[1.2vw]"
            />
            <div className="min-w-0 flex-1">
              <div className="font-display leading-none font-bold uppercase" style={{ fontSize: vw(1.6, 3.4, 5.5) }}>
                {s.lastResult.player.name}
              </div>
              {shown.kind === "SOLD" && team ? (
                <>
                  <div className="mt-[1.2vw] flex items-center gap-[1vw]">
                    <span className="text-ink-200" style={{ fontSize: vw(0.9, 1.4, 2.2) }}>
                      Acquired by
                    </span>
                    <TeamLogo team={team} className="size-[4vw] min-h-10 min-w-10" />
                    <span className="font-display font-semibold uppercase" style={{ fontSize: vw(1.2, 2.4, 4) }}>
                      {team.name}
                    </span>
                  </div>
                  <div className="mt-[1vw] font-display font-bold text-gold" style={{ fontSize: vw(2.4, 6, 10) }} data-testid="overlay-price">
                    {money(s.lastResult.amount)}
                  </div>
                  <div className="text-ink-300" style={{ fontSize: vw(0.8, 1.1, 1.7) }}>
                    {multipleOfBase(s.lastResult.amount ?? 0, s.lastResult.player.basePrice ?? s.auction.basePrice)} base price
                  </div>
                </>
              ) : (
                <div className="mt-[1vw] text-ink-300" style={{ fontSize: vw(1, 1.6, 2.4) }}>
                  No team bought this candidate in round {s.auction.round}.
                </div>
              )}
            </div>
            <div
              ref={stamp}
              className={cn(
                "absolute right-[2.5vw] bottom-[2vw] flex items-center gap-[0.6vw] rounded-[1vw] border-[0.35vw] px-[1.6vw] py-[0.6vw] font-display font-bold tracking-[0.12em] uppercase",
                shown.kind === "SOLD" ? "border-gold-400 bg-ink-950/90 text-gold-300" : "border-amber-400 bg-ink-950/90 text-amber-300",
              )}
              style={{ fontSize: vw(1.8, 4, 6.5), transform: "rotate(-9deg)" }}
            >
              {shown.kind === "SOLD" ? <Gavel className="size-[0.8em]" /> : null}
              {shown.kind === "SOLD" ? "Sold!" : "Unsold"}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ------------------------------------------------------------------------- pre-live
function PreLive({ s, money }: { s: LiveSnapshot; money: Money }) {
  const a = s.auction;
  return (
    <section className="col-span-full flex min-h-0 flex-1 flex-col items-center justify-center gap-[2vw] text-center" data-testid="display-prelive">
      <Trophy className="size-[5vw] min-h-12 min-w-12 text-gold-400" />
      <div className="font-display font-semibold tracking-[0.18em] text-ink-200 uppercase" style={{ fontSize: vw(1.2, 2.2, 3.6) }}>
        The auction starts soon
      </div>
      <div className="flex flex-wrap justify-center gap-[0.8vw]" style={{ fontSize: vw(0.8, 1.15, 1.8) }}>
        {[`Purse ${money(a.purse)} per team`, `Base price ${money(a.basePrice)}`, `Squad ${a.minSquad}–${a.maxSquad}`, `${s.stats.total} candidates`].map(
          (t) => (
            <span key={t} className="rounded-full bg-ink-850/80 px-[1.2vw] py-[0.4vw] ring-1 ring-ink-600">
              {t}
            </span>
          ),
        )}
      </div>
      <div
        className="grid w-full max-w-[90vw] gap-[1vw]"
        style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(s.teams.length, 1), 6)}, minmax(0, 1fr))` }}
      >
        {s.teams.map((t, i) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="panel flex flex-col items-center gap-[0.6vw] p-[1.2vw]"
            style={{ borderColor: t.color }}
          >
            <TeamLogo team={t} className="size-[6vw] min-h-14 min-w-14" />
            <div className="font-display font-semibold uppercase" style={{ fontSize: vw(0.9, 1.4, 2.2) }}>
              {t.name}
            </div>
            {t.members.length > 0 && (
              <div className="text-ink-300" style={{ fontSize: vw(0.65, 0.85, 1.3) }}>
                {t.members.join(" & ")}
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------- final board
function FinalBoard({ s, money }: { s: LiveSnapshot; money: Money }) {
  const a = s.auction;
  return (
    <section className="col-span-full flex min-h-0 flex-1 flex-col gap-[1vw]" data-testid="display-final">
      <RevealComingUp />
      <div className="text-center font-display font-semibold tracking-[0.2em] text-ink-200 uppercase" style={{ fontSize: vw(1, 1.8, 3) }}>
        Final squads
      </div>
      <div className="grid min-h-0 flex-1 gap-[1vw]" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(s.teams.length, 1), 5)}, minmax(0, 1fr))` }}>
        {s.teams.map((t) => (
          <FinalTeam key={t.id} t={t} s={s} money={money} minSquad={a.minSquad} />
        ))}
      </div>
    </section>
  );
}

function FinalTeam({ t, s, money, minSquad }: { t: TeamView; s: LiveSnapshot; money: Money; minSquad: number }) {
  return (
    <div
      className={cn("panel flex min-h-0 flex-col p-[1vw]", t.disqualified && "opacity-80")}
      style={{ borderColor: t.disqualified ? "#ef4444" : t.color }}
      data-testid={`final-${t.shortName}`}
    >
      <div className="flex items-center gap-[0.7vw]">
        <TeamLogo team={t} className="size-[3.4vw] min-h-10 min-w-10" />
        <div className="min-w-0">
          <div className="truncate font-display font-semibold uppercase" style={{ fontSize: vw(0.9, 1.4, 2.2) }}>
            {t.name}
          </div>
          <div className="truncate text-ink-300" style={{ fontSize: vw(0.6, 0.75, 1.1) }}>
            {t.members.join(" & ")}
          </div>
        </div>
      </div>
      <div
        className={cn(
          "mt-[0.8vw] rounded-lg px-[0.6vw] py-[0.3vw] text-center font-bold tracking-widest uppercase",
          t.disqualified ? "bg-loss-500/20 text-loss-400" : "bg-win-500/15 text-win-400",
        )}
        style={{ fontSize: vw(0.55, 0.7, 1) }}
      >
        {t.disqualified ? `Disqualified · below minimum ${minSquad}` : "Qualified"}
      </div>
      <div className="mt-[0.8vw] grid grid-cols-3 gap-[0.4vw] text-center" style={{ fontSize: vw(0.55, 0.75, 1.1) }}>
        <div>
          <div className="text-ink-400 uppercase">Squad</div>
          <div className="font-display text-[1.6em] font-semibold">{t.squadCount}</div>
        </div>
        <div>
          <div className="text-ink-400 uppercase">Spent</div>
          <div className="font-display text-[1.6em] font-semibold text-gold-300">{money(t.spent)}</div>
        </div>
        <div>
          <div className="text-ink-400 uppercase">Left</div>
          <div className="font-display text-[1.6em] font-semibold">{money(t.remaining)}</div>
        </div>
      </div>
      <SquadList auctionSlug={s.auction.slug} teamId={t.id} money={money} version={s.version} />
    </div>
  );
}

/** Squad names for the final board come from the public results endpoint. */
function SquadList({ auctionSlug, teamId, money, version }: { auctionSlug: string; teamId: string; money: Money; version: number }) {
  const [rows, setRows] = useState<{ name: string; price: number | null }[] | null>(null);
  useEffect(() => {
    fetch(`/api/public/auctions/${auctionSlug}/squads`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { squads: Record<string, { name: string; price: number | null }[]> } | null) => setRows(d?.squads?.[teamId] ?? []))
      .catch(() => setRows([]));
  }, [auctionSlug, teamId, version]);
  if (!rows) return null;
  return (
    <ul className="mt-[0.8vw] min-h-0 flex-1 space-y-[0.3vw] overflow-hidden" style={{ fontSize: vw(0.6, 0.85, 1.3) }}>
      {rows.map((r) => (
        <li key={r.name} className="flex justify-between gap-2 rounded-md bg-ink-950/50 px-[0.5vw] py-[0.2vw]">
          <span className="truncate">{r.name}</span>
          <span className="font-semibold text-gold-300 tabular-nums">{money(r.price)}</span>
        </li>
      ))}
      {rows.length === 0 && <li className="text-ink-400 italic">No candidates</li>}
    </ul>
  );
}

// ----------------------------------------------------------------------------- sound
let audioCtx: AudioContext | null = null;
function ctx() {
  audioCtx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  return audioCtx;
}
/** Synthesised gavel knock (no audio files, nothing to license). */
function playGavel(sold: boolean) {
  try {
    const c = ctx();
    const knocks = sold ? [0, 0.18, 0.36] : [0];
    for (const t of knocks) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(sold ? 180 : 140, c.currentTime + t);
      o.frequency.exponentialRampToValueAtTime(60, c.currentTime + t + 0.12);
      g.gain.setValueAtTime(0.6, c.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + t + 0.16);
      o.connect(g).connect(c.destination);
      o.start(c.currentTime + t);
      o.stop(c.currentTime + t + 0.18);
    }
  } catch {
    /* audio unavailable */
  }
}
function playTick() {
  try {
    const c = ctx();
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.12, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.08);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.09);
  } catch {
    /* audio unavailable */
  }
}
