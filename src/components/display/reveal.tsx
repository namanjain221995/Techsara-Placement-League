"use client";

import confetti from "canvas-confetti";
import { FileText, Lock, Sparkles, Trophy } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { PlayerPhoto, TeamLogo } from "@/components/media";
import { cn } from "@/lib/cn";
import { formatUsd } from "@/shared/money";
import { REVEAL_STEPS, type LiveSnapshot, type OfferLetterRef, type RevealCard, type TeamStanding, type TeamView } from "@/shared/types";

const vw = (min: number, v: number, max: number) => `clamp(${min}rem, ${v}vw, ${max}rem)`;
type Money = (k: number | null | undefined) => string;

/** Animated count-up for salary figures, starting from 0 on first show (instant with reduced motion). */
function useCountUp(target: number, ms = 1200) {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(0);
  const shown = useRef(0);
  useEffect(() => {
    if (reduce) return;
    const start = performance.now();
    const from = shown.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const v = Math.round(from + (target - from) * (1 - Math.pow(1 - t, 3)));
      shown.current = v;
      setValue(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, reduce]);
  return reduce ? target : value;
}

function Usd({ value, className, style, testId }: { value: number; className?: string; style?: React.CSSProperties; testId?: string }) {
  const shown = useCountUp(value);
  return (
    <span className={cn("tabular-nums", className)} style={style} data-testid={testId} data-value={value}>
      {formatUsd(shown)}
    </span>
  );
}

// ------------------------------------------------------------------ "coming up" banner
export function RevealComingUp() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-[1.2vw] bg-gold-500/10 px-[2vw] py-[1vw] text-center ring-1 ring-gold-500/40"
      data-testid="display-reveal-coming"
    >
      <div className="shimmer absolute inset-0 opacity-40" />
      <div className="relative flex items-center justify-center gap-[1vw]">
        <Sparkles className="size-[2.6vw] min-h-8 min-w-8 text-gold-300" />
        <div>
          <div className="font-display font-bold tracking-[0.14em] text-gold uppercase" style={{ fontSize: vw(1.3, 2.8, 4.6) }}>
            Final reveal coming up
          </div>
          <div className="text-ink-200" style={{ fontSize: vw(0.75, 1.1, 1.7) }}>
            The real candidates, their actual offer letters and annual salaries — the highest combined offers win.
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------- reveal stage
export function RevealStage({ s, money, teamById }: { s: LiveSnapshot; money: Money; teamById: Map<string, TeamView> }) {
  const r = s.reveal;
  const card = r.current;
  return (
    <>
      <section className="panel relative flex min-h-0 flex-col gap-[1vw] overflow-hidden p-[1.3vw]" data-testid="display-reveal">
        <div className="flex items-center gap-[1vw]">
          <span
            className="rounded-full bg-gold-500/15 px-[1vw] py-[0.3vw] font-bold tracking-[0.25em] text-gold-300 uppercase ring-1 ring-gold-500/40"
            style={{ fontSize: vw(0.6, 0.8, 1.2) }}
          >
            Final reveal
          </span>
          <span className="font-semibold text-ink-200" style={{ fontSize: vw(0.75, 1.05, 1.6) }} data-testid="display-reveal-progress">
            Profile {r.index + 1} of {r.count}
          </span>
          <StepDots step={r.step} />
        </div>
        <AnimatePresence mode="wait">
          {card && <ProfileReveal key={card.playerId} card={card} step={r.step} money={money} teamById={teamById} />}
        </AnimatePresence>
      </section>
      <RunningTotals s={s} teamById={teamById} />
    </>
  );
}

function StepDots({ step }: { step: number }) {
  return (
    <ol className="ml-auto flex items-center gap-[0.4vw]" aria-label="Reveal steps">
      {REVEAL_STEPS.map((label, i) => (
        <li
          key={label}
          title={label}
          className={cn("h-[0.5vw] min-h-1.5 rounded-full transition-all", i <= step ? "w-[2.4vw] bg-gold-400" : "w-[1vw] bg-ink-600")}
        />
      ))}
    </ol>
  );
}

function ProfileReveal({ card, step, money, teamById }: { card: RevealCard; step: number; money: Money; teamById: Map<string, TeamView> }) {
  const team = card.teamId ? teamById.get(card.teamId) : null;
  return (
    <motion.div
      initial={{ opacity: 0, x: -40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ type: "spring", stiffness: 220, damping: 26 }}
      className="grid min-h-0 flex-1 gap-[1.2vw] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]"
    >
      <div className="flex min-h-0 flex-col gap-[0.8vw]">
        <div className="flex items-center gap-[1vw]">
          <PlayerPhoto name={card.name} url={card.photoUrl} className="aspect-[3/4] w-[8vw] min-w-16 shrink-0 ring-2 ring-white/10" rounded="rounded-[0.9vw]" />
          <div className="min-w-0">
            <Label>Shown during bidding as</Label>
            <div
              className="font-display leading-[0.95] font-bold tracking-wide break-words uppercase"
              style={{ fontSize: vw(1.3, 2.6, 4.2) }}
              data-testid="reveal-display-name"
            >
              #{card.number} {card.name}
            </div>
            <div className="mt-[0.3vw] text-volt-400 uppercase" style={{ fontSize: vw(0.65, 0.85, 1.3) }}>
              {card.role}
            </div>
          </div>
        </div>

        <Slot shown={step >= 1} label="Original candidate" hint="Original name">
          <div className="font-display font-bold tracking-wide text-white uppercase" style={{ fontSize: vw(1.4, 3, 5) }} data-testid="reveal-original-name">
            {card.originalName ?? "—"}
          </div>
        </Slot>

        <Slot shown={step >= 3} label="Actual annual salary" hint="Annual salary">
          <Usd
            value={card.annualSalary ?? 0}
            className="font-display leading-none font-bold text-gold"
            style={{ fontSize: vw(2, 4.6, 7.5) }}
            testId="reveal-salary"
          />
          <span className="ml-[0.6vw] text-ink-300" style={{ fontSize: vw(0.7, 0.95, 1.4) }}>
            per year · from the offer letter
          </span>
        </Slot>

        <Slot shown={step >= 4} label="Purchased by" hint="Purchasing team">
          {team ? (
            <div className="flex items-center gap-[0.8vw]" data-testid="reveal-team">
              <TeamLogo team={team} className="size-[3.6vw] min-h-10 min-w-10" />
              <div className="min-w-0">
                <div className="truncate font-display font-semibold uppercase" style={{ fontSize: vw(1, 2.1, 3.4) }}>
                  {team.name}
                </div>
                <div className="text-ink-300" style={{ fontSize: vw(0.65, 0.85, 1.3) }}>
                  for {money(card.soldPrice)} auction credits
                </div>
              </div>
            </div>
          ) : (
            "—"
          )}
        </Slot>
      </div>

      <LetterPanel letter={card.letter} shown={step >= 2} />
    </motion.div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-bold tracking-[0.22em] text-gold-400 uppercase" style={{ fontSize: vw(0.55, 0.72, 1.05) }}>
      {children}
    </div>
  );
}

function Slot({ shown, label, hint, children }: { shown: boolean; label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-[0.9vw] px-[1vw] py-[0.6vw] ring-1", shown ? "bg-ink-950/60 ring-gold-500/30" : "bg-ink-900/40 ring-ink-600/60")}>
      <Label>{label}</Label>
      <AnimatePresence mode="wait" initial={false}>
        {shown ? (
          <motion.div
            key="shown"
            initial={{ opacity: 0, y: 14, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.45 }}
            className="flex flex-wrap items-baseline"
          >
            {children}
          </motion.div>
        ) : (
          <motion.div key="hidden" exit={{ opacity: 0 }} className="flex items-center gap-[0.5vw] text-ink-500" style={{ fontSize: vw(0.9, 1.6, 2.6) }}>
            <Lock className="size-[0.9em]" /> <span className="tracking-[0.3em]">• • • •</span>
            <span className="sr-only">{hint} not revealed yet</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LetterPanel({ letter, shown }: { letter: OfferLetterRef | null; shown: boolean }) {
  return (
    <div className="flex min-h-[30vh] flex-col overflow-hidden rounded-[1vw] bg-ink-950/60 ring-1 ring-white/10 lg:min-h-0" data-testid="reveal-letter">
      <div className="flex items-center gap-[0.5vw] px-[1vw] pt-[0.6vw]">
        <FileText className="size-[1.2vw] min-h-4 min-w-4 text-gold-400" />
        <Label>Actual offer letter</Label>
      </div>
      <div className="relative m-[0.8vw] flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[0.6vw]">
        {shown && letter ? (
          letter.kind === "pdf" ? (
            <iframe
              src={`${letter.url}#toolbar=0&navpanes=0&view=FitH`}
              title="Offer letter"
              className="size-full min-h-[28vh] rounded-[0.6vw] bg-white"
              data-testid="reveal-letter-pdf"
            />
          ) : (
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="flex size-full items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={letter.url}
                alt="Offer letter"
                className="max-h-full max-w-full rounded-[0.6vw] bg-white object-contain"
                data-testid="reveal-letter-image"
              />
            </motion.div>
          )
        ) : shown ? (
          <div className="text-ink-400" style={{ fontSize: vw(0.8, 1.2, 1.8) }}>
            No offer letter on file for this profile.
          </div>
        ) : (
          <div className="flex flex-col items-center gap-[0.6vw] text-ink-500">
            <Lock className="size-[3vw] min-h-8 min-w-8" />
            <span className="tracking-[0.2em] uppercase" style={{ fontSize: vw(0.7, 1, 1.5) }}>
              Revealed after the original name
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Each team's visible total — a profile's salary is added once its purchasing team is revealed. */
function RunningTotals({ s, teamById }: { s: LiveSnapshot; teamById: Map<string, TeamView> }) {
  const r = s.reveal;
  const justAdded = r.current && r.step >= REVEAL_STEPS.length - 1 ? r.current : null;
  return (
    <section className="panel flex min-h-0 flex-col p-[1vw]" data-testid="display-running-totals">
      <div className="px-[0.6vw] pb-[0.6vw] font-bold tracking-[0.2em] text-ink-300 uppercase" style={{ fontSize: vw(0.55, 0.75, 1.1) }}>
        Combined annual offers so far
      </div>
      <LayoutGroup>
        <div className="flex min-h-0 flex-1 flex-col gap-[0.5vw]">
          {r.standings.map((st) => {
            const t = teamById.get(st.teamId);
            if (!t) return null;
            const plus = justAdded && justAdded.teamId === st.teamId ? justAdded.annualSalary : null;
            return (
              <motion.div
                layout
                key={st.teamId}
                transition={{ type: "spring", stiffness: 300, damping: 32 }}
                className={cn(
                  "relative flex max-h-[8vw] min-h-0 flex-1 items-center gap-[0.8vw] rounded-[0.9vw] px-[0.8vw] ring-1",
                  plus ? "animate-glow" : "bg-ink-850/70 ring-ink-600/60",
                )}
                style={plus ? ({ "--glow": t.color, borderColor: t.color, ["--tw-ring-color" as string]: t.color } as React.CSSProperties) : undefined}
                data-testid={`running-${t.shortName}`}
              >
                <TeamLogo team={t} className="size-[2.8vw] min-h-8 min-w-8" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display font-semibold uppercase" style={{ fontSize: vw(0.8, 1.25, 2) }}>
                    {t.name}
                  </div>
                  <div className="text-ink-400" style={{ fontSize: vw(0.55, 0.72, 1.05) }}>
                    {st.profiles} profile{st.profiles === 1 ? "" : "s"} revealed
                  </div>
                </div>
                <AnimatePresence>
                  {plus && (
                    <motion.span
                      key={justAdded?.playerId}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="font-bold text-win-400 tabular-nums"
                      style={{ fontSize: vw(0.7, 1, 1.5) }}
                    >
                      +{formatUsd(plus)}
                    </motion.span>
                  )}
                </AnimatePresence>
                <Usd
                  value={st.total}
                  className="font-display font-bold text-gold-300"
                  style={{ fontSize: vw(0.9, 1.6, 2.6) }}
                  testId={`running-total-${t.shortName}`}
                />
              </motion.div>
            );
          })}
        </div>
      </LayoutGroup>
      <div className="pt-[0.6vw] text-center text-ink-400" style={{ fontSize: vw(0.55, 0.7, 1) }}>
        Highest combined actual annual salary wins · the number of profiles does not matter
      </div>
    </section>
  );
}

// ----------------------------------------------------------------- final leaderboard
export function FinalLeaderboard({ s, money, teamById }: { s: LiveSnapshot; money: Money; teamById: Map<string, TeamView> }) {
  const standings = s.reveal.standings;
  const winners = standings.filter((x) => x.winner);
  const joint = winners.length > 1;
  const reduce = useReducedMotion();
  const tieBroken = tieDecidedByCredits(standings);

  useEffect(() => {
    if (reduce || winners.length === 0) return;
    const colors = [...winners.map((w) => teamById.get(w.teamId)?.color ?? "#f5b83d"), "#ffd05a", "#ffffff"];
    const fire = () => {
      confetti({ particleCount: 180, spread: 100, startVelocity: 60, origin: { x: 0.25, y: 0.7 }, colors, disableForReducedMotion: true });
      confetti({ particleCount: 180, spread: 100, startVelocity: 60, origin: { x: 0.75, y: 0.7 }, colors, disableForReducedMotion: true });
    };
    fire();
    const h = setTimeout(fire, 900);
    return () => clearTimeout(h);
    // fire once per final screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  return (
    <section className="col-span-full flex min-h-0 flex-1 flex-col items-center gap-[1.2vw]" data-testid="display-leaderboard">
      <div className="flex flex-col items-center gap-[0.4vw] text-center">
        <Trophy className="size-[4vw] min-h-10 min-w-10 text-gold-300" />
        <div className="font-display font-bold tracking-[0.16em] text-gold uppercase" style={{ fontSize: vw(1.4, 3, 5) }}>
          {winners.length === 0 ? "Final leaderboard" : joint ? "Joint winners" : "Winner"}
        </div>
        {winners.length > 0 && (
          <div className="font-display font-semibold uppercase" style={{ fontSize: vw(1.1, 2.2, 3.6) }} data-testid="leaderboard-winner">
            {winners.map((w) => teamById.get(w.teamId)?.name).join(" & ")}
          </div>
        )}
        {tieBroken && (
          <div className="text-ink-300" style={{ fontSize: vw(0.7, 0.95, 1.4) }}>
            Tie on combined offers — decided by more auction credits remaining
          </div>
        )}
      </div>
      <div className="panel w-full max-w-[86vw] overflow-hidden p-[1vw]">
        <table className="w-full border-separate border-spacing-y-[0.4vw]" data-testid="leaderboard-table">
          <thead>
            <tr className="text-left font-bold tracking-[0.18em] text-ink-300 uppercase" style={{ fontSize: vw(0.55, 0.8, 1.2) }}>
              <th className="px-[1vw]">Team</th>
              <th className="px-[1vw] text-right">Profiles purchased</th>
              <th className="px-[1vw] text-right">Combined annual offer amount</th>
              <th className="px-[1vw] text-right">Rank</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((st, i) => {
              const t = teamById.get(st.teamId);
              if (!t) return null;
              return (
                <motion.tr
                  key={st.teamId}
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.12 }}
                  className={cn(st.winner ? "bg-gold-500/15" : "bg-ink-850/70", st.disqualified && "opacity-70")}
                  style={st.winner ? { outline: `2px solid ${t.color}`, outlineOffset: "-2px" } : undefined}
                  data-testid={`leaderboard-${t.shortName}`}
                  data-rank={st.rank ?? ""}
                  data-profiles={st.profiles}
                  data-winner={st.winner || undefined}
                >
                  <td className="rounded-l-[0.8vw] px-[1vw] py-[0.6vw]">
                    <div className="flex items-center gap-[0.8vw]">
                      <TeamLogo team={t} className="size-[3.2vw] min-h-9 min-w-9" />
                      <div className="min-w-0">
                        <div className="truncate font-display font-semibold uppercase" style={{ fontSize: vw(0.9, 1.7, 2.8) }}>
                          {t.name}
                        </div>
                        <div className="text-ink-300" style={{ fontSize: vw(0.55, 0.75, 1.1) }}>
                          {st.disqualified
                            ? `Not ranked — below the minimum squad of ${s.auction.minSquad}`
                            : `${money(st.creditsLeft)} credits left${st.winner ? (joint ? " · joint winner" : " · winner") : ""}`}
                        </div>
                      </div>
                      {st.winner && <Trophy className="ml-auto size-[2vw] min-h-6 min-w-6 text-gold-300" />}
                    </div>
                  </td>
                  <td className="px-[1vw] text-right font-display font-semibold tabular-nums" style={{ fontSize: vw(1, 2, 3.2) }}>
                    {st.profiles}
                  </td>
                  <td className="px-[1vw] text-right">
                    <Usd
                      value={st.total}
                      className="font-display font-bold text-gold"
                      style={{ fontSize: vw(1.1, 2.4, 4) }}
                      testId={`leaderboard-total-${t.shortName}`}
                    />
                  </td>
                  <td className="rounded-r-[0.8vw] px-[1vw] text-right font-display font-bold tabular-nums" style={{ fontSize: vw(1.1, 2.4, 4) }}>
                    {st.rank ?? "—"}
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** True when the top eligible teams share the same salary total and the credits tiebreaker split them. */
function tieDecidedByCredits(standings: TeamStanding[]) {
  const eligible = standings.filter((x) => !x.disqualified);
  const top = eligible.find((x) => x.winner);
  if (!top) return false;
  return eligible.some((x) => !x.winner && x.total === top.total);
}
