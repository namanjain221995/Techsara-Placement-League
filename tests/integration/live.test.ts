import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LiveSnapshot } from "../../src/shared/types";
import { Client, setupLiveAuction, startTestServer } from "./harness";

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

const team = (s: LiveSnapshot, id: string) => s.teams.find((t) => t.id === id)!;

describe("authentication & authorization", () => {
  it("rejects anonymous organizer calls, bad passwords and cross-site posts", async () => {
    const anon = new Client(srv.base);
    expect((await anon.req("GET", "/api/auctions")).status).toBe(401);
    expect((await anon.login("admin", "wrong")).status).toBe(401);
    expect((await anon.req("POST", "/api/auth/login", { username: "admin", password: "integration-test-password" }, { csrf: false })).status).toBe(403);
    const ok = await anon.login();
    expect(ok.status).toBe(200);
    expect(ok.body.admin.username).toBe("admin");
    expect((await anon.req("POST", "/api/auctions", { name: "x" }, { csrf: false })).status).toBe(403);
    await anon.req("POST", "/api/auth/logout");
    expect((await anon.req("GET", "/api/auctions")).status).toBe(401);
  });

  it("validates input on the server", async () => {
    const r = await admin.req("POST", "/api/auctions", { name: "" });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("VALIDATION_FAILED");
  });
});

describe("setup", () => {
  it("creates, configures, clones and locks an auction; money settings freeze after lock", async () => {
    const { body } = await admin.req("POST", "/api/auctions", { name: "Setup Check" });
    const id = body.auction.id;
    expect(body.auction.status).toBe("DRAFT");
    expect((await admin.req("POST", `/api/auctions/${id}/lock`)).body.error.code).toBe("SETUP_INCOMPLETE");
    await admin.req("POST", `/api/auctions/${id}/teams`, { name: "Alpha", shortName: "alp", color: "#112233", members: ["A", "B"] });
    await admin.req("POST", `/api/auctions/${id}/teams`, { name: "Beta", shortName: "BET", color: "#445566", members: [] });
    const p = await admin.req("POST", `/api/auctions/${id}/players`, { name: "Cand One", role: "Bowler", description: "Line 1\n• bullet\n\n  indented" });
    expect(p.status).toBe(201);
    expect(p.body.player.description).toBe("Line 1\n• bullet\n\n  indented"); // R-PLAYER-04: formatting preserved
    const teams = (await admin.req("GET", `/api/auctions/${id}/teams`)).body.teams;
    expect(teams[0].shortName).toBe("ALP");
    expect(teams[0].maxBid).toBe(23000);

    const clone = await admin.req("POST", `/api/auctions/${id}/clone`, { name: "Setup Check (Copy)" });
    expect(clone.status).toBe(201);
    const cloned = await admin.req("GET", `/api/auctions/${clone.body.auction.id}`);
    expect(cloned.body.counts).toMatchObject({ teams: 2, players: 1 });

    expect((await admin.req("POST", `/api/auctions/${id}/lock`)).status).toBe(200);
    const detail = (await admin.req("GET", `/api/auctions/${id}`)).body.auction;
    const changePurse = await admin.req("PUT", `/api/auctions/${id}/settings`, { ...detail, purse: 30000 });
    expect(changePurse.body.error.code).toBe("CONFIG_LOCKED");
    const rename = await admin.req("PUT", `/api/auctions/${id}/settings`, { ...detail, name: "Setup Check Renamed" });
    expect(rename.status).toBe(200);
    expect((await admin.req("POST", `/api/auctions/${id}/teams`, { name: "Gamma", shortName: "GAM", color: "#778899" })).body.error.code).toBe("CONFIG_LOCKED");
    // cosmetic edits stay possible (R-TEAM-02)
    expect((await admin.req("PUT", `/api/teams/${teams[1].id}`, { name: "Beta Prime", shortName: "BTP", color: "#000000", members: ["Z"] })).status).toBe(200);
    expect((await admin.req("POST", `/api/auctions/${id}/unlock`)).status).toBe(200);
  });
});

describe("live auction — the flow demonstrated in the client video", () => {
  it("replays 04:03–05:00: opening bid at base, raise to $2M, SOLD, purse/max bid/squad update", async () => {
    const { id, teamIds } = await setupLiveAuction(admin);
    const [, , blr, , del] = teamIds;
    let r = await admin.command(id, { type: "NEXT_PLAYER" });
    expect(r.status).toBe(200);
    expect(r.body.snapshot.lot!.currentBid).toBeNull();
    expect(r.body.snapshot.lot!.basePrice).toBe(1000);

    r = await admin.command(id, { type: "BID", teamId: blr }); // one tap → base price
    expect(r.body.snapshot.lot!.currentBid).toBe(1000);
    expect(r.body.snapshot.lot!.leadingTeamId).toBe(blr);

    r = await admin.command(id, { type: "BID", teamId: del, amount: 2000 });
    expect(r.body.snapshot.lot!.currentBid).toBe(2000);
    expect(r.body.snapshot.event.type).toBe("BID_PLACED");

    r = await admin.command(id, { type: "SOLD" });
    const s = r.body.snapshot;
    expect(s.lot).toBeNull();
    expect(s.lastResult).toMatchObject({ result: "SOLD", teamId: del, amount: 2000 });
    expect(team(s, del)).toMatchObject({ remaining: 23000, squadCount: 1, maxBid: 22000, spent: 2000 });
    expect(team(s, blr)).toMatchObject({ remaining: 25000, squadCount: 0, maxBid: 23000 });
    expect(s.stats).toMatchObject({ sold: 1, pool: 19, total: 20 });
  });

  it("enforces the custom-bid ceiling: 24 rejected, 23 accepted (client 08:11–08:56)", async () => {
    const { id, teamIds } = await setupLiveAuction(admin);
    await admin.command(id, { type: "NEXT_PLAYER" });
    await admin.command(id, { type: "BID", teamId: teamIds[3], amount: 2000 });
    const over = await admin.command(id, { type: "BID", teamId: teamIds[0], amount: 24000 });
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe("EXCEEDS_MAX_BID");
    expect(over.body.error.message).toContain("$23M");
    const ten = await admin.command(id, { type: "BID", teamId: teamIds[2], amount: 10000 });
    expect(ten.status).toBe(200);
    const ok = await admin.command(id, { type: "BID", teamId: teamIds[0], amount: 23000 });
    expect(ok.status).toBe(200);
    expect(ok.body.snapshot.lot!.currentBid).toBe(23000);
  });

  it("rejects bids that are not above the current bid, self-outbids, and bids while paused", async () => {
    const { id, teamIds } = await setupLiveAuction(admin);
    expect((await admin.command(id, { type: "BID", teamId: teamIds[0] })).body.error.code).toBe("NO_PLAYER_ON_BLOCK");
    await admin.command(id, { type: "NEXT_PLAYER" });
    await admin.command(id, { type: "BID", teamId: teamIds[0], amount: 3000 });
    expect((await admin.command(id, { type: "BID", teamId: teamIds[1], amount: 3000 })).body.error.code).toBe("NOT_ABOVE_CURRENT_BID");
    expect((await admin.command(id, { type: "BID", teamId: teamIds[0], amount: 4000 })).body.error.code).toBe("ALREADY_LEADING");
    await admin.command(id, { type: "PAUSE" });
    expect((await admin.command(id, { type: "BID", teamId: teamIds[1] })).body.error.code).toBe("AUCTION_PAUSED");
    await admin.command(id, { type: "RESUME" });
    const r = await admin.command(id, { type: "BID", teamId: teamIds[1] });
    expect(r.body.snapshot.lot!.currentBid).toBe(4000); // one tap = current + $1M step
  });

  it("is idempotent: the same commandId is applied once", async () => {
    const { id, teamIds } = await setupLiveAuction(admin);
    await admin.command(id, { type: "NEXT_PLAYER" });
    const cid = crypto.randomUUID();
    const a = await admin.command(id, { type: "BID", teamId: teamIds[0] }, cid);
    const b = await admin.command(id, { type: "BID", teamId: teamIds[0] }, cid);
    expect(a.body.duplicate).toBe(false);
    expect(b.status).toBe(200);
    expect(b.body.duplicate).toBe(true);
    expect(b.body.snapshot.lot!.bids).toHaveLength(1);
    expect(b.body.snapshot.version).toBe(a.body.snapshot.version);
  });

  it("serialises simultaneous bids: exactly one of ten identical raises is accepted", async () => {
    const { id, teamIds } = await setupLiveAuction(admin);
    await admin.command(id, { type: "NEXT_PLAYER" });
    await admin.command(id, { type: "BID", teamId: teamIds[0] }); // $1M
    const burst = await Promise.all(Array.from({ length: 10 }, (_, i) => admin.command(id, { type: "BID", teamId: teamIds[1 + (i % 4)], amount: 2000 })));
    expect(burst.filter((r) => r.status === 200)).toHaveLength(1);
    expect(burst.filter((r) => r.status === 409).every((r) => ["NOT_ABOVE_CURRENT_BID", "ALREADY_LEADING"].includes(r.body.error.code))).toBe(true);
    const snap = (await admin.req<LiveSnapshot>("GET", `/api/auctions/${id}/snapshot`)).body;
    expect(snap.lot!.bids.map((b) => b.amount)).toEqual([2000, 1000]);
  });

  it("serialises simultaneous SOLD + BID so a candidate is never sold twice", async () => {
    const { id, teamIds } = await setupLiveAuction(admin);
    await admin.command(id, { type: "NEXT_PLAYER" });
    await admin.command(id, { type: "BID", teamId: teamIds[0] });
    const [sold1, sold2, late] = await Promise.all([
      admin.command(id, { type: "SOLD" }),
      admin.command(id, { type: "SOLD" }),
      admin.command(id, { type: "BID", teamId: teamIds[1] }),
    ]);
    expect([sold1, sold2].filter((r) => r.status === 200)).toHaveLength(1);
    const snap = (await admin.req<LiveSnapshot>("GET", `/api/auctions/${id}/snapshot`)).body;
    expect(snap.stats.sold).toBe(1);
    const spent = snap.teams.reduce((s, t) => s + t.spent, 0);
    expect(spent).toBe(snap.lastResult!.amount);
    if (late.status === 200) expect(snap.lastResult).toMatchObject({ amount: 2000, teamId: teamIds[1] });
    else expect(snap.lastResult).toMatchObject({ amount: 1000, teamId: teamIds[0] });
  });

  it("undo restores the previous leader; unsold/skip/disqualify close the lot correctly", async () => {
    const { id, teamIds } = await setupLiveAuction(admin);
    await admin.command(id, { type: "NEXT_PLAYER" });
    await admin.command(id, { type: "BID", teamId: teamIds[0] });
    await admin.command(id, { type: "BID", teamId: teamIds[1] });
    let r = await admin.command(id, { type: "UNDO_BID" });
    expect(r.body.snapshot.lot).toMatchObject({ currentBid: 1000, leadingTeamId: teamIds[0] });
    r = await admin.command(id, { type: "UNDO_BID" });
    expect(r.body.snapshot.lot).toMatchObject({ currentBid: null, leadingTeamId: null });
    expect((await admin.command(id, { type: "UNDO_BID" })).body.error.code).toBe("NO_BIDS");
    expect((await admin.command(id, { type: "SOLD" })).body.error.code).toBe("NO_BIDS");
    r = await admin.command(id, { type: "UNSOLD" });
    expect(r.body.snapshot.stats).toMatchObject({ unsold: 1, pool: 19 });
    await admin.command(id, { type: "NEXT_PLAYER" });
    r = await admin.command(id, { type: "SKIP" });
    expect(r.body.snapshot.stats).toMatchObject({ unsold: 1, pool: 19 });
    await admin.command(id, { type: "NEXT_PLAYER" });
    r = await admin.command(id, { type: "DISQUALIFY_PLAYER" });
    expect(r.body.snapshot.stats).toMatchObject({ disqualified: 1, pool: 18 });
  });

  it("enforces the maximum squad and re-auctions unsold candidates in the next round", async () => {
    const { id, teamIds } = await setupLiveAuction(admin, { maxSquad: 2, minSquad: 1 }, 4);
    for (let i = 0; i < 2; i++) {
      await admin.command(id, { type: "NEXT_PLAYER" });
      await admin.command(id, { type: "BID", teamId: teamIds[0] });
      await admin.command(id, { type: "SOLD" });
    }
    await admin.command(id, { type: "NEXT_PLAYER" });
    expect((await admin.command(id, { type: "BID", teamId: teamIds[0] })).body.error.code).toBe("SQUAD_FULL");
    await admin.command(id, { type: "UNSOLD" });
    await admin.command(id, { type: "NEXT_PLAYER" });
    await admin.command(id, { type: "UNSOLD" });
    expect((await admin.command(id, { type: "NEXT_PLAYER" })).body.error.code).toBe("POOL_EMPTY");
    const r = await admin.command(id, { type: "NEXT_ROUND" });
    expect(r.body.snapshot.auction.round).toBe(2);
    expect(r.body.snapshot.stats).toMatchObject({ pool: 2, unsold: 0 });
  });

  it("disqualifies teams below the minimum squad when the auction ends (client 06:53–07:08)", async () => {
    const { id, teamIds } = await setupLiveAuction(admin, {}, 20);
    for (let i = 0; i < 3; i++) {
      await admin.command(id, { type: "NEXT_PLAYER" });
      await admin.command(id, { type: "BID", teamId: teamIds[0] });
      await admin.command(id, { type: "SOLD" });
    }
    await admin.command(id, { type: "NEXT_PLAYER" });
    expect((await admin.command(id, { type: "END_AUCTION" })).body.error.code).toBe("LOT_OPEN");
    await admin.command(id, { type: "BID", teamId: teamIds[1] });
    await admin.command(id, { type: "SOLD" });
    const r = await admin.command(id, { type: "END_AUCTION" });
    expect(r.status).toBe(200);
    const s = r.body.snapshot;
    expect(s.auction.status).toBe("COMPLETED");
    expect(team(s, teamIds[0]).disqualified).toBe(false); // 3 candidates
    expect(team(s, teamIds[1]).disqualified).toBe(true); // 1 candidate
    expect(team(s, teamIds[4]).disqualified).toBe(true); // 0 candidates
    expect((await admin.command(id, { type: "NEXT_PLAYER" })).body.error.code).toBe("INVALID_STATE");
    const results = await admin.req("GET", `/api/auctions/${id}/results`);
    expect(results.body.teams.find((t: { id: string }) => t.id === teamIds[0]).players).toHaveLength(3);
    const xlsx = await fetch(`${srv.base}/api/auctions/${id}/export.xlsx`, { headers: { cookie: admin.cookie } });
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers.get("content-type")).toContain("spreadsheetml");
    const audit = await admin.req("GET", `/api/auctions/${id}/audit`);
    expect(audit.body.entries.some((e: { action: string }) => e.action === "live.end_auction")).toBe(true);
  });

  it("supports manual corrections with purse refunds (assign / return to pool)", async () => {
    const { id, teamIds } = await setupLiveAuction(admin);
    const players = (await admin.req("GET", `/api/auctions/${id}/players`)).body.players;
    const p = players[5].id;
    expect((await admin.req("POST", `/api/players/${p}/override`, { action: "ASSIGN", teamId: teamIds[2], amount: 24000 })).body.error.code).toBe(
      "EXCEEDS_MAX_BID",
    );
    expect((await admin.req("POST", `/api/players/${p}/override`, { action: "ASSIGN", teamId: teamIds[2], amount: 5000 })).status).toBe(200);
    let snap = (await admin.req<LiveSnapshot>("GET", `/api/auctions/${id}/snapshot`)).body;
    expect(team(snap, teamIds[2])).toMatchObject({ spent: 5000, squadCount: 1 });
    expect((await admin.req("POST", `/api/players/${p}/override`, { action: "RETURN_TO_POOL" })).status).toBe(200);
    snap = (await admin.req<LiveSnapshot>("GET", `/api/auctions/${id}/snapshot`)).body;
    expect(team(snap, teamIds[2])).toMatchObject({ spent: 0, squadCount: 0, maxBid: 23000 });
  });
});
