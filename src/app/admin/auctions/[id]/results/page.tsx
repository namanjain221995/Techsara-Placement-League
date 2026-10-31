"use client";

import { Download, Eye, EyeOff, History, Lock, ScrollText, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuction } from "@/components/admin/auction-context";
import { SalaryLeaderboard, usePrivateToggle } from "@/components/admin/hidden-totals";
import { PlayerPhoto, TeamLogo } from "@/components/media";
import { Button } from "@/components/ui/button";
import { Badge, Spinner, Stat } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatMoney, formatUsd } from "@/shared/money";
import type { PrivatePlayerView as PlayerView, RevealStatus, TeamStanding, TeamView } from "@/shared/types";

interface Results {
  reveal: { status: RevealStatus };
  standings: TeamStanding[];
  revealCheck: { blocking: string[]; warnings: string[] };
  teams: (TeamView & { belowMinimum: boolean; players: PlayerView[] })[];
  unsold: PlayerView[];
  pool: PlayerView[];
  disqualified: PlayerView[];
  totals: { spent: number; sold: number; candidates: number };
}
interface LotRow {
  id: string;
  sequence: number;
  round: number;
  result: string;
  finalAmount: number | null;
  winningTeamId: string | null;
  playerName: string;
  playerNumber: number;
  bids: { id: number; teamId: string; amount: number; at: string; undone: boolean }[];
}
interface AuditRow {
  id: number;
  at: string;
  actor: string;
  action: string;
  details: Record<string, unknown>;
}

export default function ResultsPage() {
  const { id, snapshot, version } = useAuction();
  const [tab, setTab] = useState<"squads" | "bids" | "audit">("squads");
  const [results, setResults] = useState<Results | null>(null);
  const [lots, setLots] = useState<LotRow[] | null>(null);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [showPrivate, togglePrivate] = usePrivateToggle("tpl.results.showPrivate", true);

  useEffect(() => {
    api.get<Results>(`/auctions/${id}/results`).then(setResults, (e) => toast.error(errorMessage(e)));
    if (tab === "bids")
      api.get<{ lots: LotRow[] }>(`/auctions/${id}/bids`).then(
        (r) => setLots(r.lots),
        () => setLots([]),
      );
    if (tab === "audit")
      api.get<{ entries: AuditRow[] }>(`/auctions/${id}/audit`).then(
        (r) => setAudit(r.entries),
        () => setAudit([]),
      );
  }, [id, version, tab]);

  if (!snapshot || !results) return <Spinner className="py-20" />;
  const a = snapshot.auction;
  const money = (k: number | null) => formatMoney(k, a.currencySymbol);
  const teamName = (tid: string | null) => snapshot.teams.find((t) => t.id === tid)?.name ?? "—";
  const completed = a.status === "COMPLETED";
  const final = completed && results.revealCheck.blocking.length === 0;
  const winners = results.standings.filter((x) => x.winner);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-wide text-white uppercase">Results & reports</h1>
          <p className="text-sm text-ink-300">{completed ? "Final results." : "Live standings — the auction is not finished yet."}</p>
        </div>
        <a href={`/api/auctions/${id}/export.xlsx`}>
          <Button variant="primary" data-testid="export-xlsx">
            <Download className="size-4" /> Export Excel
          </Button>
        </a>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Candidates sold" value={`${results.totals.sold}/${results.totals.candidates}`} />
        <Stat label="Total spent" value={money(results.totals.spent)} />
        <Stat label="Unsold" value={results.unsold.length} />
        <Stat label="Still in pool" value={results.pool.length} />
      </div>

      <div className="flex gap-1" role="tablist">
        {(
          [
            ["squads", "Squads", Trophy],
            ["bids", "Bid history", History],
            ["audit", "Audit log", ScrollText],
          ] as const
        ).map(([k, l, Icon]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold",
              tab === k ? "bg-gold-500/15 text-gold-300 ring-1 ring-gold-500/40" : "text-ink-300 hover:text-white",
            )}
          >
            <Icon className="size-4" /> {l}
          </button>
        ))}
      </div>

      {tab === "squads" && (
        <>
          <section className="panel p-5" data-testid="results-salary">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h2 className="flex items-center gap-2 text-xs font-bold tracking-widest text-gold-400 uppercase">
                <Lock className="size-3.5" /> Winner — combined actual annual salary of purchased profiles
              </h2>
              <Badge tone={results.reveal.status === "COMPLETE" ? "green" : "neutral"}>
                {results.reveal.status === "COMPLETE"
                  ? "Revealed to the audience"
                  : results.reveal.status === "IN_PROGRESS"
                    ? "Reveal running"
                    : "Hidden from the audience"}
              </Badge>
              <Button size="sm" variant="ghost" className="ml-auto" onClick={togglePrivate} aria-pressed={showPrivate}>
                {showPrivate ? <EyeOff className="size-4" /> : <Eye className="size-4" />} {showPrivate ? "Hide" : "Show"} salaries
              </Button>
            </div>
            {showPrivate ? (
              <>
                {winners.length > 0 && (
                  <p className="mb-3 text-sm text-ink-200">
                    <Trophy className="mr-1 inline size-4 text-gold-300" />
                    {final ? (winners.length > 1 ? "Joint winners: " : "Winner: ") : "Current leader (not final): "}
                    <b className="text-white">{winners.map((w) => teamName(w.teamId)).join(" & ")}</b> — {formatUsd(winners[0].total)} combined annual offers
                  </p>
                )}
                <SalaryLeaderboard
                  standings={results.standings}
                  teams={snapshot.teams}
                  currencySymbol={a.currencySymbol}
                  final={final}
                  testId="results-leaderboard"
                />
                {results.revealCheck.blocking.length > 0 && completed && (
                  <p className="mt-3 text-xs text-loss-400">Not final: {results.revealCheck.blocking.join("; ")}</p>
                )}
                <p className="mt-2 text-[11px] text-ink-400">
                  Only confirmed purchases count. Tie → more credits remaining wins; still tied → joint winners. Teams below the minimum squad are not ranked.
                </p>
              </>
            ) : (
              <p className="text-sm text-ink-400">Salaries hidden on this screen.</p>
            )}
          </section>
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {results.teams.map((t) => (
              <article key={t.id} className="panel overflow-hidden" data-testid="result-team">
                <div className="h-1.5" style={{ background: t.color }} />
                <div className="p-5">
                  <div className="flex items-center gap-3">
                    <TeamLogo team={t} className="size-12" />
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate font-display text-lg font-semibold text-white uppercase">{t.name}</h2>
                      <p className="truncate text-xs text-ink-300">{t.members.join(" & ") || "—"}</p>
                    </div>
                    {completed ? (
                      t.disqualified ? (
                        <Badge tone="red">Disqualified</Badge>
                      ) : (
                        <Badge tone="green">Qualified</Badge>
                      )
                    ) : t.belowMinimum ? (
                      <Badge tone="amber">Below min {a.minSquad}</Badge>
                    ) : (
                      <Badge tone="green">Min reached</Badge>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-ink-850 py-1.5">
                      <div className="text-ink-400">Spent</div>
                      <b className="text-gold-300">{money(t.spent)}</b>
                    </div>
                    <div className="rounded-lg bg-ink-850 py-1.5">
                      <div className="text-ink-400">Left</div>
                      <b className="text-white">{money(t.remaining)}</b>
                    </div>
                    <div className="rounded-lg bg-ink-850 py-1.5">
                      <div className="text-ink-400">Squad</div>
                      <b className="text-white">
                        {t.squadCount}/{a.maxSquad}
                      </b>
                    </div>
                  </div>
                  <ul className="mt-3 space-y-1.5">
                    {t.players.map((p) => (
                      <li key={p.id} className="flex items-center gap-2 rounded-lg bg-ink-850 p-1.5 text-sm">
                        <PlayerPhoto name={p.name} url={p.photoUrl} className="size-8" rounded="rounded-md" />
                        <span className="min-w-0 flex-1 truncate text-ink-100">
                          #{p.number} {p.name}
                          {showPrivate && (
                            <span className="block truncate text-xs text-ink-400">
                              {p.originalName ?? "no original name"} ·{" "}
                              <b className={p.annualSalary == null ? "text-amber-300" : "text-gold-300"}>
                                {p.annualSalary == null ? "no salary" : `${formatUsd(p.annualSalary)}/yr`}
                              </b>
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-ink-400">R{p.soldRound}</span>
                        <b className="font-display text-white tabular-nums">{money(p.soldPrice)}</b>
                      </li>
                    ))}
                    {t.players.length === 0 && <li className="text-sm text-ink-400 italic">No candidates bought.</li>}
                  </ul>
                </div>
              </article>
            ))}
          </div>
          {(results.unsold.length > 0 || results.pool.length > 0 || results.disqualified.length > 0) && (
            <div className="panel p-5">
              <h2 className="mb-3 text-xs font-bold tracking-widest text-ink-300 uppercase">Not sold</h2>
              <div className="flex flex-wrap gap-2">
                {[...results.unsold, ...results.pool, ...results.disqualified].map((p) => (
                  <span key={p.id} className="rounded-full bg-ink-850 px-3 py-1 text-sm ring-1 ring-ink-600">
                    #{p.number} {p.name} <span className="text-xs text-ink-400">· {p.status.toLowerCase()}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {tab === "bids" &&
        (!lots ? (
          <Spinner />
        ) : lots.length === 0 ? (
          <p className="panel p-8 text-center text-sm text-ink-400">No candidate has been on the block yet.</p>
        ) : (
          <div className="space-y-3">
            {lots.map((l) => (
              <div key={l.id} className="panel p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-white">
                    Lot {l.sequence} · #{l.playerNumber} {l.playerName}
                  </b>
                  <Badge>Round {l.round}</Badge>
                  <Badge tone={l.result === "SOLD" ? "green" : l.result === "OPEN" ? "blue" : "amber"}>{l.result}</Badge>
                  {l.result === "SOLD" && (
                    <span className="text-sm text-win-400">
                      {money(l.finalAmount)} → {teamName(l.winningTeamId)}
                    </span>
                  )}
                </div>
                <ol className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  {l.bids.map((b) => (
                    <li
                      key={b.id}
                      className={cn("rounded-md bg-ink-850 px-2 py-1 ring-1 ring-ink-600", b.undone && "line-through opacity-50")}
                      title={new Date(b.at).toLocaleTimeString()}
                    >
                      {teamName(b.teamId)} {money(b.amount)}
                    </li>
                  ))}
                  {l.bids.length === 0 && <li className="text-ink-400">no bids</li>}
                </ol>
              </div>
            ))}
          </div>
        ))}

      {tab === "audit" &&
        (!audit ? (
          <Spinner />
        ) : (
          <div className="panel overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs tracking-wider text-ink-400 uppercase">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Who</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-600/50">
                {audit.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-2 whitespace-nowrap text-ink-300">{new Date(e.at).toLocaleString()}</td>
                    <td className="px-4 py-2 text-ink-200">{e.actor}</td>
                    <td className="px-4 py-2 font-mono text-xs text-gold-300">{e.action}</td>
                    <td className="max-w-md truncate px-4 py-2 font-mono text-xs text-ink-400" title={JSON.stringify(e.details)}>
                      {JSON.stringify(e.details)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}
