import { expect, test } from "@playwright/test";

import {
  createStartedHostSession,
  openManualMatchModal,
  signInAsAdmin,
} from "./helpers";

test("manual match failure keeps the selected lineup ready to retry", async ({
  page,
}) => {
  await signInAsAdmin(page);
  const sessionCode = await createStartedHostSession(page, {
    sessionName: `E2E Manual Failure ${Date.now()}`,
    selectedPlayerNames: [
      "Host Player 1",
      "Host Player 2",
      "Host Player 3",
      "Host Player 4",
    ],
  });
  const manualModal = await openManualMatchModal(page);
  const createMatchButton = manualModal.getByRole("button", {
    name: "Create Match",
    exact: true,
  });

  await expect(createMatchButton).toBeDisabled();
  await expect(manualModal.getByText("Select 4 more players.")).toBeVisible();

  for (const [index, playerName] of [
    "Admin E2E",
    "Host Player 1",
    "Host Player 2",
    "Host Player 3",
  ].entries()) {
    const playerButton = manualModal
      .getByRole("button")
      .filter({ hasText: playerName });
    await expect(playerButton).toBeVisible();
    await playerButton.click();

    const remainingPlayers = 3 - index;
    if (remainingPlayers > 0) {
      await expect(createMatchButton).toBeDisabled();
      await expect(
        manualModal.getByText(
          `Select ${remainingPlayers} more ${
            remainingPlayers === 1 ? "player" : "players"
          }.`
        )
      ).toBeVisible();
    }
  }

  await expect(manualModal.getByText("4/4 selected")).toBeVisible();
  await expect(
    manualModal.getByText("Four players selected. Ready to create the match.")
  ).toBeVisible();
  await expect(createMatchButton).toBeEnabled();
  await expect(
    manualModal.getByRole("button").filter({ hasText: "Host Player 4" })
  ).toBeDisabled();

  let interceptedManualRequests = 0;
  await page.route(
    `**/api/sessions/${sessionCode}/generate-match`,
    async (route) => {
      const request = route.request();
      const body = request.postDataJSON() as {
        manualTeams?: unknown;
      };

      if (request.method() === "POST" && body.manualTeams) {
        interceptedManualRequests += 1;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Manual match service unavailable. Try again.",
          }),
        });
        return;
      }

      await route.continue();
    }
  );

  await createMatchButton.click();

  await expect(manualModal).toBeVisible();
  await expect(manualModal.getByRole("alert")).toHaveText(
    "Manual match service unavailable. Try again."
  );
  await expect(manualModal.locator('button[aria-pressed="true"]')).toHaveCount(
    4
  );
  await expect(manualModal.getByText("4/4 selected")).toBeVisible();
  await expect(createMatchButton).toBeEnabled();
  expect(interceptedManualRequests).toBe(1);
});
