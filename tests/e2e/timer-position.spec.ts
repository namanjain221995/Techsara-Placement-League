import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { command, login, TEAMS } from "./helpers";

const H = { "x-tpl-request": "1" };

/** An auction with the countdown on, live, with a candidate on the block. */
async function liveWithTimer(request: APIRequestContext) {
  const { auction } = await (await request.post("/api/auctions", { headers: H, data: { name: "E2E Timer Position" } })).json();
  const settings = {
    name: auction.name,
    currencySymbol: "$",
    purse: 25000,
    basePrice: 1000,
    bidIncrement: 1000,
    minSquad: 3,
    maxSquad: 9,
    timerEnabled: true,
    timerSeconds: 600,
    poolOrder: "SEQUENTIAL",
    roles: ["Batsman", "Bowler", "All-Rounder", "Wicket Keeper"],
  };
  expect((await request.put(`/api/auctions/${auction.id}/settings`, { headers: H, data: settings })).ok()).toBeTruthy();
  for (const t of TEAMS) await request.post(`/api/auctions/${auction.id}/teams`, { headers: H, data: t });
  for (let i = 1; i <= 3; i++)
    await request.post(`/api/auctions/${auction.id}/players`, {
      headers: H,
      data: {
        name: i === 1 ? "Asha Verma" : `Candidate ${i}`,
        role: "All-Rounder",
        description: "• Experience: 5 years\n• Niche: AI/ML platforms\n• Current round: final",
      },
    });
  expect((await request.post(`/api/auctions/${auction.id}/lock`, { headers: H })).ok()).toBeTruthy();
  await command(request, auction.id, { type: "GO_LIVE" });
  await command(request, auction.id, { type: "NEXT_PLAYER" });
  return { id: auction.id as string, slug: auction.slug as string };
}

const center = async (l: Locator) => {
  const b = (await l.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width };
};
/** The candidate panel slides in and web fonts swap in; measure only once the timer has stopped moving. */
const settledCenter = async (l: Locator) => {
  await l.page().evaluate(() => document.fonts.ready.then(() => true));
  await l.page().waitForTimeout(300);
  let prev = await center(l);
  for (let i = 0; i < 40; i++) {
    await l.page().waitForTimeout(100);
    const now = await center(l);
    if (Math.abs(now.x - prev.x) < 0.5 && Math.abs(now.y - prev.y) < 0.5) return now;
    prev = now;
  }
  return prev;
};
const overlaps = async (a: Locator, b: Locator) => {
  const p = (await a.boundingBox())!;
  const q = (await b.boundingBox())!;
  return !(p.x + p.width <= q.x || q.x + q.width <= p.x || p.y + p.height <= q.y || q.y + q.height <= p.y);
};
const layoutOf = async (page: Page, id: string) => (await (await page.request.get(`/api/auctions/${id}/snapshot`)).json()).auction.timerLayout;

test("the countdown never covers the current bid, and the organizer can move it anywhere", async ({ page, browser }) => {
  await login(page);
  const a = await liveWithTimer(page.request);

  // --- audience screens: default spot next to the bid, no overlap at common projector/laptop sizes
  const audienceCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const audience = await audienceCtx.newPage();
  await audience.goto(`/display/${a.slug}`);
  const timer = audience.getByTestId("display-timer");
  await expect(timer).toBeVisible();
  await expect(timer).not.toHaveAttribute("title", /Drag/); // the audience cannot move it
  await settledCenter(timer); // fonts loaded, panel animation finished
  for (const [w, h] of [
    [1920, 1080],
    [1366, 768],
    [1112, 625],
  ]) {
    await audience.setViewportSize({ width: w, height: h });
    await audience.waitForTimeout(300);
    expect(await overlaps(timer, audience.getByTestId("display-bid-box")), `timer over the bid box at ${w}×${h}`).toBe(false);
    expect(await overlaps(timer, audience.getByTestId("display-player-name")), `timer over the name at ${w}×${h}`).toBe(false);
  }
  await audience.setViewportSize({ width: 1920, height: 1080 });
  await settledCenter(timer);
  await audience.screenshot({ path: "test-results/e2e-timer-default.png" });

  // a drag by the audience changes nothing
  const before = await settledCenter(timer);
  await audience.mouse.move(before.x, before.y);
  await audience.mouse.down();
  await audience.mouse.move(200, 900, { steps: 8 });
  await audience.mouse.up();
  await audience.waitForTimeout(500);
  expect(await layoutOf(page, a.id)).toEqual({ x: null, y: null, scale: 1 });

  // --- organizer: drag the timer on the live screen itself
  const orgScreen = await page.context().newPage();
  await orgScreen.setViewportSize({ width: 1920, height: 1080 });
  await orgScreen.goto(`/display/${a.slug}`);
  const orgTimer = orgScreen.getByTestId("display-timer");
  await expect(orgTimer).toHaveAttribute("title", /Drag to move/);
  const start = await settledCenter(orgTimer);
  await orgScreen.mouse.move(start.x, start.y);
  await orgScreen.mouse.down();
  await orgScreen.mouse.move(700, 700, { steps: 10 });
  await orgScreen.mouse.move(300, 820, { steps: 10 });
  const saved = orgScreen.waitForResponse((r) => r.url().includes("/timer-layout") && r.request().method() === "PUT");
  await orgScreen.mouse.up();
  expect((await saved).status()).toBe(200);
  const layout = await layoutOf(page, a.id);
  expect(layout.x).toBeCloseTo((300 / 1920) * 100, 0);
  expect(layout.y).toBeCloseTo((820 / 1080) * 100, 0);

  // every screen follows: the audience timer floats at the same spot, the default slot is empty
  const floating = audience.getByTestId("display-timer-floating");
  await expect(floating).toBeVisible();
  await expect(audience.getByTestId("display-timer-slot")).toBeHidden();
  const there = await center(floating);
  expect(Math.abs(there.x - 300)).toBeLessThan(6);
  expect(Math.abs(there.y - 820)).toBeLessThan(6);
  await audience.screenshot({ path: "test-results/e2e-timer-moved.png" });

  // --- live console: size and reset
  await page.goto(`/admin/auctions/${a.id}/live`);
  await expect(page.getByTestId("timer-layout")).toBeVisible();
  const small = there.w;
  await page.getByTestId("timer-size-XL").click();
  await expect.poll(async () => (await layoutOf(page, a.id)).scale).toBe(2);
  await expect.poll(async () => (await center(floating)).w).toBeGreaterThan(small * 1.8);
  // drag on the console's map → top-left corner of the live screen
  const map = page.getByTestId("timer-layout-map");
  const m = (await map.boundingBox())!;
  await page.mouse.move(m.x + m.width * 0.5, m.y + m.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(m.x + m.width * 0.1, m.y + m.height * 0.15, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await layoutOf(page, a.id)).x).toBeCloseTo(10, 0);
  await expect.poll(async () => Math.round((await center(floating)).x)).toBeLessThan(260);
  await page.getByTestId("timer-reset").click();
  await expect.poll(async () => (await layoutOf(page, a.id)).x).toBeNull();
  await expect(audience.getByTestId("display-timer-floating")).toHaveCount(0);
  await expect(timer).toBeVisible();
  expect(await overlaps(timer, audience.getByTestId("display-bid-box"))).toBe(false);
  await page.screenshot({ path: "test-results/e2e-console-timer-panel.png", fullPage: true });

  // --- double-click on the organizer's live screen puts a moved timer back next to the bid
  await page.request.put(`/api/auctions/${a.id}/timer-layout`, { headers: H, data: { x: 80, y: 85, scale: 1 } });
  const orgFloating = orgScreen.getByTestId("display-timer-floating");
  await expect(orgFloating).toBeVisible();
  await orgFloating.dblclick();
  await expect.poll(async () => (await layoutOf(page, a.id)).x).toBeNull();

  // a refreshed projector keeps the saved position
  await page.request.put(`/api/auctions/${a.id}/timer-layout`, { headers: H, data: { x: 50, y: 50, scale: 1 } });
  await audience.reload();
  const again = await center(audience.getByTestId("display-timer-floating"));
  expect(Math.abs(again.x - 960)).toBeLessThan(6);
  expect(Math.abs(again.y - 540)).toBeLessThan(6);
});
