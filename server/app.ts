import http from "node:http";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import { apiRouter } from "./api/router";
import { ensureInitialAdmin } from "./auth/auth";
import { config } from "./config";
import { closeDb } from "./db";
import { bootstrapDatabase, stopEmbeddedDatabase } from "./db/bootstrap";
import { AuctionEngine } from "./engine/engine";
import { setEngine } from "./engine/instance";
import { attachRealtime, createBroadcaster } from "./realtime/socket";
import { errorHandler } from "./util/errors";

export interface BuiltServer {
  server: http.Server;
  engine: AuctionEngine;
  close: () => Promise<void>;
}

/**
 * Build the whole backend: database (embedded or external) → migrations → first admin →
 * engine → Express API → Socket.IO → (optionally) Next.js UI. Used by server/index.ts and by
 * the integration tests (withNext: false).
 */
export async function buildServer(opts: { withNext: boolean; quietDb?: boolean }): Promise<BuiltServer> {
  const db = await bootstrapDatabase({ quiet: opts.quietDb });
  await ensureInitialAdmin();

  const broadcaster = createBroadcaster();
  const engine = new AuctionEngine(db, broadcaster);
  setEngine(engine);
  const recovered = await engine.recover();
  if (recovered) console.log(`[engine] recovered ${recovered} live auction(s) from the database`);

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  app.use(
    helmet({
      contentSecurityPolicy: false, // Next.js injects inline bootstrap scripts; see SECURITY_DESIGN.md
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "same-origin" },
    }),
  );
  app.use(cookieParser());
  app.use("/api", apiRouter());
  app.use(errorHandler);

  let nextApp: { close?: () => Promise<void> } | null = null;
  const server = http.createServer(app);

  if (opts.withNext) {
    const { default: next } = await import("next");
    const n = next({ dev: config.dev, dir: process.cwd(), httpServer: server, hostname: "localhost", port: config.port });
    await n.prepare();
    const handle = n.getRequestHandler();
    app.all("/{*splat}", (req, res) => handle(req, res));
    nextApp = n as unknown as { close?: () => Promise<void> };
  }

  const io = attachRealtime(server, () => engine, broadcaster);

  return {
    server,
    engine,
    close: async () => {
      engine.shutdown();
      await new Promise<void>((r) => io.close(() => r()));
      await new Promise<void>((r) => server.close(() => r()));
      await nextApp?.close?.().catch(() => undefined);
      await closeDb();
      await stopEmbeddedDatabase();
    },
  };
}
