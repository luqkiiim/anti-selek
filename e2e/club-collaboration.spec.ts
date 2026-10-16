import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { e2eDatabaseUrl } from "./env";
import { adminCredentials, hostClubId, signIn } from "./helpers";

const visitingClubId = "community-score-e2e";
const visitorCredentials = {
  email: "score-player-1@example.com",
  password: "Password123!",
};
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
test.beforeAll(async () => {
  // This spec runs against its explicitly isolated disposable E2E database.
  const db = new PrismaClient({ datasourceUrl: e2eDatabaseUrl });
  try {
    await db.clubAccess.update({
      where: {
        clubId_userId: {
          clubId: visitingClubId,
          userId: "account-user-score-1-e2e",
        },
      },
      data: { role: "ADMIN" },
    });
    await db.clubAccess.update({
      where: {
        clubId_userId: {
          clubId: visitingClubId,
          userId: "account-user-admin-e2e",
        },
      },
      data: { role: "MEMBER" },
    });
  } finally {
    await db.$disconnect();
  }
});
async function mobileShot(page: Page, name: string, width: number) {
  await page.setViewportSize({ width, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: `test-results/club-collaboration/${name}-${width}.png`,
    fullPage: true,
  });
}
async function addPlayer(page: Page, name: string) {
  await page
    .getByRole("button", { name: "Manage my club’s players", exact: true })
    .first()
    .click();
  const sheet = page.getByRole("dialog", { name: "Players", exact: true });
  await sheet
    .getByRole("button", { name: "Add club members", exact: true })
    .click();
  const roster = page.getByRole("dialog", {
    name: "Add club members",
    exact: true,
  });
  await roster
    .locator(".pm-player-card")
    .filter({ has: page.getByText(name, { exact: true }) })
    .getByRole("button", { name: "Add to session", exact: true })
    .click();
  await expect(sheet.getByText(name, { exact: true })).toBeVisible();
  await sheet.getByRole("button", { name: "Close", exact: true }).click();
}
async function savePair(page: Page) {
  const response = page.waitForResponse(
    (result) =>
      result.url().includes("/lineup/") &&
      result.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Save pair", exact: true }).click();
  const result = await response;
  expect(
    result.ok(),
    `${result.request().postData()} => ${await result.text()}`,
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Save pair", exact: true }),
  ).toHaveCount(0);
}
test("two clubs prepare, agree, select their own lineup, and finish a BO3 on mobile", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  page.setDefaultTimeout(20_000);
  await signIn(page, adminCredentials);
  await page.goto(`/club/${hostClubId}?tab=setup`);
  await page
    .getByLabel("Session name", { exact: true })
    .fill("Club collaboration mobile");
  await page.getByRole("button", { name: "More courts", exact: true }).click();
  await page
    .getByLabel("Find a partner club", { exact: true })
    .fill("E2E Score");
  await page.getByRole("button", { name: /E2E Score Club.*members/ }).click();
  await page.getByRole("radio", { name: "Club vs club", exact: true }).check();
  await page.getByRole("radio", { name: "Best of three", exact: true }).check();
  await page.getByRole("radio", { name: "Lineup", exact: true }).check();
  await expect(page.getByLabel("Session name", { exact: true })).toHaveValue(
    "Club collaboration mobile",
  );
  await expect(page.getByLabel("Court count", { exact: true })).toHaveText("3");
  await expect(
    page.getByRole("radio", { name: "Unrated", exact: true }),
  ).toBeChecked();
  await mobileShot(page, "setup", 320);
  const creation = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/sessions") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Prepare session", exact: true })
    .click();
  const result = await creation;
  expect(result.ok(), await result.text()).toBe(true);
  const { code } = await result.json();
  await expect(page).toHaveURL(new RegExp(`/session/${code}`));
  await expect(
    page.getByRole("button", { name: "Start session", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText("No players yet", { exact: true })).toBeVisible();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const visitor = await context.newPage();
  visitor.setDefaultTimeout(20_000);
  try {
    await signIn(visitor, visitorCredentials);
    await visitor.goto(`/session/${code}`);
    await expect(
      visitor.getByRole("button", { name: "Cancel invitation", exact: true }),
    ).toHaveCount(0);
    await visitor
      .getByRole("button", { name: "Accept invitation", exact: true })
      .click();
    await visitor
      .getByRole("button", {
        name: "Confirm rules · E2E Score Club",
        exact: true,
      })
      .click();
    await expect(
      page.getByText("E2E Score Club", { exact: true }).first(),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Confirm rules · E2E Host Club",
        exact: true,
      })
      .click();
    await addPlayer(page, "Host Player 2");
    await addPlayer(page, "Host Player 3");
    await addPlayer(visitor, "Score Player 1");
    await addPlayer(visitor, "Score Player 2");
    await expect(
      visitor.getByRole("button", { name: "Add match", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Add match", exact: true }).click();
    await page
      .getByLabel("E2E Host Club player 1 for match 1", { exact: true })
      .selectOption("user-host-2-e2e");
    await page
      .getByLabel("E2E Host Club player 2 for match 1", { exact: true })
      .selectOption("user-host-3-e2e");
    await savePair(page);
    await visitor.reload();
    await visitor
      .getByLabel("E2E Score Club player 1 for match 1", { exact: true })
      .selectOption("user-score-1-e2e");
    await visitor
      .getByLabel("E2E Score Club player 2 for match 1", { exact: true })
      .selectOption("user-score-2-e2e");
    await savePair(visitor);
    await page.reload();
    await page
      .getByRole("button", { name: "Confirm pair", exact: true })
      .click();
    await visitor
      .getByRole("button", { name: "Confirm pair", exact: true })
      .click();
    await expect(page.locator(".lineup-confirmation")).toHaveText([
      "Confirmed",
      "Confirmed",
    ]);
    await expect(visitor.locator(".lineup-confirmation")).toHaveText([
      "Confirmed",
      "Confirmed",
    ]);
    await mobileShot(visitor, "visitor-lineup", 320);
    await mobileShot(page, "host-lineup", 390);
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator(".collaboration-lineup").screenshot({ path: "test-results/club-collaboration/lineup-sheet-1280.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: "Start session", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Create matches", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Start match", exact: true })
      .click();
    await page.getByLabel("Game 1 team 1 score", { exact: true }).fill("21");
    await page.getByLabel("Game 1 team 2 score", { exact: true }).fill("19");
    await page
      .getByRole("button", { name: "Save progress", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Save progress", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Add game", exact: true }).click();
    await page.getByLabel("Game 2 team 1 score", { exact: true }).fill("0");
    await page.getByLabel("Game 2 team 2 score", { exact: true }).fill("21");
    await page.getByRole("button", { name: "Add game", exact: true }).click();
    await page.getByLabel("Game 3 team 1 score", { exact: true }).fill("21");
    await page.getByLabel("Game 3 team 2 score", { exact: true }).fill("19");
    await mobileShot(page, "series-score", 320);
    await page
      .getByRole("button", { name: "Finish match", exact: true })
      .click();
    await expect(
      page.getByLabel("Game 1 team 1 score", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "More options", exact: true })
      .click();
    await page
      .getByRole("button", { name: "End session", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "End session", exact: true })
      .click();
    await expect(
      page.getByText("Session complete", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Unrated", { exact: true }).first(),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Match history", exact: true })
      .click();
    await expect(page.getByLabel("Game scores", { exact: true })).toContainText(
      "G1 21–19",
    );
    await expect(page.getByLabel("Game scores", { exact: true })).toContainText(
      "G2 0–21",
    );
    await expect(page.getByLabel("Game scores", { exact: true })).toContainText(
      "G3 21–19",
    );
    await mobileShot(page, "history", 390);
  } finally {
    await context.close();
  }
});

test("club vs club free play defaults to one unrated game and retains host match controls", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(20_000);
  await signIn(page, adminCredentials);
  await page.goto(`/club/${hostClubId}?tab=setup`);
  await page
    .getByLabel("Session name", { exact: true })
    .fill("Collaboration free play");
  await page
    .getByLabel("Find a partner club", { exact: true })
    .fill("E2E Score");
  await page.getByRole("button", { name: /E2E Score Club.*members/ }).click();
  await page.getByRole("radio", { name: "Club vs club", exact: true }).check();
  await expect(
    page.getByRole("radio", { name: "Free play", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("radio", { name: "Single game", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("radio", { name: "Unrated", exact: true }),
  ).toBeChecked();
  const creation = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/sessions") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Prepare session", exact: true })
    .click();
  const response = await creation;
  expect(response.ok(), await response.text()).toBe(true);
  const { code } = await response.json();
  await expect(page).toHaveURL(new RegExp(`/session/${code}`));
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const visitor = await context.newPage();
  visitor.setDefaultTimeout(20_000);
  try {
    await signIn(visitor, visitorCredentials);
    await visitor.goto(`/session/${code}`);
    await visitor
      .getByRole("button", { name: "Accept invitation", exact: true })
      .click();
    await visitor
      .getByRole("button", {
        name: "Confirm rules · E2E Score Club",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name: "Confirm rules · E2E Host Club",
        exact: true,
      })
      .click();
    // Roster UI is exercised above; these own-account requests keep this format check focused.
    for (const [owner, clubId, ids] of [
      [page, hostClubId, ["user-host-2-e2e", "user-host-3-e2e"]],
      [visitor, visitingClubId, ["user-score-1-e2e", "user-score-2-e2e"]],
    ] as const) {
      for (const playerId of ids) {
        const added = await owner.request.post(`/api/sessions/${code}/join`, {
          data: {
            playerId,
            profileClubId: clubId,
            representingClubId: clubId,
            pool: "A",
          },
        });
        expect(added.ok(), await added.text()).toBe(true);
      }
    }
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Lineup", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Start session", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Create matches", exact: true })
      .click();
    await page.getByLabel("Team 1 score", { exact: true }).fill("21");
    await page.getByLabel("Team 2 score", { exact: true }).fill("18");
    await mobileShot(page, "freeplay-single-game", 390);
    await page.getByRole("button", { name: "Save score", exact: true }).click();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page.getByLabel("Team 1 score", { exact: true })).toHaveCount(
      0,
    );
    const saved = await (
      await page.request.get(`/api/sessions/${code}`)
    ).json();
    expect(saved).toMatchObject({
      collaborationVersion: 2,
      schedulingMode: "FREE_PLAY",
      scoringFormat: "SINGLE_GAME",
      ratingMode: "UNRATED",
    });
    expect(saved.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "COMPLETED",
          team1Score: 21,
          team2Score: 18,
          winnerTeam: 1,
        }),
      ]),
    );
  } finally {
    await context.close();
  }
});
