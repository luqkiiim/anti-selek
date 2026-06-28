import { expect, test } from "@playwright/test";

import { hostClubId, signInAsAdmin } from "./helpers";

const profileHref = `/profile/user-host-1-e2e?clubId=${hostClubId}`;

const portraitViewports = [
  {
    name: "iPhone portrait",
    viewport: { width: 390, height: 844 },
  },
  {
    name: "iPad portrait",
    viewport: { width: 768, height: 1024 },
  },
];

for (const { name, viewport } of portraitViewports) {
  test.describe(`minimal copy smoke - ${name}`, () => {
    test.use({
      viewport,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });

    test("club overview omits redundant section subtitles", async ({ page }) => {
      await signInAsAdmin(page);
      await page.goto(`/club/${hostClubId}`);

      await expect(
        page.getByRole("heading", { name: "E2E Host Club" })
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Club pulse" }).filter({
          visible: true,
        })
      ).toBeVisible();
      await expect(
        page
          .getByRole("heading", {
            name: "Current tournament",
            exact: true,
          })
          .filter({ visible: true })
      ).toBeVisible();

      await expect(
        page.getByText("The competitive snapshot right now")
      ).toHaveCount(0);
      await expect(page.getByText("Recent form leaders")).toHaveCount(0);
      await expect(page.getByText("Top of the club table")).toHaveCount(0);
    });

    test("profile overview keeps achievement badges compact", async ({ page }) => {
      await signInAsAdmin(page);
      await page.goto(profileHref);

      await expect(
        page.getByRole("heading", { name: "Host Player 1" })
      ).toBeVisible();
      const achievementPreview = page
        .locator("section")
        .filter({
          has: page.getByRole("heading", {
            name: "Achievements",
            exact: true,
          }),
          hasText: "0/13 unlocked",
        })
        .first();

      await expect(achievementPreview).toBeVisible();
      await expect(
        achievementPreview.getByText("Strong Start", { exact: true })
      ).toHaveCount(1);

      await expect(
        achievementPreview.getByText("Win your first 2 matches.")
      ).toHaveCount(0);
      await expect(
        achievementPreview.getByText("Locked", { exact: true })
      ).toHaveCount(0);
    });
  });
}
