import { expect, test } from "@playwright/test";
import { SessionMode } from "../src/types/enums";

import {
  adminUserId,
  createManualMatchWithPlayers,
  createStartedHostSession,
  hostCommunityId,
  readCurrentMatchMixicanoShape,
  readCommunityMembersSnapshot,
  readCommunitySessionsSnapshot,
  readCurrentMatchSignature,
  readSessionSnapshot,
  scoreSessionCode,
  signInAsAdmin,
  submitAndApproveVisibleMatch,
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
  await page.getByRole("button", { name: "Reshuffle" }).click();
  const reshuffleModal = page
    .locator(".app-modal-frame")
    .filter({ has: page.getByRole("heading", { name: "Reshuffle match?" }) });
  await expect(reshuffleModal.getByRole("heading", { name: "Reshuffle match?" })).toBeVisible();
  await reshuffleModal.getByRole("button", { name: "Confirm Reshuffle" }).click();

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

  await createManualMatchWithPlayers(page, [
    "Admin E2E (1000)",
    "Host Player 1 (1000)",
    "Host Player 2 (1000)",
    "Host Player 3 (1000)",
  ]);
  await expect
    .poll(() => readCurrentMatchSignature(page, sessionCode), {
      message: "expected the manual lineup to appear on the court",
    })
    .toBe("Admin E2E|Host Player 1|vs|Host Player 2|Host Player 3");

  await page.getByRole("button", { name: "Undo" }).click();
  const undoModal = page
    .locator(".app-modal-frame")
    .filter({ has: page.getByRole("heading", { name: "Undo match selection?" }) });
  await expect(undoModal.getByRole("heading", { name: "Undo match selection?" })).toBeVisible();
  await undoModal.getByRole("button", { name: "Confirm Undo" }).click();

  await expect
    .poll(async () => {
      const snapshot = await readSessionSnapshot(page, sessionCode);
      return snapshot.courts.filter((court) => court.currentMatch).length;
    })
    .toBe(0);
  await expect(page.getByRole("button", { name: "Manual" })).toBeVisible();
});

test("admin cannot create an invalid Mixicano manual pairing", async ({
  page,
}) => {
  await signInAsAdmin(page);
  const sessionCode = await createStartedHostSession(page, {
    sessionName: "E2E Mixed Invalid Manual",
    sessionMode: SessionMode.MIXICANO,
  });

  await expect(page.getByRole("button", { name: "Manual" })).toBeVisible();
  await page.getByRole("button", { name: "Manual" }).click();

  const manualModal = page
    .locator("div.fixed.inset-0")
    .filter({ has: page.getByRole("heading", { name: "Manual Match" }) });
  await expect(manualModal.getByRole("heading", { name: "Manual Match" })).toBeVisible();

  const selects = manualModal.locator("select");
  await selects.nth(0).selectOption({ label: "Host Player 2 (1000)" });
  await selects.nth(1).selectOption({ label: "Host Player 4 (1000)" });
  await selects.nth(2).selectOption({ label: "Admin E2E (1000)" });
  await selects.nth(3).selectOption({ label: "Host Player 1 (1000)" });
  await manualModal.getByRole("button", { name: "Create Match" }).click();

  await expect(
    page.getByText("That manual pairing is invalid for current Mixed preferences.")
  ).toBeVisible();
  await expect(manualModal).toBeVisible();

  await expect
    .poll(async () => {
      const snapshot = await readSessionSnapshot(page, sessionCode);
      return snapshot.courts.filter((court) => court.currentMatch).length;
    })
    .toBe(0);
});

test("mixed sessions reject guests without explicit gender via the guest API", async ({
  page,
}) => {
  await signInAsAdmin(page);
  const sessionCode = await createStartedHostSession(page, {
    sessionName: "E2E Mixed Guest Validation",
    sessionMode: SessionMode.MIXICANO,
    selectedPlayerNames: ["Host Player 1"],
  });

  const guestResponse = await page.evaluate(async (targetSessionCode) => {
    const res = await fetch(`/api/sessions/${targetSessionCode}/guests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Invalid Mixed Guest",
        gender: "UNSPECIFIED",
      }),
    });

    return {
      status: res.status,
      body: await res.json(),
    };
  }, sessionCode);

  expect(guestResponse).toEqual({
    status: 400,
    body: {
      error: "Mixed requires guest gender (MALE/FEMALE)",
    },
  });

  await expect
    .poll(async () => {
      const snapshot = await readSessionSnapshot(page, sessionCode);
      return snapshot.players.some((player) => player.user.name === "Invalid Mixed Guest");
    })
    .toBe(false);
});

test("admin can create and reshuffle valid Mixicano pairings", async ({
  page,
}) => {
  await signInAsAdmin(page);
  const sessionCode = await createStartedHostSession(page, {
    sessionName: "E2E Mixed Auto Session",
    sessionMode: SessionMode.MIXICANO,
    selectedPlayerNames: ["Host Player 1", "Host Player 2", "Host Player 4"],
  });

  await expect(page.getByRole("button", { name: "Create Match" })).toBeVisible();
  await page.getByRole("button", { name: "Create Match" }).click();

  await expect
    .poll(async () => {
      const shape = await readCurrentMatchMixicanoShape(page, sessionCode);
      return {
        hasMatch: !!shape,
        team1FemaleCount: shape?.team1FemaleCount ?? -1,
        team2FemaleCount: shape?.team2FemaleCount ?? -1,
      };
    }, {
      message: "expected a valid mixed pairing to appear on court",
    })
    .toEqual({
      hasMatch: true,
      team1FemaleCount: 1,
      team2FemaleCount: 1,
    });

  const firstLineup = await readCurrentMatchSignature(page, sessionCode);
  expect(firstLineup).not.toBe("");
  await page.getByRole("button", { name: "Reshuffle" }).click();
  const reshuffleModal = page
    .locator(".app-modal-frame")
    .filter({ has: page.getByRole("heading", { name: "Reshuffle match?" }) });
  await expect(reshuffleModal.getByRole("heading", { name: "Reshuffle match?" })).toBeVisible();
  await reshuffleModal.getByRole("button", { name: "Confirm Reshuffle" }).click();

  await expect
    .poll(async () => {
      const shape = await readCurrentMatchMixicanoShape(page, sessionCode);
      return {
        changed: !!shape && shape.signature !== firstLineup,
        team1FemaleCount: shape?.team1FemaleCount ?? -1,
        team2FemaleCount: shape?.team2FemaleCount ?? -1,
      };
    }, {
      message: "expected reshuffle to keep the mixed pairing valid",
    })
    .toEqual({
      changed: true,
      team1FemaleCount: 1,
      team2FemaleCount: 1,
    });
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

test("admin can confirm removing a player from an active session", async ({
  page,
}) => {
  await signInAsAdmin(page);
  const sessionCode = await createStartedHostSession(page, {
    sessionName: "E2E Remove Player Session",
    selectedPlayerNames: ["Host Player 1", "Host Player 2", "Host Player 3"],
  });

  const playerRow = page
    .locator("tr")
    .filter({ has: page.getByRole("link", { name: "Host Player 3" }) });
  await playerRow.getByRole("button", { name: "Edit" }).click();
  const removePlayerButton = page.getByRole("button", { name: "Remove Player" });
  await expect(removePlayerButton).toBeVisible();
  await removePlayerButton.click({ force: true });

  const removePlayerModal = page
    .locator(".app-modal-frame")
    .filter({ has: page.getByRole("heading", { name: "Remove player?" }) });
  await expect(removePlayerModal.getByRole("heading", { name: "Remove player?" })).toBeVisible();
  await expect(removePlayerModal.getByText("Host Player 3")).toBeVisible();
  await removePlayerModal.getByRole("button", { name: "Confirm Remove Player" }).click();

  await expect
    .poll(async () => {
      const snapshot = await readSessionSnapshot(page, sessionCode);
      return {
        totalPlayers: snapshot.players.length,
        playerStillPresent: snapshot.players.some(
          (player) => player.user.name === "Host Player 3"
        ),
      };
    })
    .toEqual({
      totalPlayers: 3,
      playerStillPresent: false,
    });
});

test("admin can end and rollback the latest completed tournament", async ({
  page,
}) => {
  await signInAsAdmin(page);
  const sessionName = "E2E Rollback Session";
  const sessionCode = await createStartedHostSession(page, {
    sessionName,
  });

  await createManualMatchWithPlayers(page, [
    "Admin E2E (1000)",
    "Host Player 1 (1000)",
    "Host Player 2 (1000)",
    "Host Player 3 (1000)",
  ]);
  await expect
    .poll(() => readCurrentMatchSignature(page, sessionCode), {
      message: "expected a live match before submitting a result",
    })
    .not.toBe("");

  await submitAndApproveVisibleMatch(page, {
    team1Score: 21,
    team2Score: 18,
  });

  await expect
    .poll(async () => {
      const snapshot = await readCommunityMembersSnapshot(page, hostCommunityId);
      return snapshot.some((member) => member.elo !== 1000);
    })
    .toBe(true);

  await page.getByRole("button", { name: "End Session" }).click();
  await expect(page.getByRole("heading", { name: "End session?" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm End Session" }).click();
  await expect(page.getByRole("heading", { name: "Final Standings" })).toBeVisible();
  await expect(page.getByText("Completed session")).toBeVisible();

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(new RegExp(`/community/${hostCommunityId}$`));
  await page.getByRole("button", { name: "Tournaments" }).click();
  await expect(page.getByText(sessionName)).toBeVisible();

  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Rollback" }).click();

  await expect(page.getByText(`Rolled back "${sessionName}".`)).toBeVisible();
  await expect(page.getByText("No past tournaments")).toBeVisible();

  await expect
    .poll(async () => {
      const [members, sessions] = await Promise.all([
        readCommunityMembersSnapshot(page, hostCommunityId),
        readCommunitySessionsSnapshot(page, hostCommunityId),
      ]);

      return {
        allRatingsReset: members.every((member) => member.elo === 1000),
        sessionRemoved: !sessions.some((session) => session.code === sessionCode),
      };
    })
    .toEqual({
      allRatingsReset: true,
      sessionRemoved: true,
    });
});

test("admin can submit and approve a pending score", async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto(`/session/${scoreSessionCode}`);

  await expect(page.getByText("Court 1")).toBeVisible();
  await submitAndApproveVisibleMatch(page, {
    team1Score: 21,
    team2Score: 18,
  });

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
