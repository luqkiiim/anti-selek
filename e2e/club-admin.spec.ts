import { expect, test, type Page } from "@playwright/test";
import {
  adminControlsClubId,
  claimClubId,
  claimPlaceholderUserId,
  claimRequesterUserId,
  createClaimRequest,
  readClubClaimRequestsSnapshot,
  hostClubId,
  readClubMembersSnapshot,
  signInAsAdmin,
  signInAsClaimRequester,
} from "./helpers";

function getPlayerEditorModal(page: Page, playerName: string) {
  return page
    .locator(".app-modal-frame")
    .filter({ has: page.getByRole("heading", { name: playerName }) });
}

test("admin can create and open a club player profile from admin page", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto(`/club/${hostClubId}/admin`);

  await expect(page.getByText("Club admin")).toBeVisible();
  await expect(page.getByRole("heading", { name: "E2E Host Club" })).toBeVisible();

  await page.getByRole("button", { name: "Add player" }).click();
  await expect(
    page.getByRole("heading", { name: "Create player profile" })
  ).toBeVisible();

  await page.getByLabel("Player name").fill("Admin Page Placeholder");
  await page.getByRole("button", { name: "Create profile" }).click();

  await expect
    .poll(async () => {
      const members = await readClubMembersSnapshot(page, hostClubId);
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

  const editorModal = getPlayerEditorModal(page, "Admin Page Placeholder");
  await expect(
    editorModal.getByRole("heading", { name: "Admin Page Placeholder" })
  ).toBeVisible();
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
  await page.goto(`/club/${adminControlsClubId}/admin`);

  await page.getByPlaceholder("Search players by name or email").fill(
    "Admin Control Remove"
  );
  await page.getByRole("button", { name: "Edit" }).click();
  const editorModal = getPlayerEditorModal(page, "Admin Control Remove");
  await expect(
    editorModal.getByRole("heading", { name: "Admin Control Remove" })
  ).toBeVisible();

  await editorModal.getByRole("button", { name: "Remove player" }).click();
  const removeModal = page
    .locator(".app-modal-frame")
    .filter({ has: page.getByRole("heading", { name: "Remove Admin Control Remove?" }) });
  await expect(
    removeModal.getByRole("heading", { name: "Remove Admin Control Remove?" })
  ).toBeVisible();
  await removeModal.getByRole("button", { name: "Remove Player" }).click();

  await expect
    .poll(async () => {
      const members = await readClubMembersSnapshot(
        page,
        adminControlsClubId
      );
      return members.some((member) => member.name === "Admin Control Remove");
    })
    .toBe(false);
});

test("club admin sees password recovery guidance for claimed members", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto(`/club/${adminControlsClubId}/admin`);

  await page.getByPlaceholder("Search players by name or email").fill(
    "Admin Control Reset"
  );
  await page.getByRole("button", { name: "Edit" }).click();

  const editorModal = getPlayerEditorModal(page, "Admin Control Reset");
  await expect(
    editorModal.getByRole("heading", { name: "Admin Control Reset" })
  ).toBeVisible();
  await expect(
    editorModal.getByText(
      "Claimed members recover passwords from the sign-in screen by email."
    )
  ).toBeVisible();
  await expect(
    editorModal.getByRole("button", { name: "Emergency password reset" })
  ).toHaveCount(0);
});

test("admin can approve a pending claim request from the admin page", async ({
  page,
}) => {
  await signInAsClaimRequester(page);
  const claimResponse = await createClaimRequest(page, {
    clubId: claimClubId,
    targetUserId: claimPlaceholderUserId,
  });
  expect(claimResponse.ok).toBe(true);

  await expect
    .poll(async () => {
      const requests = await readClubClaimRequestsSnapshot(
        page,
        claimClubId
      );
      return requests.length;
    })
    .toBe(1);

  await signInAsAdmin(page);
  await page.goto(`/club/${claimClubId}/admin`);
  await page.getByRole("button", { name: "Claims" }).click();

  const claimsPanel = page
    .getByRole("heading", { name: "Claim Requests" })
    .locator("xpath=ancestor::div[contains(@class, 'bg-white')][1]");
  await expect(claimsPanel).toBeVisible();
  await expect(
    claimsPanel.getByRole("button", { name: "Approve" }).first()
  ).toBeVisible();
  await claimsPanel.getByRole("button", { name: "Approve" }).first().click();

  await expect
    .poll(async () => {
      const requests = await readClubClaimRequestsSnapshot(
        page,
        claimClubId
      );
      return requests.length;
    })
    .toBe(0);

  await expect
    .poll(async () => {
      const members = await readClubMembersSnapshot(page, claimClubId);
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
      requesterName: "CLAIM Candidate",
    });
});
