import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { e2eBaseURL, e2eDatabaseUrl } from "./env";
import { claimRequesterCredentials, signIn, signInAsAdmin, submitAndApproveVisibleMatch } from "./helpers";
import { admissionTransaction } from "../src/lib/clubAdmissions";
import { managePlayerInvitation, INVITATION_TTL_MS } from "../src/lib/playerInvitations";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";

const adminId = "account-user-admin-e2e";
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
    return { clubId, playerId, name, sessionId: session.id, id: created.invitation!.id, url: `${e2eBaseURL}/player-invites/${created.invitation!.id}#${created.secret}` };
  } finally { await db.$disconnect(); }
}
async function signinWithoutClearingContinuation(page: Page, credentials = claimRequesterCredentials) {
  await page.getByLabel("Email", { exact: true }).fill(credentials.email);
  await page.getByLabel("Password", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
function captureInvitationAuditApiFailures(page: Page, pathPart: string, includeSuccessful = false) {
  page.on("response", async response => {
    const url = new URL(response.url());
    if ((!includeSuccessful && response.status() < 400) || !url.pathname.includes(pathPart)) return;
    const bodyText = await response.text().catch(() => "");
    let summary = "";
    try {
      const body = JSON.parse(bodyText) as { status?: unknown; error?: unknown; code?: unknown };
      summary = JSON.stringify({ status: body.status, error: body.error, code: body.code });
    } catch {
      const title = (bodyText.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ?? [])[1] ?? "";
      summary = `content-type=${response.headers()["content-type"] ?? "unknown"}; title=${title}`;
    }
    console.log(`[e2e-api-response] ${response.request().method()} ${url.pathname} ${response.status()} ${summary}`);
  });
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
  const firstAccountId = "account-player-invitation-switch-from-e2e";
  const firstCredentials = { email: "player-invitation-switch-from@example.invalid", password: "Password123!" };
  const switchAccountId = "account-player-invitation-switch-to-e2e";
  const switchCredentials = { email: "player-invitation-switch-to@example.invalid", password: "Password123!" };
  const db = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl } } });
  try {
    const passwordHash = await bcrypt.hash(switchCredentials.password, 10);
    await db.user.createMany({ data: [
      { id: firstAccountId, name: "First Invitation Switch Account", gender: "FEMALE", email: firstCredentials.email, passwordHash },
      { id: switchAccountId, name: "Second Invitation Switch Account", gender: "FEMALE", email: switchCredentials.email, passwordHash },
    ] });
  } finally { await db.$disconnect(); }
  await signIn(page, firstCredentials);
  await page.goto(invited.url);
  await expect(page.getByRole("button", { name: "Claim my profile" })).toBeVisible();
  const verify = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl } } });
  try { expect((await verify.player.findUniqueOrThrow({ where: { id: invited.playerId } })).ownerUserId).toBeNull(); } finally { await verify.$disconnect(); }
  await page.getByRole("button", { name: "Switch account" }).click();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await signinWithoutClearingContinuation(page, switchCredentials);
  await expect(page.getByRole("button", { name: "Claim my profile" })).toBeVisible();
  await assertClaim(page, invited);
  const ownerDb = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl } } });
  try { expect((await ownerDb.player.findUniqueOrThrow({ where: { id: invited.playerId } })).ownerUserId).toBe(switchAccountId); } finally { await ownerDb.$disconnect(); }
});
test("lost continuation fails closed and reopening the original link restores it; expired links fail", async ({ page }) => {
  const invited = await fixture("lost");
  await page.goto(invited.url);
  await expect(page.getByRole("heading", { name: invited.name })).toBeVisible();
  await page.context().clearCookies();
  await page.reload();
  const unavailable = page.getByRole("region", { name: "Claim invitation unavailable" });
  await expect(unavailable).toContainText(/reopen the original/i);
  await expect(unavailable.getByRole("heading", { name: invited.name })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Claim my profile" })).toHaveCount(0);
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
  const accountId = "account-revoked-review-e2e";
  const credentials = { email: "revoked-review-e2e@example.invalid", password: "Password123!" };
  const db = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl } } });
  try {
    await db.user.create({ data: { id: accountId, name: "Revoked Review Account", gender: "FEMALE", email: credentials.email, passwordHash: await bcrypt.hash(credentials.password, 10) } });
    await db.clubAccess.create({ data: { clubId: invited.clubId, userId: accountId, status: "REVOKED", role: "ADMIN" } });
  } finally { await db.$disconnect(); }
  await signIn(page, credentials);
  await page.goto(invited.url);
  await page.getByRole("button", { name: "Claim my profile" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Your club access was revoked");
  const verify = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl } } });
  try { expect((await verify.player.findUniqueOrThrow({ where: { id: invited.playerId } })).ownerUserId).toBeNull(); } finally { await verify.$disconnect(); }
});
test("admin can replace, copy, show QR and revoke; later visits cannot reconstruct secrets", async ({ page }) => {
  const invited = await fixture("admin");
  captureInvitationAuditApiFailures(page, "/members/");
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

test("normal admission, removal, and admin-approved placeholder recovery preserve history and retire the duplicate", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const invited = await fixture("recovery");
  const accountId = "account-recovery-e2e";
  const credentials = { email: "recovery-e2e@example.invalid", password: "Password123!" };
  const db = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl } } });
  const pageErrors: string[] = [];
  captureInvitationAuditApiFailures(page, "/join-requests/");
  page.on("pageerror", error => pageErrors.push(error.message));
  await db.user.create({ data: { id: accountId, name: "Recovery Account", gender: "FEMALE", email: credentials.email, passwordHash: await bcrypt.hash(credentials.password, 10) } });
  await db.club.update({ where: { id: invited.clubId }, data: { allowJoinRequests: true } });
  const teammates = [1, 2, 3].map(index => ({
    id: `invitation-recovery-teammate-${index}`,
    name: `Recovery Teammate ${index}`,
  }));
  for (const teammate of teammates) {
    await db.player.create({ data: { id: teammate.id, name: teammate.name, gender: "MALE" } });
    await db.clubMember.create({ data: { clubId: invited.clubId, playerId: teammate.id, elo: 1384 } });
  }
  const original = await db.player.findUniqueOrThrow({ where: { id: invited.playerId } });
  expect(original.isActive).toBe(true);
  const accountSnapshot = async () => {
    const account = await db.user.findUniqueOrThrow({ where: { id: accountId }, select: { id: true, email: true, name: true, passwordHash: true } });
    return {
      id: account.id,
      email: account.email,
      name: account.name,
      passwordHashFingerprint: createHash("sha256").update(account.passwordHash).digest("hex"),
    };
  };
  const originalMember = await db.clubMember.findUniqueOrThrow({ where: { clubId_playerId: { clubId: invited.clubId, playerId: invited.playerId } } });
  const historySnapshot = async () => ({
    session: await db.session.findUniqueOrThrow({ where: { id: invited.sessionId } }),
    courts: await db.court.findMany({ where: { sessionId: invited.sessionId }, orderBy: { courtNumber: "asc" } }),
    sessionPlayers: await db.sessionPlayer.findMany({ where: { sessionId: invited.sessionId }, orderBy: { playerId: "asc" } }),
    matches: await db.match.findMany({ where: { sessionId: invited.sessionId }, orderBy: { id: "asc" } }),
    adjustments: await db.matchEloAdjustment.findMany({ where: { match: { sessionId: invited.sessionId } }, orderBy: { id: "asc" } }),
  });
  const history = await historySnapshot();
  const adminContext = await browser.newContext({ baseURL: e2eBaseURL });
  const adminPage = await adminContext.newPage();
  captureInvitationAuditApiFailures(adminPage, "/join-requests/");
  captureInvitationAuditApiFailures(adminPage, "/api/matches/", true);
  adminPage.on("pageerror", error => pageErrors.push(error.message));
  try {
    await signIn(page, credentials);
    await page.goto(`/?join=${invited.clubId}`);
    const join = page.getByRole("dialog", { name: "Join a club" });
    await join.getByRole("button", { name: "I’m new to this club" }).click();
    await join.getByRole("button", { name: "Send request" }).click();
    await expect(join.getByText("Request sent")).toBeVisible();
    const pendingAdmission = await db.clubAdmissionRequest.findFirstOrThrow({ where: { clubId: invited.clubId, requesterUserId: accountId, status: "PENDING" } });
    expect(pendingAdmission).toMatchObject({ kind: "NEW_PLAYER", requestedPlayerId: null });
    expect(await db.player.count({ where: { ownerUserId: accountId } })).toBe(0);
    expect(await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: invited.clubId, userId: accountId } } })).toBeNull();
    await signInAsAdmin(adminPage);
    await adminPage.getByRole("button", { name: /Invitation Club recovery/ }).click();
    await adminPage.getByRole("button", { name: "Manage club" }).click();
    await adminPage.getByRole("tab", { name: /Requests/ }).click();
    const newRequest = adminPage.locator(".admission-review-card").filter({ hasText: credentials.email });
    await newRequest.getByRole("button", { name: "Approve as new Player" }).click();
    await expect(newRequest).toHaveCount(0);
    const duplicate = await db.clubMember.findFirstOrThrow({ where: { clubId: invited.clubId, ownerUserId: accountId } });
    const expectedOwnedPlayerIds = [invited.playerId, duplicate.playerId].sort();
    const ownedPlayerIds = async () => (await db.player.findMany({ where: { ownerUserId: accountId }, select: { id: true }, orderBy: { id: "asc" } })).map(player => player.id);
    const accountBeforeRecovery = await accountSnapshot();
    await adminPage.getByRole("tab", { name: /^Players/ }).click();
    await adminPage.getByRole("button", { name: "Edit Recovery Account", exact: true }).click();
    await adminPage.getByRole("button", { name: "Remove player", exact: true }).click();
    await adminPage.getByRole("button", { name: "Remove player", exact: true }).click();
    await expect(adminPage.getByRole("button", { name: "Edit Recovery Account", exact: true })).toHaveCount(0);
    const replacement = await admissionTransaction(db, tx => managePlayerInvitation(tx, { clubId: invited.clubId, playerId: invited.playerId, userId: adminId, action: "REPLACE", invitationId: invited.id }));
    if (!("secret" in replacement)) throw new Error("Replacement fixture missing secret");
    await db.club.update({ where: { id: invited.clubId }, data: { allowJoinRequests: false } });
    await page.goto(`${e2eBaseURL}/player-invites/${replacement.invitation!.id}#${replacement.secret}`);
    await page.getByRole("button", { name: "Claim my profile" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("Your club access was revoked");
    await page.getByRole("button", { name: "Request admin review" }).click();
    await expect(page.getByRole("region", { name: "Recovery request status" })).toContainText("pending");
    await adminPage.getByRole("tab", { name: /Requests/ }).click();
    const recoveryCard = adminPage.locator(".admission-review-card").filter({ hasText: credentials.email });
    await expect(recoveryCard).toContainText("Claim candidate: Invited Luqman recovery");
    await expect(recoveryCard).toContainText("1384 rating · 1 matches");
    await expect(recoveryCard.getByRole("button", { name: "Approve recovery" })).toBeDisabled();
    await recoveryCard.getByLabel("Restore club access as MEMBER").check();
    await recoveryCard.getByLabel("Retire empty duplicate Recovery Account").check();
    await recoveryCard.getByLabel("Retirement reason (required for approval)").fill("Accidental empty profile from the normal invitation");
    await recoveryCard.getByRole("button", { name: "Approve recovery" }).click();
    await expect(recoveryCard).toHaveCount(0);
    await page.getByRole("button", { name: "Refresh request status" }).click();
    await expect(page.getByRole("region", { name: "Recovery request status" })).toContainText("approved");
    await page.getByRole("link", { name: "Continue to club" }).click();
    await expect(page).toHaveURL(new RegExp(`/club/${invited.clubId}\\?tab=profile`));
    await expect(page.getByRole("region", { name: "Player summary" })).toContainText("1");
    await expect(page.getByTestId("profile-hero-title").filter({ visible: true }).first()).toHaveText(invited.name);
    await expect(page.getByTestId("profile-rating-snapshot").filter({ visible: true }).first()).toContainText("1384");

    await page.getByRole("button", { name: /^Leaderboard\b/ }).filter({ visible: true }).first().click();
    await expect(page.getByRole("link", { name: `Open ${invited.name}'s profile` })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Recovery Account's profile" })).toHaveCount(0);

    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Account settings" })).toBeVisible();
    await expect(page.getByLabel("Account name")).toHaveValue("Recovery Account");
    const tutorialResponse = await page.request.post("/api/tutorial-playground");
    expect(tutorialResponse.ok()).toBe(true);
    const tutorial = (await tutorialResponse.json()).playground as { clubId: string; clubName: string; sessionCode: string | null };
    expect(tutorial.clubName).toBe("Tutorial playground");
    expect(tutorial.sessionCode).toBeTruthy();
    await page.goto(`/club/${tutorial.clubId}`);
    await expect(page.getByRole("heading", { name: "Tutorial playground", exact: true })).toBeVisible();
    const guidedPractice = page.getByRole("link", { name: "Open guided practice" });
    await expect(guidedPractice).toBeVisible();
    await guidedPractice.click();
    await expect(page).toHaveURL(new RegExp(`/session/${tutorial.sessionCode}$`));
    await expect(page.getByText("Practice rally", { exact: true }).first()).toBeVisible();
    expect(await ownedPlayerIds()).toEqual(expectedOwnedPlayerIds);
    expect(await accountSnapshot()).toEqual(accountBeforeRecovery);

    await page.goto(`/club/${invited.clubId}?tab=profile`);
    await expect(page.getByTestId("profile-hero-title").filter({ visible: true }).first()).toHaveText(invited.name);
    await expect(page.getByTestId("profile-rating-snapshot").filter({ visible: true }).first()).toContainText("1384");
    const owned = await db.player.findUniqueOrThrow({ where: { id: invited.playerId } });
    expect(owned).toEqual({ ...original, ownerUserId: accountId });
    expect(await db.clubMember.findUnique({ where: { id: originalMember.id } })).toEqual({ ...originalMember, ownerUserId: accountId });
    expect(await historySnapshot()).toEqual(history);
    expect(await db.player.findUnique({ where: { id: duplicate.playerId } })).toMatchObject({ isActive: false, ownerUserId: accountId });
    expect(await db.clubMember.findUnique({ where: { id: duplicate.id } })).toMatchObject({ retiredByAdmissionEventId: expect.any(String), archivedAt: expect.any(Date) });
    expect(await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: invited.clubId, userId: accountId } } })).toMatchObject({ status: "ACTIVE", role: "MEMBER" });
    const me = await page.request.get("/api/user/me");
    expect((await me.json()).players.map((p: { id: string }) => p.id)).toEqual([invited.playerId]);

    const sessionName = "Recovery identity first future tournament";
    await adminPage.goto(`/club/${invited.clubId}?tab=host`);
    await expect(adminPage.getByRole("heading", { name: `Invitation Club recovery` })).toBeVisible();
    const hostPanel = adminPage.locator("section.app-panel").filter({ hasText: "New tournament" }).filter({ visible: true });
    await expect(hostPanel).toBeVisible();
    await hostPanel.getByLabel("Name", { exact: true }).fill(sessionName);
    await hostPanel.getByRole("button", { name: "Add players" }).click();
    const playersModal = adminPage.getByRole("dialog").filter({ has: adminPage.getByRole("heading", { name: "Add players" }) });
    await expect(playersModal).toBeVisible();
    await expect(playersModal.getByRole("button", { name: /Recovery Account/ })).toHaveCount(0);
    for (const playerName of [invited.name, ...teammates.map(teammate => teammate.name)]) {
      const playerButton = playersModal.getByRole("button").filter({ hasText: playerName });
      await expect(playerButton).toBeVisible();
      await playerButton.click();
    }
    await playersModal.getByRole("button", { name: "Done" }).click();
    await hostPanel.getByRole("button", { name: "Create Tournament" }).click();
    await expect(adminPage).toHaveURL(/\/session\/.+/);
    await expect(adminPage.getByRole("button", { name: "Start Tournament" })).toBeVisible();
    await adminPage.getByRole("button", { name: "Start Tournament" }).click();
    const sessionCode = adminPage.url().split("/").pop();
    if (!sessionCode) throw new Error("Future tournament did not produce a session code");
    const tournament = await db.session.findUniqueOrThrow({ where: { code: sessionCode } });
    const enrolled = await db.sessionPlayer.findMany({ where: { sessionId: tournament.id } });
    expect(enrolled.map(player => player.playerId)).toContain(invited.playerId);
    expect(enrolled.map(player => player.playerId)).not.toContain(duplicate.playerId);
    const preMatchMember = await db.clubMember.findUniqueOrThrow({ where: { id: originalMember.id } });
    expect(preMatchMember.elo).toBe(originalMember.elo);

    await adminPage.getByRole("button", { name: "Create Match" }).click();
    await expect.poll(async () => db.match.count({ where: { sessionId: tournament.id, status: "IN_PROGRESS" } })).toBe(1);
    await submitAndApproveVisibleMatch(adminPage, { team1Score: 21, team2Score: 18 });
    await expect.poll(async () => (await db.match.findFirst({ where: { sessionId: tournament.id }, select: { status: true } }))?.status, { timeout: 15_000 }).toBe("COMPLETED");
    const futureMatch = await db.match.findFirstOrThrow({ where: { sessionId: tournament.id, status: "COMPLETED" } });
    expect([futureMatch.team1Player1Id, futureMatch.team1Player2Id, futureMatch.team2Player1Id, futureMatch.team2Player2Id]).toContain(invited.playerId);
    expect(futureMatch).toMatchObject({ team1Score: 21, team2Score: 18, winnerTeam: 1 });
    expect(await db.player.findUniqueOrThrow({ where: { id: invited.playerId } })).toMatchObject({
      id: invited.playerId,
      name: invited.name,
      ownerUserId: accountId,
      isActive: true,
    });
    const updatedMember = await db.clubMember.findUniqueOrThrow({ where: { id: originalMember.id } });
    const adjustment = await db.matchEloAdjustment.findUniqueOrThrow({ where: { matchId_clubId_playerId: { matchId: futureMatch.id, clubId: invited.clubId, playerId: invited.playerId } } });
    expect(adjustment.beforeElo).toBe(preMatchMember.elo);
    expect(adjustment.afterElo).toBe(updatedMember.elo);
    expect(adjustment.delta).toBe(updatedMember.elo - preMatchMember.elo);
    expect(adjustment.delta).not.toBe(0);
    expect(await historySnapshot()).toEqual(history);
    await expect.poll(async () => (await db.sessionPlayer.findUniqueOrThrow({ where: { sessionId_playerId: { sessionId: tournament.id, playerId: invited.playerId } } })).matchesPlayed).toBe(1);
    expect(await ownedPlayerIds()).toEqual(expectedOwnedPlayerIds);
    expect(await accountSnapshot()).toEqual(accountBeforeRecovery);

    await page.goto(`/club/${invited.clubId}?tab=leaderboard`);
    await expect(page.getByRole("link", { name: `Open ${invited.name}'s profile` })).toContainText(String(updatedMember.elo));
    await expect(page.getByRole("link", { name: "Open Recovery Account's profile" })).toHaveCount(0);
    await page.goto(`/club/${invited.clubId}/?tab=tournaments`);
    const futureTournamentCard = page.getByRole("link").filter({ hasText: sessionName }).filter({ visible: true }).first();
    await expect(futureTournamentCard).toBeVisible();
    await expect(futureTournamentCard).toHaveAttribute("href", `/session/${sessionCode}`);
    await page.goto(`/session/${sessionCode}`);
    await expect(page.getByRole("heading", { name: sessionName, exact: true }).filter({ visible: true }).first()).toBeVisible();
    const authenticatedSessionResponse = await page.request.get(`/api/sessions/${sessionCode}`);
    expect(authenticatedSessionResponse.ok()).toBe(true);
    const authenticatedSession = await authenticatedSessionResponse.json() as { viewerUserId: string; viewerPlayerId: string | null; players: Array<{ playerId: string }> };
    expect(authenticatedSession.viewerUserId).toBe(accountId);
    expect(authenticatedSession.viewerPlayerId).toBe(invited.playerId);
    expect(authenticatedSession.players.map(player => player.playerId)).toContain(invited.playerId);
    expect(pageErrors).toEqual([]);
  } finally { await db.$disconnect(); await adminContext.close().catch(() => {}); }
});

test("normal new-player admission can be corrected to the exact original Player and keeps future play on that ID", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const invited = await fixture("authorized-correction");
  const accountId = "account-authorized-correction-e2e";
  const credentials = { email: "authorized-correction-e2e@example.invalid", password: "Password123!" };
  const db = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl } } });
  const pageErrors: string[] = [];
  const apiResults: Array<{ path: string; status: number }> = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("response", response => {
    const url = new URL(response.url());
    if (url.pathname.endsWith("/correction-invitations") || url.pathname.endsWith("/confirm-correction")) {
      apiResults.push({ path: url.pathname, status: response.status() });
    }
  });
  await db.user.create({ data: { id: accountId, name: "Correction Account", gender: "FEMALE", email: credentials.email, passwordHash: await bcrypt.hash(credentials.password, 10) } });
  await db.club.update({ where: { id: invited.clubId }, data: { allowJoinRequests: true } });
  const teammates = [1, 2, 3].map(index => ({ id: `invitation-authorized-correction-teammate-${index}`, name: `Correction Teammate ${index}` }));
  for (const teammate of teammates) {
    await db.player.create({ data: { id: teammate.id, name: teammate.name, gender: "MALE" } });
    await db.clubMember.create({ data: { clubId: invited.clubId, playerId: teammate.id, elo: 1384 } });
  }
  const original = await db.player.findUniqueOrThrow({ where: { id: invited.playerId } });
  const originalMember = await db.clubMember.findUniqueOrThrow({ where: { clubId_playerId: { clubId: invited.clubId, playerId: invited.playerId } } });
  const accountSnapshot = async () => {
    const account = await db.user.findUniqueOrThrow({ where: { id: accountId }, select: { id: true, email: true, name: true, passwordHash: true } });
    return { id: account.id, email: account.email, name: account.name, passwordHashFingerprint: createHash("sha256").update(account.passwordHash).digest("hex") };
  };
  const historySnapshot = async () => ({
    session: await db.session.findUniqueOrThrow({ where: { id: invited.sessionId } }),
    courts: await db.court.findMany({ where: { sessionId: invited.sessionId }, orderBy: { courtNumber: "asc" } }),
    sessionPlayers: await db.sessionPlayer.findMany({ where: { sessionId: invited.sessionId }, orderBy: { playerId: "asc" } }),
    matches: await db.match.findMany({ where: { sessionId: invited.sessionId }, orderBy: { id: "asc" } }),
    adjustments: await db.matchEloAdjustment.findMany({ where: { match: { sessionId: invited.sessionId } }, orderBy: { id: "asc" } }),
  });
  const accountBefore = await accountSnapshot();
  const originalHistory = await historySnapshot();
  const adminContext = await browser.newContext({ baseURL: e2eBaseURL });
  const adminPage = await adminContext.newPage();
  adminPage.on("response", response => {
    const url = new URL(response.url());
    if (url.pathname.endsWith("/correction-invitations") || url.pathname.endsWith("/confirm-correction")) {
      apiResults.push({ path: url.pathname, status: response.status() });
    }
  });
  await adminContext.grantPermissions(["clipboard-read", "clipboard-write"]);
  adminPage.on("pageerror", error => pageErrors.push(error.message));
  try {
    // This intentionally follows the ordinary join path first. The duplicate is
    // created only after the administrator approves the user's NEW_PLAYER request.
    await signIn(page, credentials);
    await page.goto(`/?join=${invited.clubId}`);
    const join = page.getByRole("dialog", { name: "Join a club" });
    await join.getByRole("button", { name: "I’m new to this club" }).click();
    await join.getByRole("button", { name: "Send request" }).click();
    await expect(join.getByText("Request sent")).toBeVisible();
    const pendingAdmission = await db.clubAdmissionRequest.findFirstOrThrow({ where: { clubId: invited.clubId, requesterUserId: accountId, status: "PENDING" } });
    expect(pendingAdmission).toMatchObject({ kind: "NEW_PLAYER", requestedPlayerId: null });
    expect(await db.player.count({ where: { ownerUserId: accountId } })).toBe(0);
    expect(await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: invited.clubId, userId: accountId } } })).toBeNull();

    await signInAsAdmin(adminPage);
    await adminPage.getByRole("button", { name: /Invitation Club authorized-correction/ }).click();
    await adminPage.getByRole("button", { name: "Manage club" }).click();
    await adminPage.getByRole("tab", { name: /Requests/ }).click();
    const newRequest = adminPage.locator(".admission-review-card").filter({ hasText: credentials.email });
    await newRequest.getByRole("button", { name: "Approve as new Player" }).click();
    await expect(newRequest).toHaveCount(0);
    const duplicate = await db.clubMember.findFirstOrThrow({ where: { clubId: invited.clubId, ownerUserId: accountId } });
    expect(duplicate.playerId).not.toBe(invited.playerId);
    const expectedOwnedIds = [invited.playerId, duplicate.playerId].sort();
    const ownedIds = async () => (await db.player.findMany({ where: { ownerUserId: accountId }, select: { id: true }, orderBy: { id: "asc" } })).map(player => player.id);
    expect(await ownedIds()).toEqual([duplicate.playerId]);

    await adminPage.getByRole("tab", { name: /^Players/ }).click();
    await adminPage.getByRole("button", { name: "Edit Correction Account", exact: true }).click();
    await adminPage.getByRole("button", { name: "Remove player", exact: true }).click();
    await adminPage.getByRole("button", { name: "Remove player", exact: true }).click();
    await expect(adminPage.getByRole("button", { name: "Edit Correction Account", exact: true })).toHaveCount(0);
    const removedSource = await db.player.findUniqueOrThrow({ where: { id: duplicate.playerId } });
    const removedSourceMember = await db.clubMember.findUniqueOrThrow({ where: { id: duplicate.id } });
    expect(removedSource).toMatchObject({ ownerUserId: accountId, isActive: true });
    expect(removedSourceMember.archivedAt).toBeInstanceOf(Date);
    expect(await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: invited.clubId, userId: accountId } } })).toMatchObject({ status: "REVOKED" });

    // The admin chooses the original placeholder and the exact account-owned
    // source Player; the active old CLAIM link is replaced with explicit review.
    await adminPage.getByRole("button", { name: `Edit ${invited.name}`, exact: true }).click();
    const originalEditor = adminPage.getByRole("dialog");
    await originalEditor.getByRole("button", { name: "Correct existing account connection" }).click();
    await originalEditor.getByLabel("Find a relevant Account").fill("Correction Account");
    await originalEditor.getByRole("button", { name: "Search Accounts" }).click();
    const sourceOption = originalEditor.locator("label")
      .filter({ hasText: `Account ID ${accountId}` })
      .filter({ hasText: duplicate.playerId });
    await expect(sourceOption.getByRole("radio")).toBeEnabled();
    await sourceOption.getByRole("radio").check();
    await originalEditor.getByLabel("Correction reason").fill("Correct the accidentally approved second profile.");
    await originalEditor.getByLabel(/I explicitly authorize retiring source Player/).check();
    await originalEditor.getByLabel(/I explicitly authorize restoring revoked club access as MEMBER/).check();
    await originalEditor.getByLabel(/Replace active CLAIM invitation ID/).check();
    await originalEditor.getByLabel(/I reviewed the exact Account, source and original Player IDs/).check();
    const issueResponse = adminPage.waitForResponse(response => new URL(response.url()).pathname.endsWith("/correction-invitations") && response.request().method() === "POST");
    await originalEditor.getByRole("button", { name: "Create correction invitation" }).click();
    expect((await issueResponse).status()).toBe(200);
    const secureLink = originalEditor.getByRole("status", { name: "Secure invitation ready" });
    await expect(secureLink).toBeVisible();
    await secureLink.getByRole("button", { name: "Copy secure link" }).click();
    await expect(secureLink.getByRole("button", { name: "Link copied" })).toBeVisible();
    const correctionUrl = await adminPage.evaluate(() => navigator.clipboard.readText());
    const correctionLink = new URL(correctionUrl);
    expect(correctionLink.pathname).toMatch(/^\/player-invites\//);
    expect(correctionLink.hash).toMatch(/^#[A-Za-z0-9_-]{43}$/);
    const correctionInvitationId = correctionLink.pathname.split("/").pop()!;
    const issued = await db.playerInvitation.findUniqueOrThrow({ where: { id: correctionInvitationId } });
    expect(issued).toMatchObject({ purpose: "CORRECTION", playerId: invited.playerId, targetAccountUserId: accountId, sourcePlayerId: duplicate.playerId, sourceMemberId: duplicate.id, retireSourcePlayerId: duplicate.playerId, authorizedAccessAction: "RESTORE_MEMBER" });
    expect(await db.playerInvitation.findUnique({ where: { id: invited.id } })).toMatchObject({ status: "REVOKED", purpose: "CLAIM" });
    expect((await db.player.findUniqueOrThrow({ where: { id: invited.playerId } })).ownerUserId).toBeNull();

    await page.goto(correctionUrl);
    await expect(page.getByRole("heading", { name: "Approved Player correction", exact: true })).toBeVisible();
    const review = page.getByRole("region", { name: "Authorized identity change review" });
    await expect(review).toContainText(`ID ${accountId}`);
    await expect(review).toContainText(`${invited.name} · ID ${invited.playerId}`);
    await expect(review).toContainText(`Correction Account · ID ${duplicate.playerId}`);
    const confirmResponse = page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/confirm-correction") && response.request().method() === "POST");
    await review.getByRole("button", { name: "Confirm Player correction" }).click();
    expect((await confirmResponse).status()).toBe(200);
    const receipt = page.getByRole("region", { name: "Completed identity action" });
    await expect(receipt).toContainText("Confirmed by Account");
    await expect(receipt).toContainText("Authorized by Admin");
    await expect(receipt).toContainText(`Source Player ${duplicate.playerId} was retired`);
    await expect(receipt).toContainText("Revoked club access was restored as MEMBER");
    const execution = await db.clubAdmissionRequest.findFirstOrThrow({ where: { originInvitationId: correctionInvitationId }, include: { events: true } });
    expect(execution).toMatchObject({ status: "APPROVED", requesterUserId: accountId, requestedPlayerId: invited.playerId, approvedPlayerId: invited.playerId, reviewedByUserId: adminId });
    expect(execution.events.map(event => event.action)).toContain("EXECUTE_AUTHORIZED_CORRECTION");

    await receipt.getByRole("link", { name: "Continue to club" }).click();
    await expect(page).toHaveURL(new RegExp(`/club/${invited.clubId}\\?tab=profile`));
    await expect(page.getByTestId("profile-hero-title").filter({ visible: true }).first()).toHaveText(invited.name);
    await expect(page.getByTestId("profile-rating-snapshot").filter({ visible: true }).first()).toContainText(String(originalMember.elo));
    expect(await ownedIds()).toEqual(expectedOwnedIds);
    expect(await accountSnapshot()).toEqual(accountBefore);
    expect(await historySnapshot()).toEqual(originalHistory);
    expect(await db.player.findUniqueOrThrow({ where: { id: invited.playerId } })).toEqual({ ...original, ownerUserId: accountId });
    expect(await db.clubMember.findUniqueOrThrow({ where: { id: originalMember.id } })).toEqual({ ...originalMember, ownerUserId: accountId });
    expect(await db.player.findUniqueOrThrow({ where: { id: duplicate.playerId } })).toMatchObject({ id: duplicate.playerId, ownerUserId: accountId, isActive: false });
    expect(await db.clubMember.findUniqueOrThrow({ where: { id: duplicate.id } })).toMatchObject({ id: duplicate.id, archivedAt: expect.any(Date), retiredByAdmissionEventId: expect.any(String) });
    expect(await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: invited.clubId, userId: accountId } } })).toMatchObject({ status: "ACTIVE", role: "MEMBER" });
    const me = await page.request.get("/api/user/me");
    expect((await me.json()).players.map((player: { id: string }) => player.id)).toEqual([invited.playerId]);

    const sessionName = "Authorized correction uses permanent Player identity";
    await adminPage.goto(`/club/${invited.clubId}?tab=host`);
    const hostPanel = adminPage.locator("section.app-panel").filter({ hasText: "New tournament" }).filter({ visible: true });
    await expect(hostPanel).toBeVisible();
    await hostPanel.getByLabel("Name", { exact: true }).fill(sessionName);
    await hostPanel.getByRole("button", { name: "Add players" }).click();
    const playersModal = adminPage.getByRole("dialog").filter({ has: adminPage.getByRole("heading", { name: "Add players" }) });
    await expect(playersModal).toBeVisible();
    await expect(playersModal.getByRole("button", { name: /Correction Account/ })).toHaveCount(0);
    for (const playerName of [invited.name, ...teammates.map(teammate => teammate.name)]) {
      const playerButton = playersModal.getByRole("button").filter({ hasText: playerName });
      await expect(playerButton).toBeVisible();
      await playerButton.click();
    }
    await playersModal.getByRole("button", { name: "Done" }).click();
    await hostPanel.getByRole("button", { name: "Create Tournament" }).click();
    await expect(adminPage).toHaveURL(/\/session\/.+/);
    await adminPage.getByRole("button", { name: "Start Tournament" }).click();
    const sessionCode = adminPage.url().split("/").pop();
    if (!sessionCode) throw new Error("Future tournament did not produce a session code");
    const tournament = await db.session.findUniqueOrThrow({ where: { code: sessionCode } });
    const enrolled = await db.sessionPlayer.findMany({ where: { sessionId: tournament.id } });
    expect(enrolled.map(player => player.playerId)).toContain(invited.playerId);
    expect(enrolled.map(player => player.playerId)).not.toContain(duplicate.playerId);
    const preMatchMember = await db.clubMember.findUniqueOrThrow({ where: { id: originalMember.id } });
    expect(preMatchMember.elo).toBe(originalMember.elo);
    await adminPage.getByRole("button", { name: "Create Match" }).click();
    await expect.poll(async () => db.match.count({ where: { sessionId: tournament.id, status: "IN_PROGRESS" } })).toBe(1);
    await submitAndApproveVisibleMatch(adminPage, { team1Score: 21, team2Score: 18 });
    await expect.poll(async () => (await db.match.findFirst({ where: { sessionId: tournament.id }, select: { status: true } }))?.status, { timeout: 15_000 }).toBe("COMPLETED");
    const futureMatch = await db.match.findFirstOrThrow({ where: { sessionId: tournament.id, status: "COMPLETED" } });
    expect([futureMatch.team1Player1Id, futureMatch.team1Player2Id, futureMatch.team2Player1Id, futureMatch.team2Player2Id]).toContain(invited.playerId);
    expect([futureMatch.team1Player1Id, futureMatch.team1Player2Id, futureMatch.team2Player1Id, futureMatch.team2Player2Id]).not.toContain(duplicate.playerId);
    expect(futureMatch).toMatchObject({ team1Score: 21, team2Score: 18, winnerTeam: 1 });
    const updatedMember = await db.clubMember.findUniqueOrThrow({ where: { id: originalMember.id } });
    const adjustment = await db.matchEloAdjustment.findUniqueOrThrow({ where: { matchId_clubId_playerId: { matchId: futureMatch.id, clubId: invited.clubId, playerId: invited.playerId } } });
    expect(adjustment.beforeElo).toBe(preMatchMember.elo);
    expect(adjustment.afterElo).toBe(updatedMember.elo);
    expect(adjustment.delta).toBe(updatedMember.elo - preMatchMember.elo);
    expect(adjustment.delta).not.toBe(0);
    expect(await historySnapshot()).toEqual(originalHistory);
    expect(await ownedIds()).toEqual(expectedOwnedIds);
    expect(await accountSnapshot()).toEqual(accountBefore);
    const sessionResponse = await page.request.get(`/api/sessions/${sessionCode}`);
    expect(sessionResponse.ok()).toBe(true);
    const sessionView = await sessionResponse.json() as { viewerUserId: string; viewerPlayerId: string | null; players: Array<{ playerId: string }> };
    expect(sessionView).toMatchObject({ viewerUserId: accountId, viewerPlayerId: invited.playerId });
    expect(sessionView.players.map(player => player.playerId)).toContain(invited.playerId);
    expect(apiResults).toEqual(expect.arrayContaining([
      { path: `/api/clubs/${invited.clubId}/players/${invited.playerId}/correction-invitations`, status: 200 },
      { path: `/api/player-invites/${correctionInvitationId}/confirm-correction`, status: 200 },
    ]));
    expect(pageErrors).toEqual([]);
  } finally { await db.$disconnect(); await adminContext.close().catch(() => {}); }
});

test("replaced invitations retain readable recovery status and a fresh link creates one new pending request", async ({ page }) => {
  const invited = await fixture("recovery-replacement");
  const accountId = "account-recovery-replacement-e2e";
  const credentials = { email: "recovery-replacement-e2e@example.invalid", password: "Password123!" };
  const db = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl } } });
  try {
    await db.user.create({ data: { id: accountId, name: "Recovery Replacement Account", gender: "FEMALE", email: credentials.email, passwordHash: await bcrypt.hash(credentials.password, 10) } });
    await db.clubAccess.create({ data: { clubId: invited.clubId, userId: accountId, status: "REVOKED" } });
    await signIn(page, credentials);
    await page.goto(invited.url);
    await page.getByRole("button", { name: "Claim my profile" }).click();
    await page.getByRole("button", { name: "Request admin review" }).click();
    await expect(page.getByRole("region", { name: "Recovery request status" })).toContainText("pending");
    const replacement = await admissionTransaction(db, tx => managePlayerInvitation(tx, { clubId: invited.clubId, playerId: invited.playerId, userId: adminId, action: "REPLACE", invitationId: invited.id }));
    await page.reload();
    await expect(page.getByRole("region", { name: "Recovery request status" })).toContainText("original invitation is replaced");
    if (!("secret" in replacement)) throw new Error("Replacement fixture missing secret");
    await page.goto(`${e2eBaseURL}/player-invites/${replacement.invitation!.id}#${replacement.secret}`);
    await page.getByRole("button", { name: "Claim my profile" }).click();
    await page.getByRole("button", { name: "Request admin review" }).click();
    await expect(page.getByRole("region", { name: "Recovery request status" })).toContainText("pending");
    const requests = await db.clubAdmissionRequest.findMany({ where: { clubId: invited.clubId, requesterUserId: accountId } });
    expect(requests.filter(r => r.status === "PENDING")).toHaveLength(1);
    expect(requests.filter(r => r.status === "CANCELLED")).toHaveLength(1);
  } finally { await db.$disconnect(); }
});

test("admin restores revoked access for the exact owned Player without changing identity or history", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const invited = await fixture("access-restore");
  const accountId = "account-access-restore-e2e";
  const credentials = { email: "access-restore-e2e@example.invalid", password: "Password123!" };
  const db = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl } } });
  const accountPasswordHash = await bcrypt.hash(credentials.password, 10);
  await db.user.create({ data: { id: accountId, name: "Access Restore Account", gender: "FEMALE", email: credentials.email, passwordHash: accountPasswordHash } });

  const adminContext = await browser.newContext({ baseURL: e2eBaseURL });
  const adminPage = await adminContext.newPage();
  await adminContext.grantPermissions(["clipboard-read", "clipboard-write"]);
  const apiResults: Array<{ path: string; status: number }> = [];
  const pageErrors: string[] = [];
  for (const observedPage of [page, adminPage]) {
    observedPage.on("pageerror", error => pageErrors.push(error.message));
    observedPage.on("response", response => {
      const url = new URL(response.url());
      if (url.pathname.endsWith("/access-restore-invitations") || url.pathname.endsWith("/confirm-access-restore")) {
        apiResults.push({ path: url.pathname, status: response.status() });
      }
    });
  }

  try {
    // Establish the one legitimate owner through the ordinary invitation flow.
    await signIn(page, credentials);
    await page.goto(invited.url);
    await expect(page.getByRole("button", { name: "Claim my profile" })).toBeVisible();
    await assertClaim(page, invited);

    // Model prior elevated access that was revoked. The restore operation must
    // grant MEMBER, never reinstate ADMIN, and must leave the active roster row.
    const accessKey = { clubId: invited.clubId, userId: accountId };
    await db.clubAccess.update({ where: { clubId_userId: accessKey }, data: { role: "ADMIN" } });
    await db.clubAccess.update({ where: { clubId_userId: accessKey }, data: { status: "REVOKED" } });

    const accountSnapshot = async () => {
      const account = await db.user.findUniqueOrThrow({ where: { id: accountId }, select: { id: true, email: true, name: true, passwordHash: true } });
      return { id: account.id, email: account.email, name: account.name, passwordHashFingerprint: createHash("sha256").update(account.passwordHash).digest("hex") };
    };
    const historySnapshot = async () => ({
      session: await db.session.findUniqueOrThrow({ where: { id: invited.sessionId } }),
      courts: await db.court.findMany({ where: { sessionId: invited.sessionId }, orderBy: { courtNumber: "asc" } }),
      sessionPlayers: await db.sessionPlayer.findMany({ where: { sessionId: invited.sessionId }, orderBy: { playerId: "asc" } }),
      matches: await db.match.findMany({ where: { sessionId: invited.sessionId }, orderBy: { id: "asc" } }),
      adjustments: await db.matchEloAdjustment.findMany({ where: { match: { sessionId: invited.sessionId } }, orderBy: { id: "asc" } }),
    });
    const accountBefore = await accountSnapshot();
    const playerBefore = await db.player.findUniqueOrThrow({ where: { id: invited.playerId } });
    const memberBefore = await db.clubMember.findUniqueOrThrow({ where: { clubId_playerId: { clubId: invited.clubId, playerId: invited.playerId } } });
    const historyBefore = await historySnapshot();
    const accessBefore = await db.clubAccess.findUniqueOrThrow({ where: { clubId_userId: accessKey } });
    const ownedPlayerIds = async () => (await db.player.findMany({ where: { ownerUserId: accountId }, select: { id: true }, orderBy: { id: "asc" } })).map(player => player.id);
    expect(await ownedPlayerIds()).toEqual([invited.playerId]);
    expect(accessBefore).toMatchObject({ status: "REVOKED", role: "ADMIN" });

    await signInAsAdmin(adminPage);
    await adminPage.getByRole("button", { name: /Invitation Club access-restore/ }).click();
    await adminPage.getByRole("button", { name: "Manage club" }).click();
    await adminPage.getByRole("button", { name: `Edit ${invited.name}`, exact: true }).click();
    const restoration = adminPage.getByRole("region", { name: "Restore access to an owned Player" });
    await expect(restoration).toBeVisible();
    await expect(restoration).toContainText(`ID ${accountId}`);
    await expect(restoration).toContainText(`Player: ${invited.name} · ID ${invited.playerId}`);
    await expect(restoration).toContainText("REVOKED · ADMIN");
    await restoration.getByLabel("Reason for access restoration").fill("Restore this existing owner after access was revoked.");
    await restoration.getByLabel(/I explicitly authorize restoring this Account’s access as MEMBER/).check();
    await restoration.getByLabel(/I reviewed the exact Account, Player ID, reason, and access\/roster changes/).check();
    const issueResponse = adminPage.waitForResponse(response => new URL(response.url()).pathname.endsWith("/access-restore-invitations") && response.request().method() === "POST");
    await restoration.getByRole("button", { name: "Create access restoration invitation" }).click();
    expect((await issueResponse).status()).toBe(200);
    const secureLink = restoration.getByRole("status", { name: "Secure invitation ready" });
    await expect(secureLink).toBeVisible();
    await secureLink.getByRole("button", { name: "Copy secure link" }).click();
    const restorationUrl = await adminPage.evaluate(() => navigator.clipboard.readText());
    const restorationLink = new URL(restorationUrl);
    expect(restorationLink.pathname).toMatch(/^\/player-invites\//);
    expect(restorationLink.hash).toMatch(/^#[A-Za-z0-9_-]{43}$/);
    const invitationId = restorationLink.pathname.split("/").pop()!;
    const issued = await db.playerInvitation.findUniqueOrThrow({ where: { id: invitationId } });
    expect(issued).toMatchObject({ purpose: "ACCESS_RESTORE", playerId: invited.playerId, targetAccountUserId: accountId, sourcePlayerId: null, sourceMemberId: null, authorizedAccessAction: "RESTORE_MEMBER", restoreArchivedRoster: false });

    await page.goto(restorationUrl);
    await expect(page.getByRole("heading", { name: "Approved access restoration", exact: true })).toBeVisible();
    const review = page.getByRole("region", { name: "Authorized identity change review" });
    await expect(review).toContainText(`ID ${accountId}`);
    await expect(review).toContainText(`${invited.name} · ID ${invited.playerId}`);
    await expect(review).toContainText("This action will not create, reassign, merge, activate, or retire a Player.");
    const confirmResponse = page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/confirm-access-restore") && response.request().method() === "POST");
    await review.getByRole("button", { name: "Confirm access restoration" }).click();
    expect((await confirmResponse).status()).toBe(200);
    const receiptRegion = page.getByRole("region", { name: "Completed identity action" });
    await expect(receiptRegion).toContainText("Access restoration completed");
    await expect(receiptRegion).toContainText("Confirmed by Account");
    await expect(receiptRegion).toContainText("Authorized by Admin");
    await expect(receiptRegion).toContainText("No Player was created or reassigned.");
    await expect(receiptRegion).toContainText("Revoked club access was restored as MEMBER.");

    const contextResponse = await page.request.get(`/api/player-invites/${invitationId}`);
    expect(contextResponse.status()).toBe(200);
    const context = await contextResponse.json() as { completedReceipt: unknown };
    expect(context.completedReceipt).toBeTruthy();
    const replayResponse = await page.request.post(`/api/player-invites/${invitationId}/confirm-access-restore`, {
      data: { confirm: true },
      headers: { origin: e2eBaseURL },
    });
    expect(replayResponse.status()).toBe(200);
    const replay = await replayResponse.json() as { receipt: unknown };
    expect(replay.receipt).toEqual(context.completedReceipt);

    await receiptRegion.getByRole("link", { name: "Continue to club" }).click();
    await expect(page).toHaveURL(new RegExp(`/club/${invited.clubId}\\?tab=profile`));
    expect(await db.player.findUniqueOrThrow({ where: { id: invited.playerId } })).toEqual(playerBefore);
    expect(await db.clubMember.findUniqueOrThrow({ where: { id: memberBefore.id } })).toEqual(memberBefore);
    expect(await db.clubAccess.findUniqueOrThrow({ where: { clubId_userId: accessKey } })).toMatchObject({ status: "ACTIVE", role: "MEMBER", revision: expect.any(Number) });
    expect(await ownedPlayerIds()).toEqual([invited.playerId]);
    expect(await accountSnapshot()).toEqual(accountBefore);
    expect(await historySnapshot()).toEqual(historyBefore);
    expect(apiResults).toEqual(expect.arrayContaining([
      { path: `/api/clubs/${invited.clubId}/players/${invited.playerId}/access-restore-invitations`, status: 200 },
      { path: `/api/player-invites/${invitationId}/confirm-access-restore`, status: 200 },
    ]));
    expect(pageErrors).toEqual([]);
  } finally { await db.$disconnect(); await adminContext.close().catch(() => {}); }
});
