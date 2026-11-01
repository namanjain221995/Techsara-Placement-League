import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LiveSnapshot } from "../../src/shared/types";
import { Client, emitAck, nextState, setupLiveAuction, socket, startTestServer } from "./harness";

let srv: Awaited<ReturnType<typeof startTestServer>>;
let admin: Client;

beforeAll(async () => {
  srv = await startTestServer();
  admin = new Client(srv.base);
  expect((await admin.login()).status).toBe(200);
});
afterAll(async () => {
  await srv?.built.close();
});

describe("live-screen timer position (client request, 1 Nov 2026)", () => {
  it("lets an organizer move and resize the timer at any time; every screen follows at once", async () => {
    const { id, slug } = await setupLiveAuction(admin, { timerEnabled: true, timerSeconds: 120 }, 4);
    await admin.command(id, { type: "NEXT_PLAYER" });

    const display = socket(srv.base);
    const joined = await emitAck<{ ok: boolean; snapshot: LiveSnapshot }>(display, "join", { slug });
    expect(joined.snapshot.auction.timerLayout).toEqual({ x: null, y: null, scale: 1 }); // default: next to the bid

    // while LIVE, with a candidate on the block
    const moved = nextState(display, (s) => s.auction.timerLayout.x === 15.5);
    const r = await admin.req("PUT", `/api/auctions/${id}/timer-layout`, { x: 15.5, y: 74.25, scale: 1.5 });
    expect(r.status).toBe(200);
    expect((await moved).auction.timerLayout).toEqual({ x: 15.5, y: 74.25, scale: 1.5 });
    const pub = await new Client(srv.base).req<LiveSnapshot>("GET", `/api/public/auctions/${slug}`);
    expect(pub.body.auction.timerLayout).toEqual({ x: 15.5, y: 74.25, scale: 1.5 });
    expect(pub.body.lot).not.toBeNull(); // the candidate stays on the block

    // validation and access
    expect((await admin.req("PUT", `/api/auctions/${id}/timer-layout`, { x: 10, y: null, scale: 1 })).status).toBe(400);
    expect((await admin.req("PUT", `/api/auctions/${id}/timer-layout`, { x: 150, y: 10, scale: 1 })).status).toBe(400);
    const anon = new Client(srv.base);
    expect((await anon.req("PUT", `/api/auctions/${id}/timer-layout`, { x: 50, y: 50, scale: 1 })).status).toBe(401);
    expect((await admin.req("PUT", `/api/auctions/${id}/timer-layout`, { x: 50, y: 50, scale: 1 }, { csrf: false })).status).toBe(403);

    // back to the default spot; also allowed after the auction ended; cloned with the auction
    await admin.command(id, { type: "SKIP" });
    await admin.command(id, { type: "END_AUCTION" });
    expect((await admin.req("PUT", `/api/auctions/${id}/timer-layout`, { x: null, y: null, scale: 2 })).status).toBe(200);
    const snap = (await admin.req<LiveSnapshot>("GET", `/api/auctions/${id}/snapshot`)).body;
    expect(snap.auction.timerLayout).toEqual({ x: null, y: null, scale: 2 });
    const clone = (await admin.req("POST", `/api/auctions/${id}/clone`, { name: "Timer Copy" })).body.auction;
    expect(clone.timerLayout).toEqual({ x: null, y: null, scale: 2 });
    const audit = JSON.stringify((await admin.req("GET", `/api/auctions/${id}/audit`)).body.entries);
    expect(audit).toContain("auction.timer_layout");
    display.close();
  });
});
