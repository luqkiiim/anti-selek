import { expect, test, type Page } from "@playwright/test";

import { claimClubId, scoreSessionCode } from "./helpers";

const quickAccessProfile = {
  clubName: "E2E Claim Club",
  playerName: "Claim Candidate",
};

function signinUrl(callbackUrl: string) {
  return `/signin?${new URLSearchParams({ callbackUrl }).toString()}`;
}

async function signInWithQuickAccess(page: Page, callbackUrl: string) {
  await page.context().clearCookies();
  await page.goto(signinUrl(callbackUrl));
  await page.getByRole("button", { name: "Quick access" }).click();
  await page
    .getByLabel("Club name", { exact: true })
    .fill(quickAccessProfile.clubName);
  await page
    .getByLabel("Your player name", { exact: true })
    .fill(quickAccessProfile.playerName);
  await page.getByRole("button", { name: "Enter club" }).click();
}

test("Quick access honors its own club profile callback", async ({ page }) => {
  await signInWithQuickAccess(page, `/club/${claimClubId}?tab=profile`);

  await expect(page).toHaveURL(
    new RegExp(`/club/${claimClubId}\\?tab=profile$`)
  );
  await expect(
    page.getByRole("heading", { name: "E2E Claim Club" })
  ).toBeVisible();
});

for (const { label, callbackUrl } of [
  { label: "account settings", callbackUrl: "/settings" },
  {
    label: "club administration",
    callbackUrl: `/club/${claimClubId}/admin`,
  },
  {
    label: "an unreadable tournament",
    callbackUrl: `/session/${scoreSessionCode}?tab=standings`,
  },
]) {
  test(`Quick access falls back from ${label} to its own club`, async ({
    page,
  }) => {
    await signInWithQuickAccess(page, callbackUrl);

    await expect(page).toHaveURL(new RegExp(`/club/${claimClubId}$`));
    await expect(
      page.getByRole("heading", { name: "E2E Claim Club" })
    ).toBeVisible();
  });
}
