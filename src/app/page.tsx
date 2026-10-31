"use client";

import { ArrowRight, Gavel, MonitorPlay, ShieldCheck, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const openDisplay = (e: React.FormEvent) => {
    e.preventDefault();
    const slug = code
      .trim()
      .replace(/^.*\/display\//, "")
      .replace(/\/$/, "");
    if (slug) router.push(`/display/${encodeURIComponent(slug)}`);
  };
  return (
    <div className="stage-bg relative min-h-dvh overflow-hidden">
      <div className="grid-lines pointer-events-none absolute inset-0" />
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Wordmark />
        <Link href="/admin">
          <Button variant="outline" size="sm">
            Organizer sign in <ArrowRight className="size-4" />
          </Button>
        </Link>
      </header>
      <main className="relative mx-auto grid max-w-6xl gap-12 px-6 pt-10 pb-20 lg:grid-cols-[1.2fr_1fr] lg:pt-20">
        <div>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-gold-500/10 px-3 py-1 text-xs font-bold tracking-[0.25em] text-gold-300 uppercase ring-1 ring-gold-500/30">
            <Gavel className="size-3.5" /> Live candidate auction
          </p>
          <h1 className="font-display text-5xl leading-[0.95] font-bold tracking-wide text-white uppercase sm:text-7xl">
            TechSara <span className="text-gold">Placement League</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-200">
            Teams bid a fixed purse on candidates, live on the big screen. The organizer runs the room from one console; every screen updates the instant a bid
            lands.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/admin">
              <Button variant="primary" size="lg">
                Open organizer console <ArrowRight className="size-4" />
              </Button>
            </Link>
          </div>
          <ul className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              { icon: Zap, t: "Real-time", d: "Bids reach the projector in milliseconds." },
              { icon: ShieldCheck, t: "Rules enforced", d: "Purse, max bid and squad limits checked on the server." },
              { icon: MonitorPlay, t: "Made for the big screen", d: "Readable from the back of the hall." },
            ].map((f) => (
              <li key={f.t} className="panel p-4">
                <f.icon className="mb-2 size-5 text-gold-400" />
                <div className="font-semibold text-white">{f.t}</div>
                <div className="mt-1 text-sm text-ink-300">{f.d}</div>
              </li>
            ))}
          </ul>
        </div>
        <form onSubmit={openDisplay} className="panel self-start p-6">
          <h2 className="font-display text-2xl tracking-wide text-white uppercase">Open a live screen</h2>
          <p className="mt-2 text-sm text-ink-300">Paste the display link or code from the organizer console. No sign-in needed.</p>
          <Input
            className="mt-5"
            placeholder="e.g. techsara-placement-league-1a2b3c"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-label="Display link or code"
          />
          <Button type="submit" variant="volt" className="mt-3 w-full" disabled={!code.trim()}>
            <MonitorPlay className="size-4" /> Open display
          </Button>
        </form>
      </main>
    </div>
  );
}
