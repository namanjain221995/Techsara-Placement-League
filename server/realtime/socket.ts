import type { Server as HttpServer } from "node:http";
import { eq } from "drizzle-orm";
import { Server } from "socket.io";
import { z } from "zod";
import type { LiveSnapshot } from "../../src/shared/types";
import { adminFromToken, readCookie, SESSION_COOKIE } from "../auth/auth";
import { getDb } from "../db";
import { auctions } from "../db/schema";
import type { AuctionEngine, Broadcaster } from "../engine/engine";

/**
 * Real-time protocol (see docs/architecture/REALTIME_EVENT_PROTOCOL.md)
 *  client → server  "join"  {slug} (public display) | {auctionId} (organizer, needs session)
 *                   "sync"  {}                     → ack with the latest snapshot
 *                   "clock" {}                     → ack with server epoch ms
 *  server → client  "state" LiveSnapshot            (full, versioned; replaces client state)
 * Commands are NOT sent over the socket: they go through POST /api/auctions/:id/commands,
 * which validates, persists, then broadcasts "state" to the auction room.
 */
const joinSchema = z.union([z.object({ slug: z.string().min(1).max(120) }), z.object({ auctionId: z.uuid() })]);

export function createBroadcaster(): Broadcaster & { attach(io: Server): void } {
  let io: Server | null = null;
  return {
    attach(server) {
      io = server;
    },
    publish(snap: LiveSnapshot) {
      io?.to(room(snap.auction.id)).emit("state", snap);
    },
  };
}

const room = (auctionId: string) => `auction:${auctionId}`;

export function attachRealtime(httpServer: HttpServer, engine: () => AuctionEngine, broadcaster: ReturnType<typeof createBroadcaster>) {
  const io = new Server(httpServer, {
    path: "/socket.io",
    serveClient: false,
    pingInterval: 10_000,
    pingTimeout: 8_000,
    maxHttpBufferSize: 64 * 1024,
    destroyUpgrade: false, // leave other WebSocket upgrades (Next.js dev HMR) alone
    connectionStateRecovery: { maxDisconnectionDuration: 60_000, skipMiddlewares: false },
  });
  broadcaster.attach(io);

  io.on("connection", (socket) => {
    let joined: string | null = null;

    socket.on("join", async (raw: unknown, ack?: (r: unknown) => void) => {
      try {
        const parsed = joinSchema.safeParse(raw);
        if (!parsed.success) return ack?.({ ok: false, error: "BAD_REQUEST" });
        const db = getDb();
        let auctionId: string | null = null;
        if ("slug" in parsed.data) {
          const [a] = await db.select({ id: auctions.id }).from(auctions).where(eq(auctions.slug, parsed.data.slug)).limit(1);
          auctionId = a?.id ?? null;
        } else {
          const admin = await adminFromToken(readCookie(socket.handshake.headers.cookie, SESSION_COOKIE));
          if (!admin) return ack?.({ ok: false, error: "UNAUTHORIZED" });
          const [a] = await db.select({ id: auctions.id }).from(auctions).where(eq(auctions.id, parsed.data.auctionId)).limit(1);
          auctionId = a?.id ?? null;
        }
        if (!auctionId) return ack?.({ ok: false, error: "NOT_FOUND" });
        if (joined && joined !== auctionId) await socket.leave(room(joined));
        joined = auctionId;
        await socket.join(room(auctionId));
        ack?.({ ok: true, snapshot: await engine().snapshot(auctionId) });
      } catch (e) {
        console.error("[socket] join failed", e);
        ack?.({ ok: false, error: "INTERNAL" });
      }
    });

    socket.on("sync", async (_raw: unknown, ack?: (r: unknown) => void) => {
      if (!joined) return ack?.({ ok: false, error: "NOT_JOINED" });
      try {
        ack?.({ ok: true, snapshot: await engine().snapshot(joined) });
      } catch {
        ack?.({ ok: false, error: "INTERNAL" });
      }
    });

    socket.on("clock", (_raw: unknown, ack?: (r: unknown) => void) => ack?.({ now: Date.now() }));
  });

  return io;
}
