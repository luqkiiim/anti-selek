import { expect, test } from "@playwright/test";

import { adminCredentials, hostClubId, signInAsAdmin } from "./helpers";

test("a signed-out club deep link returns to the same section after sign-in", async ({
  page,
}) => {
  await page.context().clearCookies();
  const destination = `/club/${hostClubId}?tab=tournaments`;

  await page.goto(destination);
  await expect(page).toHaveURL(/\/signin\?callbackUrl=/);

  await page.getByLabel("Email", { exact: true }).fill(adminCredentials.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(adminCredentials.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(new RegExp(`${destination.replace("?", "\\?")}$`));
  await expect(page.getByRole("heading", { name: "E2E Host Club" })).toBeVisible();
});

test("a failed club join stays visible and focused inside the open dialog", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsAdmin(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Join Club" }).click();
  const dialog = page.getByRole("dialog", { name: "Join club" });
  const clubName = dialog.getByLabel("Club name");
  await expect(clubName).toBeFocused();
  const closeBox = await dialog.getByRole("button", { name: "Close" }).boundingBox();
  expect(closeBox?.width).toBeGreaterThanOrEqual(44);
  expect(closeBox?.height).toBeGreaterThanOrEqual(44);

  await clubName.fill(`Missing Club ${Date.now()}`);
  await dialog.getByRole("button", { name: "Join", exact: true }).click();

  await expect(dialog.getByRole("alert")).toContainText("Club not found");
  await expect(clubName).toBeFocused();
  await expect(dialog).toBeVisible();
});

test("desktop club navigation matches mobile and host readiness is truthful", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/club/${hostClubId}`);

  const overviewTab = page.getByRole("button", {
    name: "Overview Live snapshot",
  });
  const tournamentsTab = page.getByRole("button", {
    name: /Tournaments \d+ total/,
  });
  const hostTab = page.getByRole("button", { name: "Host Setup desk" });
  const leaderboardTab = page.getByRole("button", {
    name: /Leaderboard \d+ players/,
  });
  const profileTab = page.getByRole("button", {
    name: "Profile Your club profile",
  });

  await expect(overviewTab).toBeVisible();
  await expect(tournamentsTab).toBeVisible();
  await expect(hostTab).toBeVisible();
  await expect(leaderboardTab).toBeVisible();
  await expect(profileTab).toBeVisible();
  await expect(page.getByRole("link", { name: "Manage club" })).toBeVisible();

  await hostTab.click();
  await page
    .locator('[data-tutorial-target="admin-onboarding-session-name"]:visible')
    .fill("Readiness check");
  await expect(
    page.locator(
      '[data-tutorial-target="admin-onboarding-create-session"]:visible'
    )
  ).toBeDisabled();
  await expect(
    page.locator("li:visible").filter({ hasText: /Add 2 more players or guests/ })
  ).toBeVisible();
});

test.describe("mobile auth priority", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const entry of [
    { path: "/signin", action: "Sign in" },
    { path: "/signup", action: "Create account" },
  ]) {
    test(`${entry.action} is reachable in the first phone viewport`, async ({
      page,
    }) => {
      await page.context().clearCookies();
      await page.goto(entry.path);

      const action = page.getByRole("button", { name: entry.action });
      await expect(action).toBeVisible();
      const box = await action.boundingBox();

      expect(box).not.toBeNull();
      expect((box?.y ?? 844) + (box?.height ?? 0)).toBeLessThanOrEqual(844);
    });
  }
});
