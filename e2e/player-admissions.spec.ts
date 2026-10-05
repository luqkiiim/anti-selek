import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { e2eBaseURL, e2eDatabaseUrl } from "./env";
import {
  adminCredentials,
  adminUserId,
  claimClubId,
  claimPlaceholderUserId,
  signIn,
  signInAsAdmin,
  signInAsClaimRequester,
} from "./helpers";

const historySessionCode = "admission-history-e2e";
const newAdmissionClubId = "community-new-admission-e2e";
const newAdmissionEmail = "new-admission-e2e@example.com";
const newAdmissionPassword = "Password123!";
const newAdmissionPlayerName = "New Admission Candidate";

async function seedPlayerHistory() {
  const prisma = new PrismaClient({
    datasources: { db: { url: e2eDatabaseUrl } },
  });
  try {
    if (await prisma.session.findUnique({ where: { code: historySessionCode } })) {
      return;
    }

    const session = await prisma.session.create({
      data: {
        code: historySessionCode,
        clubId: claimClubId,
        name: "Admission History Session",
        status: "COMPLETED",
        endedAt: new Date("2026-09-20T12:00:00.000Z"),
      },
    });
    const court = await prisma.court.create({
      data: { sessionId: session.id, courtNumber: 1 },
    });
    const playerIds = [
      claimPlaceholderUserId,
      adminUserId,
      "user-host-1-e2e",
      "user-host-2-e2e",
    ];
    await prisma.sessionPlayer.createMany({
      data: playerIds.map((playerId) => ({ sessionId: session.id, playerId })),
    });
    await prisma.match.create({
      data: {
        sessionId: session.id,
        courtId: court.id,
        status: "COMPLETED",
        team1Player1Id: claimPlaceholderUserId,
        team1Player2Id: adminUserId,
        team2Player1Id: "user-host-1-e2e",
        team2Player2Id: "user-host-2-e2e",
        team1Score: 21,
        team2Score: 17,
        winnerTeam: 1,
        completedAt: new Date("2026-09-20T12:00:00.000Z"),
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

test("a request stays pending before review and the claimed Player keeps match history", async ({
  page,
}) => {
  await seedPlayerHistory();
  await signInAsClaimRequester(page);
  await page.goto(`/?join=${encodeURIComponent(claimClubId)}`);

  const joinDialog = page.getByRole("dialog", { name: "Join a club" });
  await expect(joinDialog.getByRole("heading", { name: "E2E Claim Club" })).toBeVisible();
  await expect(joinDialog.getByText("Your account already has club access.")).toBeVisible();
  await joinDialog.getByRole("button", { name: "Yes, find my profile" }).click();
  await joinDialog.getByRole("button", { name: /Claim Candidate/ }).click();
  await expect(joinDialog.getByText(/1\s+match(?:es)?/)).toBeVisible();
  await joinDialog.getByRole("button", { name: "Request to connect this Player" }).click();
  await expect(joinDialog.getByText("Request sent")).toBeVisible();
  await expect(joinDialog.getByText(/An admin will review your request/)).toBeVisible();

  const pendingAccount = await page.evaluate(async () => {
    const response = await fetch("/api/user/me");
    return response.json();
  });
  expect(pendingAccount.players).toEqual([]);

  const browser = page.context().browser();
  if (!browser) throw new Error("Playwright browser context is unavailable");
  const adminContext = await browser.newContext({ baseURL: e2eBaseURL });
  const adminPage = await adminContext.newPage();
  try {
    await adminPage.goto("/signin");
    await adminPage.getByLabel("Email", { exact: true }).fill(adminCredentials.email);
    await adminPage.getByLabel("Password", { exact: true }).fill(adminCredentials.password);
    await adminPage.getByRole("button", { name: "Sign in" }).click();
    await expect(adminPage).toHaveURL(/\/$/);
    await adminPage.getByRole("button", { name: /E2E Claim Club/ }).click();
    await adminPage.getByRole("button", { name: "Manage club" }).click();
    await adminPage.getByRole("tab", { name: /Requests/ }).click();

    const requestCard = adminPage.locator(".admission-review-card").filter({
      hasText: "CLAIM Candidate",
    });
    await expect(requestCard).toContainText("Claim candidate: Claim Candidate");
    await expect(requestCard).toContainText(/\d+ rating · 1 matches/);
    await requestCard.getByRole("button", { name: "Approve Claim Candidate" }).click();
    await expect(requestCard).toHaveCount(0);
  } finally {
    await adminContext.close().catch(() => {});
  }

  await page.goto(`/?join=${encodeURIComponent(claimClubId)}`);
  const approvedDialog = page.getByRole("dialog", { name: "Join a club" });
  await expect(approvedDialog.getByText("You’re already a member.")).toBeVisible();
  await approvedDialog.getByRole("button", { name: "Open E2E Claim Club" }).click();
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  const playerProfile = page.locator(".player-profile");
  await expect(playerProfile.getByRole("heading", { name: "Your latest session" })).toBeVisible();
  await expect(playerProfile.locator(".profile-latest")).toContainText("Admission History Session");
  await expect(playerProfile.locator(".profile-activity-totals")).toContainText("1 sessions · 1 matches");
  await expect(page.getByRole("heading", { name: "Player preferences" })).toBeVisible();
});

test("registration creates only an Account until a new Player request is approved", async ({
  page,
}) => {
  await page.goto("/signup");
  await page.getByLabel("Name", { exact: true }).fill("New Admission Account");
  await page.getByLabel("Email", { exact: true }).fill(newAdmissionEmail);
  await page.getByLabel("Gender for Mixed pairing").selectOption("MALE");
  const passwordFields = page.locator('input[autocomplete="new-password"]');
  await passwordFields.nth(0).fill(newAdmissionPassword);
  await passwordFields.nth(1).fill(newAdmissionPassword);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/signin\?registered=true/);

  await signIn(page, { email: newAdmissionEmail, password: newAdmissionPassword });
  const account = await page.evaluate(async () => {
    const response = await fetch("/api/user/me");
    if (!response.ok) throw new Error(`Account request failed: ${response.status}`);
    return response.json();
  });
  expect(account.players).toEqual([]);

  const prisma = new PrismaClient({
    datasources: { db: { url: e2eDatabaseUrl } },
  });
  let accountId: string;
  try {
    const registeredAccount = await prisma.user.findUnique({
      where: { email: newAdmissionEmail },
      select: { id: true },
    });
    expect(registeredAccount).not.toBeNull();
    accountId = registeredAccount!.id;
    expect(await prisma.player.findMany({ where: { ownerUserId: accountId } })).toEqual([]);
    expect(
      await prisma.clubMember.findMany({
        where: {
          clubId: newAdmissionClubId,
          player: { name: newAdmissionPlayerName },
        },
      }),
    ).toEqual([]);
  } finally {
    await prisma.$disconnect();
  }

  await page.goto(`/?join=${encodeURIComponent(newAdmissionClubId)}`);
  const joinDialog = page.getByRole("dialog", { name: "Join a club" });
  await expect(
    joinDialog.getByRole("heading", { name: "E2E New Admission Club" }),
  ).toBeVisible();
  await joinDialog.getByRole("button", { name: "I’m new to this club" }).click();
  await joinDialog.getByLabel("Player name").fill(newAdmissionPlayerName);
  await joinDialog.getByRole("button", { name: "Send request" }).click();
  await expect(joinDialog.getByText("Request sent")).toBeVisible();

  const pendingAccount = await page.evaluate(async () => {
    const response = await fetch("/api/user/me");
    return response.json();
  });
  expect(pendingAccount.players).toEqual([]);

  const pendingPrisma = new PrismaClient({
    datasources: { db: { url: e2eDatabaseUrl } },
  });
  try {
    expect(await pendingPrisma.player.findMany({ where: { ownerUserId: accountId } })).toEqual([]);
    expect(
      await pendingPrisma.clubMember.findMany({
        where: {
          clubId: newAdmissionClubId,
          player: { name: newAdmissionPlayerName },
        },
      }),
    ).toEqual([]);
    expect(
      await pendingPrisma.clubAccess.findUnique({
        where: { clubId_userId: { clubId: newAdmissionClubId, userId: accountId } },
      }),
    ).toBeNull();
    const request = await pendingPrisma.clubAdmissionRequest.findFirst({
      where: { clubId: newAdmissionClubId, requesterUserId: accountId },
      select: { kind: true, status: true },
    });
    expect(request).toEqual({ kind: "NEW_PLAYER", status: "PENDING" });
  } finally {
    await pendingPrisma.$disconnect();
  }

  const browser = page.context().browser();
  if (!browser) throw new Error("Playwright browser context is unavailable");
  const adminContext = await browser.newContext({ baseURL: e2eBaseURL });
  const adminPage = await adminContext.newPage();
  try {
    await signInAsAdmin(adminPage);
    await adminPage.getByRole("button", { name: /E2E New Admission Club/ }).click();
    await adminPage.getByRole("button", { name: "Manage club" }).click();
    await adminPage.getByRole("tab", { name: /Requests/ }).click();
    const requestCard = adminPage.locator(".admission-review-card").filter({
      hasText: newAdmissionPlayerName,
    });
    await expect(requestCard).toContainText("New Player request");
    await expect(requestCard).toContainText("no Player profile has been created");
    await requestCard.getByRole("button", { name: "Approve as new Player" }).click();
    await expect(requestCard).toHaveCount(0);
  } finally {
    await adminContext.close().catch(() => {});
  }

  await page.goto(`/?join=${encodeURIComponent(newAdmissionClubId)}`);
  const approvedDialog = page.getByRole("dialog", { name: "Join a club" });
  await expect(approvedDialog.getByText("You’re already a member.")).toBeVisible();
  await approvedDialog.getByRole("button", { name: "Open E2E New Admission Club" }).click();
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(page.locator(".player-profile")).toContainText(newAdmissionPlayerName);
  await expect(page.getByRole("heading", { name: "Player preferences" })).toBeVisible();

  const approvedAccount = await page.evaluate(async () => {
    const response = await fetch("/api/user/me");
    return response.json();
  });
  expect(approvedAccount.players).toHaveLength(1);
  expect(approvedAccount.players[0].name).toBe(newAdmissionPlayerName);

  const approvedPrisma = new PrismaClient({
    datasources: { db: { url: e2eDatabaseUrl } },
  });
  try {
    const players = await approvedPrisma.player.findMany({
      where: { ownerUserId: accountId },
      select: { id: true, name: true },
    });
    expect(players).toEqual([{ id: approvedAccount.players[0].id, name: newAdmissionPlayerName }]);
    expect(
      await approvedPrisma.clubMember.findMany({
        where: { clubId: newAdmissionClubId, playerId: players[0].id },
      }),
    ).toHaveLength(1);
    expect(
      await approvedPrisma.clubAccess.findUnique({
        where: { clubId_userId: { clubId: newAdmissionClubId, userId: accountId } },
        select: { status: true },
      }),
    ).toEqual({ status: "ACTIVE" });
  } finally {
    await approvedPrisma.$disconnect();
  }
});
