import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { e2eDatabaseUrl } from "./env";
import { scoreSessionCode, signInAsAdmin } from "./helpers";

test.use({ viewport: { width: 390, height: 844 } });

async function changeCourtCount(page: Page, count: number) {
  await page.getByRole("button", { name: "More options", exact: true }).click();
  await page.getByRole("button", { name: "Session settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Session settings", exact: true });
  await settings.getByLabel("Court count", { exact: true }).selectOption(String(count));
  const saved = page.waitForResponse(response => new URL(response.url()).pathname === `/api/sessions/${scoreSessionCode}` && response.request().method() === "PATCH");
  await settings.getByRole("button", { name: "Save settings", exact: true }).click();
  const response = await saved;
  expect(response.ok(), await response.text()).toBe(true);
  await expect(settings).toBeHidden();
  await expect(page.locator(".court-card")).toHaveCount(count);
}

test("changes courts during play, preserving matches, ratings, history and reopened court IDs", async ({ page }) => {
  const db = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl } } });
  try {
    await signInAsAdmin(page);
    const endpoint = `/api/sessions/${scoreSessionCode}`;
    const initial = await (await page.request.get(endpoint)).json();
    const playingMatchId = initial.courts[0].currentMatch.id;
    await page.goto(`/session/${scoreSessionCode}`);
    await changeCourtCount(page, 3);
    const three = await (await page.request.get(endpoint)).json();
    expect(three.courts[0].currentMatch.id).toBe(playingMatchId);
    const lastCourt = three.courts[2];
    await db.court.update({ where: { id: lastCourt.id }, data: { label: "East" } });
    const liveMatch = await db.match.findUniqueOrThrow({ where: { id: playingMatchId } });
    const history = await db.match.create({ data: {
      sessionId: initial.id, courtId: lastCourt.id, status: "COMPLETED", completedAt: new Date(),
      team1Player1Id: liveMatch.team1Player1Id, team1Player2Id: liveMatch.team1Player2Id,
      team2Player1Id: liveMatch.team2Player1Id, team2Player2Id: liveMatch.team2Player2Id,
      team1Score: 21, team2Score: 18, winnerTeam: 1,
    } });
    const playersBefore = await db.sessionPlayer.findMany({ where: { sessionId: initial.id }, orderBy: { id: "asc" } });
    const ratingsBefore = await db.clubMember.findMany({ where: { clubId: initial.clubId }, orderBy: { id: "asc" } });
    await page.reload();
    await changeCourtCount(page, 1);
    const one = await (await page.request.get(endpoint)).json();
    expect(one.status).toBe("ACTIVE");
    expect(one.courts[0].currentMatch.id).toBe(playingMatchId);
    expect(one.matches.some((match: { id: string }) => match.id === history.id)).toBe(true);
    expect(await db.match.findUnique({ where: { id: history.id } })).toEqual(history);
    expect(await db.sessionPlayer.findMany({ where: { sessionId: initial.id }, orderBy: { id: "asc" } })).toEqual(playersBefore);
    expect(await db.clubMember.findMany({ where: { clubId: initial.clubId }, orderBy: { id: "asc" } })).toEqual(ratingsBefore);
    expect((await db.court.findUniqueOrThrow({ where: { id: lastCourt.id } })).isActive).toBe(false);
    const rejected = await page.request.post(`${endpoint}/generate-match`, { data: { courtId: lastCourt.id } });
    expect(rejected.status()).toBe(403); // Existing invalid-target privacy response.
    expect(await db.match.count({ where: { courtId: lastCourt.id } })).toBe(1);
    await page.reload();
    await expect(page.locator(".court-card")).toHaveCount(1);
    await changeCourtCount(page, 3);
    const reopened = await (await page.request.get(endpoint)).json();
    expect(reopened.courts.map((court: { id: string }) => court.id)).toEqual(three.courts.map((court: { id: string }) => court.id));
    expect(reopened.courts[2].label).toBe("East");
    expect(await db.court.count({ where: { sessionId: initial.id } })).toBe(3);
    expect(await db.match.findUnique({ where: { id: history.id } })).toEqual(history);
    await page.screenshot({ path: "test-results/live-court-quantity.png", fullPage: true });
  } finally { await db.$disconnect(); }
});
