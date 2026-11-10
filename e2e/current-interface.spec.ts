import { expect, test, type Page } from "@playwright/test";
import { hostClubId, signInAsAdmin } from "./helpers";

async function capture(page: Page, name: string, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: `test-results/current-interface/${name}-${width}.png`, fullPage: true });
}

test("admin edits linked pairing through the current route and updates an active session, with mixed pairing off", async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signInAsAdmin(page);
  const playerIds = ["user-admin-e2e", "user-host-1-e2e", "user-host-2-e2e", "user-host-3-e2e"];
  const created = await page.request.post("/api/sessions", { data: {
    name: "Mid-session pairing check", clubId: hostClubId, courtCount: 1,
    scoringType: "POINTS", matchmakingStyle: "BALANCED", pairingMode: "OPEN", playerIds,
    playerConfigs: playerIds.map(playerId => ({ playerId, profileClubId: hostClubId })),
  } });
  expect(created.ok(), await created.text()).toBe(true);
  const { code } = await created.json();
  const started = await page.request.post(`/api/sessions/${code}/start`);
  expect(started.ok(), await started.text()).toBe(true);
  const sessionPlayer = async () => {
    const response = await page.request.get(`/api/sessions/${code}`);
    expect(response.ok()).toBe(true);
    const session = await response.json();
    expect(session.status).toBe("ACTIVE");
    return session.players.find((player: { userId: string }) => player.userId === "user-host-1-e2e");
  };
  expect(await sessionPlayer()).toMatchObject({ mixedSideOverride: null });
  await page.goto(`/community/${hostClubId}/admin?tab=members&tools=advanced`);
  await expect(page).toHaveURL(`/club/${hostClubId}/admin?tab=players`);
  await page.getByRole("button", { name: "Edit Host Player 1", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit Host Player 1", exact: true });
  await editor.getByText("Advanced pairing", { exact: true }).click();
  await editor.getByLabel("Mixed-pairing level", { exact: true }).selectOption("LOWER");
  for (const width of [320, 390, 1280]) await capture(page, "linked-player-pairing", width);
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(editor).not.toBeVisible();
  expect(await sessionPlayer()).toMatchObject({ mixedSideOverride: "LOWER", partnerPreference: "OPEN" });
  await page.getByRole("button", { name: "Edit Host Player 1", exact: true }).click();
  await expect(editor.locator("summary").filter({ hasText: "Advanced pairing" })).toContainText("Lower level");
  await editor.getByText("Advanced pairing", { exact: true }).click();
  await editor.getByLabel("Mixed-pairing level", { exact: true }).selectOption("");
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(editor).not.toBeVisible();
  expect(await sessionPlayer()).toMatchObject({ mixedSideOverride: null, partnerPreference: "OPEN" });
});

test("old practice bookmarks open regular screens and keep existing data", async ({ page }) => {
  await signInAsAdmin(page);

  // Seed a private playground as if the account had used the previous UI.
  const response = await page.request.post("/api/tutorial-playground");
  expect(response.ok()).toBe(true);
  const { playground } = await response.json();
  const { clubId, sessionCode } = playground as { clubId: string; sessionCode: string };
  const sessionUrl = `/session/${sessionCode}`;
  const before = await (await page.request.get(`/api/sessions/${sessionCode}`)).json();
  expect(before.isTest).toBe(true);

  await page.goto("/?chooser=1");
  await expect(page.getByRole("button", { name: "Create club", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Practice", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Tutorial playground/ })).toHaveCount(0);

  await page.goto(`/club/${clubId}?tools=practice`);
  await expect(page).toHaveURL(`/club/${clubId}?tab=sessions`);
  await expect(page.getByRole("heading", { name: "Past sessions", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Practice sessions", exact: true })).toHaveCount(0);

  await page.goto(`${sessionUrl}?tools=practice&practice=1&tab=courts`);
  await expect(page).toHaveURL(`${sessionUrl}?tab=courts`);
  await page.getByRole("button", { name: "More options", exact: true }).click();
  const options = page.getByRole("dialog", { name: "Options", exact: true });
  await expect(options.getByRole("button", { name: "Match history", exact: true })).toBeVisible();
  await expect(options.getByRole("button", { name: "Practice tools", exact: true })).toHaveCount(0);

  await page.goto(`/club/${clubId}/admin?tools=practice`);
  await expect(page).toHaveURL(`/club/${clubId}/admin?tab=settings`);
  await expect(page.getByLabel("Club name", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset playground", exact: true })).toHaveCount(0);
  await page.goto(`/club/${hostClubId}/admin?tab=settings`);
  await expect(page.getByRole("button", { name: "Reset club history", exact: true })).toBeVisible();

  const after = await (await page.request.get(`/api/sessions/${sessionCode}`)).json();
  expect(after).toMatchObject({ code: sessionCode, status: before.status, isTest: true });
  expect(after.matches).toEqual(before.matches);
});

test("guest, archived, and unscoped profiles use current screens", async ({ page }) => {
  test.setTimeout(120_000);
  const { PrismaClient } = await import("@prisma/client");
  const { e2eDatabaseUrl } = await import("./env");
  const db = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl } } });
  const guestId = "current-interface-guest", code = "CURRENT-UI-HISTORY";
  try {
    await db.player.create({ data: { id: guestId, name: "Alexandra Very Long Guest Name", gender: "FEMALE" } });
    await db.session.create({ data: { id: code, code, name: "Historical session", clubId: hostClubId, isTest: false, status: "COMPLETED", endedAt: new Date(), ratingPolicyVersion: 2 } });
    const ids = ["user-host-1-e2e", "user-host-2-e2e", "user-host-3-e2e", guestId];
    for (const id of ids) {
      const member = await db.clubMember.findUnique({ where: { clubId_playerId: { clubId: hostClubId, playerId: id } }, include: { player: true } });
      await db.sessionPlayer.create({ data: { sessionId: code, playerId: id, isGuest: !member, profileClubId: member ? hostClubId : null, participantAccountId: member?.ownerUserId, gender: member?.player.gender ?? "FEMALE" } });
    }
    const court = await db.court.create({ data: { sessionId: code, courtNumber: 1 } });
    await db.match.create({ data: { sessionId: code, courtId: court.id, status: "COMPLETED", team1Player1Id: ids[0], team1Player2Id: ids[1], team2Player1Id: ids[2], team2Player2Id: ids[3], team1Score: 21, team2Score: 16, completedAt: new Date() } });
    await signInAsAdmin(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const profileUrl = `/profile/${guestId}?clubId=${hostClubId}`;
    await page.goto(profileUrl);
    await expect(page.getByRole("heading", { name: "Alexandra Very Long Guest Name", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add to club", exact: true })).toBeVisible();
    await expect(page.locator("[data-profile-match]").first()).toBeVisible();
    for (const width of [320, 390, 1280]) await capture(page, "guest-profile", width);
    await page.goto(`/profile/${guestId}`);
    await expect(page.getByRole("heading", { name: "Alexandra Very Long Guest Name", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add to club", exact: true })).toHaveCount(0);
    await page.goto(profileUrl);
    await page.getByRole("button", { name: "Add to club", exact: true }).click();
    const promotion = page.getByRole("dialog", { name: "Add to club", exact: true });
    await promotion.getByRole("button", { name: "Add player", exact: true }).click();
    await expect(page.getByText("Added to club", { exact: true })).toBeVisible();
    const archived = await page.request.delete(`/api/clubs/${hostClubId}/members/${guestId}`);
    expect(archived.ok()).toBe(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Alexandra Very Long Guest Name", exact: true })).toBeVisible();
    await expect(page.locator("[data-profile-match]").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Add to club", exact: true })).toHaveCount(0);
    await capture(page, "archived-profile", 390);
    expect(await db.match.count({ where: { sessionId: code, status: "COMPLETED" } })).toBe(1);
  } finally { await db.$disconnect(); }
});
