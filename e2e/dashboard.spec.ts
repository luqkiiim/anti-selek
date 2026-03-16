import { expect, test } from "@playwright/test";
import {
  getHostPlayerCredentials,
  signIn,
  signInAsAdmin,
} from "./helpers";

test("dashboard lets an admin create a community and another member join it", async ({
  page,
}) => {
  const communityName = `E2E Dashboard Club ${Date.now()}`;
  const communityPassword = "ClubSecret123";

  await signInAsAdmin(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Anti-Selek" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Create Community" }).click();
  await expect(
    page.getByRole("heading", { name: "Create community" })
  ).toBeVisible();
  await page.getByLabel("Community name").fill(communityName);
  await page.getByLabel("Password").fill(communityPassword);
  await page.getByRole("button", { name: "Create", exact: true }).click();

  await expect(page).toHaveURL(/\/community\/.+/);
  const createdCommunityPath = new URL(page.url()).pathname;
  await expect(page.getByRole("heading", { name: communityName })).toBeVisible();

  await signIn(page, getHostPlayerCredentials(1));
  await page.goto("/");
  await page.getByRole("button", { name: "Join Community" }).click();
  await expect(
    page.getByRole("heading", { name: "Join community" })
  ).toBeVisible();
  await page.getByLabel("Community name").fill(communityName);
  await page.getByLabel("Password").fill(communityPassword);
  await page.getByRole("button", { name: "Join", exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`${createdCommunityPath}$`));
  await expect(page.getByRole("heading", { name: communityName })).toBeVisible();
});
