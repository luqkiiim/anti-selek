import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { e2eDatabaseUrl } from "./env";
import { hostClubId, signInAsAdmin } from "./helpers";

test("category standings survive ending and reopening a grouped session", async ({ page }) => {
  test.setTimeout(120_000);
  const code = `completed-groups-${randomUUID()}`;
  const groupNames = ["Competitive division", "Social division"];
  const playerIds = [1, 2, 3, 4].map(index => `user-host-${index}-e2e`);
  const db = new PrismaClient({ datasourceUrl: e2eDatabaseUrl });
  try {
    const session = await db.session.create({ data: {
      code, clubId: hostClubId, name: "Category standings", status: "ACTIVE", type: "POINTS",
      poolsEnabled: true, poolAssignmentsInitialized: true,
      poolAName: groupNames[0], poolBName: groupNames[1], autoQueueEnabled: false,
      courts: { create: { courtNumber: 1 } },
      players: { create: playerIds.map((playerId, index) => ({ playerId, pool: index % 2 ? "B" : "A" })) },
    }, include: { courts: true } });
    const match = await db.match.create({ data: {
      sessionId: session.id, courtId: session.courts[0].id, status: "IN_PROGRESS",
      team1Player1Id: playerIds[0], team1Player2Id: playerIds[1],
      team2Player1Id: playerIds[2], team2Player2Id: playerIds[3],
    } });
    await db.court.update({ where: { id: session.courts[0].id }, data: { currentMatchId: match.id } });
  } finally {
    await db.$disconnect();
  }

  await signInAsAdmin(page);
  await page.goto(`/session/${code}`);
  await page.getByRole("textbox", { name: "Team 1 score" }).fill("21");
  await page.getByRole("textbox", { name: "Team 2 score" }).fill("15");
  await page.getByRole("button", { name: "Save score" }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Team 1 score" })).toHaveCount(0);
  await page.getByRole("navigation", { name: "Session navigation" }).getByRole("button", { name: "Standings" }).click();

  const table = page.getByRole("table", { name: "Player standings" });
  const filters = page.getByRole("group", { name: "Filter standings by group" });
  await expect(table).toBeVisible();
  const overallRows = await table.locator("tbody tr").allTextContents();
  expect(overallRows).toHaveLength(4);
  const categoryRows: string[][] = [];
  for (const name of groupNames) {
    await filters.getByRole("button", { name, exact: true }).click();
    await expect(table.locator("tbody tr")).toHaveCount(2);
    await expect(table.locator("tbody tr td:first-child")).toHaveText(["1", "2"]);
    categoryRows.push(await table.locator("tbody tr").allTextContents());
  }
  expect(categoryRows[0].join()).toContain("Host Player 1");
  expect(categoryRows[0].join()).toContain("Host Player 3");
  expect(categoryRows[1].join()).toContain("Host Player 2");
  expect(categoryRows[1].join()).toContain("Host Player 4");

  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "End session", exact: true }).click();
  await page.getByRole("dialog", { name: "End this session?" }).getByRole("button", { name: "End session", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Session complete" })).toBeVisible();

  for (const reopen of [false, true]) {
    if (reopen) await page.reload();
    await expect(page.getByRole("heading", { name: "Session complete" })).toBeVisible();
    await filters.getByRole("button", { name: "All", exact: true }).click();
    await expect(table.locator("tbody tr")).toHaveText(overallRows);
    for (const [index, name] of groupNames.entries()) {
      await filters.getByRole("button", { name, exact: true }).click();
      await expect(table.locator("tbody tr")).toHaveText(categoryRows[index]);
      await expect(filters.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
    }
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/completed-session-groups-320.png", fullPage: true });
});
