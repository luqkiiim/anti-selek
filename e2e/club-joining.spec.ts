import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { expect, test } from "@playwright/test";
import { e2eBaseURL, e2eDatabaseUrl } from "./env";
import { adminUserId, signIn, signInAsAdmin } from "./helpers";

const clubId = "club-code-joining-e2e";
const openClubId = "club-open-joining-e2e";
const clubName = "E2E Join Code Club";
const joinCode = "Court2026!";
const accountPassword = "Password123!";
const variants = ["desktop", "mobile"] as const;
const db = () => new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl } } });

test.beforeAll(async () => {
  const prisma = db();
  try {
    const passwordHash = await bcrypt.hash(accountPassword, 10);
    await prisma.club.upsert({ where: { id: clubId }, update: {}, create: { id: clubId, name: clubName, createdById: `account-${adminUserId}`, allowJoinRequests: true, isPasswordProtected: true, passwordHash: await bcrypt.hash(joinCode, 10), accountAccess: { create: { userId: `account-${adminUserId}`, role: "OWNER" } } } });
    await prisma.club.upsert({ where: { id: openClubId }, update: {}, create: { id: openClubId, name: "E2E Open Joining Club", createdById: `account-${adminUserId}`, allowJoinRequests: true, accountAccess: { create: { userId: `account-${adminUserId}`, role: "OWNER" } } } });
    for (const variant of [...variants, "new", "link"]) {
      await prisma.user.upsert({ where: { id: `account-joining-${variant}` }, update: {}, create: { id: `account-joining-${variant}`, name: `Joining ${variant}`, email: `joining-${variant}@example.com`, gender: "FEMALE", passwordHash } });
    }
    for (const variant of variants) {
      await prisma.player.upsert({ where: { id: `player-joining-${variant}` }, update: {}, create: { id: `player-joining-${variant}`, name: `Returning ${variant}`, gender: "FEMALE" } });
      await prisma.clubMember.upsert({ where: { clubId_playerId: { clubId, playerId: `player-joining-${variant}` } }, update: {}, create: { clubId, playerId: `player-joining-${variant}`, elo: 1120 } });
    }
  } finally { await prisma.$disconnect(); }
});

for (const variant of variants) {
  test(`${variant}: search and join code lead to the question, then a reviewed claim`, async ({ page }) => {
    await page.setViewportSize(variant === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    await signIn(page, { email: `joining-${variant}@example.com`, password: accountPassword });
    await page.getByRole("button", { name: "Join a club", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Join a club" });
    await dialog.getByLabel("Search clubs by name").fill("join code");
    await dialog.getByRole("button", { name: new RegExp(clubName) }).click();
    await expect(dialog.getByLabel("Club join code", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Have you played with this club before?")).toHaveCount(0);
    const locked = await page.evaluate(async id => {
      const discovery = await (await fetch(`/api/clubs/join-requests?clubId=${id}`)).json();
      const submit = await fetch("/api/clubs/join-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clubId: id, kind: "NEW_PLAYER", proposedPlayerName: "Unauthorized candidate", proposedGender: "FEMALE" }) });
      return { requiresJoinCode: discovery.requiresJoinCode, players: discovery.players, status: submit.status };
    }, clubId);
    expect(locked).toEqual({ requiresJoinCode: true, players: [], status: 403 });
    await dialog.getByLabel("Club join code", { exact: true }).fill("wrong-code");
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(dialog.getByText("Invalid join code", { exact: true })).toBeVisible();
    await dialog.getByLabel("Club join code", { exact: true }).fill(joinCode);
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(dialog.getByText("Have you played with this club before?")).toBeVisible();
    const cookie = (await page.context().cookies()).find(item => item.name.startsWith("club-entry-"));
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    await page.reload();
    await page.getByRole("button", { name: "Join a club", exact: true }).click();
    await dialog.getByLabel("Invite link or club ID").fill(clubId);
    await dialog.getByRole("button", { name: "Find club", exact: true }).click();
    await expect(dialog.getByText("Have you played with this club before?")).toBeVisible();
    await dialog.getByRole("button", { name: "Yes, find my profile" }).click();
    await dialog.getByRole("button", { name: new RegExp(`Returning ${variant}`) }).click();
    await dialog.getByRole("button", { name: "Request to connect this Player" }).click();
    await expect(dialog.getByText("Waiting for admin approval")).toBeVisible();
    const prisma = db();
    let requestId: string;
    let revision: number;
    try {
      const request = await prisma.clubAdmissionRequest.findFirstOrThrow({ where: { clubId, requesterUserId: `account-joining-${variant}`, status: "PENDING" } });
      requestId = request.id; revision = request.revision;
      expect(request.requestedPlayerId).toBe(`player-joining-${variant}`);
      expect((await prisma.clubMember.findUniqueOrThrow({ where: { clubId_playerId: { clubId, playerId: request.requestedPlayerId! } } })).ownerUserId).toBeNull();
      expect(await prisma.clubAccess.findUnique({ where: { clubId_userId: { clubId, userId: `account-joining-${variant}` } } })).toBeNull();
    } finally { await prisma.$disconnect(); }
    const adminContext = await page.context().browser()!.newContext({ baseURL: e2eBaseURL });
    try {
      const admin = await adminContext.newPage();
      await signInAsAdmin(admin);
      const status = await admin.evaluate(async ({ id, requestId, revision }) => (await fetch(`/api/clubs/${id}/join-requests/${requestId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "APPROVE", revision }) })).status, { id: clubId, requestId, revision });
      expect(status).toBe(200);
    } finally { await adminContext.close(); }
    await dialog.getByRole("button", { name: "Refresh status" }).click();
    await expect(dialog.getByRole("button", { name: "Open club", exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Open club", exact: true }).click();
    await expect(page.getByRole("button", { name: `Switch club, current ${clubName}`, exact: true })).toBeVisible();
  });
}

test("ordinary protected invite links require a code and unprotected clubs go straight to the question", async ({ page }) => {
  await signIn(page, { email: "joining-link@example.com", password: accountPassword });
  await page.goto(`/?join=${clubId}`);
  const dialog = page.getByRole("dialog", { name: "Join a club" });
  await expect(dialog.getByLabel("Club join code", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Have you played with this club before?")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Find a different club" }).click();
  await dialog.getByLabel("Invite link or club ID").fill(openClubId);
  await dialog.getByRole("button", { name: "Find club", exact: true }).click();
  await expect(dialog.getByText("Have you played with this club before?")).toBeVisible();
  await expect(dialog.getByLabel("Club join code", { exact: true })).toHaveCount(0);
});

test("a new profile is prefilled and stays unallocated until approval", async ({ page }) => {
  await signIn(page, { email: "joining-new@example.com", password: accountPassword });
  await page.goto(`/?join=${openClubId}`);
  const dialog = page.getByRole("dialog", { name: "Join a club" });
  await dialog.getByRole("button", { name: "I’m new to this club" }).click();
  await expect(dialog.getByLabel("Player name", { exact: true })).toHaveValue("Joining new");
  await dialog.getByLabel("Player name", { exact: true }).fill("Brand new club player");
  await dialog.getByRole("button", { name: "Send request" }).click();
  await expect(dialog.getByText("Waiting for admin approval")).toBeVisible();
  const prisma = db();
  try {
    expect(await prisma.clubMember.count({ where: { clubId: openClubId, ownerUserId: "account-joining-new" } })).toBe(0);
    expect(await prisma.player.count({ where: { name: "Brand new club player" } })).toBe(0);
    expect(await prisma.clubAccess.count({ where: { clubId: openClubId, userId: "account-joining-new" } })).toBe(0);
  } finally { await prisma.$disconnect(); }
  await dialog.getByRole("button", { name: "Cancel request" }).click();
  await expect(dialog.getByText("Have you played with this club before?")).toBeVisible();
});
