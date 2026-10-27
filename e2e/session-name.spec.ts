import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./helpers";

test("host can rename a waiting session and the name locks when it starts", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 320, height: 844 });
  await signInAsAdmin(page);
  const endpoint = "/api/sessions/session-score-e2e";
  const reset = await page.request.post(endpoint + "/reset");
  expect(reset.ok()).toBe(true);
  await page.goto("/session/session-score-e2e");
  await page.getByRole("button", { name: "Review session settings" }).click();
  const name = page.getByRole("textbox", { name: "Session name", exact: true });
  await expect(name).toHaveValue("E2E Score Session");
  await name.fill("   ");
  await expect(page.getByRole("button", { name: "Save settings", exact: true })).toBeDisabled();
  await name.fill("  Friday evening games  ");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/session-rename-320.png", fullPage: true });
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Session settings" })).toHaveCount(0);
  await expect(page.locator(".pc-header strong")).toHaveText("Friday evening games");
  const saved = await page.request.get(endpoint);
  expect(saved.ok()).toBe(true);
  expect(await saved.json()).toMatchObject({ name: "Friday evening games", viewerCanRename: true });
  await page.reload();
  await page.getByRole("button", { name: "Review session settings" }).click();
  await expect(name).toHaveValue("Friday evening games");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Start session", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Session navigation" })).toBeVisible();
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Session settings", exact: true }).click();
  await expect(name).toHaveCount(0);
  const locked = await page.request.patch(endpoint, {
    data: { name: "Too late", autoQueueEnabled: false, respectPlayerRest: true },
  });
  expect(locked.status()).toBe(409);
  const unchanged = await page.request.get(endpoint);
  expect(await unchanged.json()).toMatchObject({ name: "Friday evening games", viewerCanRename: false });
});
