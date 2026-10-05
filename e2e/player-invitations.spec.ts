import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { e2eBaseURL, e2eDatabaseUrl } from "./env";
import { claimRequesterCredentials, signIn, signInAsAdmin } from "./helpers";
import { admissionTransaction } from "../src/lib/clubAdmissions";
import { managePlayerInvitation, INVITATION_TTL_MS } from "../src/lib/playerInvitations";

const adminId = "account-user-admin-e2e";
const requesterId = "account-user-claim-requester-e2e";
async function fixture(key: string, expired = false) {
  const db = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl } } });
  const clubId = `invitation-${key}-club`;
  const playerId = `invitation-${key}-player`;
  const name = `Invited Luqman ${key}`;
  try {
    await db.club.create({ data: { id: clubId, name: `Invitation Club ${key}`, createdById: adminId, allowJoinRequests: false } });
    await db.clubAccess.create({ data: { clubId, userId: adminId, role: "OWNER" } });
    await db.player.create({ data: { id: playerId, name, gender: "MALE" } });
    await db.clubMember.create({ data: { id: `invitation-${key}-member`, clubId, playerId, elo: 1384 } });
    const session = await db.session.create({ data: { code: `INVITATION-${key}`, name: `Preserved History ${key}`, clubId, status: "COMPLETED", endedAt: new Date("2026-09-01") } });
    const court = await db.court.create({ data: { sessionId: session.id, courtNumber: 1 } });
    await db.sessionPlayer.create({ data: { sessionId: session.id, playerId, matchesPlayed: 1 } });
    await db.match.create({ data: { sessionId: session.id, courtId: court.id, status: "COMPLETED", team1Player1Id: playerId, team1Player2Id: "user-host-1-e2e", team2Player1Id: "user-host-2-e2e", team2Player2Id: "user-host-3-e2e", team1Score: 21, team2Score: 17, winnerTeam: 1, completedAt: new Date("2026-09-01") } });
    const created = await admissionTransaction(db, tx => managePlayerInvitation(tx, { clubId, playerId, userId: adminId, action: "CREATE", ...(expired ? { now: new Date(Date.now() - INVITATION_TTL_MS - 1000) } : {}) }));
    if (!("secret" in created)) throw new Error("Fixture invitation was not created");
    return { clubId, playerId, name, id: created.invitation!.id, url: `${e2eBaseURL}/player-invites/${created.invitation!.id}#${created.secret}` };
  } finally { await db.$disconnect(); }
}
async function signinWithoutClearingContinuation(page: Page, credentials = claimRequesterCredentials) {
  await page.getByLabel("Email", { exact: true }).fill(credentials.email);
  await page.getByLabel("Password", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
async function assertClaim(page: Page, invited: Awaited<ReturnType<typeof fixture>>) {
  await page.getByRole("button", { name: "Claim my profile" }).click();
  await expect(page).toHaveURL(new RegExp(`/club/${invited.clubId}\\?tab=profile`));
  await expect(page.getByRole("region", { name: "Player summary" })).toContainText("Matches");
  await expect(page.getByRole("region", { name: "Player summary" })).toContainText("1");
  await page.getByRole("tab", { name: "Matches", exact: true }).click();
  await expect(page.getByText(`Preserved History ${invited.clubId.replace("invitation-", "").replace("-club", "")}`, { exact: true }).filter({ visible: true }).first()).toBeVisible();
  const db = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl } } });
  try {
    expect((await db.player.findUniqueOrThrow({ where: { id: invited.playerId } })).ownerUserId).not.toBeNull();
    expect(await db.clubMember.findUnique({ where: { clubId_playerId: { clubId: invited.clubId, playerId: invited.playerId } } })).toMatchObject({ id: invited.clubId.replace("-club", "-member"), elo: 1384 });
  } finally { await db.$disconnect(); }
}
test("mobile sign-in continuation survives refresh and preserves visible history", async ({ browser }) => {
  const invited = await fixture("mobile-signin");
  const context = await browser.newContext({ baseURL: e2eBaseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148" });
  const page = await context.newPage();
  try {
    await page.goto(invited.url);
    await expect(page.getByRole("heading", { name: invited.name })).toBeVisible();
    expect(new URL(page.url()).hash).toBe("");
    expect(await page.evaluate(secret => Object.values(sessionStorage).some(value => String(value).includes(secret)), new URL(invited.url).hash.slice(1))).toBe(false);
    const cookies = await context.cookies();
    expect(cookies.find(cookie => cookie.name === `player-invite-${invited.id}`)).toMatchObject({ httpOnly: true, sameSite: "Lax" });
    await page.reload();
    await expect(page.getByRole("heading", { name: invited.name })).toBeVisible();
    await page.getByRole("link", { name: "Sign in to claim" }).click();
    await expect(page).toHaveURL(/\/signin\?callbackUrl=/);
    expect(new URL(page.url()).searchParams.get("callbackUrl")).toBe(`/player-invites/${invited.id}`);
    await signinWithoutClearingContinuation(page);
    await expect(page.getByRole("button", { name: "Claim my profile" })).toBeVisible();
    await assertClaim(page, invited);
  } finally { await context.close(); }
});
test("signup returns through signin to the secret-free confirmation page", async ({ page }) => {
  const invited = await fixture("signup");
  await page.goto(invited.url);
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Invited Account");
  await page.getByLabel("Email", { exact: true }).fill("invited-signup@example.invalid");
  await page.getByLabel("Gender for Mixed pairing").selectOption("MALE");
  const passwords = page.locator('input[autocomplete="new-password"]');
  await passwords.nth(0).fill("Password123!"); await passwords.nth(1).fill("Password123!");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/signin\?registered=true/);
  await signinWithoutClearingContinuation(page, { email: "invited-signup@example.invalid", password: "Password123!" });
  await expect(page.getByRole("button", { name: "Claim my profile" })).toBeVisible();
  await expect(page.getByText("Invited Account", { exact: true })).toBeVisible();
  await assertClaim(page, invited);
});
test("an authenticated account must explicitly confirm; switching accounts retains continuation", async ({ page }) => {
  const invited = await fixture("direct");
  await signIn(page, claimRequesterCredentials);
  await page.goto(invited.url);
  await expect(page.getByRole("button", { name: "Claim my profile" })).toBeVisible();
  const db = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl } } });
  try { expect((await db.player.findUniqueOrThrow({ where: { id: invited.playerId } })).ownerUserId).toBeNull(); } finally { await db.$disconnect(); }
  await page.getByRole("button", { name: "Switch account" }).click();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await signinWithoutClearingContinuation(page);
  await expect(page.getByRole("button", { name: "Claim my profile" })).toBeVisible();
  await assertClaim(page, invited);
});
test("lost continuation fails closed and reopening the original link restores it; expired links fail", async ({ page }) => {
  const invited = await fixture("lost");
  await page.goto(invited.url);
  await expect(page.getByRole("heading", { name: invited.name })).toBeVisible();
  await page.context().clearCookies();
  await page.reload();
  await expect(page.locator("main").getByRole("alert")).toContainText(/reopen the original/i);
  await expect(page.getByRole("link", { name: "Sign in to claim" })).toHaveCount(0);
  await page.goto(invited.url);
  await expect(page.getByRole("heading", { name: invited.name })).toBeVisible();
  const expired = await fixture("expired", true);
  await page.goto(expired.url);
  await expect(page.locator("main").getByRole("alert")).toContainText("no longer available");
  expect(new URL(page.url()).hash).toBe("");
});
test("revoked access shows admin review and leaves ownership unassigned", async ({ page }) => {
  const invited = await fixture("revoked");
  const db = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl } } });
  try { await db.clubAccess.create({ data: { clubId: invited.clubId, userId: requesterId, status: "REVOKED", role: "ADMIN" } }); } finally { await db.$disconnect(); }
  await signIn(page, claimRequesterCredentials);
  await page.goto(invited.url);
  await page.getByRole("button", { name: "Claim my profile" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Your club access was revoked");
  const verify = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl } } });
  try { expect((await verify.player.findUniqueOrThrow({ where: { id: invited.playerId } })).ownerUserId).toBeNull(); } finally { await verify.$disconnect(); }
});
test("admin can replace, copy, show QR and revoke; later visits cannot reconstruct secrets", async ({ page }) => {
  const invited = await fixture("admin");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await signInAsAdmin(page);
  await page.getByRole("button", { name: /Invitation Club admin/ }).click();
  await page.getByRole("button", { name: "Manage club" }).click();
  await page.getByRole("button", { name: `View ${invited.name} profile` }).click();
  const profile = page.getByRole("dialog", { name: `${invited.name} profile in Invitation Club admin` });
  await expect(profile.getByRole("region", { name: "Player account connection" })).toContainText("Active invitation");
  await expect(profile.getByRole("button", { name: "Copy link", exact: true })).toHaveCount(0);
  await profile.getByRole("button", { name: "Back to previous page" }).click();
  await page.getByRole("button", { name: `Edit ${invited.name}` }).click();
  await expect(page.getByText("Active invitation", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy link", exact: true })).toHaveCount(0);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Revoke and create replacement" }).click();
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(page.getByRole("button", { name: "Link copied" })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(copied).pathname).toMatch(/^\/player-invites\//);
  expect(new URL(copied).hash.length).toBe(44);
  await page.getByRole("button", { name: "Show QR" }).click();
  await expect(page.getByRole("img", { name: `Invitation QR for ${invited.name}` })).toBeVisible();
  await page.getByRole("button", { name: "Revoke invite" }).click();
  await expect(page.getByRole("button", { name: "Invite player", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Invite player", exact: true }).click();
  await expect(page.getByRole("button", { name: "Copy link", exact: true })).toBeVisible();
});
