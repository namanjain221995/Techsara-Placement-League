"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import type { LiveCommand } from "@/shared/schemas";
import type { LiveSnapshot, TimerView } from "@/shared/types";
import { api } from "./api";

export type LiveTarget = { slug: string } | { auctionId: string };
export type ConnState = "connecting" | "live" | "reconnecting" | "error";

/**
 * Subscribe to an auction's live state. Every server message is a full, versioned snapshot;
 * older versions are ignored, a reconnect re-joins and receives the latest snapshot, and a
 * periodic "sync" is a safety net against any missed message.
 */
export function useLiveAuction(target: LiveTarget | null) {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [conn, setConn] = useState<ConnState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const version = useRef(0);
  const key = target ? ("slug" in target ? `slug:${target.slug}` : `id:${target.auctionId}`) : "";
  const [shownKey, setShownKey] = useState(key);
  if (shownKey !== key) {
    // a different auction: drop the old state before the new one arrives
    setShownKey(key);
    setSnapshot(null);
    setConn("connecting");
  }

  const accept = useCallback((snap: LiveSnapshot | null | undefined) => {
    if (!snap || snap.version < version.current) return;
    version.current = snap.version;
    setSnapshot(snap);
  }, []);

  useEffect(() => {
    if (!key) return;
    version.current = 0;
    const payload: LiveTarget = key.startsWith("slug:") ? { slug: key.slice(5) } : { auctionId: key.slice(3) };
    const socket = io({ path: "/socket.io", transports: ["websocket", "polling"], reconnectionDelay: 400, reconnectionDelayMax: 3000 });

    const join = () =>
      socket.emit("join", payload, (r: { ok: boolean; snapshot?: LiveSnapshot; error?: string }) => {
        if (r?.ok) {
          accept(r.snapshot);
          setConn("live");
          setError(null);
        } else {
          setConn("error");
          setError(r?.error ?? "ERROR");
        }
      });
    const syncClock = () => {
      const t0 = Date.now();
      socket.emit("clock", {}, (r: { now?: number }) => {
        const t1 = Date.now();
        if (r?.now) setClockOffset(r.now - (t0 + t1) / 2);
      });
    };

    socket.on("connect", () => {
      join();
      syncClock();
    });
    socket.on("disconnect", () => setConn("reconnecting"));
    socket.on("connect_error", () => setConn((c) => (c === "live" ? "reconnecting" : c)));
    socket.on("state", accept);
    const clockTimer = setInterval(syncClock, 30_000);
    const syncTimer = setInterval(() => {
      if (socket.connected) socket.emit("sync", {}, (r: { ok: boolean; snapshot?: LiveSnapshot }) => r?.ok && accept(r.snapshot));
    }, 15_000);
    return () => {
      clearInterval(clockTimer);
      clearInterval(syncTimer);
      socket.close();
    };
  }, [key, accept]);

  return { snapshot, conn, error, clockOffset, accept };
}

type WithoutId<T> = T extends unknown ? Omit<T, "commandId"> : never;
export type CommandInput = WithoutId<LiveCommand>;

/** Send a live command with a fresh idempotency key. Returns the authoritative snapshot. */
export async function sendCommand(auctionId: string, cmd: CommandInput) {
  return api.post<{ snapshot: LiveSnapshot; duplicate: boolean }>(`/auctions/${auctionId}/commands`, {
    ...cmd,
    commandId: crypto.randomUUID(),
  });
}

export interface CountdownState {
  remainingMs: number;
  fraction: number;
  running: boolean;
  timeUp: boolean;
}

/** Countdown derived from the server deadline and the measured clock offset. */
export function useCountdown(timer: TimerView | null | undefined, clockOffset: number): CountdownState | null {
  const [now, setNow] = useState(() => Date.now());
  const running = !!timer?.enabled && !!timer.endsAt && !timer.timeUp;
  useEffect(() => {
    if (!running) return;
    const h = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(h);
  }, [running, timer?.endsAt]);
  if (!timer?.enabled) return null;
  if (timer.timeUp) return { remainingMs: 0, fraction: 0, running: false, timeUp: true };
  if (timer.endsAt) {
    const rem = Math.max(0, timer.endsAt - (now + clockOffset));
    return { remainingMs: rem, fraction: Math.min(1, rem / timer.durationMs), running: true, timeUp: false };
  }
  if (timer.remainingMs !== null) return { remainingMs: timer.remainingMs, fraction: timer.remainingMs / timer.durationMs, running: false, timeUp: false };
  return null;
}
