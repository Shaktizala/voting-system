import { expect, test, request } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";

/**
 * End-to-end journey:
 * admin login → create participant-facing room with a custom category and a
 * linked team → activate → open presentation round → participant joins by
 * code → votes when voting opens → admin sees live progress → close →
 * publish → CSV export downloads.
 *
 * Requires seed data (`npm run seed` in server/) — uses admin + carla.
 */
const WEB = "http://localhost:5173";
const API = "http://localhost:4000";
const ROOM_NAME = `E2E Room ${Math.random().toString(36).slice(2, 7)}`;

async function login(pageContext: Page, username: string, password: string) {
  await pageContext.goto(`${WEB}/login`);
  await pageContext.getByLabel("Username or email").fill(username);
  await pageContext.getByLabel("Password").fill(password);
  await pageContext.getByRole("button", { name: "Sign in" }).click();
}

test("full voting workflow works end to end", async ({ browser }) => {
  // ---- API health
  const apiCtx = await request.newContext();
  const health = await apiCtx.get(`${API}/api/health`);
  expect(health.status()).toBe(200);
  await apiCtx.dispose();

  const adminPage = await (await browser.newContext()).newPage();
  const voterPage = await (await browser.newContext()).newPage();

  // ---- admin signs in and lands on the dashboard
  await login(adminPage, "admin", "Admin123!");
  await adminPage.waitForURL("**/admin");

  // ---- create a room that any participant can join with the code
  await adminPage.getByRole("link", { name: "Rooms" }).click();
  await adminPage.getByLabel("Room name").fill(ROOM_NAME);
  await adminPage.getByLabel("Access mode").selectOption("OPEN_WITH_CODE");
  await adminPage.getByRole("button", { name: "Create room" }).click();
  await adminPage.waitForSelector(`text=${ROOM_NAME}`);

  // ---- configure: custom category + linked team
  await adminPage.getByRole("link", { name: ROOM_NAME }).first().click();
  await adminPage.getByLabel("Category name").fill("E2E Quality");
  await adminPage.getByRole("button", { name: "Add category" }).click();
  await adminPage.waitForSelector("text=E2E Quality");

  await adminPage.getByRole("tab", { name: "teams" }).click();
  await adminPage.getByLabel("Team").selectOption({ label: "Team Alpha" });
  await adminPage.getByRole("button", { name: "Add to room" }).click();
  await adminPage.waitForSelector("text=Team linked");

  // ---- activate the room and grab the join code
  await adminPage.getByRole("button", { name: "Activate room" }).click();
  const joinCode = (await adminPage.locator("[data-testid=join-code]").textContent())?.trim();
  expect(joinCode).toMatch(/^[A-Z2-9]{6,8}$/);

  // ---- admin presents team 1 on the live dashboard (round is PENDING)
  await adminPage.getByRole("link", { name: "Open live dashboard →" }).click();
  await adminPage.waitForSelector("[data-testid=presenting-team]");
  expect(await adminPage.locator("[data-testid=presenting-team]").textContent()).toBe("— none selected —");
  await adminPage.getByLabel("Select presenting team").selectOption({ label: "1. Team Alpha" });
  await adminPage.getByRole("button", { name: "Present this team" }).click();
  await adminPage.waitForSelector("[data-testid=open-voting]", { timeout: 30_000 });

  // ---- participant joins via code from their home page
  await login(voterPage, "carla", "Participant123!");
  await voterPage.waitForURL("**/rooms");
  await voterPage.getByLabel("Join code (6–8 characters)").fill(joinCode!);
  await voterPage.getByRole("button", { name: "Join room" }).click();
  await voterPage.waitForURL("**/room/**");
  await voterPage.waitForSelector("[data-testid=presenting-team]");
  expect(await voterPage.locator("[data-testid=presenting-team]").textContent()).toContain("Team Alpha");
  await voterPage.waitForSelector("[data-testid=waiting-presenting]"); // round not open yet

  // ---- admin opens voting; participant sees the ballot update automatically
  await adminPage.getByTestId("open-voting").click();
  await voterPage.getByLabel("Score for E2E Quality").waitFor({ state: "visible", timeout: 30_000 });
  await voterPage.getByLabel("Score for E2E Quality").fill("8");

  // self-vote guard: carla is on Team Beta, so Team Alpha is fair game — the
  // quick-step buttons reflect the category range (1–10)
  await voterPage.getByTestId("review-vote").click();
  await voterPage.waitForSelector("text=Review your scores");
  await voterPage.getByTestId("confirm-vote").click();

  // ---- live progress on the moderator dashboard shows 1 vote
  await expect(adminPage.locator("[data-testid=progress-count]")).toHaveText("1", { timeout: 30_000 });

  // participant can edit while the round is open (allowVoteEdit default)
  await voterPage.getByLabel("Score for E2E Quality").fill("9");
  await voterPage.getByTestId("review-vote").click();
  await voterPage.getByTestId("confirm-vote").click();
  await voterPage.waitForSelector("text=Vote updated");

  // ---- admin closes the round; participant sees voting closed
  await adminPage.getByTestId("close-voting").click();
  await voterPage.waitForSelector("[data-testid=voting-closed]");

  // ---- results: publish, then export summary CSV
  await adminPage.getByRole("link", { name: "Results →" }).click();
  await adminPage.waitForSelector("[data-testid=publish-results]");
  await adminPage.getByTestId("publish-results").click();
  await adminPage.waitForSelector("text=Results visibility updated");
  await adminPage.waitForSelector("text=Ranking", { timeout: 30_000 });
  await adminPage.getByRole("cell", { name: "Team Alpha" }).waitFor({ timeout: 30_000 }); // rank row exists

  const download = adminPage.waitForEvent("download");
  await adminPage.getByRole("button", { name: "Export summary (CSV)" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.csv$/);
});

test("rejects bad login credentials", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await login(page, "admin", "wrong-password");
  await page.waitForSelector("text=Invalid credentials");
});
