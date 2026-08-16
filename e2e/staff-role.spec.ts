import { expect, test } from "@playwright/test";

import {
  adminUserId,
  createManualMatchWithPlayers,
  createStartedHostSession,
  getHostPlayerCredentials,
  hostClubId,
  openSessionSettings,
  readSessionSnapshot,
  signIn,
  signInAsAdmin,
} from "./helpers";

test.setTimeout(120_000);

test("staff can run a live session without admin-only controls", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto(`/club/${hostClubId}/admin`);
  await expect(page.getByRole("heading", { name: "E2E Host Club" })).toBeVisible();

  await page.getByPlaceholder("Search players by name or email").fill(
    "Host Player 1"
  );
  await page.getByRole("button", { name: "Edit" }).click();
  const editorModal = page
    .locator(".app-modal-frame")
    .filter({ has: page.getByRole("heading", { name: "Host Player 1" }) });
  await expect(
    editorModal.getByRole("heading", { name: "Host Player 1" })
  ).toBeVisible();
  const makeStaffButton = editorModal.getByRole("button", {
    name: "Make staff",
  });
  if (await makeStaffButton.count()) {
    await makeStaffButton.click();
    await expect(
      page.getByText("Host Player 1 can now host and run live tournaments.")
    ).toBeVisible();
  } else {
    await expect(
      editorModal.getByRole("button", { name: "Change to member" })
    ).toBeVisible();
  }

  await signIn(page, getHostPlayerCredentials(1));
  await page.goto(`/club/${hostClubId}`);
  await expect(page.getByText("Your role: Staff", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Manage club" })).toHaveCount(0);

  await page.goto(`/club/${hostClubId}/admin`);
  await expect(page).toHaveURL(new RegExp(`/club/${hostClubId}$`));
  await expect(page.getByText("Only club admins can access this page")).toHaveCount(0);

  const sessionName = "E2E Staff Operator Session";
  const sessionCode = await createStartedHostSession(page, {
    sessionName,
    selectedPlayerNames: ["Host Player 1", "Host Player 2", "Host Player 3"],
  });

  await expect(page.getByRole("button", { name: "Create", exact: true })).toBeVisible();
  await createManualMatchWithPlayers(page, [
    "Admin E2E (1000)",
    "Host Player 1 (1000)",
    "Host Player 2 (1000)",
    "Host Player 3 (1000)",
  ]);

  const scoreInputs = page.getByRole("spinbutton", {
    name: /^Team [12] score/,
  });
  await expect(scoreInputs).toHaveCount(2);
  await scoreInputs.nth(0).fill("21");
  await scoreInputs.nth(1).fill("16");
  await page.getByRole("button", { name: "Review result" }).click();
  await page.getByRole("button", { name: "Submit result", exact: true }).click();

  await expect
    .poll(async () => {
      const snapshot = await readSessionSnapshot(page, sessionCode);
      return {
        activeCourts: snapshot.courts.filter((court) => court.currentMatch).length,
        completedMatches:
          snapshot.matches?.filter((match) => match.status === "COMPLETED").length ?? 0,
        staffPoints:
          snapshot.players.find((player) => player.user.name === "Host Player 1")
            ?.sessionPoints ?? null,
      };
    })
    .toEqual({
      activeCourts: 0,
      completedMatches: 1,
      staffPoints: 3,
    });

  await page.getByRole("button", { name: "Match History" }).click();
  await expect(page).toHaveURL(new RegExp(`/session/${sessionCode}/history`));
  const historyMatches = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Tournament matches" }),
  });
  await expect(historyMatches).toBeVisible();
  await historyMatches
    .getByRole("button", { name: /^Open actions for/ })
    .click();
  await historyMatches
    .getByRole("menuitem", { name: "Undo result", exact: true })
    .click();
  const undoModal = page
    .locator(".app-modal-frame")
    .filter({ has: page.getByRole("heading", { name: "Undo result?" }) });
  await expect(undoModal.getByRole("heading", { name: "Undo result?" })).toBeVisible();
  await undoModal.getByRole("button", { name: "Undo Result", exact: true }).click();
  await expect(page.getByText("No matches yet")).toBeVisible();

  await expect
    .poll(async () => {
      const snapshot = await readSessionSnapshot(page, sessionCode);
      return {
        completedMatches:
          snapshot.matches?.filter((match) => match.status === "COMPLETED").length ?? 0,
        staffPoints:
          snapshot.players.find((player) => player.user.name === "Host Player 1")
            ?.sessionPoints ?? null,
      };
    })
    .toEqual({
      completedMatches: 0,
      staffPoints: 0,
    });

  await page.goto(`/session/${sessionCode}`);
  const settingsModal = await openSessionSettings(page);
  await expect(settingsModal.getByRole("button", { name: "End Tournament" })).toBeVisible();
  await expect(settingsModal.getByRole("button", { name: "Reset Test Tournament" })).toHaveCount(0);
  await expect(settingsModal.getByRole("button", { name: "Create Real Tournament" })).toHaveCount(0);
  await expect(settingsModal.getByRole("button", { name: "Delete Test Tournament" })).toHaveCount(0);
  await settingsModal.getByRole("button", { name: "End Tournament" }).click();
  await expect(page.getByRole("heading", { name: "End tournament?" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm End Tournament" }).click();
  await expect(page.getByText("Completed tournament")).toBeVisible();

  const rollbackResponse = await page.evaluate(async (code) => {
    const res = await fetch(`/api/sessions/${code}/rollback`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  }, sessionCode);
  expect(rollbackResponse).toEqual({
    status: 403,
    body: { error: "Admin only" },
  });

  const playerEditResponse = await page.evaluate(
    async ({ clubId, targetUserId }) => {
      const res = await fetch(`/api/clubs/${clubId}/members/${targetUserId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ elo: 1200 }),
      });
      return res.status;
    },
    { clubId: hostClubId, targetUserId: adminUserId }
  );
  expect(playerEditResponse).toBe(403);

  await page.goto(`/club/${hostClubId}`);
  await page
    .locator('[aria-label="Club section tabs"]')
    .getByRole("button", { name: /^Tournaments / })
    .click();
  await expect(
    page.getByText(sessionName).filter({ visible: true }).first()
  ).toBeVisible();
  await expect(
    page
      .getByRole("button", { name: "Rollback", exact: true })
      .filter({ visible: true })
  ).toHaveCount(0);
});
