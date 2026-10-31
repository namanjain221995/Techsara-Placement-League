import { expect, test } from "@playwright/test";
import { login, PASSWORD } from "./helpers";

test("unauthenticated organizers are sent to the login page; wrong passwords are rejected", async ({ page }) => {
  await page.goto("/admin");
  await page.waitForURL(/\/login/);
  await page.fill("#username", "admin");
  await page.fill("#password", "not-the-password");
  await page.click("button[type=submit]");
  await expect(page.getByText("Wrong username or password")).toBeVisible();
  await page.fill("#password", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL(/\/admin$/);
});

/**
 * The flow demonstrated in the client video, end to end through the real UI:
 * create → teams → candidates (point-wise description) → lock → go live → next candidate →
 * tap-to-bid → custom amount (24 blocked, 10 accepted) → SOLD → undo → pause → unsold → end.
 */
test("organizer runs a complete auction while the projector display follows in real time", async ({ page, browser }) => {
  await login(page);

  // --- create the auction
  await page.getByTestId("new-auction").click();
  await page.fill("#auction-name", "E2E Placement League");
  await page.getByTestId("create-auction").click();
  await page.waitForURL(/\/admin\/auctions\/[0-9a-f-]+$/);
  const base = page.url();

  // --- teams (name, short name, members)
  await page.goto(`${base}/teams`);
  for (const [name, short, m1, m2] of [
    ["Code Crusaders", "CCR", "Aarav", "Meera"],
    ["Hire Hawks", "HHK", "Kabir", "Isha"],
    ["Offer Owls", "OWL", "Rohan", "Tara"],
  ]) {
    await page.getByTestId("add-team").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Team name").fill(name);
    await dialog.getByLabel("Short name").fill(short);
    const members = dialog.getByPlaceholder("e.g. Aarav");
    await members.fill(m1);
    await members.press("Enter");
    await members.fill(m2);
    await members.press("Enter");
    await dialog.getByTestId("save-team").click();
    await expect(dialog).toBeHidden();
  }
  await expect(page.getByTestId("team-card")).toHaveCount(3);
  await expect(page.getByTestId("team-card").first()).toContainText("Max bid");

  // --- candidates with a point-wise description (R-PLAYER-04)
  const description = "1. Experience: 5 years\n2. Niche: AI/ML\n• Company background: Contoso Cloud\n\n- Current round: final";
  await page.goto(`${base}/players`);
  for (const name of ["Asha Verma", "Bilal Khan", "Chitra Rao", "Dev Malhotra"]) {
    await page.getByTestId("add-player").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByTestId("name-input").fill(name);
    await dialog.getByTestId("description-input").fill(description);
    await dialog.getByTestId("save-player").click();
    await expect(dialog).toBeHidden();
  }
  const firstDescription = page.getByTestId("player-list").locator(".description-text").first();
  await expect(firstDescription).toHaveText(description, { useInnerText: true }); // line breaks preserved exactly

  // --- lock & go live
  await page.goto(base);
  await page.getByTestId("lock").click();
  await page.getByTestId("open-live-console").click();
  const slug = (await page.request.get(`/api/auctions/${base.split("/").pop()}`).then((r) => r.json())).auction.slug as string;

  const display = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await display.goto(`/display/${slug}`);
  await expect(display.getByTestId("display-prelive")).toBeVisible();

  await page.getByTestId("go-live").click();
  await expect(display.getByTestId("display-waiting")).toBeVisible();

  // --- next candidate: full description on the big screen
  await page.getByTestId("next-player").click();
  await expect(page.getByTestId("lot-panel")).toBeVisible();
  const name = (await page.getByTestId("lot-player-name").textContent())!.trim();
  await expect(display.getByTestId("display-player-name")).toHaveText(name, { ignoreCase: true });
  await expect(display.getByTestId("display-description")).toHaveText(description, { useInnerText: true });
  await expect(display.getByTestId("counter-pool")).toHaveText("3"); // the candidate on the block is not in the pool

  // --- tap-to-bid: opening at base, then +$1M; leader floats to the top of the display
  await page.getByTestId("bid-CCR").click();
  await expect(display.getByTestId("display-current-bid")).toHaveText("$1M");
  await page.getByTestId("bid-OWL").click();
  await expect(display.getByTestId("display-current-bid")).toHaveText("$2M");
  await expect(display.getByTestId("display-leading-team")).toContainText("Offer Owls", { ignoreCase: true });
  await expect(display.locator("[data-testid^=display-team-]").first()).toHaveAttribute("data-testid", "display-team-OWL");

  // --- custom amount in millions: 24 > max 23 is impossible, 10 works (client 07:43–08:56)
  await page.getByTestId("open-custom-bid").click();
  await page.getByTestId("custom-amount").fill("24");
  for (const t of ["CCR", "HHK", "OWL"]) await expect(page.getByTestId(`custom-team-${t}`)).toBeDisabled();
  await expect(page.getByRole("dialog")).toContainText("Max $23M");
  await page.getByTestId("custom-amount").fill("10");
  await page.getByTestId("custom-team-HHK").click();
  await expect(display.getByTestId("display-current-bid")).toHaveText("$10M");
  await expect(display.getByTestId("display-current-bid")).toBeVisible();

  // --- SOLD: celebration on the display, purse/max bid updated
  await page.getByTestId("sold").click();
  await expect(display.getByTestId("overlay-sold")).toBeVisible();
  await expect(display.getByTestId("overlay-price")).toHaveText("$10M");
  await expect(display.getByTestId("display-team-HHK")).toContainText("$15M"); // purse 25 − 10
  await expect(display.getByTestId("display-team-HHK")).toContainText("$14M"); // max = 15 − 1 reserved for the 3rd mandatory slot

  // --- undo a bid
  await page.getByTestId("next-player").click();
  await page.getByTestId("bid-CCR").click();
  await expect(display.getByTestId("display-current-bid")).toHaveText("$1M");
  await page.getByTestId("undo").click();
  await expect(display.getByText("Awaiting the opening bid")).toBeVisible();

  // --- pause / resume (keyboard shortcut; wait until the console has applied the undo first)
  await expect(page.getByTestId("current-bid")).toHaveText("—");
  await expect(page.getByTestId("bid-OWL")).toBeEnabled();
  await page.keyboard.press("p");
  await expect(display.getByTestId("paused-banner")).toBeVisible();
  await page.getByTestId("resume").click();
  await expect(display.getByTestId("paused-banner")).toBeHidden();

  // --- unsold (with confirmation when bids exist), then end the auction
  await page.getByTestId("bid-OWL").click();
  await page.getByTestId("unsold").click();
  await page.getByRole("dialog").getByRole("button", { name: "Mark unsold" }).click();
  await expect(page.getByTestId("last-result")).toContainText("unsold");
  await page.getByTestId("end-auction").click();
  await expect(page.getByRole("dialog")).toContainText("disqualified");
  await page.getByRole("dialog").getByRole("button", { name: "End auction" }).click();
  await expect(display.getByTestId("display-final")).toBeVisible();
  await expect(display.getByTestId("final-HHK")).toContainText("Disqualified"); // 1 < minimum 3
  await expect(display.getByTestId("final-HHK")).toContainText("$10M");
  await display.screenshot({ path: "test-results/e2e-final-board.png" });
});
