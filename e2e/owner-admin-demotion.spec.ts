import { expect, test } from "@playwright/test";

import {
  adminUserId,
  getHostPlayerCredentials,
  hostCommunityId,
  signIn,
  signInAsAdmin,
} from "./helpers";

test.setTimeout(120_000);

test("owner gates admin demotion while staff/member access changes", async ({
  page,
}) => {
  const playerName = "Host Player 4";

  await signInAsAdmin(page);
  await page.goto(`/community/${hostCommunityId}/admin`);
  await expect(page.getByRole("heading", { name: "E2E Host Club" })).toBeVisible();

  await page.getByPlaceholder("Search players by name or email").fill(playerName);
  await page.getByRole("button", { name: "Edit" }).click();
  const memberEditor = page
    .locator(".app-modal-frame")
    .filter({ has: page.getByRole("heading", { name: playerName }) });
  await expect(memberEditor.getByRole("heading", { name: playerName })).toBeVisible();
  await memberEditor.getByRole("button", { name: "Promote to admin" }).click();
  const promoteModal = page
    .locator(".app-modal-frame")
    .filter({ has: page.getByRole("heading", { name: `Promote ${playerName}?` }) });
  await expect(promoteModal.getByRole("heading", { name: `Promote ${playerName}?` })).toBeVisible();
  await promoteModal.getByRole("button", { name: "Promote to Admin" }).click();
  await expect(page.getByText(`${playerName} promoted to admin.`)).toBeVisible();

  await signIn(page, getHostPlayerCredentials(4));
  await page.goto(`/community/${hostCommunityId}/admin`);
  await expect(page.getByRole("heading", { name: "E2E Host Club" })).toBeVisible();
  await page.getByPlaceholder("Search players by name or email").fill("Admin E2E");
  await page.getByRole("button", { name: "Edit" }).click();
  const ownerEditor = page
    .locator(".app-modal-frame")
    .filter({ has: page.getByRole("heading", { name: "Admin E2E" }) });
  await expect(ownerEditor.getByText("Owner", { exact: true })).toBeVisible();
  await expect(ownerEditor.getByText("The club owner keeps permanent admin access.")).toBeVisible();
  await expect(ownerEditor.getByRole("button", { name: "Change to staff" })).toHaveCount(0);

  const demoteOwnerResponse = await page.evaluate(
    async ({ communityId, targetUserId }) => {
      const res = await fetch(`/api/communities/${communityId}/members/${targetUserId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "STAFF" }),
      });
      const body = await res.json().catch(() => ({}));
      return { status: res.status, body };
    },
    { communityId: hostCommunityId, targetUserId: adminUserId }
  );
  expect(demoteOwnerResponse).toEqual({
    status: 400,
    body: { error: "The club owner role cannot be changed" },
  });

  await signInAsAdmin(page);
  await page.goto(`/community/${hostCommunityId}/admin`);
  await page.getByPlaceholder("Search players by name or email").fill(playerName);
  await page.getByRole("button", { name: "Edit" }).click();
  const adminEditor = page
    .locator(".app-modal-frame")
    .filter({ has: page.getByRole("heading", { name: playerName }) });
  await expect(adminEditor.getByRole("button", { name: "Change to staff" })).toBeVisible();
  await adminEditor.getByRole("button", { name: "Change to staff" }).click();
  const staffModal = page
    .locator(".app-modal-frame")
    .filter({ has: page.getByRole("heading", { name: `Change ${playerName} to staff?` }) });
  await expect(staffModal.getByRole("heading", { name: `Change ${playerName} to staff?` })).toBeVisible();
  await staffModal.getByRole("button", { name: "Change to Staff" }).click();
  await expect(page.getByText(`${playerName} changed to staff.`)).toBeVisible();

  await signIn(page, getHostPlayerCredentials(4));
  await page.goto(`/community/${hostCommunityId}`);
  await expect(page.getByText("Staff", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Host Setup desk" })).toBeVisible();

  await signInAsAdmin(page);
  await page.goto(`/community/${hostCommunityId}/admin`);
  await page.getByPlaceholder("Search players by name or email").fill(playerName);
  await page.getByRole("button", { name: "Edit" }).click();
  const staffEditor = page
    .locator(".app-modal-frame")
    .filter({ has: page.getByRole("heading", { name: playerName }) });
  await expect(staffEditor.getByRole("button", { name: "Change to member" })).toBeVisible();
  await staffEditor.getByRole("button", { name: "Change to member" }).click();
  await expect(page.getByText(`${playerName} is back to member access.`)).toBeVisible();

  await signIn(page, getHostPlayerCredentials(4));
  await page.goto(`/community/${hostCommunityId}`);
  await expect(page.getByText("Member", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Host Setup desk" })).toHaveCount(0);
});
