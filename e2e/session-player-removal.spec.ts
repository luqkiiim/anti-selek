import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { expectCurrentUi } from "./current-ui";
import { hostClubId, signInAsAdmin } from "./helpers";

test.use({ viewport: { width: 390, height: 844 } });

test("removes unused players from the session roster while preserving court players and club membership", async ({ page }) => {
  test.setTimeout(120_000);
  test.info().annotations.push({ type: "source-revision", description: `${execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()} + working tree` });
  await signInAsAdmin(page);
  const playerIds = [1, 2, 3, 4, 5].map(index => `user-host-${index}-e2e`);
  const prepared = await page.request.post("/api/sessions", { data: {
    name: "Session player removal", clubId: hostClubId, courtCount: 1,
    scoringType: "POINTS", matchmakingStyle: "BALANCED", pairingMode: "OPEN",
    autoQueueEnabled: false, playerIds,
    playerConfigs: playerIds.map(playerId => ({ playerId, profileClubId: hostClubId })),
  } });
  expect(prepared.ok(), await prepared.text()).toBe(true);
  const { code } = await prepared.json();
  const endpoint = `/api/sessions/${code}`;
  const read = async () => {
    const response = await page.request.get(endpoint);
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  try {
    const started = await page.request.post(`${endpoint}/start`);
    expect(started.ok(), await started.text()).toBe(true);
    const courtId = (await read()).courts[0].id;
    const assigned = await page.request.post(`${endpoint}/generate-match`, { data: {
      courtId, manualTeams: { team1: playerIds.slice(0, 2), team2: playerIds.slice(2, 4) },
    } });
    expect(assigned.ok(), await assigned.text()).toBe(true);
    const matchId = (await read()).courts[0].currentMatch.id;
    await page.goto(`/session/${code}?tab=players`);
    await expectCurrentUi(page, "session");
    await expect(page.getByRole("heading", { name: "Players", exact: true })).toBeVisible();
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`players-${width}.png`) });
    }

    await page.locator(".roster").getByRole("button", { name: "Options for Host Player 1", exact: true }).click();
    await page.getByRole("dialog", { name: "Host Player 1", exact: true }).getByRole("button", { name: "Remove from session", exact: true }).click();
    const confirmation = page.getByRole("dialog", { name: "Remove player", exact: true });
    await confirmation.getByRole("button", { name: "Remove player", exact: true }).click();
    await expect(confirmation.getByRole("alert")).toContainText("currently assigned to a match");
    expect((await read()).players).toHaveLength(5);

    await page.reload();
    await expectCurrentUi(page, "session");
    await page.locator(".roster").getByRole("button", { name: "Options for Host Player 5", exact: true }).click();
    await page.getByRole("dialog", { name: "Host Player 5", exact: true }).getByRole("button", { name: "Remove from session", exact: true }).click();
    await expect(confirmation).toContainText("Host Player 5");
    await confirmation.getByRole("button", { name: "Remove player", exact: true }).click();
    await expect(confirmation).toBeHidden();
    await expect(page.locator(".roster").getByRole("button", { name: "Options for Host Player 5", exact: true })).toHaveCount(0);
    const after = await read();
    expect(after.players.map((player: { userId: string }) => player.userId).sort()).toEqual(playerIds.slice(0, 4).sort());
    expect(after.courts[0].currentMatch.id).toBe(matchId);
    const members = await page.request.get(`/api/clubs/${hostClubId}/members`);
    expect((await members.json()).some((member: { id: string }) => member.id === playerIds[4])).toBe(true);

    // Clearing an unscored assignment also makes its players removable again.
    const cleared = await page.request.post(`${endpoint}/generate-match`, { data: { courtId, undoCurrentMatch: true } });
    expect(cleared.ok(), await cleared.text()).toBe(true);
    const removed = await page.request.delete(`${endpoint}/players/${playerIds[0]}`);
    expect(removed.ok(), await removed.text()).toBe(true);
    expect((await read()).players).toHaveLength(3);
  } finally {
    const deleted = await page.request.delete(`${endpoint}/delete`);
    expect(deleted.ok(), await deleted.text()).toBe(true);
  }
});
