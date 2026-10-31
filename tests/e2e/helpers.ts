import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const PASSWORD = "e2e-password-123";
const H = { "x-tpl-request": "1" };

export async function login(page: Page) {
  await page.goto("/login");
  await page.fill("#username", "admin");
  await page.fill("#password", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL(/\/admin$/);
}

async function ok<T>(res: Awaited<ReturnType<APIRequestContext["post"]>>): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBeTruthy();
  return (await res.json()) as T;
}

export const TEAMS = [
  { name: "Code Crusaders", shortName: "CCR", color: "#F5B83D", members: ["Aarav", "Meera"] },
  { name: "Hire Hawks", shortName: "HHK", color: "#2F7DF6", members: ["Kabir", "Isha"] },
  { name: "Offer Owls", shortName: "OWL", color: "#E5484D", members: ["Rohan", "Tara"] },
];

/** Fast setup through the API (used where the setup UI itself is not under test). */
export async function liveAuctionViaApi(request: APIRequestContext, name: string, players = 6) {
  const { auction } = await ok<{ auction: { id: string; slug: string } }>(await request.post("/api/auctions", { headers: H, data: { name } }));
  const teamIds: string[] = [];
  for (const t of TEAMS)
    teamIds.push((await ok<{ team: { id: string } }>(await request.post(`/api/auctions/${auction.id}/teams`, { headers: H, data: t }))).team.id);
  for (let i = 1; i <= players; i++)
    await ok(
      await request.post(`/api/auctions/${auction.id}/players`, {
        headers: H,
        data: { name: `Candidate ${i}`, role: "All-Rounder", description: `• Point A for ${i}\n• Point B for ${i}` },
      }),
    );
  await ok(await request.post(`/api/auctions/${auction.id}/lock`, { headers: H }));
  await ok(await request.post(`/api/auctions/${auction.id}/commands`, { headers: H, data: { type: "GO_LIVE", commandId: crypto.randomUUID() } }));
  return { id: auction.id, slug: auction.slug, teamIds };
}

export async function command(request: APIRequestContext, auctionId: string, cmd: Record<string, unknown>) {
  return request.post(`/api/auctions/${auctionId}/commands`, { headers: H, data: { ...cmd, commandId: crypto.randomUUID() } });
}
