import { expect, test } from "@playwright/test";
import { hostClubId, signInAsAdmin } from "./helpers";

test("setup group assignments follow the chosen players and guests", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsAdmin(page);
  await page.goto(`/club/${hostClubId}?tab=setup`);
  await page.locator(".setup-options summary").click();
  await page.locator(".setup-toggle").filter({ hasText: "Player groups" }).getByRole("checkbox").check();
  const groupButton = page.locator(".setup-group-options button");
  const groups = page.getByRole("dialog", { name: "Player groups", exact: true });
  const roster = page.getByRole("dialog", { name: "Who’s playing?", exact: true });

  await groupButton.click();
  await expect(groups.getByText("Choose players in “Who’s playing?” first.", { exact: true })).toBeVisible();
  await expect(groups.getByRole("combobox")).toHaveCount(0);
  await groups.getByRole("button", { name: "Done", exact: true }).click();
  await expect(groups).toHaveCount(0);

  await page.locator(".setup-roster-summary").click();
  for (const name of ["Host Player 1", "Host Player 2"]) {
    await roster.locator(".setup-person").filter({ has: page.getByText(name, { exact: true }) }).getByRole("checkbox").check();
  }
  await roster.getByRole("button", { name: "Add guest", exact: true }).click();
  await roster.getByLabel("Guest name", { exact: true }).fill("Setup Guest");
  await roster.locator(".setup-add-guest select").first().selectOption("FEMALE");
  await roster.getByRole("button", { name: "Add guest", exact: true }).click();
  await roster.getByLabel("Find a player", { exact: true }).fill("Host Player 7");
  await roster.getByRole("button", { name: "Done · 3 players", exact: true }).click();
  await expect(roster).toHaveCount(0);

  await groupButton.click();
  await expect(groups.locator(".setup-person strong")).toHaveText(["Host Player 1", "Host Player 2", "Setup Guest"]);
  await expect(groups.getByRole("checkbox")).toHaveCount(0);
  await expect(groups.getByRole("button", { name: /Add guest|Remove guest/ })).toHaveCount(0);
  await groups.getByLabel("Group for Host Player 1", { exact: true }).selectOption("A");
  await groups.getByLabel("Group for Host Player 2", { exact: true }).selectOption("B");
  await groups.getByLabel("Group for Setup Guest", { exact: true }).selectOption("A");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(() => groups.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: `test-results/setup-player-groups-${width}.png` });
  }
  await groups.getByRole("button", { name: "Done", exact: true }).click();
  await expect(groups).toHaveCount(0);
  await expect(groupButton).toHaveText("2 Competitive · 1 Social");

  await page.locator(".setup-roster-summary").click();
  await roster.getByRole("button", { name: "Clear player search", exact: true }).click();
  await roster.locator(".setup-person").filter({ has: page.getByText("Host Player 2", { exact: true }) }).getByRole("checkbox").uncheck();
  await roster.locator(".setup-person").filter({ has: page.getByText("Host Player 3", { exact: true }) }).getByRole("checkbox").check();
  await roster.getByRole("button", { name: "Done · 3 players", exact: true }).click();
  await expect(roster).toHaveCount(0);
  await groupButton.click();
  await expect(groups.locator(".setup-person strong")).toHaveText(["Host Player 1", "Host Player 3", "Setup Guest"]);
  await expect(groups.getByLabel("Group for Setup Guest", { exact: true })).toHaveValue("A");
});
