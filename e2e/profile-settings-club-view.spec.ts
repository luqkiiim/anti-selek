import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";
const uiDatabaseUrl = process.env.E2E_UI_DATABASE_URL ?? "";
test.skip(!uiDatabaseUrl, "Requires dedicated local UI browser fixture/config");

async function accountSheet(page: Page) {
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(page.locator(".player-profile").filter({ visible: true }).getByRole("heading", { name: "Player preferences" })).toHaveCount(0);
  await page.getByRole("button", { name: "Account settings", exact: true }).filter({ visible: true }).click();
  const sheet = page.getByRole("dialog", { name: "Your account", exact: true });
  await expect(sheet.getByLabel("Player level", { exact: true })).toBeVisible();
  return sheet;
}
async function closeAccount(page: Page) {
  await page.getByRole("dialog", { name: "Your account", exact: true }).getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Your account", exact: true })).toHaveCount(0);
}
async function settledAccountSheet(page: Page) {
  const sheet = page.getByRole("dialog", { name: "Your account", exact: true });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("status")).toHaveText("Profile updated.");
  return sheet;
}
async function saveAccount(page: Page) {
  const response = page.waitForResponse(result => result.request().method() === "PATCH" && new URL(result.url()).pathname === "/api/user/me");
  await page.getByRole("dialog", { name: "Your account", exact: true }).getByRole("button", { name: "Save changes", exact: true }).click();
  expect((await response).ok()).toBe(true);
  return settledAccountSheet(page);
}
async function assertNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true);
}

test("two club preferences remain separate; identity cancellation writes nothing and confirmation writes once", async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  const patches: { name?: string; gender?: string; clubPreferences?: { clubId: string; playerId: string; mixedSideOverride: string | null } }[] = [];
  page.on("request", request => { if (request.method() === "PATCH" && new URL(request.url()).pathname === "/api/user/me") patches.push(request.postDataJSON()); });
  await signIn(page, { email: `ui-${project}@example.com`, password: "BrowserLocal123!" });
  await expect(page.getByRole("button", { name: "Browse clubs", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: new RegExp(`QA ${project} Alpha`) }).click();
  let sheet = await accountSheet(page);
  const level = sheet.getByLabel("Player level", { exact: true });
  await expect(level.locator("option")).toHaveText(["Default", "Upper Side"]);
  await expect(sheet.locator(".account-field-note")).toHaveCount(0);
  await level.selectOption("UPPER");
  sheet = await saveAccount(page);
  expect(patches).toEqual([{ clubPreferences: { clubId: `ui-${project}-alpha`, playerId: `ui-${project}-alpha-player`, mixedSideOverride: "UPPER" } }]);
  await closeAccount(page);
  await page.getByRole("button", { name: /Switch club/ }).click();
  await page.getByRole("button", { name: new RegExp(`QA ${project} Beta`) }).click();
  sheet = await accountSheet(page);
  await expect(sheet.getByLabel("Player level", { exact: true })).toHaveValue("");
  await expect(sheet.getByLabel("Player level", { exact: true }).locator("option")).toHaveText(["Default", "Lower Side"]);
  await sheet.getByLabel("Player level", { exact: true }).selectOption("LOWER");
  sheet = await saveAccount(page);
  await closeAccount(page);
  await page.getByRole("button", { name: /Switch club/ }).click();
  await page.getByRole("button", { name: new RegExp(`QA ${project} Alpha`) }).click();
  sheet = await accountSheet(page);
  await expect(sheet.getByLabel("Player level", { exact: true })).toHaveValue("UPPER");
  await sheet.getByLabel("Account name", { exact: true }).fill(`Updated ${project}`);
  await sheet.getByLabel("Account gender", { exact: true }).selectOption("FEMALE");
  await expect(sheet.getByLabel("Player level", { exact: true })).toHaveValue("");
  await sheet.getByRole("button", { name: "Save changes", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Confirm account changes", exact: true });
  await expect(confirm).toContainText(`Browser ${project}`);
  await expect(confirm).toContainText(`Updated ${project}`);
  await expect(confirm).toContainText("You can change your name/gender only once.");
  await assertNoOverflow(page);
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click({ trial: true });
  await page.screenshot({ path: testInfo.outputPath("identity-confirmation.png"), fullPage: true });
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(confirm).toHaveCount(0);
  expect(patches).toHaveLength(2);
  await expect(sheet.getByLabel("Account name", { exact: true })).toHaveValue(`Updated ${project}`);
  const beforeConfirm = await page.request.get("/api/user/me");
  expect((await beforeConfirm.json()).user.name).toBe(`Browser ${project}`);
  await sheet.getByRole("button", { name: "Save changes", exact: true }).click();
  const saved = page.waitForResponse(response => response.request().method() === "PATCH" && new URL(response.url()).pathname === "/api/user/me");
  await confirm.getByRole("button", { name: "Confirm changes", exact: true }).click();
  expect((await saved).ok()).toBe(true);
  await expect(confirm).toHaveCount(0);
  sheet = await settledAccountSheet(page);
  expect(patches).toHaveLength(3);
  expect(patches[2]).toEqual({ name: `Updated ${project}`, gender: "FEMALE", clubPreferences: { clubId: `ui-${project}-alpha`, playerId: `ui-${project}-alpha-player`, mixedSideOverride: null } });
  await expect(sheet.getByLabel("Account name", { exact: true })).toBeDisabled();
  await expect(sheet.getByLabel("Account gender", { exact: true })).toBeDisabled();
  await sheet.getByLabel("Player level", { exact: true }).selectOption("UPPER");
  await expect(sheet.getByRole("button", { name: "Save changes", exact: true })).toBeEnabled();
  sheet = await saveAccount(page);
  await expect(sheet.getByRole("button", { name: "Save changes", exact: true })).toBeDisabled();
  expect(patches).toHaveLength(4);
  await assertNoOverflow(page);
  await sheet.getByLabel("Player level", { exact: true }).click({ trial: true });
  await page.screenshot({ path: testInfo.outputPath("club-preferences.png"), fullPage: true });
});

test("browse closed clubs and inspect members and sessions without creating participation or access", async ({ page }, testInfo) => {
  const db = new PrismaClient({ datasources: { db: { url: uiDatabaseUrl } } });
  try {
    const before = await Promise.all([db.clubAccess.count({ where: { userId: "ui-browser-viewer" } }), db.player.count({ where: { ownerUserId: "ui-browser-viewer" } }), db.sessionPlayer.count()]);
    const writes: string[] = [], globalReads: string[] = [];
    page.on("request", request => { const url = new URL(request.url()); if (url.pathname.startsWith("/api/") && !["GET", "HEAD"].includes(request.method()) && !url.pathname.startsWith("/api/auth/")) writes.push(`${request.method()} ${url.pathname}`); if (url.searchParams.get("view") === "global") globalReads.push(url.pathname + url.search); });
    await signIn(page, { email: "ui-browser-viewer@example.com", password: "BrowserLocal123!" });
    await page.getByRole("button", { name: "Browse clubs", exact: true }).click();
    const browse = page.getByRole("dialog", { name: "Browse clubs", exact: true });
    await browse.getByLabel("Search clubs", { exact: true }).fill("QA Closed Browser");
    await browse.getByRole("button", { name: /QA Closed Browser Club/ }).click();
    await expect(page.getByRole("heading", { name: "QA Closed Browser Club", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Manage club", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Profile", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "View profile", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Rankings", exact: true }).click();
    await page.getByRole("button", { name: "View Browser Player 1 profile", exact: true }).filter({ visible: true }).click();
    const member = page.getByRole("dialog", { name: "Browser Player 1 profile in QA Closed Browser Club", exact: true });
    await expect(member.getByRole("heading", { name: "Browser Player 1", exact: true })).toBeVisible();
    await expect(member.getByRole("button", { name: "Account settings", exact: true })).toHaveCount(0);
    await member.getByRole("button", { name: "Back to previous page", exact: true }).click();
    await page.getByRole("button", { name: "Sessions", exact: true }).click();
    await expect(page.getByRole("button", { name: "New", exact: true })).toHaveCount(0);
    await page.locator(".session-tile").filter({ hasText: "Browser live rally" }).getByRole("button", { name: "View session", exact: true }).click();
    await expect(page.getByText("Browser live rally", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Team 1 score", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save score", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Start session", exact: true })).toHaveCount(0);
    await assertNoOverflow(page);
    await page.screenshot({ path: testInfo.outputPath("global-live-session.png"), fullPage: true });
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: /Browser completed rally/ }).filter({ visible: true }).click();
    await page.getByRole("button", { name: "Match history", exact: true }).click();
    await expect(page.getByRole("button", { name: "Correct score", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Undo result", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Approve score", exact: true })).toHaveCount(0);
    expect(globalReads).toContain("/api/clubs/ui-closed-club?view=global");
    expect(globalReads).toContain("/api/sessions/ui-read-active?view=global&clubId=ui-closed-club");
    expect(globalReads).toContain("/api/sessions/ui-read-active/leaderboard?view=global&clubId=ui-closed-club");
    expect(globalReads).toContain("/api/sessions/ui-read-completed/history?view=global&clubId=ui-closed-club");
    expect(globalReads.some(url => url.startsWith("/api/users/ui-read-player-1/stats?") && url.includes("view=global"))).toBe(true);
    expect(writes).toEqual([]);
    expect(await Promise.all([db.clubAccess.count({ where: { userId: "ui-browser-viewer" } }), db.player.count({ where: { ownerUserId: "ui-browser-viewer" } }), db.sessionPlayer.count()])).toEqual(before);
  } finally { await db.$disconnect(); }
});
