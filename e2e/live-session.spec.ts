import { expect, test } from "@playwright/test";

import {
  adminUserId,
  hostCommunityId,
  readCurrentMatchSignature,
  readSessionSnapshot,
  scoreSessionCode,
  signInAsAdmin,
} from "./helpers";

test("admin can host a tournament and reshuffle the first live court", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto(`/community/${hostCommunityId}`);

  await expect(
    page.getByRole("heading", { name: "E2E Host Club" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Host Tournament" }).click();
  await page.getByPlaceholder("Tournament Name").fill("E2E Open Session");
  await page.locator("select").selectOption("1");

  await page.getByRole("button", { name: "Add Players" }).click();
  await expect(page.getByRole("heading", { name: "Add Players" })).toBeVisible();
  await page.getByRole("button", { name: "Select All" }).click();
  await expect(page.getByRole("button", { name: "Deselect All" })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: "Create Tournament" }).click();
  await expect(page).toHaveURL(/\/session\/.+/);
  await expect(page.getByRole("button", { name: "Start Session" })).toBeVisible();

  await page.getByRole("button", { name: "Start Session" }).click();
  await expect(page.getByRole("button", { name: "Create Match" })).toBeVisible();
  await page.getByRole("button", { name: "Create Match" }).click();

  const sessionCode = page.url().split("/").pop();
  if (!sessionCode) {
    throw new Error("Failed to capture created session code");
  }

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
