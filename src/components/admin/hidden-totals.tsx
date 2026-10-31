"use client";

import { BadgeCheck, Eye, EyeOff, FileText, Lock, Trophy } from "lucide-react";
import { useSyncExternalStore } from "react";
import { TeamLogo } from "@/components/media";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatMoney, formatUsd } from "@/shared/money";
import type { LiveSnapshot, PrivatePlayerView, TeamStanding } from "@/shared/types";

/** A show/hide switch remembered per browser — private data stays masked unless the organizer opens it. */
const TOGGLE_EVENT = "tpl:private-toggle";
const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(TOGGLE_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(TOGGLE_EVENT, cb);
  };
};
const memory = new Map<string, boolean>(); // fallback when storage is blocked
function readToggle(key: string, initial: boolean) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? (memory.get(key) ?? initial) : v === "1";
  } catch {
    return memory.get(key) ?? initial;
  }
}
export function usePrivateToggle(key: string, initial = false) {
  const show = useSyncExternalStore(
    subscribe,
    () => readToggle(key, initial),
    () => initial,
  );
  const toggle = () => {
    memory.set(key, !show);
    try {
      localStorage.setItem(key, show ? "0" : "1");
    } catch {
      /* storage unavailable: the switch still works for this page view */
    }
    window.dispatchEvent(new Event(TOGGLE_EVENT));
  };
  return [show, toggle] as const;
}

/**
 * Organizer-only: each team's combined actual annual salary from CONFIRMED purchases (SOLD).
 * Bids in progress never count. The audience never receives this data.
 */
export function HiddenTotalsPanel({ snapshot: s, show, onToggle }: { snapshot: LiveSnapshot; show: boolean; onToggle: () => void }) {
  const standings = s.private?.standings ?? [];
  const team = (id: string) => s.teams.find((t) => t.id === id);
  const missing = (s.private?.profiles ?? []).filter((p) => p.status === "SOLD" && p.annualSalary == null).length;
  return (
    <div className="panel p-4" data-testid="hidden-totals">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="flex flex-1 items-center gap-1.5 text-xs font-bold tracking-widest text-gold-400 uppercase">
          <Lock className="size-3.5" /> Hidden salary totals
        </h3>
        <Button size="sm" variant="ghost" onClick={onToggle} data-testid="toggle-hidden-totals" aria-pressed={show}>
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />} {show ? "Hide" : "Show"}
        </Button>
      </div>
      {!show ? (
        <p className="text-sm text-ink-400">
          Organizer only. Hidden on this screen until you press Show — the audience never sees these totals before the final reveal.
        </p>
      ) : standings.length === 0 ? (
        <p className="text-sm text-ink-400">No teams yet.</p>
      ) : (
        <>
          <ol className="space-y-1.5" data-testid="hidden-standings">
            {standings.map((st) => {
              const t = team(st.teamId);
              if (!t) return null;
              return (
                <li
                  key={st.teamId}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm",
                    st.rank === 1 && st.total > 0 ? "bg-gold-500/10 ring-1 ring-gold-500/30" : "bg-ink-850",
                  )}
                >
                  <span className="w-5 text-center text-xs font-bold text-ink-300 tabular-nums">{st.rank ?? "–"}</span>
                  <TeamLogo team={t} className="size-6 rounded-md" />
                  <span className="min-w-0 flex-1 truncate text-ink-100">
                    {t.name}
                    {st.disqualified && <span className="ml-1 text-[10px] font-bold text-loss-400 uppercase">DQ</span>}
                  </span>
                  <span className="text-xs text-ink-400 tabular-nums">{st.profiles}×</span>
                  <span className="w-24 text-right font-display font-semibold text-gold-300 tabular-nums" data-testid={`hidden-total-${t.shortName}`}>
                    {formatUsd(st.total)}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-[11px] text-ink-400">
            Confirmed purchases only (bids in progress never count). Tie → more credits left; still tied → joint winners.
            {missing > 0 && <span className="block text-amber-300">{missing} purchased profile(s) have no salary yet — totals are incomplete.</span>}
          </p>
        </>
      )}
    </div>
  );
}

/** Organizer-only strip on the lot panel with the real identity behind the tweaked profile. */
export function LotPrivateDetails({ profile, show }: { profile: PrivatePlayerView | undefined; show: boolean }) {
  if (!profile) return null;
  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-gold-500/5 px-2.5 py-1.5 text-xs ring-1 ring-gold-500/25"
      data-testid="lot-private"
    >
      <Lock className="size-3 text-gold-400" />
      {show ? (
        <>
          <span className="text-ink-100">{profile.originalName ?? <span className="text-amber-300">no original name</span>}</span>
          <span className={cn("font-semibold tabular-nums", profile.annualSalary == null ? "text-amber-300" : "text-gold-300")}>
            {profile.annualSalary == null ? "no salary" : `${formatUsd(profile.annualSalary)}/yr`}
          </span>
          {profile.annualSalary != null && !profile.salaryVerified && <span className="text-amber-300">not verified</span>}
          {profile.letter ? (
            <a href={profile.letter.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-win-400 hover:underline">
              <FileText className="size-3.5" /> letter
            </a>
          ) : (
            <span className="text-amber-300">no letter</span>
          )}
        </>
      ) : (
        <span className="text-ink-400">Original name & salary hidden (organizer only)</span>
      )}
    </div>
  );
}

/** Final (or running) salary leaderboard used by the console and the results page. */
export function SalaryLeaderboard({
  standings,
  teams,
  currencySymbol,
  final,
  testId = "salary-leaderboard",
}: {
  standings: TeamStanding[];
  teams: LiveSnapshot["teams"];
  currencySymbol: string;
  final: boolean;
  testId?: string;
}) {
  const joint = standings.filter((x) => x.winner).length > 1;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid={testId}>
        <thead>
          <tr className="text-left text-[11px] tracking-widest text-ink-400 uppercase">
            <th className="py-2 pr-2">Rank</th>
            <th className="py-2 pr-2">Team</th>
            <th className="py-2 pr-2 text-right">Profiles purchased</th>
            <th className="py-2 pr-2 text-right">Combined annual offer amount</th>
            <th className="py-2 text-right">Credits left</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((st) => {
            const t = teams.find((x) => x.id === st.teamId);
            if (!t) return null;
            return (
              <tr key={st.teamId} className={cn("border-t border-ink-600/50", st.winner && final && "bg-gold-500/10")}>
                <td className="py-2 pr-2 font-display text-lg font-semibold text-white tabular-nums">{st.rank ?? "—"}</td>
                <td className="py-2 pr-2">
                  <span className="flex items-center gap-2">
                    <TeamLogo team={t} className="size-7 rounded-lg" />
                    <span className="font-semibold text-white">{t.name}</span>
                    {st.winner && final && (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-gold-300 uppercase">
                        <Trophy className="size-3.5" /> {joint ? "Joint winner" : "Winner"}
                      </span>
                    )}
                    {st.disqualified && <span className="text-[11px] font-bold text-loss-400 uppercase">Not ranked · below minimum squad</span>}
                  </span>
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">{st.profiles}</td>
                <td className="py-2 pr-2 text-right font-display text-lg font-semibold text-gold-300 tabular-nums">{formatUsd(st.total)}</td>
                <td className="py-2 text-right text-ink-300 tabular-nums">{formatMoney(st.creditsLeft, currencySymbol)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function VerifiedMark({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="inline-flex items-center gap-1 text-win-400">
      <BadgeCheck className="size-3.5" /> verified
    </span>
  ) : (
    <span className="text-amber-300">not verified</span>
  );
}
