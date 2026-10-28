import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { e2eBaseURL, e2eDatabaseUrl } from "./env";
import { getHostPlayerCredentials, hostClubId, signIn, signInAsAdmin } from "./helpers";

test("two viewers receive scores and final standings with one session timer", async ({ page, browser }, testInfo) => {
  test.setTimeout(120_000);
  const code = `polling-${randomUUID()}`;
  const playerIds = [1, 2, 3, 4].map(index => `user-host-${index}-e2e`);
  const db = new PrismaClient({ datasourceUrl: e2eDatabaseUrl });
  try {
    const session = await db.session.create({ data: {
      code, clubId: hostClubId, name: "Polling check", status: "ACTIVE", type: "POINTS",
      autoQueueEnabled: false, courts: { create: { courtNumber: 1 } },
      players: { create: playerIds.map(playerId => ({ playerId })) },
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

  const hostReads = { session: 0, standings: 0 };
  page.on("request", request => {
    if (request.method() !== "GET") return;
    const path = new URL(request.url()).pathname;
    if (path === `/api/sessions/${code}`) hostReads.session++;
    if (path === `/api/sessions/${code}/leaderboard`) hostReads.standings++;
  });
  await signInAsAdmin(page);
  await page.goto(`/session/${code}`);
  await expect(page.getByRole("textbox", { name: "Team 1 score" })).toBeVisible();
  await page.waitForTimeout(6_000);
  expect(hostReads.session).toBeLessThanOrEqual(3);
  expect(hostReads.standings).toBe(0);

  const viewerContext = await browser.newContext({ baseURL: e2eBaseURL });
  try {
    const viewer = await viewerContext.newPage();
    let viewerSessionReads = 0;
    viewer.on("request", request => {
      if (request.method() === "GET" && new URL(request.url()).pathname === `/api/sessions/${code}`) viewerSessionReads++;
    });
    await signIn(viewer, getHostPlayerCredentials(1));
    await viewer.goto(`/session/${code}?tab=standings`);
    const viewerPoints = viewer.getByRole("table", { name: "Player standings" })
      .locator("tbody tr").filter({ hasText: "Host Player 1" }).locator("td").nth(2);
    await expect(viewerPoints).toHaveText("0");
    await page.getByRole("textbox", { name: "Team 1 score" }).fill("21");
    await page.getByRole("textbox", { name: "Team 2 score" }).fill("15");
    await page.getByRole("button", { name: "Save score" }).click();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Team 1 score" })).toHaveCount(0);
    await expect(viewerPoints).toHaveText("3", { timeout: 12_000 });

    await page.getByRole("button", { name: "More options" }).click();
    await page.getByRole("button", { name: "End session", exact: true }).click();
    await page.getByRole("dialog", { name: "End this session?" }).getByRole("button", { name: "End session", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Session complete" })).toBeVisible();
    await expect(viewer.getByRole("heading", { name: "Session complete" })).toBeVisible();
    await expect(viewerPoints).toHaveText("3");
    await page.waitForLoadState("networkidle");
    await viewer.waitForLoadState("networkidle");
    const finalHostReads = hostReads.session;
    const finalViewerReads = viewerSessionReads;
    await page.waitForTimeout(6_000);
    expect(hostReads.session).toBe(finalHostReads);
    expect(viewerSessionReads).toBe(finalViewerReads);
    await testInfo.attach("session-request-counts", {
      body: JSON.stringify({ hostReads, viewerSessionReads, completedScheduledReads: 0 }),
      contentType: "application/json",
    });
  } finally {
    await viewerContext.close();
  }
});
