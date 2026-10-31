import { expect, test, type APIRequestContext } from "@playwright/test";
import { samplePdf, sampleLetterImage } from "../fixtures/letters";
import { command, liveAuctionViaApi, login } from "./helpers";

const H = { "x-tpl-request": "1" };
const ORIGINAL = (n: number) => `Zephyrine Original ${n}`;
// Team CCR buys #1–#3 = $431,000 (3 profiles); HHK buys #4–#7 = $400,000 (4 profiles): CCR must win.
const SALARY: Record<number, number> = { 1: 150_000, 2: 141_000, 3: 140_000, 4: 100_000, 5: 100_000, 6: 100_000, 7: 100_000 };

async function setPrivate(request: APIRequestContext, auctionId: string) {
  const { players } = await (await request.get(`/api/auctions/${auctionId}/players`)).json();
  for (const p of players as { id: string; number: number; name: string; role: string; description: string }[]) {
    const r = await request.put(`/api/players/${p.id}`, {
      headers: H,
      data: { name: p.name, role: p.role, description: p.description, originalName: ORIGINAL(p.number), annualSalary: SALARY[p.number], salaryVerified: true },
    });
    expect(r.ok()).toBeTruthy();
    const letter =
      p.number === 1
        ? { name: "letter-1.png", mimeType: "image/png", buffer: sampleLetterImage() }
        : { name: `letter-${p.number}.pdf`, mimeType: "application/pdf", buffer: samplePdf(`Offer letter ${p.number}`) };
    expect((await request.post(`/api/players/${p.id}/offer-letter`, { headers: H, multipart: { file: letter } })).ok()).toBeTruthy();
  }
  return players as { id: string; number: number }[];
}

test("hidden salary totals during bidding, then the step-by-step Final Reveal and the winner leaderboard", async ({ page, browser }) => {
  await login(page);
  const a = await liveAuctionViaApi(page.request, "E2E Final Reveal", 7);
  const [CCR, HHK] = a.teamIds;
  const players = await setPrivate(page.request, a.id);
  const idOf = (n: number) => players.find((p) => p.number === n)!.id;

  const display = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await display.goto(`/display/${a.slug}`);
  await expect(display.getByTestId("display-waiting")).toBeVisible();

  // --- live console: the hidden totals panel is masked until the organizer opens it
  await page.goto(`/admin/auctions/${a.id}/live`);
  await expect(page.getByTestId("hidden-totals")).toBeVisible();
  await expect(page.getByTestId("hidden-standings")).toHaveCount(0);
  await page.getByTestId("toggle-hidden-totals").click();
  await expect(page.getByTestId("hidden-standings")).toBeVisible();

  // --- bidding: the lot strip shows the real identity to the organizer only (pool order is random → pick #1)
  await command(page.request, a.id, { type: "PICK_PLAYER", playerId: idOf(1) });
  await expect(page.getByTestId("lot-private")).toContainText(ORIGINAL(1));
  await expect(page.getByTestId("lot-private")).toContainText("$150,000/yr");
  await page.getByTestId("bid-CCR").click();
  await expect(page.getByTestId("hidden-total-CCR")).toHaveText("$0"); // a bid alone never counts
  await page.getByTestId("sold").click();
  await expect(page.getByTestId("hidden-total-CCR")).toHaveText("$150,000");
  await page.screenshot({ path: "test-results/e2e-console-hidden-totals.png" });

  for (const [team, n] of [
    [CCR, 2],
    [CCR, 3],
    [HHK, 4],
    [HHK, 5],
    [HHK, 6],
    [HHK, 7],
  ] as const) {
    await command(page.request, a.id, { type: "PICK_PLAYER", playerId: idOf(n) });
    await command(page.request, a.id, { type: "BID", teamId: team });
    expect((await command(page.request, a.id, { type: "SOLD" })).ok(), `sell #${n}`).toBeTruthy();
  }
  await expect(page.getByTestId("hidden-total-CCR")).toHaveText("$431,000");
  await expect(page.getByTestId("hidden-total-HHK")).toHaveText("$400,000");

  // the audience saw tweaked names and credits only
  const audience = await display.locator("body").innerText();
  expect(audience).not.toContain("Zephyrine");
  expect(audience).not.toContain("$431,000");
  expect(audience).not.toContain("150,000");

  // --- end bidding → "Final reveal coming up"
  await page.getByTestId("end-auction").click();
  await page.getByRole("dialog").getByRole("button", { name: "End auction" }).click();
  await expect(display.getByTestId("display-reveal-coming")).toBeVisible();
  await expect(page.getByTestId("reveal-console")).toBeVisible();

  // --- start the reveal
  await page.getByTestId("start-reveal").click();
  await page.getByRole("dialog").getByRole("button", { name: "Start Final Reveal" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  const press = async () => {
    await expect(page.getByTestId("reveal-next")).toBeEnabled();
    await page.keyboard.press("ArrowRight");
  };
  await expect(display.getByTestId("display-reveal")).toBeVisible();
  await expect(display.getByTestId("reveal-display-name")).toContainText("Candidate 1", { ignoreCase: true });
  await expect(display.getByTestId("reveal-original-name")).toHaveCount(0);
  await expect(display.getByTestId("display-reveal-progress")).toHaveText("Profile 1 of 7");

  // step 1: original name (keyboard → on the console)
  await press();
  await expect(display.getByTestId("reveal-original-name")).toHaveText(ORIGINAL(1), { ignoreCase: true });
  await expect(display.getByTestId("reveal-letter-image")).toHaveCount(0);
  // step 2: the actual offer letter (image) loads for the audience
  await press();
  const img = display.getByTestId("reveal-letter-image");
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(100);
  await expect(display.getByTestId("reveal-salary")).toHaveCount(0);
  // step 3: annual salary (count-up animation ends on the exact figure)
  await press();
  await expect(display.getByTestId("reveal-salary")).toHaveText("$150,000");
  await expect(display.getByTestId("running-total-CCR")).toHaveAttribute("data-value", "0");
  // step 4: purchasing team, salary added to the team's visible total
  await press();
  await expect(display.getByTestId("reveal-team")).toContainText("Code Crusaders", { ignoreCase: true });
  await expect(display.getByTestId("running-total-CCR")).toHaveText("$150,000");
  await display.screenshot({ path: "test-results/e2e-final-reveal.png" });

  // profile 2 has a PDF letter: embedded for the audience
  for (let i = 0; i < 3; i++) await page.getByTestId("reveal-next").click();
  await expect(display.getByTestId("reveal-letter-pdf")).toBeVisible();
  const pdfUrl = await display.getByTestId("reveal-letter-pdf").getAttribute("src");
  const pdf = await display.request.get(pdfUrl!.split("#")[0]);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");

  // run through the rest of the reveal (UI steps are proven above; the API is faster)
  const { reveal } = await (await page.request.get(`/api/auctions/${a.id}/snapshot`)).json();
  const remaining = reveal.count * 5 - (reveal.index * 5 + reveal.step);
  for (let i = 0; i < remaining; i++) expect((await command(page.request, a.id, { type: "REVEAL_NEXT" })).ok()).toBeTruthy();
  await expect(display.getByTestId("display-leaderboard")).toBeVisible();
  await expect(display.getByTestId("leaderboard-winner")).toHaveText("Code Crusaders", { ignoreCase: true });
  await expect(display.getByTestId("leaderboard-CCR")).toHaveAttribute("data-rank", "1");
  await expect(display.getByTestId("leaderboard-CCR")).toHaveAttribute("data-winner", "true");
  await expect(display.getByTestId("leaderboard-HHK")).toHaveAttribute("data-rank", "2");
  await expect(display.getByTestId("leaderboard-total-CCR")).toHaveText("$431,000");
  await expect(display.getByTestId("leaderboard-total-HHK")).toHaveText("$400,000");
  await expect(display.getByTestId("leaderboard-CCR")).toHaveAttribute("data-profiles", "3"); // fewer profiles, still the winner
  await expect(display.getByTestId("leaderboard-HHK")).toHaveAttribute("data-profiles", "4");
  await expect(display.getByTestId("leaderboard-OWL")).toContainText("Not ranked"); // 0 < minimum squad
  await display.waitForTimeout(1500);
  await display.screenshot({ path: "test-results/e2e-final-leaderboard.png" });

  // a refreshed projector shows the same final leaderboard
  await display.reload();
  await expect(display.getByTestId("leaderboard-total-CCR")).toHaveText("$431,000");
  await expect(page.getByTestId("visible-standings")).toContainText("$431,000");
});
