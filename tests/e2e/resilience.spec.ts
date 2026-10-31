import { expect, test } from "@playwright/test";
import { command, liveAuctionViaApi, login } from "./helpers";

test("a refreshed or reconnecting display restores the exact live state", async ({ page, browser }) => {
  await login(page);
  const a = await liveAuctionViaApi(page.request, "E2E Resilience");
  await command(page.request, a.id, { type: "NEXT_PLAYER" });
  await command(page.request, a.id, { type: "BID", teamId: a.teamIds[0] });

  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const display = await ctx.newPage();
  await display.goto(`/display/${a.slug}`);
  await expect(display.getByTestId("display-current-bid")).toHaveText("$1M");

  // browser refresh
  await display.reload();
  await expect(display.getByTestId("display-current-bid")).toHaveText("$1M");
  await expect(display.getByTestId("display-leading-team")).toContainText("Code Crusaders", { ignoreCase: true });

  // network drop: bids continue while the projector is offline, then it reconnects
  await ctx.setOffline(true);
  await command(page.request, a.id, { type: "BID", teamId: a.teamIds[1], amount: 5000 });
  await command(page.request, a.id, { type: "BID", teamId: a.teamIds[2], amount: 7000 });
  await ctx.setOffline(false);
  await expect(display.getByTestId("display-current-bid")).toHaveText("$7M", { timeout: 20_000 });
  await expect(display.getByTestId("display-leading-team")).toContainText("Offer Owls", { ignoreCase: true });
});

test("two operators tapping at the same moment: rules hold and both consoles converge", async ({ page, browser }) => {
  // Exact-tie races (identical amounts) are proven in tests/integration/live.test.ts (10 simultaneous raises → 1 accepted).
  // Here two real browsers click as close together as Playwright allows; whatever the interleaving, the result must be legal and identical everywhere.
  await login(page);
  const a = await liveAuctionViaApi(page.request, "E2E Concurrency");
  const second = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  await login(second);
  await page.goto(`/admin/auctions/${a.id}/live`);
  await second.goto(`/admin/auctions/${a.id}/live`);
  await page.getByTestId("next-player").click();
  await expect(second.getByTestId("lot-panel")).toBeVisible();

  await Promise.all([page.getByTestId("bid-CCR").click(), second.getByTestId("bid-HHK").click()]);
  await page.waitForTimeout(500);
  const snap = await (await page.request.get(`/api/auctions/${a.id}/snapshot`)).json();
  const amounts: number[] = snap.lot.bids.map((b: { amount: number }) => b.amount);
  expect(amounts.length).toBeGreaterThanOrEqual(1);
  expect(amounts.length).toBeLessThanOrEqual(2);
  expect(new Set(amounts).size).toBe(amounts.length); // never two accepted bids at the same price
  expect([...amounts].sort((x, y) => y - x)).toEqual(amounts); // strictly increasing over time
  expect(snap.lot.currentBid).toBe(amounts[0]);
  const leader = snap.teams.find((t: { id: string }) => t.id === snap.lot.leadingTeamId).name;
  for (const p of [page, second]) {
    await expect(p.getByTestId("bid-history").locator("li")).toHaveCount(amounts.length);
    await expect(p.getByTestId("leading-team")).toContainText(leader);
  }
});

test("the live screen works on a phone and on a projector", async ({ page, browser }) => {
  await login(page);
  const a = await liveAuctionViaApi(page.request, "E2E Layouts");
  await command(page.request, a.id, { type: "NEXT_PLAYER" });
  await command(page.request, a.id, { type: "BID", teamId: a.teamIds[2], amount: 3000 });
  for (const [label, viewport] of [
    ["phone", { width: 390, height: 844 }],
    ["projector", { width: 1920, height: 1080 }],
    ["led-wall", { width: 3840, height: 2160 }],
  ] as const) {
    const p = await (await browser.newContext({ viewport })).newPage();
    await p.goto(`/display/${a.slug}`);
    await expect(p.getByTestId("display-current-bid")).toHaveText("$3M");
    await expect(p.getByTestId("display-team-OWL")).toBeVisible();
    await expect(p.getByTestId("display-description")).toContainText("Point B");
    await p.screenshot({ path: `test-results/e2e-display-${label}.png` });
  }
});
