import { Readable } from "node:stream";
import { asc, desc, eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { formatMoney, K_PER_MILLION, parseMillions } from "../../src/shared/money";
import { playerSchema, type PlayerInput } from "../../src/shared/schemas";
import type { Db } from "../db";
import { auctions, auditLogs, bids, lots, players, teams } from "../db/schema";
import { auctionView, playerView, teamViews } from "../engine/snapshot";
import { badRequest, notFound } from "../util/errors";

// ------------------------------------------------------------------------------ import
const HEADER_MAP: Record<string, keyof PlayerInput> = {
  number: "number",
  no: "number",
  "#": "number",
  name: "name",
  candidate: "name",
  candidatename: "name",
  playername: "name",
  role: "role",
  category: "role",
  description: "description",
  details: "description",
  baseprice: "basePrice",
  basepricem: "basePrice",
  basepriceinmillions: "basePrice",
  photourl: "photoUrl",
  photo: "photoUrl",
  imageurl: "photoUrl",
};

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("result" in v && v.result !== undefined) return cellText(v.result as ExcelJS.CellValue);
  }
  return String(v);
}

export async function parsePlayersFile(file: Express.Multer.File | undefined, roles: string[]) {
  if (!file) throw badRequest("NO_FILE", "Choose an .xlsx or .csv file.");
  const wb = new ExcelJS.Workbook();
  const isZip = file.buffer.length > 4 && file.buffer.readUInt32LE(0) === 0x04034b50;
  try {
    if (isZip) await wb.xlsx.load(file.buffer as unknown as ArrayBuffer);
    else await wb.csv.read(Readable.from(file.buffer.toString("utf8").replace(/^﻿/, "")));
  } catch {
    throw badRequest("UNREADABLE_FILE", "The file could not be read. Use the provided template (.xlsx) or a UTF-8 .csv.");
  }
  const ws = wb.worksheets[0];
  if (!ws || ws.rowCount < 2) throw badRequest("EMPTY_FILE", "The file has no candidate rows.");

  const columns = new Map<number, keyof PlayerInput>();
  ws.getRow(1).eachCell((cell, col) => {
    const key = cellText(cell.value)
      .toLowerCase()
      .replace(/[^a-z0-9#]/g, "");
    if (HEADER_MAP[key]) columns.set(col, HEADER_MAP[key]);
  });
  if (![...columns.values()].includes("name")) throw badRequest("MISSING_COLUMN", 'The first row must contain a "Name" column.');

  const rows: PlayerInput[] = [];
  const errors: { row: number; message: string }[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const raw: Record<string, unknown> = {};
    let empty = true;
    for (const [col, field] of columns) {
      const text = cellText(ws.getRow(r).getCell(col).value).trim();
      if (text) empty = false;
      if (field === "number") raw.number = text ? Number(text) : undefined;
      else if (field === "basePrice") {
        if (text) {
          const k = parseMillions(text);
          if (k === null) errors.push({ row: r, message: `Base price "${text}" is not a number of millions.` });
          raw.basePrice = k ?? undefined;
        }
      } else if (field === "photoUrl") raw.photoUrl = text || null;
      else raw[field] = text;
    }
    if (empty) continue;
    if (!raw.role) raw.role = roles[0] ?? "All-Rounder";
    const parsed = playerSchema.safeParse(raw);
    if (!parsed.success) errors.push({ row: r, message: parsed.error.issues.map((i) => `${i.path.join(".") || "row"}: ${i.message}`).join("; ") });
    else rows.push(parsed.data);
  }
  if (rows.length > 500) errors.push({ row: 0, message: "Import at most 500 candidates at a time." });
  return { rows, errors };
}

export async function playersTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Candidates");
  ws.columns = [
    { header: "Number", key: "number", width: 9 },
    { header: "Name", key: "name", width: 26 },
    { header: "Role", key: "role", width: 16 },
    { header: "Description", key: "description", width: 70 },
    { header: "Base Price (M)", key: "base", width: 15 },
    { header: "Photo URL", key: "photo", width: 30 },
  ];
  ws.getRow(1).font = { bold: true };
  const example = [
    {
      number: 1,
      name: "Aarav Example",
      role: "All-Rounder",
      description: "• Experience: 5 years\n• Niche: AI/ML — NLP, computer vision\n• Current interview: final round",
      base: "",
      photo: "",
    },
    {
      number: 2,
      name: "Diya Sample",
      role: "Batsman",
      description: "1. Experience: 4 years\n2. Niche: QA automation\n3. Notes: prefers remote",
      base: 1.5,
      photo: "",
    },
  ];
  example.forEach((e) => {
    const row = ws.addRow(e);
    row.getCell("description").alignment = { wrapText: true, vertical: "top" };
  });
  const help = wb.addWorksheet("Instructions");
  help.getColumn(1).width = 110;
  for (const line of [
    "How to fill the Candidates sheet",
    "• One candidate per row. Name is required; Role defaults to the first role of the auction.",
    "• Description: write it point-wise. Line breaks (Alt+Enter in Excel), numbering and bullets are kept exactly.",
    "• Base Price (M): in millions, e.g. 1.5 — leave empty to use the auction base price.",
    "• Number: optional; empty rows get the next free number.",
    "• Replace the two example rows with your candidates. Nothing is imported unless every row is valid.",
  ])
    help.addRow([line]);
  help.getRow(1).font = { bold: true };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ----------------------------------------------------------------------------- results
export async function resultsData(db: Db, auctionId: string) {
  const [a] = await db.select().from(auctions).where(eq(auctions.id, auctionId)).limit(1);
  if (!a) throw notFound("Auction");
  const ts = await db.select().from(teams).where(eq(teams.auctionId, auctionId));
  const ps = await db.select().from(players).where(eq(players.auctionId, auctionId)).orderBy(asc(players.number));
  const tv = teamViews(a, ts, ps);
  const views = ps.map(playerView);
  return {
    auction: auctionView(a),
    teams: tv.map((t) => ({
      ...t,
      belowMinimum: t.squadCount < a.minSquad,
      players: views.filter((p) => p.status === "SOLD" && p.soldToTeamId === t.id).sort((x, y) => (y.soldPrice ?? 0) - (x.soldPrice ?? 0)),
    })),
    unsold: views.filter((p) => p.status === "UNSOLD"),
    pool: views.filter((p) => p.status === "POOL"),
    disqualified: views.filter((p) => p.status === "DISQUALIFIED"),
    totals: { spent: tv.reduce((s, t) => s + t.spent, 0), sold: views.filter((p) => p.status === "SOLD").length, candidates: views.length },
  };
}

export async function bidHistory(db: Db, auctionId: string) {
  const ls = await db
    .select({
      id: lots.id,
      sequence: lots.sequence,
      round: lots.round,
      result: lots.result,
      finalAmount: lots.finalAmount,
      winningTeamId: lots.winningTeamId,
      openedAt: lots.openedAt,
      closedAt: lots.closedAt,
      playerName: players.name,
      playerNumber: players.number,
    })
    .from(lots)
    .innerJoin(players, eq(players.id, lots.playerId))
    .where(eq(lots.auctionId, auctionId))
    .orderBy(desc(lots.sequence));
  const bs = await db.select().from(bids).where(eq(bids.auctionId, auctionId)).orderBy(asc(bids.id));
  return ls.map((l) => ({
    ...l,
    openedAt: l.openedAt.toISOString(),
    closedAt: l.closedAt?.toISOString() ?? null,
    bids: bs
      .filter((b) => b.lotId === l.id)
      .map((b) => ({ id: b.id, teamId: b.teamId, amount: b.amount, at: b.createdAt.toISOString(), undone: !!b.undoneAt })),
  }));
}

export async function auditLog(db: Db, auctionId: string, limit = 400) {
  const rows = await db.select().from(auditLogs).where(eq(auditLogs.auctionId, auctionId)).orderBy(desc(auditLogs.id)).limit(limit);
  return rows.map((r) => ({ id: r.id, at: r.createdAt.toISOString(), actor: r.actorLabel, action: r.action, details: r.details }));
}

export async function exportResults(db: Db, auctionId: string) {
  const data = await resultsData(db, auctionId);
  const history = await bidHistory(db, auctionId);
  const sym = data.auction.currencySymbol;
  const m = (k: number | null) => (k === null ? null : k / K_PER_MILLION);
  const teamName = new Map(data.teams.map((t) => [t.id, t.name]));
  const wb = new ExcelJS.Workbook();
  wb.creator = "TechSara Placement League";
  wb.created = new Date();
  const bold = (ws: ExcelJS.Worksheet) => (ws.getRow(1).font = { bold: true });

  const s = wb.addWorksheet("Summary");
  s.columns = [
    { header: "Team", key: "team", width: 28 },
    { header: "Members", key: "members", width: 30 },
    { header: `Purse (${sym}M)`, key: "purse", width: 12 },
    { header: `Spent (${sym}M)`, key: "spent", width: 12 },
    { header: `Remaining (${sym}M)`, key: "remaining", width: 15 },
    { header: "Candidates", key: "squad", width: 11 },
    { header: "Status", key: "status", width: 34 },
  ];
  bold(s);
  for (const t of data.teams)
    s.addRow({
      team: t.name,
      members: t.members.join(", "),
      purse: m(t.purse),
      spent: m(t.spent),
      remaining: m(t.remaining),
      squad: t.squadCount,
      status: t.disqualified || (data.auction.status === "COMPLETED" && t.belowMinimum) ? `DISQUALIFIED (below minimum ${data.auction.minSquad})` : "Qualified",
    });
  s.addRow({});
  s.addRow({ team: "Auction", members: data.auction.name });
  s.addRow({ team: "Status", members: data.auction.status });
  s.addRow({
    team: "Rules",
    members: `Purse ${formatMoney(data.auction.purse, sym)}, base ${formatMoney(data.auction.basePrice, sym)}, squad ${data.auction.minSquad}–${data.auction.maxSquad}`,
  });
  s.addRow({ team: "Exported", members: new Date().toISOString() });

  const q = wb.addWorksheet("Squads");
  q.columns = [
    { header: "Team", key: "team", width: 28 },
    { header: "#", key: "no", width: 6 },
    { header: "Candidate", key: "name", width: 28 },
    { header: "Role", key: "role", width: 16 },
    { header: `Price (${sym}M)`, key: "price", width: 12 },
    { header: "Round", key: "round", width: 8 },
  ];
  bold(q);
  for (const t of data.teams)
    for (const p of t.players) q.addRow({ team: t.name, no: p.number, name: p.name, role: p.role, price: m(p.soldPrice), round: p.soldRound });

  const u = wb.addWorksheet("Unsold & Pool");
  u.columns = [
    { header: "#", key: "no", width: 6 },
    { header: "Candidate", key: "name", width: 28 },
    { header: "Role", key: "role", width: 16 },
    { header: "Status", key: "status", width: 14 },
  ];
  bold(u);
  for (const p of [...data.unsold, ...data.pool, ...data.disqualified]) u.addRow({ no: p.number, name: p.name, role: p.role, status: p.status });

  const h = wb.addWorksheet("Bid History");
  h.columns = [
    { header: "Lot", key: "lot", width: 6 },
    { header: "Round", key: "round", width: 7 },
    { header: "Candidate", key: "name", width: 28 },
    { header: "Team", key: "team", width: 28 },
    { header: `Bid (${sym}M)`, key: "amount", width: 10 },
    { header: "Time (UTC)", key: "at", width: 24 },
    { header: "Note", key: "note", width: 18 },
  ];
  bold(h);
  for (const l of [...history].reverse()) {
    for (const b of l.bids)
      h.addRow({
        lot: l.sequence,
        round: l.round,
        name: l.playerName,
        team: teamName.get(b.teamId) ?? "?",
        amount: m(b.amount),
        at: b.at,
        note: b.undone ? "undone" : "",
      });
    h.addRow({
      lot: l.sequence,
      round: l.round,
      name: l.playerName,
      team: l.winningTeamId ? teamName.get(l.winningTeamId) : "",
      amount: m(l.finalAmount),
      at: l.closedAt ?? "",
      note: `RESULT: ${l.result}`,
    });
  }

  const safe = data.auction.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "auction";
  return { filename: `${safe}-results.xlsx`, buffer: Buffer.from(await wb.xlsx.writeBuffer()) };
}
