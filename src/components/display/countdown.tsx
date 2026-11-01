"use client";

import { Timer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import type { CountdownState } from "@/lib/live";
import { DEFAULT_TIMER_LAYOUT, type TimerLayout } from "@/shared/types";

const vw = (min: number, v: number, max: number) => `clamp(${min}rem, ${v}vw, ${max}rem)`;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round2 = (v: number) => Math.round(v * 100) / 100;
const keyOf = (l: TimerLayout) => `${l.x}|${l.y}|${l.scale}`;

/** True when this browser has an organizer session (then the timer can be moved on the live screen). */
export function useIsOrganizer() {
  const [organizer, setOrganizer] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" })
      .then((r) => alive && setOrganizer(r.ok))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return organizer;
}

/** Saves the layout without the shared API client (no redirect to the login page on a projector). */
export async function saveTimerLayout(auctionId: string, layout: TimerLayout) {
  const r = await fetch(`/api/auctions/${auctionId}/timer-layout`, {
    method: "PUT",
    credentials: "same-origin",
    headers: { "content-type": "application/json", "x-tpl-request": "1" },
    body: JSON.stringify(layout),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
}

/**
 * The countdown on the live screen (client request, 1 Nov 2026: "the user can move the timer anywhere").
 * Default: next to the current-bid box, never on top of it. With a saved position (x/y in % of the screen)
 * it floats there on large screens; phones keep the default spot. A signed-in organizer can drag it to any
 * spot (saved for every screen at once) and double-click it to put it back.
 */
export function CountdownTimer({
  c,
  layout,
  auctionId,
  editable,
}: {
  c: CountdownState;
  layout: TimerLayout | undefined;
  auctionId: string;
  editable: boolean;
}) {
  const server = layout ?? DEFAULT_TIMER_LAYOUT;
  const [pending, setPending] = useState<TimerLayout | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [seenKey, setSeenKey] = useState(keyOf(server));
  if (seenKey !== keyOf(server)) {
    // the authoritative layout changed (our save arrived, or another organizer moved it)
    setSeenKey(keyOf(server));
    setPending(null);
  }
  const effective = pending ?? server;
  const saved = effective.x !== null && effective.y !== null ? { x: effective.x, y: effective.y } : null;
  const pos = drag ?? saved;
  const moved = useRef(false);

  useEffect(() => {
    if (!failed) return;
    const h = setTimeout(() => setFailed(false), 2500);
    return () => clearTimeout(h);
  }, [failed]);

  const commit = (next: TimerLayout) => {
    setPending(next);
    saveTimerLayout(auctionId, next).catch(() => {
      setPending(null);
      setFailed(true);
    });
  };

  const startDrag = (e: React.PointerEvent<HTMLElement>) => {
    if (!editable || e.button !== 0) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const startX = e.clientX;
    const startY = e.clientY;
    const toPct = (x: number, y: number) => ({
      x: clamp(((x - dx) / window.innerWidth) * 100, 1, 99),
      y: clamp(((y - dy) / window.innerHeight) * 100, 1, 99),
    });
    let last = toPct(e.clientX, e.clientY);
    moved.current = false;
    const move = (ev: PointerEvent) => {
      if (!moved.current && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
      moved.current = true;
      last = toPct(ev.clientX, ev.clientY);
      setDrag(last);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      setDrag(null);
      if (moved.current) commit({ x: round2(last.x), y: round2(last.y), scale: effective.scale });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  const reset = () => editable && commit({ ...DEFAULT_TIMER_LAYOUT, scale: effective.scale });

  const ring = (floating: boolean) => (
    <TimerRing
      c={c}
      scale={effective.scale}
      floating={floating}
      editable={editable}
      failed={failed}
      onPointerDown={startDrag}
      onDoubleClick={reset}
      testId={floating ? "display-timer-floating" : "display-timer"}
    />
  );

  return (
    <>
      {/* default spot (always used on phones) */}
      <div className={cn("shrink-0 self-center", pos && "lg:hidden")} data-testid="display-timer-slot">
        {ring(false)}
      </div>
      {pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="pointer-events-none fixed z-30 hidden -translate-x-1/2 -translate-y-1/2 lg:block"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            data-testid="display-timer-anchor"
          >
            <div className="pointer-events-auto">{ring(true)}</div>
          </div>,
          document.body,
        )}
    </>
  );
}

function TimerRing({
  c,
  scale,
  floating,
  editable,
  failed,
  onPointerDown,
  onDoubleClick,
  testId,
}: {
  c: CountdownState;
  scale: number;
  floating: boolean;
  editable: boolean;
  failed: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onDoubleClick: () => void;
  testId: string;
}) {
  const secs = Math.ceil(c.remainingMs / 1000);
  const r = 26;
  const circ = 2 * Math.PI * r;
  const danger = secs <= 5;
  const size = `max(${3 * scale}rem, ${5 * scale}vw)`;
  return (
    <div
      className={cn(
        "relative rounded-full",
        floating && "bg-ink-950/75 shadow-2xl ring-1 ring-white/10 backdrop-blur-sm",
        editable && "cursor-grab touch-none hover:outline-2 hover:outline-offset-4 hover:outline-gold-400/70 hover:outline-dashed active:cursor-grabbing",
        failed && "outline-2 outline-offset-4 outline-loss-500",
        c.timeUp && "animate-pulse",
      )}
      style={{ width: size, height: size }}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      title={editable ? "Drag to move the timer on every screen · double-click to put it back next to the bid" : undefined}
      role="timer"
      aria-label={c.timeUp ? "Time up" : `${secs} seconds left`}
      data-testid={testId}
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
      <span
        className="absolute inset-0 flex items-center justify-center font-display font-bold tabular-nums"
        style={{ fontSize: vw(0.9 * scale, 1.5 * scale, 2.4 * scale) }}
      >
        {c.timeUp ? <Timer className="size-1/2 text-loss-400" /> : secs}
      </span>
    </div>
  );
}
