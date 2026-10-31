"use client";

import { ArrowLeft, ArrowRight, CheckCircle2, Circle, FileText, Lock, PartyPopper, RotateCcw, Sparkles, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { SalaryLeaderboard, VerifiedMark } from "@/components/admin/hidden-totals";
import { PlayerPhoto, TeamLogo } from "@/components/media";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import type { CommandInput } from "@/lib/live";
import { formatMoney, formatUsd } from "@/shared/money";
import { REVEAL_STEPS, type LiveSnapshot } from "@/shared/types";

/**
 * Final reveal controls (organizer). The display follows step by step:
 * tweaked name → original name → offer letter → annual salary → purchasing team,
 * then the final leaderboard. The organizer always sees the full private details.
 */
export function RevealConsole({
  snapshot: s,
  busy,
  run,
}: {
  snapshot: LiveSnapshot;
  busy: string | null;
  run: (cmd: CommandInput, label?: string) => Promise<boolean>;
}) {
  const confirm = useConfirm();
  const r = s.reveal;
  const a = s.auction;
  const priv = s.private;
  const check = priv?.revealCheck ?? { blocking: [], warnings: [] };
  const team = (id: string | null | undefined) => s.teams.find((t) => t.id === id);
  const purchased = (priv?.profiles ?? []).filter((p) => p.status === "SOLD");

  const start = async () => {
    const ok = await confirm({
      title: "Start the final reveal?",
      tone: "primary",
      confirmLabel: "Start Final Reveal",
      body: (
        <div className="space-y-2">
          <p>
            The live screen switches to the reveal. {r.count || purchased.length} purchased profile(s) are revealed one by one in purchase order, then the final
            leaderboard.
          </p>
          <p className="text-amber-300">
            Purchases, salaries, original names and offer letters are frozen while the reveal runs (restart the reveal to correct them).
          </p>
          {check.warnings.length > 0 && <p className="text-amber-300">{check.warnings.length} warning(s) are still open — see the list.</p>}
        </div>
      ),
    });
    if (ok) run({ type: "START_REVEAL" });
  };
  const restart = async () => {
    if (
      await confirm({
        title: "Restart the final reveal?",
        tone: "danger",
        confirmLabel: "Restart",
        body: "The screen goes back to “Final reveal coming up” and every revealed detail is hidden again. Purchases and private details can then be corrected.",
      })
    )
      run({ type: "RESTART_REVEAL" });
  };

  // ---------------------------------------------------------------- not started yet
  if (r.status === "NOT_STARTED") {
    return (
      <div className="panel p-6" data-testid="reveal-console">
        <div className="flex flex-col items-center gap-3 text-center">
          <Sparkles className="size-10 text-gold-400" />
          <h2 className="font-display text-3xl tracking-wide text-white uppercase">Final reveal</h2>
          <p className="max-w-xl text-sm text-ink-300">
            Bidding is over. The audience screen shows “Final reveal coming up”. The winner is the team whose purchased profiles have the highest combined
            actual annual salary — the number of profiles does not matter and auction credits are not deducted.
          </p>
        </div>
        <div className="mx-auto mt-5 max-w-2xl space-y-3">
          {check.blocking.length > 0 && (
            <div className="rounded-xl bg-loss-500/10 p-4 text-sm text-loss-400 ring-1 ring-loss-500/30" data-testid="reveal-blocking">
              <div className="mb-1 flex items-center gap-2 font-semibold">
                <TriangleAlert className="size-4" /> Fix before the reveal can start
              </div>
              <ul className="list-disc space-y-0.5 pl-5">
                {check.blocking.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-300">
                Enter salaries on the{" "}
                <Link className="font-semibold text-gold-300 underline" href={`/admin/auctions/${a.id}/players`}>
                  Candidates
                </Link>{" "}
                page.
              </p>
            </div>
          )}
          {check.warnings.length > 0 && (
            <details className="rounded-xl bg-warn-500/10 p-4 text-sm text-amber-300 ring-1 ring-warn-500/30" data-testid="reveal-warnings">
              <summary className="cursor-pointer font-semibold">{check.warnings.length} warning(s) — the reveal can still start</summary>
              <ul className="mt-2 list-disc space-y-0.5 pl-5">
                {check.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>
          )}
          {check.blocking.length === 0 && check.warnings.length === 0 && (
            <p className="rounded-xl bg-win-500/10 p-3 text-center text-sm text-win-400 ring-1 ring-win-500/30">
              Every purchased profile has a verified salary, an original name and an offer letter.
            </p>
          )}
          <div className="flex flex-col items-center gap-2 pt-2">
            <Button
              variant="primary"
              size="xl"
              onClick={start}
              disabled={check.blocking.length > 0 || busy !== null}
              loading={busy === "START_REVEAL"}
              data-testid="start-reveal"
            >
              <Sparkles className="size-5" /> Start Final Reveal
            </Button>
            <p className="text-xs text-ink-400">
              Need a correction first? Use Corrections on the{" "}
              <Link className="underline" href={`/admin/auctions/${a.id}/players`}>
                Candidates
              </Link>{" "}
              page — credits and hidden totals update automatically.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- running / done
  const done = r.status === "COMPLETE";
  const cardId = r.current?.playerId;
  const profile = priv?.profiles.find((p) => p.id === cardId);
  const buyer = team(profile?.soldToTeamId);
  const atLast = r.index >= r.count - 1 && r.step >= REVEAL_STEPS.length - 1;
  const nextLabel = done
    ? null
    : atLast
      ? "Show final leaderboard"
      : r.step >= REVEAL_STEPS.length - 1
        ? "Next profile"
        : `Reveal ${REVEAL_STEPS[r.step + 1].toLowerCase()}`;
  const finalStandings = done ? r.standings : (priv?.standings ?? []);

  return (
    <div className="panel overflow-hidden" data-testid="reveal-console">
      <div className="flex flex-wrap items-center gap-3 border-b border-ink-600/60 p-4">
        <Sparkles className="size-5 text-gold-400" />
        <h2 className="font-display text-xl tracking-wide text-white uppercase">{done ? "Final leaderboard on screen" : "Final reveal"}</h2>
        {!done && (
          <span className="rounded-lg bg-ink-850 px-2.5 py-1 text-xs text-ink-200 ring-1 ring-ink-600" data-testid="reveal-progress">
            Profile <b className="text-white">{r.index + 1}</b> of {r.count} · step <b className="text-white">{r.step + 1}</b>/{REVEAL_STEPS.length}:{" "}
            {REVEAL_STEPS[r.step]}
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button onClick={() => run({ type: "REVEAL_BACK" })} disabled={busy !== null || (!done && r.index === 0 && r.step === 0)} data-testid="reveal-back">
            <ArrowLeft className="size-4" /> Back <Kbd>←</Kbd>
          </Button>
          {!done && (
            <Button
              variant="primary"
              onClick={() => run({ type: "REVEAL_NEXT" })}
              loading={busy === "REVEAL_NEXT"}
              disabled={busy !== null}
              data-testid="reveal-next"
            >
              {nextLabel} <ArrowRight className="size-4" /> <Kbd>→</Kbd>
            </Button>
          )}
          <Button variant="ghost" className="text-loss-400" onClick={restart} disabled={busy !== null} data-testid="reveal-restart">
            <RotateCcw className="size-4" /> Restart
          </Button>
        </div>
      </div>

      {!done && profile && r.current && (
        <div className="grid gap-5 p-5 md:grid-cols-[150px_minmax(0,1fr)]">
          <PlayerPhoto name={profile.name} url={profile.photoUrl} className="aspect-[3/4] w-full" />
          <div className="min-w-0 space-y-3">
            <ol className="grid gap-1.5 sm:grid-cols-5" aria-label="Reveal steps">
              {REVEAL_STEPS.map((label, i) => (
                <li
                  key={label}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold uppercase ring-1",
                    i < r.step ? "text-win-400 ring-win-500/30" : i === r.step ? "bg-gold-500/15 text-gold-300 ring-gold-500/50" : "text-ink-400 ring-ink-600",
                  )}
                >
                  {i <= r.step ? <CheckCircle2 className="size-3.5" /> : <Circle className="size-3.5" />} {label}
                </li>
              ))}
            </ol>
            <p className="text-[11px] text-ink-400">
              <Lock className="mr-1 inline size-3" />
              You see everything below; the audience sees only the ticked steps.
            </p>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Detail label="Tweaked name" shown={true}>
                #{profile.number} {profile.name}
              </Detail>
              <Detail label="Original candidate name" shown={r.step >= 1}>
                {profile.originalName ?? <span className="text-amber-300">not entered</span>}
              </Detail>
              <Detail label="Actual offer letter" shown={r.step >= 2}>
                {profile.letter ? (
                  <a className="inline-flex items-center gap-1 text-gold-300 underline" href={profile.letter.url} target="_blank" rel="noopener noreferrer">
                    <FileText className="size-4" /> {profile.letter.fileName ?? "open"}
                  </a>
                ) : (
                  <span className="text-amber-300">not uploaded</span>
                )}
              </Detail>
              <Detail label="Annual salary (USD)" shown={r.step >= 3}>
                <span className="font-display text-lg text-gold-300">{formatUsd(profile.annualSalary)}</span>{" "}
                <span className="text-xs">
                  <VerifiedMark verified={profile.salaryVerified} />
                </span>
              </Detail>
              <Detail label="Purchasing team" shown={r.step >= 4}>
                {buyer ? (
                  <span className="inline-flex items-center gap-2">
                    <TeamLogo team={buyer} className="size-6 rounded-md" /> {buyer.name} · paid {formatMoney(profile.soldPrice, a.currencySymbol)} credits
                  </span>
                ) : (
                  "—"
                )}
              </Detail>
            </dl>
          </div>
        </div>
      )}

      <div className={cn("grid gap-5 border-t border-ink-600/60 p-5", done && "lg:grid-cols-[minmax(0,1fr)_280px]")}>
        <div>
          <h3 className="mb-2 text-xs font-bold tracking-widest text-ink-300 uppercase">
            {done ? "Final standings (on screen)" : "Visible totals on screen so far"}
          </h3>
          <SalaryLeaderboard standings={r.standings} teams={s.teams} currencySymbol={a.currencySymbol} final={done} testId="visible-standings" />
        </div>
        {!done && (
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold tracking-widest text-gold-400 uppercase">
              <Lock className="size-3.5" /> Final result (organizer only)
            </h3>
            <SalaryLeaderboard standings={finalStandings} teams={s.teams} currencySymbol={a.currencySymbol} final testId="final-preview" />
          </div>
        )}
        {done && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl bg-gold-500/10 p-6 text-center ring-1 ring-gold-500/30">
            <PartyPopper className="size-10 text-gold-300" />
            <p className="font-display text-2xl text-white uppercase">
              {r.standings
                .filter((x) => x.winner)
                .map((x) => team(x.teamId)?.name)
                .join(" & ") || "No winner"}
            </p>
            <p className="text-sm text-ink-300">
              {r.standings.filter((x) => x.winner).length > 1 ? "Joint winners" : "Winner"} · {formatUsd(r.standings.find((x) => x.winner)?.total ?? null)}{" "}
              combined annual offers
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Detail({ label, shown, children }: { label: string; shown: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-lg px-3 py-2 ring-1", shown ? "bg-win-500/5 ring-win-500/25" : "bg-ink-850 ring-ink-600")}>
      <dt className="flex items-center justify-between text-[11px] font-bold tracking-widest text-ink-400 uppercase">
        {label}
        <span className={cn("text-[10px]", shown ? "text-win-400" : "text-ink-500")}>{shown ? "on screen" : "hidden"}</span>
      </dt>
      <dd className="mt-0.5 text-ink-100">{children}</dd>
    </div>
  );
}
