import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LiveSnapshot } from "../../src/shared/types";
import { Client, emitAck, nextState, setupLiveAuction, socket, startTestServer } from "./harness";

let srv: Awaited<ReturnType<typeof startTestServer>>;
let admin: Client;

beforeAll(async () => {
  srv = await startTestServer();
  admin = new Client(srv.base);
  await admin.login();
});
afterAll(async () => {
  await srv?.built.close();
});

describe("real-time synchronisation", () => {
  it("pushes every change to the public display within milliseconds (client 05:19–05:35)", async () => {
    const { id, slug, teamIds } = await setupLiveAuction(admin);
    const display = socket(srv.base);
    const joined = await emitAck<{ ok: boolean; snapshot: LiveSnapshot }>(display, "join", { slug });
    expect(joined.ok).toBe(true);
    expect(joined.snapshot.auction.status).toBe("LIVE");

    const waitUp = nextState(display, (s) => s.event.type === "PLAYER_UP");
    await admin.command(id, { type: "NEXT_PLAYER" });
    const up = await waitUp;
    expect(up.lot).not.toBeNull();

    const latencies: number[] = [];
    for (const [i, t] of [teamIds[2], teamIds[4], teamIds[3]].entries()) {
      const wait = nextState(display, (s) => s.event.type === "BID_PLACED" && s.lot?.leadingTeamId === t);
      const t0 = performance.now();
      await admin.command(id, { type: "BID", teamId: t, amount: 1000 * (i + 1) });
      const s = await wait;
      latencies.push(performance.now() - t0);
      expect(s.lot!.currentBid).toBe(1000 * (i + 1));
    }
    console.log(`[realtime] command→display latency ms: ${latencies.map((l) => l.toFixed(1)).join(", ")}`);
    expect(Math.max(...latencies)).toBeLessThan(500);
    display.close();
  });

  it("refuses organizer rooms without a session and lets an unknown slug fail cleanly", async () => {
    const s = socket(srv.base);
    expect((await emitAck<{ ok: boolean; error: string }>(s, "join", { auctionId: "6c3f5f8e-7d1a-4a43-9f53-2d4a9c4a1b10" })).error).toBe("UNAUTHORIZED");
    expect((await emitAck<{ ok: boolean; error: string }>(s, "join", { slug: "does-not-exist" })).error).toBe("NOT_FOUND");
    s.close();
    const org = socket(srv.base, admin.cookie);
    const { id } = await setupLiveAuction(admin, {}, 4);
    expect((await emitAck<{ ok: boolean }>(org, "join", { auctionId: id })).ok).toBe(true);
    org.close();
  });

  it("recovers after a disconnect: a reconnecting screen gets the latest version", async () => {
    const { id, slug, teamIds } = await setupLiveAuction(admin);
    const first = socket(srv.base);
    const j1 = await emitAck<{ snapshot: LiveSnapshot }>(first, "join", { slug });
    first.close(); // projector Wi-Fi drops…
    await admin.command(id, { type: "NEXT_PLAYER" });
    await admin.command(id, { type: "BID", teamId: teamIds[0] });
    const again = socket(srv.base); // …and comes back
    const j2 = await emitAck<{ snapshot: LiveSnapshot }>(again, "join", { slug });
    expect(j2.snapshot.version).toBeGreaterThan(j1.snapshot.version);
    expect(j2.snapshot.lot!.leadingTeamId).toBe(teamIds[0]);
    const synced = await emitAck<{ ok: boolean; snapshot: LiveSnapshot }>(again, "sync", {});
    expect(synced.snapshot.version).toBe(j2.snapshot.version);
    again.close();
  });

  it("runs the countdown on the server, restarts it on every bid and flags time-up without selling", async () => {
    const { id, slug, teamIds } = await setupLiveAuction(admin, { timerEnabled: true, timerSeconds: 5 });
    const display = socket(srv.base);
    await emitAck(display, "join", { slug });
    const up = (await admin.command(id, { type: "NEXT_PLAYER" })).body.snapshot;
    expect(up.lot!.timer.enabled).toBe(true);
    expect(up.lot!.timer.endsAt! - up.serverNow).toBeGreaterThan(4500);
    await new Promise((r) => setTimeout(r, 2000));
    const bid = (await admin.command(id, { type: "BID", teamId: teamIds[1] })).body.snapshot;
    expect(bid.lot!.timer.endsAt! - bid.serverNow).toBeGreaterThan(4500); // restarted
    // pause freezes the remaining time
    const paused = (await admin.command(id, { type: "PAUSE" })).body.snapshot;
    expect(paused.lot!.timer.endsAt).toBeNull();
    expect(paused.lot!.timer.remainingMs).toBeGreaterThan(3000);
    await new Promise((r) => setTimeout(r, 1500));
    const resumed = (await admin.command(id, { type: "RESUME" })).body.snapshot;
    expect(resumed.lot!.timer.endsAt! - resumed.serverNow).toBeGreaterThan(3000);
    const timeUp = await nextState(display, (s) => s.event.type === "TIME_UP", 9000);
    expect(timeUp.lot!.timer.timeUp).toBe(true);
    expect(timeUp.lot!.currentBid).toBe(1000);
    expect(timeUp.stats.sold).toBe(0); // never auto-sold (open question Q-04)
    display.close();
  });
});

describe("crash recovery", () => {
  it("restores the live state from PostgreSQL after a server restart", async () => {
    const { id, teamIds } = await setupLiveAuction(admin);
    await admin.command(id, { type: "NEXT_PLAYER" });
    await admin.command(id, { type: "BID", teamId: teamIds[3], amount: 7000 });
    const before = (await admin.req<LiveSnapshot>("GET", `/api/auctions/${id}/snapshot`)).body;

    await srv.built.close(); // simulate a crash/restart (DB stops too)
    srv = await startTestServer();
    admin = new Client(srv.base);
    await admin.login();

    const after = (await admin.req<LiveSnapshot>("GET", `/api/auctions/${id}/snapshot`)).body;
    expect(after.version).toBe(before.version);
    expect(after.auction.status).toBe("LIVE");
    expect(after.lot).toMatchObject({ currentBid: 7000, leadingTeamId: teamIds[3], id: before.lot!.id });
    const sold = await admin.command(id, { type: "SOLD" });
    expect(sold.body.snapshot.lastResult).toMatchObject({ amount: 7000, teamId: teamIds[3] });
  });
});
