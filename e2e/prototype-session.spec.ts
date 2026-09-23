import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./helpers";

test("prototype host can reach court controls, player management, and match history", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsAdmin(page);

  await page.getByRole("button", { name: /E2E Score Club/ }).click();
  await page.getByRole("button", { name: "Sessions", exact: true }).click();
  await page.getByRole("button", { name: "Continue hosting" }).click();
  await expect(page.getByRole("button", { name: "Court 1 options" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose next match manually" })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/prototype-courts-390.png", fullPage: true });
  await page.getByRole("button", { name: "Court 1 options" }).click();
  await expect(page.getByRole("dialog", { name: "Court 1 options" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reshuffle whole match" })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Session settings" }).click();
  await expect(page.getByRole("dialog", { name: "Session settings" })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 700 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/prototype-settings-320.png" });
  await page.getByRole("textbox", { name: "Court 1 label" }).fill("North Court");
  await page.getByRole("switch", { name: "Prepare the next game" }).click();
  await page.getByRole("switch", { name: "Respect extra rest" }).click();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("heading", { name: "North Court" })).toBeVisible();
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Session settings" }).click();
  await expect(page.getByRole("switch", { name: "Prepare the next game" })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("switch", { name: "Respect extra rest" })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("textbox", { name: "Court 1 label" })).toHaveValue("North Court");
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("navigation", { name: "Session navigation" }).getByRole("button", { name: "Players" }).click();
  await page.getByRole("button", { name: "Manage players" }).click();
  await expect(page.getByRole("dialog", { name: "Players" })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 700 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByText("In rotation")).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Players" }).getByText("0 taking a break")).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Players" }).getByRole("button", { name: "Skip next match" })).toHaveCount(0);
  await page.getByRole("button", { name: "Options for Score Player 1" }).click();
  await expect(page.getByRole("dialog", { name: "Score Player 1" }).getByRole("button", { name: "Skip next match" })).toBeVisible();
  await page.getByRole("dialog", { name: "Score Player 1" }).getByRole("button", { name: "Players", exact: true }).click();
  await page.screenshot({ path: "test-results/prototype-players-320.png" });
  await expect(page.getByRole("button", { name: "Add club members" })).toBeVisible();
  await page.getByRole("button", { name: "Add club members" }).click();
  await expect(page.getByRole("dialog", { name: "Add club members" })).toBeVisible();
  await expect(page.getByText("Everyone in this roster is already here.")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("navigation", { name: "Session navigation" }).getByRole("button", { name: "Courts" }).click();
  await page.getByRole("textbox", { name: "Team 1 score" }).fill("21");
  await page.getByRole("textbox", { name: "Team 2 score" }).fill("19");
  await page.getByRole("button", { name: "Save score" }).click();
  await page.getByRole("dialog", { name: "Confirm result" }).getByRole("button", { name: "Confirm result" }).click();

  await page.getByRole("navigation", { name: "Session navigation" }).getByRole("button", { name: "Standings" }).click();
  await expect(page.getByRole("heading", { name: "Standings" })).toBeVisible();
  await expect(page.getByText("Point diff").first()).toBeVisible();
  for (const width of [320, 390, 430, 1100]) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: "test-results/prototype-standings-390.png", fullPage: true });
  await page.getByRole("navigation", { name: "Session navigation" }).getByRole("button", { name: "Courts" }).click();
  await expect(page.getByRole("navigation", { name: "Session navigation" }).getByRole("button", { name: "Courts" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Create on North Court" }).click();
  await expect(page.getByRole("group", { name: "Create a match on North Court" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Best Match" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Manual" })).toBeVisible();

  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Match history" }).click();
  await page.setViewportSize({ width: 430, height: 932 });
  await expect(page.getByRole("heading", { name: "E2E Score Session" })).toBeVisible();
  await expect(page.getByText("Score Player 1")).toBeVisible();
  await expect(page.getByLabel("21 to 19")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/prototype-history-430.png", fullPage: true });
  await page.setViewportSize({ width: 320, height: 700 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/prototype-history-320.png" });
  await page.getByRole("button", { name: "Back to session" }).click();
  await expect(page.getByRole("button", { name: "More options" })).toBeVisible();

  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Session settings" }).click();
  await page.getByRole("button", { name: "Reset session to change setup" }).click();
  await expect(page.getByRole("dialog", { name: "Reset this session?" })).toContainText("reverses its rating changes");
  await page.getByRole("button", { name: "Reset session", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ready to play?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Manage players" })).toBeVisible();

  await page.getByRole("button", { name: "Review session settings" }).click();
  await expect.poll(() => page.evaluate(() => {
    const dialog = document.querySelector('dialog.prototype-sheet[open]');
    const panel = dialog?.querySelector('.sheet-panel');
    return !!dialog && !!panel && dialog.scrollWidth <= dialog.clientWidth && panel.scrollWidth <= panel.clientWidth;
  })).toBe(true);
  await page.screenshot({ path: "test-results/prototype-waiting-settings-320.png" });
  await page.getByRole("combobox", { name: "Matchmaking style" }).selectOption("LEVEL_MATCH");
  await page.getByRole("combobox", { name: "Court count" }).selectOption("2");
  await page.getByRole("textbox", { name: "Court 2 label" }).fill("South Court");
  await page.getByRole("button", { name: "Save settings" }).click();
  await page.getByRole("button", { name: "Review session settings" }).click();
  await expect(page.getByRole("combobox", { name: "Matchmaking style" })).toHaveValue("LEVEL_MATCH");
  await expect(page.getByRole("textbox", { name: "Court 2 label" })).toHaveValue("South Court");
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page.getByRole("heading", { name: "South Court" })).toBeVisible();
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "End session" }).click();
  await page.getByRole("dialog", { name: "End this session?" }).getByRole("button", { name: "End session" }).click();
  await expect(page.getByRole("heading", { name: "Session complete" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share standings" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Replay winner celebration" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.waitForTimeout(700);
  await page.screenshot({ path: "test-results/prototype-finish-320.png", fullPage: true });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Share standings" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/e2e-score-session-standings\.png$/);
});
