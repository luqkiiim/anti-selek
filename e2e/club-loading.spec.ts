import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });
const club = { id: "loading-club", name: "Riverside club", avatarUrl: "/spark.png", role: "ADMIN", membersCount: 1, sessionsCount: 0, isPasswordProtected: false, isTutorial: false };
const member = { id: "loading-player", name: "Riverside player", gender: "FEMALE", partnerPreference: "ANY", status: "CORE", preferredPool: "B", elo: 1000, matchesPlayed: 0, wins: 0, losses: 0, isClaimed: true, role: "ADMIN" };
const snapshot = { club, viewer: { id: "loading-account", name: "Ari", playerId: member.id, isAdmin: false, isQuickAccess: false }, clubMembers: [member], sessions: [], claimRequests: [] };
async function mockedApp(page: Page) {
  const state = { delay: 0, status: 200, name: club.name, requests: [] as string[], snapshots: 0, stats: 0 };
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url()); const path = url.pathname;
    let data: unknown = {};
    let status = 200;
    if (path === "/api/auth/session") data = { user: { id: "loading-account", name: "Ari", isQuickAccess: false }, expires: "2099-01-01T00:00:00Z" };
    else if (path === "/api/user/me") data = { user: { id: "loading-account", name: "Ari", gender: "FEMALE", isQuickAccess: false } };
    else if (path === "/api/clubs") data = [club, { ...club, id: "other-loading-club", name: "Other club" }];
    else if (path === "/api/clubs/loading-club") {
      state.snapshots++; state.requests.push(url.pathname + url.search);
      const name = state.name; status = state.status;
      if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
      data = status === 200 ? { ...snapshot, club: { ...club, name, readOnly: url.searchParams.get("view") === "global" } } : { error: "Unable to load club." };
    } else if (path.endsWith("/stats")) {
      state.stats++;
      data = { user: member, recentSessions: [], matchHistory: [], profile: { matchHistory: [] } };
    } else if (path.endsWith("/achievements")) data = { achievements: [], showcase: [], unseen: [], earned: [] };
    await route.fulfill({ status, json: data });
  });
  await page.goto("/?chooser=1");
  await expect(page.getByRole("button", { name: /Riverside club Admin/ })).toBeVisible();
  return state;
}
const switcher = (page: Page, name = club.name) => page.getByRole("button", { name: `Switch club, current ${name}`, exact: true });

test("slow selection retains name/avatar and requests the club and own statistics once", async ({ page }) => {
  const state = await mockedApp(page); state.delay = 800;
  await page.evaluate(() => {
    const names: string[] = [];
    Object.assign(window, { loadingHeaderNames: names });
    new MutationObserver(() => {
      const name = document.querySelector(".club-switcher strong")?.textContent;
      if (name && names.at(-1) !== name) names.push(name);
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await page.getByRole("button", { name: /Riverside club Admin/ }).focus();
  expect(state.snapshots).toBe(0);
  await page.getByRole("button", { name: /Riverside club Admin/ }).click();
  await expect(switcher(page)).toBeVisible();
  await expect(page.getByLabel("Riverside club club photo").locator("img")).toHaveAttribute("src", "/spark.png");
  await expect(page.getByRole("button", { name: "Manage club", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New session", exact: true })).toBeVisible();
  expect(state.snapshots).toBe(1); expect(state.stats).toBe(1);
  const names = await page.evaluate(() => (window as unknown as { loadingHeaderNames: string[] }).loadingHeaderNames);
  expect(names).toEqual([club.name]);
  await page.screenshot({ path: "test-results/club-loading/loaded-390.png" });
});

test("warm return shows cached content read-only, then fresh permissions and renamed identity", async ({ page }) => {
  const state = await mockedApp(page);
  await page.getByRole("button", { name: /Riverside club Admin/ }).click();
  await expect(page.getByRole("button", { name: "New session", exact: true })).toBeVisible();
  await switcher(page).click();
  await expect(page.getByRole("button", { name: /Riverside club Admin/ })).toBeVisible();
  state.delay = 1000; state.name = "Riverside renamed";
  await page.getByRole("button", { name: /Riverside club Admin/ }).click();
  await expect(page.getByRole("region", { name: "Club activity" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Manage club", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New session", exact: true })).toHaveCount(0);
  await expect(switcher(page, state.name)).toBeVisible();
  await expect(page.getByRole("button", { name: "New session", exact: true })).toBeVisible();
  expect(state.snapshots).toBe(2);
  state.delay = 800;
  await page.reload();
  await expect(switcher(page, state.name)).toBeVisible();
  await expect(page.getByRole("button", { name: "New session", exact: true })).toBeVisible();
  expect(state.snapshots).toBe(3);
});

test("a failed warm refresh keeps read-only content and retries once", async ({ page }) => {
  const state = await mockedApp(page);
  await page.getByRole("button", { name: /Riverside club Admin/ }).click();
  await expect(page.getByRole("button", { name: "New session", exact: true })).toBeVisible();
  await switcher(page).click();
  await expect(page.getByRole("button", { name: /Riverside club Admin/ })).toBeVisible();
  state.status = 503;
  await page.getByRole("button", { name: /Riverside club Admin/ }).click();
  await expect(page.getByRole("main").getByRole("alert").filter({ visible: true })).toHaveText("Unable to load club.");
  await expect(page.getByRole("region", { name: "Club activity" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Manage club", exact: true })).toHaveCount(0);
  state.status = 200;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("button", { name: "New session", exact: true })).toBeVisible();
  expect(state.snapshots).toBe(3);
});

test("an unknown cold club has a skeleton header and global access stays separate", async ({ page }) => {
  const state = await mockedApp(page); state.delay = 800;
  await page.goto("/club/loading-club?view=global");
  await expect(page.getByRole("status", { name: "Loading club name" })).toBeVisible();
  await expect(switcher(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Manage club", exact: true })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Profile", exact: true })).toHaveCount(0);
  expect(state.requests).toEqual(["/api/clubs/loading-club?view=global"]);
});
