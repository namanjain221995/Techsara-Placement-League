import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import { buildServer, type BuiltServer } from "../../server/app";
import type { LiveSnapshot } from "../../src/shared/types";

export async function startTestServer() {
  const built: BuiltServer = await buildServer({ withNext: false, quietDb: true });
  await new Promise<void>((r) => built.server.listen(0, "127.0.0.1", r));
  const port = (built.server.address() as AddressInfo).port;
  return { built, base: `http://127.0.0.1:${port}` };
}

export interface Res<T = any> {
  status: number;
  body: T;
}

export class Client {
  cookie = "";
  constructor(public base: string) {}

  async req<T = any>(method: string, path: string, body?: unknown, opts: { csrf?: boolean } = {}): Promise<Res<T>> {
    const headers: Record<string, string> = {};
    if (opts.csrf !== false) headers["x-tpl-request"] = "1";
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.cookie) headers.cookie = this.cookie;
    const r = await fetch(this.base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = r.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    const text = await r.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* binary or text */
    }
    return { status: r.status, body: parsed as T };
  }

  /** Multipart upload (field "file"), like the organizer UI. */
  async upload<T = any>(path: string, data: Buffer | string, name: string, type: string): Promise<Res<T>> {
    const fd = new FormData();
    fd.append("file", new Blob([typeof data === "string" ? data : new Uint8Array(data)], { type }), name);
    const headers: Record<string, string> = { "x-tpl-request": "1" };
    if (this.cookie) headers.cookie = this.cookie;
    const r = await fetch(this.base + path, { method: "POST", headers, body: fd });
    const text = await r.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: r.status, body: parsed as T };
  }

  login(username = "admin", password = "integration-test-password") {
    return this.req("POST", "/api/auth/login", { username, password });
  }

  command(auctionId: string, cmd: Record<string, unknown>, commandId: string = crypto.randomUUID()) {
    return this.req<any>("POST", `/api/auctions/${auctionId}/commands`, { commandId, ...cmd });
  }
}

export const TEAMS = [
  { name: "Chennai Strikers", shortName: "CHS", color: "#F5B83D", members: ["Aarav", "Meera"] },
  { name: "Mumbai Mavericks", shortName: "MUM", color: "#2F7DF6", members: ["Kabir", "Isha"] },
  { name: "Bengaluru Blazers", shortName: "BLR", color: "#E5484D", members: ["Rohan", "Tara"] },
  { name: "Gujarat Giants", shortName: "GUJ", color: "#14B8A6", members: ["Vihaan", "Anaya"] },
  { name: "Delhi Dynamos", shortName: "DEL", color: "#8B5CF6", members: ["Aman", "Neha"] },
];

/** The client's configuration (video 03:16): 5 teams, 20 candidates, $25M, base $1M, squad 3–9. */
export async function setupLiveAuction(c: Client, over: Record<string, unknown> = {}, playerCount = 20) {
  const created = await c.req("POST", "/api/auctions", { name: `Test League ${crypto.randomBytes(3).toString("hex")}` });
  const id: string = created.body.auction.id;
  const settings = await c.req("PUT", `/api/auctions/${id}/settings`, {
    name: created.body.auction.name,
    currencySymbol: "$",
    purse: 25000,
    basePrice: 1000,
    bidIncrement: 1000,
    minSquad: 3,
    maxSquad: 9,
    timerEnabled: false,
    timerSeconds: 30,
    poolOrder: "SEQUENTIAL",
    roles: ["Batsman", "Bowler", "All-Rounder", "Wicket Keeper"],
    ...over,
  });
  if (settings.status !== 200) throw new Error(`settings failed: ${JSON.stringify(settings.body)}`);
  const teamIds: string[] = [];
  for (const t of TEAMS) teamIds.push((await c.req("POST", `/api/auctions/${id}/teams`, t)).body.team.id);
  for (let i = 1; i <= playerCount; i++)
    await c.req("POST", `/api/auctions/${id}/players`, {
      name: `Candidate ${i}`,
      role: i % 2 ? "All-Rounder" : "Batsman",
      description: `• Experience: ${3 + (i % 4)} years\n• Niche: Track ${i}`,
    });
  const lock = await c.req("POST", `/api/auctions/${id}/lock`);
  if (lock.status !== 200) throw new Error(`lock failed: ${JSON.stringify(lock.body)}`);
  const live = await c.command(id, { type: "GO_LIVE" });
  if (live.status !== 200) throw new Error(`go live failed: ${JSON.stringify(live.body)}`);
  return { id, slug: created.body.auction.slug as string, teamIds };
}

export function socket(base: string, cookie?: string): Socket {
  return connect(base, { transports: ["websocket"], forceNew: true, reconnection: false, extraHeaders: cookie ? { cookie } : undefined });
}

export function emitAck<T = any>(s: Socket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => s.emit(event, payload, (r: T) => resolve(r)));
}

export function nextState(s: Socket, predicate: (snap: LiveSnapshot) => boolean = () => true, timeoutMs = 5000): Promise<LiveSnapshot> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      s.off("state", on);
      reject(new Error("timed out waiting for state"));
    }, timeoutMs);
    const on = (snap: LiveSnapshot) => {
      if (!predicate(snap)) return;
      clearTimeout(timer);
      s.off("state", on);
      resolve(snap);
    };
    s.on("state", on);
  });
}

export { samplePdf, samplePng } from "../fixtures/letters";
