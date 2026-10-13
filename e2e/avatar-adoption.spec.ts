import { PrismaClient } from "@prisma/client";
import { expect, test, type Locator } from "@playwright/test";
import bcrypt from "bcryptjs";
import { e2eBaseURL, e2eDatabaseUrl } from "./env";
import { signIn } from "./helpers";
import { admissionTransaction } from "../src/lib/clubAdmissions";
import { managePlayerInvitation } from "../src/lib/playerInvitations";

// A bundled PNG keeps image loading independent of uploads and external hosts.
const photo = "/spark.png";
const password = "Password123!";

async function fixture(key: string) {
  const db = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl } } });
  const ownerId = `avatar-${key}-owner`;
  const accountId = `avatar-${key}-account`;
  const clubId = `avatar-${key}-club`;
  const playerId = `avatar-${key}-player`;
  const memberId = `avatar-${key}-member`;
  const name = `Avatar Player ${key}`;
  const owner = { email: `${ownerId}@example.invalid`, password };
  const account = { email: `${accountId}@example.invalid`, password };
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    await db.user.createMany({ data: [
      { id: ownerId, name: `Avatar Owner ${key}`, gender: "FEMALE", email: owner.email, passwordHash },
      { id: accountId, name, gender: "MALE", email: account.email, passwordHash, avatarKey: null },
    ] });
    await db.club.create({ data: { id: clubId, name: `Avatar Club ${key}`, createdById: ownerId, allowJoinRequests: true } });
    await db.clubAccess.create({ data: { clubId, userId: ownerId, role: "OWNER" } });
    await db.player.create({ data: { id: playerId, name, gender: "MALE", avatarKey: photo } });
    await db.clubMember.create({ data: { id: memberId, clubId, playerId, elo: 1384 } });
    return { ownerId, accountId, clubId, playerId, memberId, name, owner, account };
  } finally { await db.$disconnect(); }
}

async function assertImage(image: Locator) {
  await expect(image).toHaveAttribute("src", photo);
  await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0)).toBe(true);
}

async function assertPersistedAdoption(f: Awaited<ReturnType<typeof fixture>>) {
  const db = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl } } });
  try {
    expect(await db.user.findUniqueOrThrow({ where: { id: f.accountId }, select: { avatarKey: true } })).toEqual({ avatarKey: photo });
    expect(await db.player.findUniqueOrThrow({ where: { id: f.playerId }, select: { avatarKey: true, ownerUserId: true } })).toEqual({ avatarKey: photo, ownerUserId: null });
    expect(await db.clubMember.findUniqueOrThrow({ where: { clubId_playerId: { clubId: f.clubId, playerId: f.playerId } } })).toMatchObject({ id: f.memberId, elo: 1384, ownerUserId: f.accountId });
  } finally { await db.$disconnect(); }
}

for (const layout of ["desktop", "mobile"] as const) {
  test.describe(`placeholder photo adoption on ${layout}`, () => {
    test.use({ viewport: layout === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, isMobile: layout === "mobile", hasTouch: layout === "mobile" });

    test("approved Open club refreshes the Player, chooser, and account photos without reloading", async ({ page, browser }, testInfo) => {
      const f = await fixture(`approval-${layout}`);
      await signIn(page, f.account);
      await expect(page.getByRole("button", { name: "Account", exact: true }).locator("img")).toHaveCount(0);
      await page.getByRole("button", { name: "Join a club", exact: true }).click();
      const join = page.getByRole("dialog", { name: "Join a club" });
      await join.getByLabel("Invite link or club ID").fill(f.clubId);
      await join.getByRole("button", { name: "Find club", exact: true }).click();
      await join.getByRole("button", { name: "Yes, find my profile", exact: true }).click();
      await join.getByRole("button", { name: new RegExp(f.name) }).click();
      await join.getByRole("button", { name: "Send request", exact: true }).click();
      await expect(join.getByText("Waiting for admin approval")).toBeVisible();
      const pending = await page.request.get("/api/user/me");
      expect((await pending.json()).user.avatarUrl).toBeNull();

      const ownerContext = await browser.newContext({ baseURL: e2eBaseURL });
      try {
        const ownerPage = await ownerContext.newPage();
        await signIn(ownerPage, f.owner);
        await ownerPage.getByRole("button", { name: "Manage club", exact: true }).click();
        await ownerPage.getByRole("tab", { name: /Requests/ }).click();
        const requestCard = ownerPage.locator(".admission-review-card").filter({ hasText: f.name });
        await requestCard.getByRole("button", { name: `Approve ${f.name}`, exact: true }).click();
        await expect(requestCard).toHaveCount(0);
      } finally { await ownerContext.close(); }

      await join.getByRole("button", { name: "Refresh status", exact: true }).click();
      await expect(join.getByRole("button", { name: "Open club", exact: true })).toBeVisible();
      // The account remains stale until Open club explicitly refreshes its client resource.
      await expect(page.getByRole("button", { name: "Account", exact: true }).locator("img")).toHaveCount(0);
      const accountRefresh = page.waitForResponse(response => new URL(response.url()).pathname === "/api/user/me" && response.request().method() === "GET");
      await join.getByRole("button", { name: "Open club", exact: true }).click();
      expect((await accountRefresh).status()).toBe(200);
      await page.getByRole("button", { name: "Profile", exact: true }).click();
      await assertImage(page.getByRole("button", { name: "Account settings", exact: true }).locator("img"));
      await page.getByRole("button", { name: "Account settings", exact: true }).click();
      const settings = page.getByRole("dialog", { name: "Your account" });
      await assertImage(settings.getByRole("button", { name: "Change account photo", exact: true }).locator("img"));
      await settings.getByRole("button", { name: "Close", exact: true }).click();
      await page.getByRole("button", { name: /Switch club, current/ }).click();
      await assertImage(page.getByRole("button", { name: "Account", exact: true }).locator("img"));
      await testInfo.attach(`adopted-chooser-${layout}`, { body: await page.screenshot(), contentType: "image/png" });
      await assertPersistedAdoption(f);
    });

    test("personal invitation mounts the destination with the adopted photo", async ({ page }, testInfo) => {
      const f = await fixture(`invitation-${layout}`);
      const db = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl } } });
      let invitationUrl: string;
      try {
        const issued = await admissionTransaction(db, tx => managePlayerInvitation(tx, { clubId: f.clubId, playerId: f.playerId, userId: f.ownerId, action: "CREATE" }));
        if (!("secret" in issued)) throw new Error("Fixture invitation was not created");
        invitationUrl = `${e2eBaseURL}/player-invites/${issued.invitation!.id}#${issued.secret}`;
      } finally { await db.$disconnect(); }
      await signIn(page, f.account);
      await page.goto(invitationUrl);
      await expect(page.getByRole("button", { name: "Claim my profile", exact: true })).toBeVisible();
      const before = await page.request.get("/api/user/me");
      expect((await before.json()).user.avatarUrl).toBeNull();
      await page.getByRole("button", { name: "Claim my profile", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/club/${f.clubId}\\?tab=profile`));
      await assertImage(page.getByTestId("profile-hero-body").locator("img").first());
      await testInfo.attach(`adopted-invitation-${layout}`, { body: await page.screenshot(), contentType: "image/png" });
      await page.goto("/");
      await page.getByRole("button", { name: /Switch club, current/ }).click();
      await assertImage(page.getByRole("button", { name: "Account", exact: true }).locator("img"));
      await page.getByRole("button", { name: "Account", exact: true }).click();
      await assertImage(page.getByRole("dialog", { name: "Your account" }).getByRole("button", { name: "Change account photo", exact: true }).locator("img"));
      await assertPersistedAdoption(f);
    });
  });
}
