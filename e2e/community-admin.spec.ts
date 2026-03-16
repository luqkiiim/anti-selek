import { expect, test } from "@playwright/test";
import {
  adminControlsCommunityId,
  claimCommunityId,
  claimPlaceholderUserId,
  claimRequesterUserId,
  createClaimRequest,
  readCommunityClaimRequestsSnapshot,
  hostCommunityId,
  readCommunityMembersSnapshot,
  signIn,
  signInAsAdmin,
  signInAsClaimRequester,
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

test("admin can remove a player through the admin confirmation modal", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto(`/community/${adminControlsCommunityId}/admin`);

  await page.getByPlaceholder("Search players by name or email").fill(
    "Admin Control Remove"
  );
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(
    page.getByRole("heading", { name: "Admin Control Remove" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Remove player" }).click();
  const removeModal = page
    .locator(".app-modal-frame")
    .filter({ has: page.getByRole("heading", { name: "Remove Admin Control Remove?" }) });
  await expect(
    removeModal.getByRole("heading", { name: "Remove Admin Control Remove?" })
  ).toBeVisible();
  await removeModal.getByRole("button", { name: "Remove Player" }).click();

  await expect
    .poll(async () => {
      const members = await readCommunityMembersSnapshot(
        page,
        adminControlsCommunityId
      );
      return members.some((member) => member.name === "Admin Control Remove");
    })
    .toBe(false);
});

test("admin can reset a claimed member password from the admin page", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto(`/community/${adminControlsCommunityId}/admin`);

  await page.getByPlaceholder("Search players by name or email").fill(
    "Admin Control Reset"
  );
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Reset password" }).click();

  await expect(
    page.getByRole("heading", { name: "Reset member password" })
  ).toBeVisible();
  await page.getByLabel("New password").fill("UpdatedPass456!");
  await page.getByLabel("Confirm password").fill("UpdatedPass456!");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(
    page.getByText("Password reset for Admin Control Reset.")
  ).toBeVisible();

  await signIn(page, {
    email: "admin-control-reset@example.com",
    password: "UpdatedPass456!",
  });
  await expect(page).toHaveURL(/\/$/);
});

test("admin can approve a pending claim request from the admin page", async ({
  page,
}) => {
  await signInAsClaimRequester(page);
  const claimResponse = await createClaimRequest(page, {
    communityId: claimCommunityId,
    targetUserId: claimPlaceholderUserId,
  });
  expect(claimResponse.ok).toBe(true);

  await expect
    .poll(async () => {
      const requests = await readCommunityClaimRequestsSnapshot(
        page,
        claimCommunityId
      );
      return requests.length;
    })
    .toBe(1);

  await signInAsAdmin(page);
  await page.goto(`/community/${claimCommunityId}/admin`);
  await page.getByRole("button", { name: "Claims" }).click();

  await expect(page.getByRole("button", { name: "Approve" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();

  await expect
    .poll(async () => {
      const requests = await readCommunityClaimRequestsSnapshot(
        page,
        claimCommunityId
      );
      return requests.length;
    })
    .toBe(0);

  await expect
    .poll(async () => {
      const members = await readCommunityMembersSnapshot(page, claimCommunityId);
      const placeholder = members.find(
        (member) => member.id === claimPlaceholderUserId
      );
      const requester = members.find(
        (member) => member.id === claimRequesterUserId
      );
      return {
        placeholderExists: !!placeholder,
        requesterName: requester?.name ?? null,
      };
    })
    .toEqual({
      placeholderExists: false,
      requesterName: "Claim Candidate",
    });
});
