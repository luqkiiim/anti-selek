import { expect, test } from "@playwright/test";
import {
  hostCommunityId,
  readCommunityMembersSnapshot,
  signInAsAdmin,
} from "./helpers";

test("admin can create and open a community player profile from admin page", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto(`/community/${hostCommunityId}/admin`);

  await expect(page.getByText("Community admin")).toBeVisible();
  await expect(page.getByRole("heading", { name: "E2E Host Club" })).toBeVisible();

  await page.getByRole("button", { name: "Add player" }).click();
  await expect(
    page.getByRole("heading", { name: "Create player profile" })
  ).toBeVisible();

  await page.getByLabel("Player name").fill("Admin Page Placeholder");
  await page.getByRole("button", { name: "Create profile" }).click();

  await expect
    .poll(async () => {
      const members = await readCommunityMembersSnapshot(page, hostCommunityId);
      return members.some((member) => member.name === "Admin Page Placeholder");
    })
    .toBe(true);

  await page.getByRole("button", { name: "Players" }).click();
  await page.getByPlaceholder("Search players by name or email").fill(
    "Admin Page Placeholder"
  );
  await expect(
    page.getByText("Admin Page Placeholder", { exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();

  await expect(
    page.getByRole("heading", { name: "Admin Page Placeholder" })
  ).toBeVisible();
  const editorModal = page
    .locator(".app-modal-frame")
    .filter({ has: page.getByRole("heading", { name: "Admin Page Placeholder" }) });
  await expect(
    editorModal.getByRole("link", { name: "View profile" })
  ).toBeVisible();
  await editorModal.locator("button.app-button-secondary", { hasText: "Close" }).click();
  await expect(
    page.getByRole("heading", { name: "Admin Page Placeholder" })
  ).toHaveCount(0);
});
