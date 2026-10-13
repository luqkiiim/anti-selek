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

      await expect(page.getByRole("heading", { name: "Ready for a rally?" })).toBeVisible();
      await expect(page.getByRole("region", { name: "Club activity" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Club highlights", exact: true })).toHaveCount(0);

      await expect(
        page.getByText("The competitive snapshot right now")
      ).toHaveCount(0);
      await expect(page.getByText("Recent form leaders")).toHaveCount(0);
      await expect(page.getByText("Top of the club table")).toHaveCount(0);
    });

    test("unplayed profile keeps one empty state", async ({ page }) => {
      await signInAsAdmin(page);
      await page.goto(profileHref);

      await expect(
        page.getByRole("heading", { name: "Host Player 1" })
      ).toBeVisible();
      await expect(page.getByRole("heading", { name: "No completed sessions yet.", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Achievements", exact: true })).toHaveCount(0);
      await expect(page.getByText("Win your first 2 matches.")).toHaveCount(0);
      await expect(page.getByText("Locked", { exact: true })).toHaveCount(0);
    });
  });
}
