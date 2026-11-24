import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { e2eDatabaseUrl } from "./env";
import { hostClubId, signInAsAdmin } from "./helpers";
import { expectCurrentUi } from "./current-ui";

async function seedDoublesCourt(db: PrismaClient, code: string, pauseOne = false) {
  const courtId = `${code}-court`;
  const players = Array.from({ length: 8 }, (_, index) => ({
    id: `${code}-${index}`,
    name: `Doubles Player ${index + 1}`,
    gender: index < 4 ? "MALE" : "FEMALE",
    partnerPreference: index < 4 ? "OPEN" : "FEMALE_FLEX",
  }));
  await db.player.createMany({ data: players });
  const session = await db.session.create({ data: {
    code, clubId: hostClubId, name: "Doubles Session", type: "POINTS",
    status: "ACTIVE", autoQueueEnabled: false,
    players: { create: players.map(({ id, gender, partnerPreference }, index) => ({
      playerId: id, gender, partnerPreference, isGuest: true, isPaused: pauseOne && index === 0,
    })) },
    courts: { create: { id: courtId, courtNumber: 1 } },
  } });
  const current = await db.match.create({ data: {
    sessionId: session.id, courtId, status: "IN_PROGRESS",
    team1Player1Id: players[0].id, team1Player2Id: players[1].id,
    team2Player1Id: players[2].id, team2Player2Id: players[3].id,
  } });
  await db.court.update({ where: { id: courtId }, data: { currentMatchId: current.id } });
}

test("hosts can choose a doubles type from a live session on mobile", async ({ page }) => {
  const db = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl } } });
  const code = "queued-doubles-e2e";
  try {
    await seedDoublesCourt(db, code);

    await page.setViewportSize({ width: 390, height: 844 });
    await signInAsAdmin(page);
    await page.goto(`/session/${code}`);
    await expectCurrentUi(page, "session");
    await page.getByRole("button", { name: "Queue next match" }).click();
    const picker = page.getByRole("dialog", { name: "Queue next match" });
    await expect(picker.getByRole("button", { name: "Best Match" })).toBeEnabled();
    const mens = picker.getByRole("button", { name: /Men's Doubles/ });
    await expect(mens).toBeDisabled();
    await expect(mens).toContainText("Only 0 available");
    const womens = picker.getByRole("button", { name: "Women's Doubles" });
    await expect(womens).toBeEnabled();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await womens.click();

    const nextUp = page.getByRole("button", { name: "Next up options" });
    await expect(nextUp).toContainText("Women's Doubles");
    await expect(nextUp).toContainText("Doubles Player 5");
    await page.reload();
    await expect(nextUp).toContainText("Women's Doubles");

    const court = page.locator(".court-card").filter({ has: page.getByRole("heading", { name: "Court 1" }) });
    await court.getByRole("textbox", { name: "Team 1 score" }).fill("21");
    await court.getByRole("textbox", { name: "Team 2 score" }).fill("18");
    await court.getByRole("button", { name: "Save score" }).click();
    await court.getByRole("button", { name: "Confirm", exact: true }).click();
    const notice = court.getByRole("status");
    await expect(notice).toHaveText("21–18 saved · Next match started");
    await expect(court.getByText("Doubles Player 5")).toBeVisible();
    await expect(court.getByRole("textbox", { name: "Team 1 score" })).toBeEnabled();
    await expect(court.getByRole("textbox", { name: "Team 1 score" })).toHaveValue("");
    await expect(nextUp).toHaveCount(0);

    const incomingPlayers = court.locator(".team-players").first();
    const highlight = court.locator(".court-handoff-highlight");
    await expect(incomingPlayers).toHaveCSS("animation-name", "court-handoff-players");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(incomingPlayers).toHaveCSS("animation-name", "none");
    await expect(highlight).toHaveCSS("opacity", "1");
    await expect(notice).toHaveText("21–18 saved · Next match started");
  } finally {
    await db.$disconnect();
  }
});


test("hosts can preview and confirm a doubles reshuffle in the same mobile sheet", async ({ page }) => {
  const db = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl } } });
  const code = "reshuffle-doubles-e2e";
  try {
    await seedDoublesCourt(db, code, true);
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAsAdmin(page);
    await page.goto(`/session/${code}`);
    await expectCurrentUi(page, "session");

    const court = page.locator(".court-card").filter({ has: page.getByRole("heading", { name: "Court 1" }) });
    const teamOneScore = court.getByRole("textbox", { name: "Team 1 score" });
    const teamTwoScore = court.getByRole("textbox", { name: "Team 2 score" });
    await teamOneScore.fill("21");
    await teamTwoScore.fill("18");
    const options = page.getByRole("dialog", { name: "Court 1 options" });
    const confirmation = page.getByRole("dialog", { name: "Reshuffle this match?" });
    async function openReshuffle() {
      await court.getByRole("button", { name: "Court 1 options" }).click();
      await options.getByRole("button", { name: "Reshuffle match" }).click();
      await expect(confirmation).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(1);
    }

    await openReshuffle();
    await expect(confirmation.getByRole("radio", { name: "Best Match", exact: true })).toBeChecked();
    await expect(confirmation.getByRole("radio", { name: /Men's Doubles/ })).toBeDisabled();
    await expect(confirmation.getByText("Only 3 eligible players")).toBeVisible();
    await expect(confirmation.getByText("Reshuffling discards any draft scores.")).toBeVisible();
    await confirmation.getByRole("radio", { name: "Women's Doubles" }).check();
    await expect(confirmation.getByRole("radio", { name: "Women's Doubles" })).toBeChecked();
    await confirmation.getByRole("button", { name: "Keep current lineup" }).click();
    await options.getByRole("button", { name: "Close" }).click();
    await expect(teamOneScore).toHaveValue("21");
    await expect(teamTwoScore).toHaveValue("18");
    await expect(court.getByText("Doubles Player 1", { exact: true })).toBeVisible();

    await openReshuffle();
    await expect(confirmation.getByRole("radio", { name: "Best Match", exact: true })).toBeChecked();
    await confirmation.getByRole("radio", { name: "Women's Doubles" }).check();
    await confirmation.getByRole("button", { name: "Reshuffle match", exact: true }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(court.getByText("Doubles Player 5", { exact: true })).toBeVisible();
    await expect(court.getByText("Doubles Player 1", { exact: true })).toHaveCount(0);
    await expect(teamOneScore).toHaveValue("");
    await expect(teamTwoScore).toHaveValue("");
  } finally {
    await db.$disconnect();
  }
});
