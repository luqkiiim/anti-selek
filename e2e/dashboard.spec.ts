import { expect, test } from "@playwright/test";
import {
  getHostPlayerCredentials,
  signIn,
  signInAsAdmin,
} from "./helpers";

test("dashboard lets an admin create a club and another member join it", async ({
  page,
}) => {
  const clubName = `E2E Dashboard Club ${Date.now()}`;
  const clubPassword = "ClubSecret123";

  await signInAsAdmin(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Anti-Selek" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Create Club" }).click();
  await expect(
    page.getByRole("heading", { name: "Create club" })
  ).toBeVisible();
  await page.getByLabel("Club name").fill(clubName);
  await page.getByLabel("Password").fill(clubPassword);
  await page.getByRole("button", { name: "Create", exact: true }).click();

  await expect(page).toHaveURL(/\/club\/.+/);
  const createdClubPath = new URL(page.url()).pathname;
  await expect(page.getByRole("heading", { name: clubName })).toBeVisible();

  await signIn(page, getHostPlayerCredentials(1));
  await page.goto("/");
  await page.getByRole("button", { name: "Join Club" }).click();
  await expect(
    page.getByRole("heading", { name: "Join club" })
  ).toBeVisible();
  await page.getByLabel("Club name").fill(clubName);
  await page.getByLabel("Password").fill(clubPassword);
  await page.getByRole("button", { name: "Join", exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`${createdClubPath}$`));
  await expect(page.getByRole("heading", { name: clubName })).toBeVisible();
});
