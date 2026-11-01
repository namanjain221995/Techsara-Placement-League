"use client";

import { Move, RotateCcw, Timer } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { DEFAULT_TIMER_LAYOUT, type LiveSnapshot, type TimerLayout } from "@/shared/types";

/**
 * Where the default timer sits on a 16:9 live screen, for the map only: just left of the current-bid box
 * (which starts at 46.1% of the width, measured at 1920×1080 and 1536×864), 1% gap, ring = 5% × size.
 */
const defaultSpot = (scale: number) => ({ x: 45.1 - 2.5 * scale, y: 20.5 });
const SIZES: [string, number][] = [
  ["S", 0.75],
  ["M", 1],
  ["L", 1.5],
  ["XL", 2],
];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round2 = (v: number) => Math.round(v * 100) / 100;
const keyOf = (l: TimerLayout) => `${l.x}|${l.y}|${l.scale}`;

/**
 * Live console panel: move and resize the countdown on the live screen (client request, 1 Nov 2026).
 * The small screen below is a map of the live screen; drag the timer anywhere on it. Every screen follows at once.
 */
export function TimerLayoutPanel({ snapshot: s }: { snapshot: LiveSnapshot }) {
  const a = s.auction;
  const server = a.timerLayout ?? DEFAULT_TIMER_LAYOUT;
  const [pending, setPending] = useState<TimerLayout | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [seenKey, setSeenKey] = useState(keyOf(server));
  if (seenKey !== keyOf(server)) {
    setSeenKey(keyOf(server));
    setPending(null);
  }
  const box = useRef<HTMLDivElement>(null);
  const effective = pending ?? server;
  const custom = effective.x !== null && effective.y !== null;
  const pos = drag ?? (custom ? { x: effective.x as number, y: effective.y as number } : defaultSpot(effective.scale));

  const save = async (next: TimerLayout) => {
    setPending(next);
    try {
      await api.put(`/auctions/${a.id}/timer-layout`, next);
    } catch (e) {
      setPending(null);
      toast.error(errorMessage(e));
    }
  };

  const toPct = (clientX: number, clientY: number) => {
    const r = box.current!.getBoundingClientRect();
    return { x: round2(clamp(((clientX - r.left) / r.width) * 100, 1, 99)), y: round2(clamp(((clientY - r.top) / r.height) * 100, 1, 99)) };
  };
  const start = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    let last = toPct(e.clientX, e.clientY);
    setDrag(last);
    const move = (ev: PointerEvent) => {
      last = toPct(ev.clientX, ev.clientY);
      setDrag(last);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      setDrag(null);
      save({ x: last.x, y: last.y, scale: effective.scale });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  return (
    <div className="panel p-4" data-testid="timer-layout">
      <h3 className="mb-1 flex items-center gap-2 text-xs font-bold tracking-widest text-ink-300 uppercase">
        <Timer className="size-4" /> Timer on the live screen
      </h3>
      <p className="mb-3 text-[11px] text-ink-400">
        Drag the timer to any spot on this map of the live screen — every screen follows at once.
        {!a.timerEnabled && <span className="block text-amber-300">The countdown is off: switch it on in Settings to show it.</span>}
      </p>
      <div
        ref={box}
        className="relative aspect-video w-full cursor-crosshair touch-none overflow-hidden rounded-lg bg-ink-950 ring-1 ring-ink-600 select-none"
        onPointerDown={start}
        data-testid="timer-layout-map"
        role="application"
        aria-label="Live screen map: drag to place the timer"
      >
        {/* simplified live screen: header, candidate panel with photo + current bid, team board, ticker */}
        <div className="absolute inset-x-[2%] top-[2.5%] h-[6%] rounded-sm bg-ink-700/70" />
        <div className="absolute top-[11%] bottom-[8%] left-[2%] w-[57%] rounded-sm bg-ink-800/80" />
        <div className="absolute top-[13%] left-[3.3%] h-[23%] w-[13%] rounded-sm bg-ink-600/70" />
        <div className="absolute top-[14%] left-[18%] h-[5%] w-[20%] rounded-sm bg-ink-600/50" />
        <div className="absolute top-[11.8%] left-[46%] h-[17.5%] w-[11.5%] rounded-sm bg-gold-500/25 ring-1 ring-gold-500/50" title="Current bid" />
        <div className="absolute top-[40%] bottom-[10%] left-[3.3%] w-[54.4%] rounded-sm bg-ink-700/40" />
        <div className="absolute top-[11%] right-[2%] bottom-[8%] w-[38%] rounded-sm bg-ink-800/80" />
        <div className="absolute inset-x-0 bottom-0 h-[5%] bg-ink-700/70" />
        <span className="pointer-events-none absolute top-[30%] left-[46%] text-[9px] font-bold tracking-wide text-gold-300/80 uppercase">Bid</span>
        <span
          className={cn(
            "pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-ink-950 text-gold-300 shadow-lg ring-2",
            drag ? "ring-gold-300" : custom ? "ring-gold-500" : "ring-ink-400",
          )}
          style={{ left: `${pos.x}%`, top: `${pos.y}%`, width: `${Math.max(5 * effective.scale, 4)}%`, aspectRatio: "1" }}
          data-testid="timer-marker"
          data-x={pos.x}
          data-y={pos.y}
        >
          <Timer className="size-1/2" />
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-ink-300">Size</span>
        {SIZES.map(([label, v]) => (
          <button
            key={label}
            type="button"
            aria-pressed={effective.scale === v}
            onClick={() => save({ ...effective, scale: v })}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-bold ring-1",
              effective.scale === v ? "bg-gold-500/15 text-gold-300 ring-gold-500/50" : "text-ink-300 ring-ink-600 hover:text-white",
            )}
            data-testid={`timer-size-${label}`}
          >
            {label}
          </button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => save({ ...DEFAULT_TIMER_LAYOUT, scale: effective.scale })}
          disabled={!custom}
          data-testid="timer-reset"
        >
          <RotateCcw className="size-4" /> Next to the bid
        </Button>
      </div>
      <p className="mt-2 flex items-start gap-1.5 text-[11px] text-ink-400">
        <Move className="mt-0.5 size-3 shrink-0" />
        You can also drag the timer directly on the live screen in a browser where you are signed in; double-click it there to put it back. Phones always show
        it next to the bid.
      </p>
    </div>
  );
}
