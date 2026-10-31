"use client";

import { BarChart3, ChevronLeft, ExternalLink, LayoutDashboard, MonitorPlay, Radio, Settings2, Users, UsersRound, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { AuctionProvider, useAuction } from "@/components/admin/auction-context";
import { AuctionStatusBadge, Spinner } from "@/components/ui/misc";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "", label: "Overview", icon: LayoutDashboard },
  { href: "/teams", label: "Teams", icon: UsersRound },
  { href: "/players", label: "Candidates", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings2 },
  { href: "/live", label: "Live console", icon: Radio },
  { href: "/results", label: "Results & reports", icon: BarChart3 },
];

function Shell({ children }: { children: React.ReactNode }) {
  const { id, snapshot, conn } = useAuction();
  const pathname = usePathname();
  const base = `/admin/auctions/${id}`;
  if (!snapshot) return <Spinner className="py-24" label="Loading auction…" />;
  const a = snapshot.auction;

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <aside className="lg:sticky lg:top-22 lg:self-start">
        <Link href="/admin" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-ink-300 hover:text-white">
          <ChevronLeft className="size-4" /> All auctions
        </Link>
        <div className="panel mb-3 p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <AuctionStatusBadge status={a.status} />
            <span
              className={cn("flex items-center gap-1 text-[11px] font-semibold", conn === "live" ? "text-win-400" : "text-amber-300")}
              title="Real-time connection"
            >
              {conn === "live" ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
              {conn === "live" ? "Synced" : "Reconnecting"}
            </span>
          </div>
          <h1 className="font-display text-lg leading-tight font-semibold tracking-wide text-white uppercase">{a.name}</h1>
          <p className="mt-1 text-xs text-ink-400">
            {snapshot.teams.length} teams · {snapshot.stats.total} candidates · round {a.round}
          </p>
        </div>
        <nav className="panel flex gap-1 overflow-x-auto p-2 lg:flex-col" aria-label="Auction sections">
          {NAV.map((n) => {
            const href = base + n.href;
            const active = n.href === "" ? pathname === base : pathname.startsWith(href);
            return (
              <Link
                key={n.href}
                href={href}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                  active ? "bg-gold-500/15 text-gold-300 ring-1 ring-gold-500/40" : "text-ink-200 hover:bg-ink-700/60 hover:text-white",
                )}
              >
                <n.icon className="size-4" />
                {n.label}
                {n.href === "/live" && (a.status === "LIVE" || a.status === "PAUSED") && (
                  <span className="ml-auto size-2 animate-live-dot rounded-full bg-loss-400" />
                )}
              </Link>
            );
          })}
          <a
            href={`/display/${a.slug}`}
            target="_blank"
            rel="noreferrer"
            className="flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-volt-400 hover:bg-ink-700/60"
          >
            <MonitorPlay className="size-4" /> Open display <ExternalLink className="ml-auto size-3.5" />
          </a>
        </nav>
      </aside>
      <section className="min-w-0">{children}</section>
    </div>
  );
}

export default function AuctionLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  return (
    <AuctionProvider id={id}>
      <Shell>{children}</Shell>
    </AuctionProvider>
  );
}
