import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./helpers";

test("prototype host can reach court controls, player management, and match history", async ({ page }) => {
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

  await page.getByRole("navigation", { name: "Session navigation" }).getByRole("button", { name: "Players" }).click();
  await page.getByRole("button", { name: "Manage players" }).click();
  await expect(page.getByRole("dialog", { name: "Players" })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 700 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
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
});
