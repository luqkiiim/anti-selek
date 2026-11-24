import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { expectCurrentUi } from "./current-ui";
import { e2eDatabaseUrl } from "./env";
import { hostClubId, scoreSessionCode, signInAsAdmin } from "./helpers";

test.use({ viewport: { width: 390, height: 844 } });

function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

async function openClear(page: Page) {
  await page.getByRole("button", { name: "Court 1 options", exact: true }).click();
  await page.getByRole("dialog", { name: "Court 1 options", exact: true }).getByRole("button", { name: "Clear court", exact: true }).click();
  return page.getByRole("dialog", { name: "Clear court?", exact: true });
}

for (const delayedRead of ["existing poll", "follow-up refresh"] as const) {
  test(`confirmed clear removes player names without waiting for ${delayedRead}`, async ({ page }) => {
    await signInAsAdmin(page);
    const endpoint = `/api/sessions/${scoreSessionCode}`;
    const response = await page.request.get(endpoint);
    expect(response.ok()).toBe(true);
    const snapshot = await response.json();
    const match = snapshot.courts[0].currentMatch;
    const cleared = { ...snapshot, courts: snapshot.courts.map((court: { id: string }) => court.id === snapshot.courts[0].id ? { ...court, currentMatch: null } : court) };
    const read = gate(), readStarted = gate(), mutation = gate(), accepted = gate();
    let holdRead = false, committed = false, mutations = 0;
    await page.route(`**${endpoint}**`, async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === endpoint && route.request().method() === "GET") {
        const body = committed ? cleared : snapshot;
        if (holdRead) { readStarted.release(); await read.promise; }
        await route.fulfill({ json: body });
      } else if (path === endpoint + "/generate-match") {
        mutations++;
        await mutation.promise;
        committed = true;
        await route.fulfill({ json: { ok: true, undoneMatchId: match.id, autoAssignedMatch: null, queuedMatchCleared: false, queuedMatch: null } });
        accepted.release();
      } else await route.continue();
    });
    try {
      await page.goto(`/session/${scoreSessionCode}`);
      const court = page.locator(".court-card").first();
      await expect(court.getByRole("button", { name: "Player actions for Score Player 1", exact: true })).toBeVisible();
      const dialog = await openClear(page);
      holdRead = true;
      if (delayedRead === "existing poll") {
        await page.clock.setFixedTime(new Date(Date.now() + 11_000));
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        await readStarted.promise;
      }
      await dialog.getByRole("button", { name: "Clear court", exact: true }).click();
      await expect(dialog.getByRole("button", { name: "Clear court", exact: true })).toBeDisabled();
      await expect(court.locator(".team-row")).toHaveCount(2);
      mutation.release();
      await accepted.promise;
      await expect(dialog).toBeHidden({ timeout: 500 });
      await expect(court.locator(".team-row")).toHaveCount(0, { timeout: 500 });
      await expect(court.getByRole("button", { name: /Create/ })).toBeVisible();
      read.release();
      await expect(court.locator(".team-row")).toHaveCount(0);
      expect(mutations).toBe(1);
    } finally { mutation.release(); read.release(); }
  });
}

test("a rejected clear keeps the lineup and allows recovery", async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto(`/session/${scoreSessionCode}`);
  const court = page.locator(".court-card").first();
  await expect(court.locator(".team-row")).toHaveCount(2);
  await page.route(`**/api/sessions/${scoreSessionCode}/generate-match`, route => route.fulfill({ status: 409, json: { error: "This match has changed. Refresh and try again." } }));
  const dialog = await openClear(page);
  await dialog.getByRole("button", { name: "Clear court", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("This match has changed. Refresh and try again.");
  await expect(dialog.getByRole("button", { name: "Clear court", exact: true })).toBeEnabled();
  await expect(court.locator(".team-row")).toHaveCount(2);
});

test("a real clear commits the empty court and preserves its players", async ({ page }) => {
  await signInAsAdmin(page);
  const endpoint = `/api/sessions/${scoreSessionCode}`;
  const before = await (await page.request.get(endpoint)).json();
  await page.goto(`/session/${scoreSessionCode}`);
  const court = page.locator(".court-card").first();
  await expect(court.locator(".team-row")).toHaveCount(2);
  const dialog = await openClear(page);
  const response = page.waitForResponse(response => new URL(response.url()).pathname === endpoint + "/generate-match" && response.request().method() === "POST");
  const started = Date.now();
  await dialog.getByRole("button", { name: "Clear court", exact: true }).click();
  const accepted = await response;
  const confirmedAt = Date.now();
  expect(accepted.ok()).toBe(true);
  expect((await accepted.json()).undoneMatchId).toBe(before.courts[0].currentMatch.id);
  await expect(court.locator(".team-row")).toHaveCount(0, { timeout: 500 });
  await expect(dialog).toBeHidden({ timeout: 500 });
  console.log(JSON.stringify({ clearPostMs: confirmedAt - started, clearedWithinMsOfResponse: Date.now() - confirmedAt }));
  const after = await (await page.request.get(endpoint)).json();
  expect(after.courts[0].currentMatch).toBeNull();
  expect(after.players.map((p: { userId: string }) => p.userId).sort()).toEqual(before.players.map((p: { userId: string }) => p.userId).sort());
});

test("hosts can cancel or clear every unfinished court and Next up on mobile", async ({ page }) => {
  const db = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl } } });
  const code = "clear-all-courts-e2e";
  try {
    const players = Array.from({ length: 12 }, (_, index) => ({
      id: `${code}-player-${index}`, name: `Clear Court Player ${index + 1}`, gender: "MALE",
    }));
    await db.player.createMany({ data: players });
    const session = await db.session.create({
      data: {
        code, clubId: hostClubId, name: "Clear Courts Session", type: "POINTS", status: "ACTIVE", autoQueueEnabled: true,
        players: { create: players.map(({ id, gender }) => ({ playerId: id, gender, isGuest: true })) },
        courts: { create: [1, 2].map(courtNumber => ({ courtNumber })) },
      },
      include: { courts: { orderBy: { courtNumber: "asc" } } },
    });
    const teams = (offset: number) => ({
      team1Player1Id: players[offset].id, team1Player2Id: players[offset + 1].id,
      team2Player1Id: players[offset + 2].id, team2Player2Id: players[offset + 3].id,
    });
    for (const [index, court] of session.courts.entries()) {
      const match = await db.match.create({
        data: { sessionId: session.id, courtId: court.id, status: "IN_PROGRESS", ...teams(index * 4) },
      });
      await db.court.update({ where: { id: court.id }, data: { currentMatchId: match.id } });
    }
    await db.queuedMatch.create({ data: { sessionId: session.id, ...teams(8), requestedMatchType: "MENS" } });

    await signInAsAdmin(page);
    await page.goto(`/session/${code}`);
    await expectCurrentUi(page, "session");
    const nextUp = page.getByRole("button", { name: "Next up options" });
    const occupied = page.locator(".court-card .team-row");
    const createMatches = page.getByRole("button", { name: "Create matches 2", exact: true });
    const draftScore = page.locator(".court-card").first().getByRole("textbox", { name: "Team 1 score" });
    await draftScore.fill("21");
    await expect(occupied).toHaveCount(4);
    await expect(nextUp).toBeVisible();

    const options = page.getByRole("dialog", { name: "Options", exact: true });
    const confirm = page.getByRole("dialog", { name: "Clear all courts?" });
    const clearButton = { name: "Clear all courts", exact: true };
    await page.getByRole("button", { name: "More options" }).click();
    await options.getByRole("button", clearButton).click();
    await expect(confirm).toContainText("Clear 2 courts? Any draft scores and Next up will be discarded.");
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
    await options.getByRole("button", { name: "Close" }).click();
    await expect(draftScore).toHaveValue("21");
    await expect(occupied).toHaveCount(4);
    await expect(nextUp).toBeVisible();

    await page.getByRole("button", { name: "More options" }).click();
    await options.getByRole("button", clearButton).click();
    await confirm.getByRole("button", clearButton).click();
    await expect(confirm).toBeHidden();
    await expect(occupied).toHaveCount(0);
    await expect(nextUp).toHaveCount(0);
    await expect(createMatches).toBeEnabled();
    await page.reload();
    await expect(occupied).toHaveCount(0);
    await expect(nextUp).toHaveCount(0);
    await createMatches.click();
    await expect(occupied).toHaveCount(4);
  } finally {
    await db.$disconnect();
  }
});
