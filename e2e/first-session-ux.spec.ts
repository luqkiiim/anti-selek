import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hostClubId, readClubMembersSnapshot, signInAsAdmin } from "./helpers";
import { e2eDatabaseUrl } from "./env";
import type { SessionData } from "../src/components/session/sessionTypes";

const savedName = "Alexandra Longname Abdullah";
const guestName = "Samira Guest";

async function snapshot(page: Page, code: string): Promise<SessionData> {
  const response = await page.request.get(`/api/sessions/${code}`);
  expect(response.ok()).toBe(true);
  return response.json();
}

async function capture(page: Page, name: string, width: number) {
  await page.setViewportSize({ width, height: width === 320 ? 740 : 900 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const dialog = page.locator("dialog[open]");
  if (await dialog.count()) {
    await expect.poll(() => dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
  await page.screenshot({ path: `test-results/first-session-ux/${name}-${width}.png`, fullPage: true });
}

test("first session: saved players, guest, breaks, safe finish, podium and guest recovery", async ({ page }) => {
  test.setTimeout(240_000);
  page.setDefaultTimeout(15_000);
  const browserErrors: string[] = [];
  page.on("pageerror", error => browserErrors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 900 });
  await signInAsAdmin(page);
  await page.goto(`/club/${hostClubId}?tab=setup`);
  await page.getByLabel("Session name", { exact: true }).fill("Friday first session");
  await page.getByRole("button", { name: "Fewer courts" }).click();
  await capture(page, "setup", 390);
  await page.getByRole("button", { name: /Add players/ }).click();
  const roster = page.getByRole("dialog", { name: "Who’s playing?" });
  await roster.getByRole("checkbox", { name: /Admin E2E/ }).check();
  await roster.getByRole("checkbox", { name: /Host Player 1/ }).check();
  await roster.getByRole("button", { name: "Add new player" }).click();
  const form = page.locator(".new-player-form");
  await expect(form.getByRole("button", { name: "Save to club", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(form.getByLabel("Name", { exact: true })).toBeFocused();
  await form.getByLabel("Name", { exact: true }).fill(savedName);
  await form.getByRole("combobox", { name: "Gender", exact: true }).selectOption("FEMALE");
  await capture(page, "new-saved-player", 320);
  await form.getByRole("button", { name: "Save & select" }).click();
  await expect(roster.getByRole("status")).toContainText("saved to the club and selected");
  await expect(roster.getByRole("textbox", { name: "Find a player" })).toBeFocused();
  expect((await readClubMembersSnapshot(page, hostClubId)).filter(member => member.name === savedName)).toHaveLength(1);

  await roster.getByRole("button", { name: "Add new player" }).click();
  await form.getByRole("button", { name: "This session only" }).click();
  await form.getByLabel("Name", { exact: true }).fill(guestName);
  await form.getByRole("combobox", { name: "Gender", exact: true }).selectOption("FEMALE");
  await form.getByRole("button", { name: "Add to session", exact: true }).click();
  await roster.getByRole("button", { name: "Done · 4 players" }).click();
  await page.getByRole("button", { name: "Prepare session" }).click();
  await expect(page).toHaveURL(/\/session\//);
  const code = new URL(page.url()).pathname.split("/").pop()!;
  await expect(page.getByRole("button", { name: "Add players", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start session", exact: true }).click();
  const nav = page.getByRole("navigation", { name: "Session navigation" });
  await nav.getByRole("button", { name: "Courts", exact: true }).click();
  await page.getByRole("button", { name: "Create matches", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Team 1 score" })).toBeVisible();

  // Creating a saved player in a live session uses that same identity for admission.
  await nav.getByRole("button", { name: "Players", exact: true }).click();
  await page.getByRole("button", { name: "Add players", exact: true }).click();
  const add = page.getByRole("dialog", { name: "Add players", exact: true });
  await add.getByRole("button", { name: "Add new player" }).click();
  await form.getByLabel("Name", { exact: true }).fill("Morgan New Player");
  await form.getByRole("combobox", { name: "Gender", exact: true }).selectOption("MALE");
  await form.getByRole("button", { name: "Save & add to session" }).click();
  await expect(form).toHaveCount(0);
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  const live = await snapshot(page, code);
  const morgan = live.players.find(player => player.user.name === "Morgan New Player")!;
  expect(morgan.isGuest).toBe(false);
  expect((await readClubMembersSnapshot(page, hostClubId)).find(member => member.name === "Morgan New Player")?.id).toBe(morgan.userId);
  await page.getByRole("button", { name: "Pause Morgan New Player", exact: true }).click();
  await expect(page.getByRole("heading", { name: "On break", exact: true })).toBeVisible();
  await expect.poll(async () => (await snapshot(page, code)).players.find(player => player.userId === morgan.userId)?.isPaused).toBe(true);
  await page.getByRole("button", { name: "Resume Morgan New Player", exact: true }).click();
  await expect.poll(async () => (await snapshot(page, code)).players.find(player => player.userId === morgan.userId)?.isPaused).toBe(false);
  await page.getByRole("button", { name: `Pause after game ${guestName}`, exact: true }).click();
  await expect(page.getByText(/^Break after this game/)).toBeVisible();
  await capture(page, "pause-controls", 320);
  await capture(page, "pause-controls", 390);

  await nav.getByRole("button", { name: "Courts", exact: true }).click();
  await page.getByRole("textbox", { name: "Team 1 score" }).fill("21");
  await page.getByRole("textbox", { name: "Team 2 score" }).fill("19");
  await page.getByRole("button", { name: "Save score", exact: true }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Team 1 score" })).toHaveCount(0);
  await nav.getByRole("button", { name: "Players", exact: true }).click();
  await expect(page.getByRole("heading", { name: "On break", exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Resume ${guestName}`, exact: true }).click();
  await nav.getByRole("button", { name: "Standings", exact: true }).click();
  await expect(page.getByText("Finish the session to reveal the podium")).toBeVisible();
  await page.getByRole("button", { name: "Finish session", exact: true }).click();
  await expect(page.getByRole("button", { name: "Finish & show results", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Keep playing", exact: true }).click();

  // Finishing another unfinished game requires an explicit reviewed discard.
  await nav.getByRole("button", { name: "Courts", exact: true }).click();
  await page.getByRole("button", { name: "Create matches", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Team 1 score" })).toBeVisible();
  await page.getByRole("button", { name: "Finish session", exact: true }).click();
  await expect(page.getByRole("button", { name: "Review scores", exact: true })).toBeVisible();
  await capture(page, "finish-confirmation", 390);
  await page.getByRole("button", { name: "Finish & discard unfinished games", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Session complete", exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Top finishers" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share recap", exact: true })).toBeEnabled({ timeout: 30_000 });
  const completed = await snapshot(page, code);
  expect(completed.status).toBe("COMPLETED");
  expect(completed.matches?.filter(match => match.status === "COMPLETED")).toHaveLength(1);
  expect(completed.matches?.filter(match => match.status !== "COMPLETED")).toHaveLength(0);
  const guest = completed.players.find(player => player.user.name === guestName)!;
  // Session payloads retain a guest's starting rating. Promotion carries the
  // completed game's earned adjustment into the club membership.
  const db = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl } } });
  let earnedRating: number;
  try {
    const game = await db.match.findUniqueOrThrow({ where: { id: completed.matches![0].id } });
    const guestOnTeam1 = [game.team1Player1Id, game.team1Player2Id].includes(guest.userId);
    const change = guestOnTeam1 ? game.team1EloChange : game.team2EloChange;
    expect(change).not.toBe(0);
    earnedRating = guest.user.elo + (change ?? 0);
  } finally { await db.$disconnect(); }
  for (const width of [320, 390, 1280]) await capture(page, "results", width);

  await page.getByRole("button", { name: "Save guests to club", exact: true }).click();
  const guestSheet = page.getByRole("dialog", { name: "Save guests to club", exact: true });
  await expect(guestSheet.getByRole("button", { name: "Add to club", exact: true })).toBeEnabled();
  await capture(page, "save-guest", 390);
  await guestSheet.getByRole("button", { name: "Add to club", exact: true }).click();
  await expect(guestSheet.getByText("Added", { exact: true })).toBeVisible();
  const rosterAfter = await readClubMembersSnapshot(page, hostClubId);
  expect(rosterAfter.find(member => member.name === guestName)?.id).toBe(guest.userId);
  expect(rosterAfter.find(member => member.name === guestName)?.elo).toBe(earnedRating);
  const afterPromotion = await snapshot(page, code);
  expect(afterPromotion.players.find(player => player.userId === guest.userId)?.isGuest).toBe(true);
  expect(afterPromotion.matches).toEqual(completed.matches);
  await guestSheet.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Save guests to club", exact: true }).click();
  await expect(guestSheet.getByText("Added", { exact: true })).toBeVisible();

  await page.goto(`/club/${hostClubId}?tab=setup`);
  await page.getByRole("button", { name: /Add players/ }).click();
  await roster.getByRole("textbox", { name: "Find a player" }).fill(guestName);
  await expect(roster.getByRole("checkbox", { name: new RegExp(guestName) })).toBeVisible();
  await capture(page, "next-session", 390);
  await roster.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("checkbox", { name: "Mixed pairs", exact: true }).check();
  await page.getByRole("button", { name: /Add players/ }).click();
  await roster.getByRole("button", { name: "Add new player" }).click();
  await form.getByLabel("Name", { exact: true }).fill("New mixed player");
  await form.getByRole("combobox", { name: "Gender", exact: true }).selectOption("FEMALE");
  await form.getByText("Advanced pairing", { exact: true }).click();
  await expect(form.getByRole("combobox", { name: "Mixed-pairing level" })).toHaveValue("");
  await page.setViewportSize({ width: 390, height: 1200 });
  await form.getByRole("button", { name: "Save & select" }).scrollIntoViewIfNeeded();
  await form.screenshot({ path: "test-results/first-session-ux/mixed-pairing-390.png" });

  await page.goto("/club/community-new-admission-e2e");
  await expect(page.getByRole("button", { name: "New session", exact: true })).toBeVisible();
  await capture(page, "first-club", 390);
  await page.getByRole("button", { name: "Add your players", exact: true }).click();
  await form.getByLabel("Name", { exact: true }).fill("First Club Player");
  await form.getByRole("combobox", { name: "Gender", exact: true }).selectOption("MALE");
  await form.getByRole("button", { name: "Save to club", exact: true }).click();
  await expect(page.getByText("First Club Player is saved to the club.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "2 Members, view members", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Players", exact: true }).getByRole("button", { name: "Add players", exact: true })).toBeVisible();
  await capture(page, "club-players", 390);
  expect(browserErrors).toEqual([]);
});
