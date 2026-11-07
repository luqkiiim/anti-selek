import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { e2eDatabaseUrl } from "./env";
import { adminCredentials, hostClubId, scoreSessionCode, signIn } from "./helpers";

function scorePlayer(index: number) {
  return { email: `score-player-${index}@example.com`, password: adminCredentials.password };
}

function refreshButton(page: Page) {
  return page.getByRole("button", { name: "Refresh", exact: true });
}

test("two opponents can discover a score by refreshing or waiting for the next check", async ({ page, browser }) => {
  const manualContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const timedContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const manual = await manualContext.newPage();
    const timed = await timedContext.newPage();
    await signIn(page, scorePlayer(1));
    await signIn(manual, scorePlayer(2));
    await signIn(timed, scorePlayer(3));
    await manual.clock.install();
    await timed.clock.install();
    await page.goto(`/session/${scoreSessionCode}`);
    await manual.goto(`/session/${scoreSessionCode}`);
    await timed.goto(`/session/${scoreSessionCode}`);
    await expect(refreshButton(manual)).toBeVisible();
    await expect(refreshButton(timed)).toBeVisible();

    await page.getByLabel("Team 1 score").fill("21");
    await page.getByLabel("Team 2 score").fill("18");
    await page.getByRole("button", { name: "Save score", exact: true }).click();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page.getByText("Waiting for score approval", { exact: true })).toBeVisible();

    const approve = (viewer: Page) => viewer.getByRole("button", { name: "Approve score", exact: true });
    await expect(approve(manual)).toHaveCount(0);
    await refreshButton(manual).click();
    await expect(approve(manual)).toBeVisible();
    await expect(approve(timed)).toHaveCount(0);
    await timed.clock.fastForward(30_000);
    await expect(approve(timed)).toBeVisible();
    await approve(timed).click();
    await expect(approve(timed)).toHaveCount(0);

    await manual.getByRole("button", { name: "More options", exact: true }).click();
    await manual.getByRole("button", { name: "Match history", exact: true }).click();
    await expect(refreshButton(manual)).toBeVisible();
    await expect(manual.getByText("1 completed match", { exact: true })).toBeVisible();
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const header = page.locator(".session-header");
      await expect(header.getByText(/Updated at/)).toBeVisible();
      expect(await header.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      const refresh = await refreshButton(page).boundingBox();
      const options = await header.getByRole("button", { name: "More options" }).boundingBox();
      expect(refresh!.x + refresh!.width).toBeLessThanOrEqual(options!.x);
    }
  } finally {
    await manualContext.close();
    await timedContext.close();
  }
});

test("interclub organizers see an invitation accepted on the next scheduled refresh", async ({ page, browser }) => {
  const partnerClubId = "community-score-e2e";
  const db = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl } } });
  const user = await db.user.findUniqueOrThrow({ where: { email: scorePlayer(1).email } });
  await db.clubAccess.update({
    where: { clubId_userId: { clubId: partnerClubId, userId: user.id } }, data: { role: "ADMIN" },
  });
  await db.$disconnect();
  const visitorContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const visitor = await visitorContext.newPage();
    await signIn(page, adminCredentials);
    await signIn(visitor, scorePlayer(1));
    const create = await page.request.post("/api/sessions", { data: {
      name: "Shared refresh verification", clubId: hostClubId, partnerClubId,
      courtCount: 1, scoringType: "POINTS", matchmakingStyle: "BALANCED",
      pairingMode: "OPEN", collabFormat: "INTERCLUB", collaborationVersion: 2,
      playerIds: ["user-admin-e2e", "user-host-1-e2e"],
      playerConfigs: ["user-admin-e2e", "user-host-1-e2e"].map(playerId => ({
        playerId, profileClubId: hostClubId, representingClubId: hostClubId, pool: "B",
      })),
    } });
    expect(create.ok(), await create.text()).toBe(true);
    const { code } = await create.json();
    await page.clock.install();
    await page.goto(`/session/${code}`);
    await visitor.goto(`/session/${code}`);
    const pending = page.getByText(/Invitation pending/);
    await expect(pending).toBeVisible();
    await visitor.getByRole("button", { name: "Accept invitation", exact: true }).click();
    await expect(visitor.getByText(/Invitation pending/)).toHaveCount(0);
    await expect(pending).toBeVisible();
    await page.clock.fastForward(30_000);
    await expect(pending).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Club collaboration" })).toBeVisible();
  } finally {
    await visitorContext.close();
  }
});
