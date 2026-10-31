import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, startTestServer } from "./harness";

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

async function upload(path: string, file: Blob, name: string) {
  const fd = new FormData();
  fd.append("file", file, name);
  const r = await fetch(srv.base + path, { method: "POST", headers: { cookie: admin.cookie, "x-tpl-request": "1" }, body: fd });
  return { status: r.status, body: await r.json() };
}

describe("candidate import (R-PLAYER-06)", () => {
  it("imports the downloaded Excel template unchanged, keeping multi-line descriptions", async () => {
    const id = (await admin.req("POST", "/api/auctions", { name: "Import XLSX" })).body.auction.id;
    const tpl = await fetch(srv.base + "/api/players-template.xlsx", { headers: { cookie: admin.cookie } });
    expect(tpl.status).toBe(200);
    const r = await upload(`/api/auctions/${id}/players/import`, await tpl.blob(), "template.xlsx");
    expect(r.status).toBe(200);
    expect(r.body.imported).toBe(2);
    const players = (await admin.req("GET", `/api/auctions/${id}/players`)).body.players;
    expect(players.map((p: { name: string }) => p.name)).toEqual(["Aarav Example", "Diya Sample"]);
    expect(players[0].description).toBe("• Experience: 5 years\n• Niche: AI/ML — NLP, computer vision\n• Current interview: final round");
    expect(players[1].basePrice).toBe(1500);
  });

  it("imports CSV and rejects the whole file with row numbers when a row is invalid", async () => {
    const id = (await admin.req("POST", "/api/auctions", { name: "Import CSV" })).body.auction.id;
    const good = 'Name,Role,Description,Base Price (M)\nRiya Test,Bowler,"1. First\n2. Second",2\nSam Test,,Plain,\n';
    const ok = await upload(`/api/auctions/${id}/players/import`, new Blob([good], { type: "text/csv" }), "c.csv");
    expect(ok.status).toBe(200);
    expect(ok.body.imported).toBe(2);
    const players = (await admin.req("GET", `/api/auctions/${id}/players`)).body.players;
    expect(players[0]).toMatchObject({ name: "Riya Test", role: "Bowler", description: "1. First\n2. Second", basePrice: 2000 });
    expect(players[1].role).toBe("Batsman"); // first configured role
    const bad = "Name,Role,Base Price (M)\nOk Person,Bowler,1\n,Bowler,abc\n";
    const r = await upload(`/api/auctions/${id}/players/import`, new Blob([bad], { type: "text/csv" }), "bad.csv");
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("IMPORT_INVALID");
    expect(r.body.error.details.map((d: { row: number }) => d.row)).toContain(3);
    expect((await admin.req("GET", `/api/auctions/${id}/players`)).body.players).toHaveLength(2); // nothing partial
  });

  it("refuses non-image uploads for photos", async () => {
    const id = (await admin.req("POST", "/api/auctions", { name: "Upload check" })).body.auction.id;
    const p = (await admin.req("POST", `/api/auctions/${id}/players`, { name: "Pic Test", role: "Bowler" })).body.player;
    const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], { type: "image/svg+xml" });
    const r = await upload(`/api/players/${p.id}/photo`, svg, "x.svg");
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("UNSUPPORTED_IMAGE");
    const png = new Blob(
      [
        Buffer.from(
          "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4b60000000049454e44ae426082",
          "hex",
        ),
      ],
      { type: "image/png" },
    );
    const ok = await upload(`/api/players/${p.id}/photo`, png, "p.png");
    expect(ok.status).toBe(200);
    const photo = (await admin.req("GET", `/api/auctions/${id}/players`)).body.players[0].photoUrl as string;
    const img = await fetch(srv.base + photo);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(img.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
