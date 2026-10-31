import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LiveSnapshot, PrivatePlayerView, TeamStanding } from "../../src/shared/types";
import { Client, emitAck, samplePdf, samplePng, setupLiveAuction, socket, startTestServer } from "./harness";

/**
 * Client request (1 Nov 2026): the winner is the team whose purchased profiles have the highest
 * COMBINED ACTUAL ANNUAL SALARY. Salaries, original names and offer letters stay hidden from the
 * audience until the operator runs the Final Reveal.
 */
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

const SALARY: Record<number, number> = {
  1: 150_000, // CHS
  2: 141_000, // CHS
  3: 140_000, // CHS → 3 profiles, $431,000 (the client's example)
  4: 100_000, // MUM
  5: 100_000, // MUM
  6: 100_000, // MUM
  7: 100_000, // MUM → 4 profiles, $400,000
  8: 987_654, // stays UNSOLD → never counts
  9: 250_000, // BLR buys, correction returns it, then assigned to GUJ
};
const ORIGINAL = (n: number) => `Zephyrine Original ${n}`;

const standing = (rows: TeamStanding[] | undefined, teamId: string) => rows!.find((r) => r.teamId === teamId)!;
const hidden = (s: LiveSnapshot, teamId: string) => standing(s.private?.standings, teamId);

async function orgSnapshot(id: string) {
  return (await admin.req<LiveSnapshot>("GET", `/api/auctions/${id}/snapshot`)).body;
}
async function publicSnapshot(slug: string) {
  return (await new Client(srv.base).req<LiveSnapshot>("GET", `/api/public/auctions/${slug}`)).body;
}
async function setPrivate(playerId: string, data: { originalName?: string | null; annualSalary?: number | null; salaryVerified?: boolean }) {
  const players: PrivatePlayerView[] = (await admin.req("GET", `/api/auctions/${currentId}/players`)).body.players;
  const p = players.find((x) => x.id === playerId)!;
  return admin.req("PUT", `/api/players/${playerId}`, { name: p.name, role: p.role, description: p.description, ...data });
}
async function publicLetter(slug: string, playerId: string) {
  return fetch(`${srv.base}/api/public/auctions/${slug}/reveal/${playerId}/offer-letter`);
}
/** Nothing private may appear in a payload meant for the audience. */
function expectNoSecrets(payload: unknown) {
  const json = JSON.stringify(payload);
  expect(json).not.toContain("Zephyrine");
  expect(json).not.toMatch(/"annualSalary":\d/);
  expect(json).not.toMatch(/"originalName":"/);
  expect(json).not.toContain("offer-letter");
  expect(json).not.toContain('"private"');
  expect(json).not.toContain("987654");
}

let currentId = "";

describe("hidden salary scoring and the final reveal", () => {
  it("runs the whole event: hidden totals while bidding, corrections, gated reveal, final leaderboard", async () => {
    const { id, slug, teamIds } = await setupLiveAuction(admin, { minSquad: 1 }, 12);
    currentId = id;
    const [CHS, MUM, BLR, GUJ, DEL] = teamIds;
    const players: PrivatePlayerView[] = (await admin.req("GET", `/api/auctions/${id}/players`)).body.players;
    const byNo = (n: number) => players.find((p) => p.number === n)!;

    // ---- private data entered after locking (allowed until the reveal starts); #3 is left without a salary for now
    for (const [n, salary] of Object.entries(SALARY)) {
      if (Number(n) === 3) continue;
      const r = await setPrivate(byNo(Number(n)).id, { originalName: ORIGINAL(Number(n)), annualSalary: salary, salaryVerified: true });
      expect(r.status).toBe(200);
      expect(r.body.player).toMatchObject({ originalName: ORIGINAL(Number(n)), annualSalary: salary, salaryVerified: true });
    }
    await setPrivate(byNo(3).id, { originalName: ORIGINAL(3) });
    // a changed salary needs re-verification unless the same request confirms it
    expect((await setPrivate(byNo(4).id, { annualSalary: 100_001 })).body.player.salaryVerified).toBe(false);
    expect((await setPrivate(byNo(4).id, { annualSalary: 100_000, salaryVerified: true })).body.player.salaryVerified).toBe(true);
    expect((await setPrivate(byNo(5).id, { annualSalary: 12.5 as unknown as number })).status).toBe(400);

    // ---- offer letters: PDF and image, organizer-only
    expect((await admin.upload(`/api/players/${byNo(1).id}/offer-letter`, samplePdf("Offer letter 1"), "Zephyrine-1.pdf", "application/pdf")).status).toBe(200);
    expect((await admin.upload(`/api/players/${byNo(2).id}/offer-letter`, samplePng(), "letter-2.png", "image/png")).status).toBe(200);
    const notALetter = await admin.upload(`/api/players/${byNo(4).id}/offer-letter`, "<html>hi</html>", "x.html", "text/html");
    expect(notALetter.body.error.code).toBe("UNSUPPORTED_LETTER");
    const own = await fetch(`${srv.base}/api/players/${byNo(1).id}/offer-letter`, { headers: { cookie: admin.cookie } });
    expect(own.status).toBe(200);
    expect(own.headers.get("content-type")).toBe("application/pdf");
    expect(own.headers.get("cache-control")).toContain("no-store");
    expect((await fetch(`${srv.base}/api/players/${byNo(1).id}/offer-letter`)).status).toBe(401);

    // ---- the audience: public socket + public API never carry private data
    const display = socket(srv.base);
    const seen: LiveSnapshot[] = [];
    display.on("state", (s: LiveSnapshot) => seen.push(s));
    const joined = await emitAck<{ ok: boolean; snapshot: LiveSnapshot }>(display, "join", { slug });
    expect(joined.ok).toBe(true);
    expectNoSecrets(joined.snapshot);
    const org = socket(srv.base, admin.cookie);
    const orgJoin = await emitAck<{ ok: boolean; snapshot: LiveSnapshot }>(org, "join", { auctionId: id });
    expect(orgJoin.snapshot.private?.profiles.find((p) => p.number === 1)?.originalName).toBe(ORIGINAL(1));

    // ---- bidding: a temporary bid never changes the totals; SOLD adds the salary to the hidden total
    const sell = async (team: string, extraBids: string[] = []) => {
      await admin.command(id, { type: "NEXT_PLAYER" });
      for (const t of extraBids) await admin.command(id, { type: "BID", teamId: t });
      await admin.command(id, { type: "BID", teamId: team });
      return (await admin.command(id, { type: "SOLD" })).body.snapshot as LiveSnapshot;
    };
    await admin.command(id, { type: "NEXT_PLAYER" }); // #1
    let s = (await admin.command(id, { type: "BID", teamId: CHS })).body.snapshot as LiveSnapshot;
    expect(hidden(s, CHS)).toMatchObject({ total: 0, profiles: 0 });
    s = (await admin.command(id, { type: "SOLD" })).body.snapshot;
    expect(hidden(s, CHS)).toMatchObject({ total: 150_000, profiles: 1 });
    expect(s.teams.find((t) => t.id === CHS)!.remaining).toBe(24_000); // credits only pay for bids
    s = await sell(CHS, [MUM]); // #2: MUM bids first, CHS wins at 2M
    expect(hidden(s, MUM).total).toBe(0);
    expect(hidden(s, CHS).total).toBe(291_000);
    s = await sell(CHS); // #3 (salary not entered yet)
    expect(hidden(s, CHS)).toMatchObject({ total: 291_000, profiles: 3 });
    for (let i = 0; i < 4; i++) s = await sell(MUM); // #4–#7
    expect(hidden(s, MUM)).toMatchObject({ total: 400_000, profiles: 4 });
    await admin.command(id, { type: "NEXT_PLAYER" }); // #8 — bid on, then unsold
    await admin.command(id, { type: "BID", teamId: DEL });
    s = (await admin.command(id, { type: "UNSOLD" })).body.snapshot;
    expect(hidden(s, DEL).total).toBe(0);
    s = await sell(BLR); // #9
    expect(hidden(s, BLR).total).toBe(250_000);

    // ---- corrections update credits AND hidden totals
    const p9 = byNo(9).id;
    expect((await admin.req("POST", `/api/players/${p9}/override`, { action: "RETURN_TO_POOL" })).status).toBe(200);
    s = await orgSnapshot(id);
    expect(hidden(s, BLR)).toMatchObject({ total: 0, profiles: 0 });
    expect(s.teams.find((t) => t.id === BLR)!.remaining).toBe(25_000);
    expect((await admin.req("POST", `/api/players/${p9}/override`, { action: "ASSIGN", teamId: GUJ, amount: 2000 })).status).toBe(200);
    s = await orgSnapshot(id);
    expect(hidden(s, GUJ)).toMatchObject({ total: 250_000, profiles: 1 });
    expect(s.teams.find((t) => t.id === GUJ)!.remaining).toBe(23_000);

    expectNoSecrets(await publicSnapshot(slug));
    expect((await publicLetter(slug, byNo(1).id)).status).toBe(404); // not before the reveal

    // ---- end of bidding; cancellation after the end makes the profile unsold
    s = (await admin.command(id, { type: "END_AUCTION" })).body.snapshot;
    expect(s.auction.status).toBe("COMPLETED");
    expect(s.reveal.status).toBe("NOT_STARTED");
    expect(s.teams.find((t) => t.id === BLR)!.disqualified).toBe(true); // 0 < minimum 1
    const p7 = byNo(7).id;
    expect((await admin.req("POST", `/api/players/${p7}/override`, { action: "RETURN_TO_POOL" })).status).toBe(200);
    s = await orgSnapshot(id);
    expect(s.private!.profiles.find((p) => p.id === p7)!.status).toBe("UNSOLD");
    expect(hidden(s, MUM)).toMatchObject({ total: 300_000, profiles: 3 });
    expect((await admin.req("POST", `/api/players/${p7}/override`, { action: "ASSIGN", teamId: MUM, amount: 1000 })).status).toBe(200);
    expect(hidden(await orgSnapshot(id), MUM)).toMatchObject({ total: 400_000, profiles: 4 });

    // ---- the reveal cannot start while a purchased profile has no salary
    const blocked = await admin.command(id, { type: "START_REVEAL" });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("REVEAL_NOT_READY");
    expect(blocked.body.error.message).toContain("#3");
    expect((await setPrivate(byNo(3).id, { annualSalary: 140_000, salaryVerified: true })).status).toBe(200);
    s = await orgSnapshot(id);
    expect(hidden(s, CHS)).toMatchObject({ total: 431_000, profiles: 3, rank: 1, winner: true });
    expect(hidden(s, MUM)).toMatchObject({ total: 400_000, profiles: 4, rank: 2 });
    expect(s.private!.revealCheck.blocking).toEqual([]);

    const beforeReveal = seen.filter((x) => x.reveal.status === "NOT_STARTED");
    expect(beforeReveal.length).toBeGreaterThan(10);
    beforeReveal.forEach(expectNoSecrets);

    // ---- final reveal, step by step
    s = (await admin.command(id, { type: "START_REVEAL" })).body.snapshot;
    expect(s.reveal).toMatchObject({ status: "IN_PROGRESS", index: 0, step: 0, count: 8 });
    let pub = await publicSnapshot(slug);
    expect(pub.private).toBeUndefined();
    expect(pub.reveal.current).toMatchObject({ number: 1, name: "Candidate 1", originalName: null, letter: null, annualSalary: null, teamId: null });
    expect(pub.reveal.standings.every((x) => x.total === 0 && x.rank === null)).toBe(true);
    expect((await publicLetter(slug, byNo(1).id)).status).toBe(404);

    // edits are frozen while the reveal runs
    expect((await setPrivate(byNo(1).id, { annualSalary: 999_999 })).body.error.code).toBe("REVEAL_STARTED");
    expect((await admin.upload(`/api/players/${byNo(4).id}/offer-letter`, samplePdf(), "l.pdf", "application/pdf")).body.error.code).toBe("REVEAL_STARTED");
    expect((await admin.req("POST", `/api/players/${p9}/override`, { action: "RETURN_TO_POOL" })).body.error.code).toBe("REVEAL_STARTED");
    expect((await setPrivate(byNo(1).id, { originalName: ORIGINAL(1) })).status).toBe(200); // unchanged values are fine

    const next = async () => (await admin.command(id, { type: "REVEAL_NEXT" })).body.snapshot as LiveSnapshot;
    await next(); // step 1: original name
    pub = await publicSnapshot(slug);
    expect(pub.reveal.current).toMatchObject({ originalName: ORIGINAL(1), letter: null, annualSalary: null });
    expect(JSON.stringify(pub)).not.toContain(ORIGINAL(2));
    await next(); // step 2: offer letter
    pub = await publicSnapshot(slug);
    expect(pub.reveal.current!.letter).toMatchObject({ kind: "pdf" });
    expect(pub.reveal.current!.annualSalary).toBeNull();
    const letter = await fetch(srv.base + pub.reveal.current!.letter!.url);
    expect(letter.status).toBe(200);
    expect(letter.headers.get("content-type")).toBe("application/pdf");
    expect(letter.headers.get("content-disposition")).not.toContain("Zephyrine"); // no original file name in public
    expect((await publicLetter(slug, byNo(2).id)).status).toBe(404); // the next profile is still hidden
    await next(); // step 3: salary
    pub = await publicSnapshot(slug);
    expect(pub.reveal.current!.annualSalary).toBe(150_000);
    expect(pub.reveal.current!.teamId).toBeNull();
    expect(standing(pub.reveal.standings, CHS).total).toBe(0); // added only with the team
    await next(); // step 4: purchasing team → added to the visible total
    pub = await publicSnapshot(slug);
    expect(pub.reveal.current).toMatchObject({ teamId: CHS, soldPrice: 1000 });
    expect(standing(pub.reveal.standings, CHS)).toMatchObject({ total: 150_000, profiles: 1, rank: null, winner: false });
    expect(JSON.stringify(pub.reveal)).not.toContain(ORIGINAL(2));

    // back / forward
    s = (await admin.command(id, { type: "REVEAL_BACK" })).body.snapshot;
    expect(s.reveal).toMatchObject({ index: 0, step: 3 });
    expect(standing(s.reveal.standings, CHS).total).toBe(0);
    await next();
    s = await next(); // profile 2, step 0
    expect(s.reveal).toMatchObject({ index: 1, step: 0 });
    expect((await admin.command(id, { type: "REVEAL_BACK" })).body.snapshot.reveal).toMatchObject({ index: 0, step: 4 });
    await next();

    // run to the end: 8 profiles × 5 steps
    for (let i = 0; i < 200 && s.reveal.status === "IN_PROGRESS"; i++) {
      s = await next();
      if (s.reveal.status === "IN_PROGRESS" && s.reveal.step === 4) {
        // after each completed profile the visible totals equal the revealed salaries so far
        const revealedSum = s.reveal.revealed.reduce((sum, c) => sum + (c.annualSalary ?? 0), 0);
        expect(s.reveal.standings.reduce((sum, x) => sum + x.total, 0)).toBe(revealedSum);
      }
    }
    expect(s.reveal.status).toBe("COMPLETE");
    expect((await admin.command(id, { type: "REVEAL_NEXT" })).body.error.code).toBe("REVEAL_COMPLETE");
    pub = await publicSnapshot(slug);
    const final = pub.reveal.standings;
    expect(final.map((x) => [x.teamId, x.profiles, x.total, x.rank, x.winner])).toEqual([
      [CHS, 3, 431_000, 1, true],
      [MUM, 4, 400_000, 2, false],
      [GUJ, 1, 250_000, 3, false],
      [BLR, 0, 0, null, false], // disqualified (below the minimum squad) → not ranked
      [DEL, 0, 0, null, false],
    ]);
    expect(pub.reveal.revealed).toHaveLength(8);
    expect(JSON.stringify(pub)).not.toContain("987654"); // the unsold profile is never revealed
    expect((await publicLetter(slug, byNo(8).id)).status).toBe(404);
    expect((await publicLetter(slug, byNo(2).id)).status).toBe(200);

    // ---- refresh / restart: purchases, totals and the reveal survive
    display.close();
    org.close();
    await srv.built.close();
    srv = await startTestServer();
    admin = new Client(srv.base);
    await admin.login();
    const again = await publicSnapshot(slug);
    expect(again.reveal.status).toBe("COMPLETE");
    expect(again.reveal.standings).toEqual(final);

    // ---- results + export carry the salary leaderboard (organizer only)
    const results = (await admin.req("GET", `/api/auctions/${id}/results`)).body;
    expect(standing(results.standings, CHS)).toMatchObject({ total: 431_000, winner: true });
    const xlsx = await fetch(`${srv.base}/api/auctions/${id}/export.xlsx`, { headers: { cookie: admin.cookie } });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await xlsx.arrayBuffer());
    const sheet = wb.getWorksheet("Winner (Salary Totals)")!;
    expect(sheet.getRow(2).values).toEqual(expect.arrayContaining([1, "Chennai Strikers", 3, 431000, "WINNER"]));
    const squads = wb.getWorksheet("Squads")!;
    expect(squads.getColumn(4).values).toContain(ORIGINAL(1));

    // the audit log records that private fields changed, never the amounts
    const audit = JSON.stringify((await admin.req("GET", `/api/auctions/${id}/audit`)).body.entries);
    expect(audit).toContain("privateFieldsChanged");
    expect(audit).not.toContain("141000");

    // ---- restart the reveal: everything is hidden again and corrections are possible
    s = (await admin.command(id, { type: "RESTART_REVEAL" })).body.snapshot;
    expect(s.reveal).toMatchObject({ status: "NOT_STARTED", count: 0, standings: [] });
    expectNoSecrets(await publicSnapshot(slug));
    expect((await publicLetter(slug, byNo(1).id)).status).toBe(404);
    expect((await setPrivate(byNo(1).id, { annualSalary: 151_000, salaryVerified: true })).status).toBe(200);

    // ---- reset (rehearsal) clears the reveal but keeps the private data
    expect((await admin.req("POST", `/api/auctions/${id}/reset`)).status).toBe(200);
    s = await orgSnapshot(id);
    expect(s.auction).toMatchObject({ status: "LOCKED", revealStatus: "NOT_STARTED" });
    expect(s.private!.profiles.find((p) => p.number === 1)).toMatchObject({ annualSalary: 151_000, originalName: ORIGINAL(1) });
    expect(s.private!.standings.every((x) => x.total === 0)).toBe(true);
  });

  it("clones private data with the auction and imports salaries from the spreadsheet", async () => {
    const created = (await admin.req("POST", "/api/auctions", { name: "Salary Import" })).body.auction;
    const csv =
      'Name,Original Name,Annual Salary (USD),Salary Verified,Role\nCodename Falcon,Zephyrine Real,"$120,000",Yes,Bowler\nCodename Owl,,95000,,Bowler\n';
    const ok = await admin.upload(`/api/auctions/${created.id}/players/import`, csv, "s.csv", "text/csv");
    expect(ok.status).toBe(200);
    const ps: PrivatePlayerView[] = (await admin.req("GET", `/api/auctions/${created.id}/players`)).body.players;
    expect(ps[0]).toMatchObject({ name: "Codename Falcon", originalName: "Zephyrine Real", annualSalary: 120_000, salaryVerified: true });
    expect(ps[1]).toMatchObject({ originalName: null, annualSalary: 95_000, salaryVerified: false });
    const bad = await admin.upload(`/api/auctions/${created.id}/players/import`, "Name,Annual Salary (USD)\nX,12.5k\n", "b.csv", "text/csv");
    expect(bad.body.error.code).toBe("IMPORT_INVALID");
    expect(bad.body.error.details[0].message).toContain("Annual salary");

    await admin.upload(`/api/players/${ps[0].id}/offer-letter`, samplePdf(), "l.pdf", "application/pdf");
    const clone = (await admin.req("POST", `/api/auctions/${created.id}/clone`, { name: "Salary Import (Copy)" })).body.auction;
    const cps: PrivatePlayerView[] = (await admin.req("GET", `/api/auctions/${clone.id}/players`)).body.players;
    expect(cps[0]).toMatchObject({ originalName: "Zephyrine Real", annualSalary: 120_000, salaryVerified: true });
    expect(cps[0].letter?.kind).toBe("pdf");
    const copy = await fetch(srv.base + cps[0].letter!.url, { headers: { cookie: admin.cookie } });
    expect(copy.status).toBe(200);

    const detail = (await admin.req("GET", `/api/auctions/${created.id}`)).body;
    expect(detail.readiness).toMatchObject({ profiles: 2, withSalary: 2, verified: 1, withLetter: 1, withOriginalName: 1 });

    const tpl = await fetch(srv.base + "/api/players-template.xlsx", { headers: { cookie: admin.cookie } });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await tpl.arrayBuffer());
    expect(wb.worksheets[0].getRow(1).values).toEqual(expect.arrayContaining(["Original Name", "Annual Salary (USD)", "Salary Verified"]));
  });

  it("drops an organizer socket from the private room when its session ends", async () => {
    const other = new Client(srv.base);
    await other.login();
    const { id } = await setupLiveAuction(admin, {}, 3);
    const s = socket(srv.base, other.cookie);
    const j = await emitAck<{ ok: boolean; snapshot: LiveSnapshot }>(s, "join", { auctionId: id });
    expect(j.snapshot.private).toBeDefined();
    await other.req("POST", "/api/auth/logout");
    const sync = await emitAck<{ ok: boolean; error?: string }>(s, "sync", {});
    expect(sync).toMatchObject({ ok: false, error: "UNAUTHORIZED" });
    s.close();
  });
});
