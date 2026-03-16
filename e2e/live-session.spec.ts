import { expect, test } from "@playwright/test";

import {
  adminUserId,
  createStartedHostSession,
  readCurrentMatchSignature,
  readSessionSnapshot,
  scoreSessionCode,
  signInAsAdmin,
} from "./helpers";

test("admin can host a tournament and reshuffle the first live court", async ({
  page,
}) => {
  await signInAsAdmin(page);
  const sessionCode = await createStartedHostSession(page, {
    sessionName: "E2E Open Session",
  });
  await expect(page.getByRole("button", { name: "Create Match" })).toBeVisible();
  await page.getByRole("button", { name: "Create Match" }).click();

  await expect
    .poll(() => readCurrentMatchSignature(page, sessionCode), {
      message: "expected the first court to receive a match",
    })
    .not.toBe("");

  const firstLineup = await readCurrentMatchSignature(page, sessionCode);
  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Reshuffle" }).click();

  await expect
    .poll(() => readCurrentMatchSignature(page, sessionCode), {
      message: "expected reshuffle to change the live matchup",
    })
    .not.toBe(firstLineup);
});

test("admin can create and undo a manual match on an open court", async ({
  page,
}) => {
  await signInAsAdmin(page);
  const sessionCode = await createStartedHostSession(page, {
    sessionName: "E2E Manual Session",
  });

  await expect(page.getByRole("button", { name: "Manual" })).toBeVisible();
  await page.getByRole("button", { name: "Manual" }).click();

  const manualModal = page
    .locator("div.fixed.inset-0")
    .filter({ has: page.getByRole("heading", { name: "Manual Match" }) });
  await expect(manualModal.getByRole("heading", { name: "Manual Match" })).toBeVisible();

  const selects = manualModal.locator("select");
  await selects.nth(0).selectOption({ label: "Admin E2E (1000)" });
  await selects.nth(1).selectOption({ label: "Host Player 1 (1000)" });
  await selects.nth(2).selectOption({ label: "Host Player 2 (1000)" });
  await selects.nth(3).selectOption({ label: "Host Player 3 (1000)" });
  await manualModal.getByRole("button", { name: "Create Match" }).click();

  await expect(manualModal).toHaveCount(0);
  await expect
    .poll(() => readCurrentMatchSignature(page, sessionCode), {
      message: "expected the manual lineup to appear on the court",
    })
    .toBe("Admin E2E|Host Player 1|vs|Host Player 2|Host Player 3");

  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Undo" }).click();

  await expect
    .poll(async () => {
      const snapshot = await readSessionSnapshot(page, sessionCode);
      return snapshot.courts.filter((court) => court.currentMatch).length;
    })
    .toBe(0);
  await expect(page.getByRole("button", { name: "Manual" })).toBeVisible();
});

test("admin can add a community player into an active session", async ({
  page,
}) => {
  await signInAsAdmin(page);
  const sessionCode = await createStartedHostSession(page, {
    sessionName: "E2E Late Join Session",
    selectedPlayerNames: ["Host Player 1", "Host Player 2", "Host Player 3"],
  });

  await page.getByRole("button", { name: "Add Players" }).click();
  const rosterModal = page
    .locator("div.fixed.inset-0")
    .filter({ has: page.getByPlaceholder("Search players...") });
  await expect(rosterModal.getByRole("heading", { name: "Add Players" })).toBeVisible();
  await rosterModal.getByPlaceholder("Search players...").fill("Host Player 4");
  await expect(rosterModal.getByText("Host Player 4")).toBeVisible();
  await rosterModal.locator("button.bg-blue-600").click();

  await expect
    .poll(async () => {
      const snapshot = await readSessionSnapshot(page, sessionCode);
      return {
        totalPlayers: snapshot.players.length,
        addedPlayerPresent: snapshot.players.some(
          (player) => player.user.name === "Host Player 4" && !player.isGuest
        ),
      };
    })
    .toEqual({
      totalPlayers: 5,
      addedPlayerPresent: true,
    });
});

test("admin can add a guest into an active session", async ({ page }) => {
  await signInAsAdmin(page);
  const sessionCode = await createStartedHostSession(page, {
    sessionName: "E2E Guest Join Session",
    selectedPlayerNames: ["Host Player 1", "Host Player 2", "Host Player 3"],
  });

  await page.getByRole("button", { name: "Add Players" }).click();
  const rosterModal = page
    .locator("div.fixed.inset-0")
    .filter({ has: page.getByPlaceholder("Guest name...") });
  await expect(rosterModal.getByRole("heading", { name: "Add Players" })).toBeVisible();
  await rosterModal.getByPlaceholder("Guest name...").fill("Late Guest");
  await rosterModal.getByRole("button", { name: "Add" }).first().click();

  await expect
    .poll(async () => {
      const snapshot = await readSessionSnapshot(page, sessionCode);
      return {
        totalPlayers: snapshot.players.length,
        guestPresent: snapshot.players.some(
          (player) => player.user.name === "Late Guest" && player.isGuest
        ),
      };
    })
    .toEqual({
      totalPlayers: 5,
      guestPresent: true,
    });
});

test("admin can submit and approve a pending score", async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto(`/session/${scoreSessionCode}`);

  await expect(page.getByText("Court 1")).toBeVisible();

  const scoreInputs = page.locator('input[type="number"]');
  await expect(scoreInputs).toHaveCount(2);
  await scoreInputs.nth(0).fill("21");
  await scoreInputs.nth(1).fill("18");
  await page.getByRole("button", { name: "Submit Score" }).click();

  await expect(
    page.getByRole("heading", { name: "Confirm score submission" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm Submission" }).click();
  await expect(page.getByText("Awaiting Confirmation")).toBeVisible();
  await page.getByRole("button", { name: "Confirm Results" }).click();

  await expect
    .poll(async () => {
      const snapshot = await readSessionSnapshot(page, scoreSessionCode);
      return {
        activeCourts: snapshot.courts.filter((court) => court.currentMatch).length,
        completedMatches:
          snapshot.matches?.filter((match) => match.status === "COMPLETED").length ?? 0,
        adminPoints:
          snapshot.players.find((player) => player.userId === adminUserId)?.sessionPoints ?? null,
      };
    })
    .toEqual({
      activeCourts: 0,
      completedMatches: 1,
      adminPoints: 3,
    });

  await expect(page.getByText("Awaiting Confirmation")).toHaveCount(0);
});
