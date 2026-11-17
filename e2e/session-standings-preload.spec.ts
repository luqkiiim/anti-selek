import { expect, test } from "@playwright/test";
import { scoreSessionCode, signInAsAdmin } from "./helpers";

test("standings preload on Courts and tab switches reuse the loaded results", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsAdmin(page);
  let reads = 0;
  page.on("request", request => {
    if (request.method() === "GET" && new URL(request.url()).pathname === `/api/sessions/${scoreSessionCode}/leaderboard`) reads++;
  });
  const preloaded = page.waitForResponse(response =>
    new URL(response.url()).pathname === `/api/sessions/${scoreSessionCode}/leaderboard` && response.ok());
  await page.goto(`/session/${scoreSessionCode}?tab=courts`);
  await preloaded;
  await expect(page.locator(".product-root")).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Session navigation" });
  await expect(navigation.getByRole("button", { name: "Courts", exact: true })).toHaveAttribute("aria-current", "page");
  expect(reads).toBe(1);
  for (const tab of ["Standings", "Players", "Courts", "Standings"]) {
    await navigation.getByRole("button", { name: tab, exact: true }).click();
    await expect(navigation.getByRole("button", { name: tab, exact: true })).toHaveAttribute("aria-current", "page");
    if (tab === "Standings") {
      await expect(page.getByRole("table", { name: "Player standings" }).locator("tbody tr")).toHaveCount(5);
    }
  }
  await page.waitForLoadState("networkidle");
  expect(reads).toBe(1);

  await navigation.getByRole("button", { name: "Courts", exact: true }).click();
  await page.getByRole("textbox", { name: "Team 1 score" }).fill("21");
  await page.getByRole("textbox", { name: "Team 2 score" }).fill("19");
  await page.getByRole("button", { name: "Save score", exact: true }).click();
  const updated = page.waitForResponse(response =>
    new URL(response.url()).pathname === `/api/sessions/${scoreSessionCode}/leaderboard` && response.ok());
  const refreshed = page.waitForResponse(response =>
    new URL(response.url()).pathname === `/api/sessions/${scoreSessionCode}` && response.ok());
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await updated;
  await refreshed;
  // The accepted score and reconciled session each update the standings revision.
  await expect.poll(() => reads).toBe(3);
  await page.waitForLoadState("networkidle");
  const readsAfterSave = reads;
  expect(readsAfterSave).toBeGreaterThan(1);
  await navigation.getByRole("button", { name: "Standings", exact: true }).click();
  const winner = page.getByRole("table", { name: "Player standings" }).locator("tbody tr").filter({ hasText: "Admin E2E" });
  await expect(winner.locator("td").nth(2)).toHaveText("3");
  await page.waitForLoadState("networkidle");
  expect(reads).toBe(readsAfterSave);
});
