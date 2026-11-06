import { expect, test, type Page } from "@playwright/test";
import { hostClubId, signInAsAdmin } from "./helpers";

async function capture(page: Page, name: string, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: `test-results/current-interface/${name}-${width}.png`, fullPage: true });
}

test("admin edits linked pairing through the current route, with mixed pairing off", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signInAsAdmin(page);
  await page.goto(`/community/${hostClubId}/admin?tab=members&tools=advanced`);
  await expect(page).toHaveURL(`/club/${hostClubId}/admin?tab=players`);
  await page.getByRole("button", { name: "Edit Host Player 1", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit Host Player 1", exact: true });
  await editor.getByText("Advanced pairing", { exact: true }).click();
  await editor.getByLabel("Mixed-pairing level", { exact: true }).selectOption("LOWER");
  for (const width of [320, 390, 1280]) await capture(page, "linked-player-pairing", width);
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(editor).not.toBeVisible();
  await page.getByRole("button", { name: "Edit Host Player 1", exact: true }).click();
  await expect(editor.locator("summary").filter({ hasText: "Advanced pairing" })).toContainText("Lower level");
  await editor.getByText("Advanced pairing", { exact: true }).click();
  await editor.getByLabel("Mixed-pairing level", { exact: true }).selectOption("");
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(editor).not.toBeVisible();
});

test("optional practice, current guide, old bookmarks, session reset and playground reset", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 900 });
  await signInAsAdmin(page);
  await page.goto("/?chooser=1");
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await expect(page).toHaveURL(/\/club\//);
  const club = new URL(page.url()).pathname.split("/").pop()!;
  await expect(page.getByText("Guided practice", { exact: false }).first()).toBeVisible();
  await capture(page, "guided-practice", 390);
  await page.getByRole("button", { name: "Review practice players", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Search players", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Hide guide", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open guided practice", exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open guided practice", exact: true }).click();
  await expect(page.getByRole("button", { name: "Hide guide", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create a practice session", exact: true }).click();
  await page.getByLabel("Session name", { exact: true }).fill("Guided practice setup");
  await page.getByRole("button", { name: /Add players/ }).click();
  const roster = page.getByRole("dialog", { name: "Who’s playing?", exact: true });
  for (let index = 0; index < 4; index++) await roster.getByRole("checkbox").nth(index).check();
  await roster.getByRole("button", { name: "Done · 4 players", exact: true }).click();
  await page.getByRole("button", { name: "Prepare session", exact: true }).click();
  await expect(page).toHaveURL(/\/session\//);
  const progress = await (await page.request.get("/api/tutorial-progress/admin-onboarding")).json();
  expect(progress.completedStepIds).toContain("host-session");
  await page.goto(`/club/${club}?tools=practice`);
  await expect(page).toHaveURL(`/club/${club}?tab=sessions`);
  await expect(page.getByRole("region", { name: "Practice sessions", exact: true })).toBeVisible();
  const { playground } = await (await page.request.get("/api/tutorial-playground")).json();
  await page.goto(`/session/${playground.sessionCode}?tools=practice`);
  const tools = page.getByRole("dialog", { name: "Practice tools", exact: true });
  await expect(tools).toBeVisible();
  await expect(page).toHaveURL(`/session/${playground.sessionCode}?practice=1`);
  await expect(tools.getByRole("button", { name: "Create real session", exact: true })).toHaveCount(0);
  await tools.getByRole("button", { name: "Reset practice session", exact: true }).click();
  await capture(page, "practice-reset", 320);
  await tools.getByRole("button", { name: "Confirm reset", exact: true }).click();
  await expect(tools).not.toBeVisible();
  await page.goto(`/club/${club}/admin?tools=practice`);
  await expect(page).toHaveURL(`/club/${club}/admin?tab=settings`);
  await page.getByRole("button", { name: "Reset playground", exact: true }).last().click();
  const reset = page.getByRole("dialog", { name: "Reset playground?", exact: true });
  await reset.getByLabel("Type RESET to confirm", { exact: true }).fill("RESET");
  await capture(page, "playground-reset", 390);
  await reset.getByRole("button", { name: "Reset playground", exact: true }).click();
  await expect(reset).not.toBeVisible();
  await expect(page.getByText("Playground reset.", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("historical test conversion and guest, archived, and unscoped profiles use current screens", async ({ page }) => {
  test.setTimeout(120_000);
  const { PrismaClient } = await import("@prisma/client");
  const { e2eDatabaseUrl } = await import("./env");
  const db = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl } } });
  const guestId = "current-interface-guest", code = "CURRENT-UI-TEST";
  try {
    await db.player.create({ data: { id: guestId, name: "Alexandra Very Long Guest Name", gender: "FEMALE" } });
    await db.session.create({ data: { id: code, code, name: "Historical test", clubId: hostClubId, isTest: true, status: "COMPLETED", endedAt: new Date(), ratingPolicyVersion: 2 } });
    const ids = ["user-host-1-e2e", "user-host-2-e2e", "user-host-3-e2e", guestId];
    for (const id of ids) {
      const member = await db.clubMember.findUnique({ where: { clubId_playerId: { clubId: hostClubId, playerId: id } }, include: { player: true } });
      await db.sessionPlayer.create({ data: { sessionId: code, playerId: id, isGuest: !member, profileClubId: member ? hostClubId : null, participantAccountId: member?.ownerUserId, gender: member?.player.gender ?? "FEMALE" } });
    }
    const court = await db.court.create({ data: { sessionId: code, courtNumber: 1 } });
    await db.match.create({ data: { sessionId: code, courtId: court.id, status: "COMPLETED", team1Player1Id: ids[0], team1Player2Id: ids[1], team2Player1Id: ids[2], team2Player2Id: ids[3], team1Score: 21, team2Score: 16, completedAt: new Date() } });
    await signInAsAdmin(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/session/${code}?tools=practice`);
    const tools = page.getByRole("dialog", { name: "Practice tools", exact: true });
    await tools.getByRole("button", { name: "Create real session", exact: true }).click();
    await expect(tools.getByRole("checkbox")).toBeChecked();
    await capture(page, "test-to-real", 390);
    await tools.getByRole("button", { name: "Create real session", exact: true }).click();
    await expect(page).not.toHaveURL(new RegExp(code));
    const realCode = new URL(page.url()).pathname.split("/").pop()!;
    const real = await (await page.request.get(`/api/sessions/${realCode}`)).json();
    expect(real.isTest).toBe(false);
    expect(real.matches.filter((item: { status: string }) => item.status === "COMPLETED")).toHaveLength(1);
    const guest = real.players.find((item: { isGuest: boolean }) => item.isGuest);
    const profileUrl = `/profile/${guest.userId}?clubId=${hostClubId}`;
    await page.goto(profileUrl);
    await expect(page.getByRole("heading", { name: "Alexandra Very Long Guest Name", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add to club", exact: true })).toBeVisible();
    await expect(page.locator("[data-profile-match]").first()).toBeVisible();
    for (const width of [320, 390, 1280]) await capture(page, "guest-profile", width);
    await page.goto(`/profile/${guest.userId}`);
    await expect(page.getByRole("heading", { name: "Alexandra Very Long Guest Name", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add to club", exact: true })).toHaveCount(0);
    await page.goto(profileUrl);
    await page.getByRole("button", { name: "Add to club", exact: true }).click();
    const promotion = page.getByRole("dialog", { name: "Add to club", exact: true });
    await promotion.getByRole("button", { name: "Add player", exact: true }).click();
    await expect(page.getByText("Added to club", { exact: true })).toBeVisible();
    const archived = await page.request.delete(`/api/clubs/${hostClubId}/members/${guest.userId}`);
    expect(archived.ok()).toBe(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Alexandra Very Long Guest Name", exact: true })).toBeVisible();
    await expect(page.locator("[data-profile-match]").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Add to club", exact: true })).toHaveCount(0);
    await capture(page, "archived-profile", 390);
    expect(await db.match.count({ where: { sessionId: real.id, status: "COMPLETED" } })).toBe(1);
  } finally { await db.$disconnect(); }
});
