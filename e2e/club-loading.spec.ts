import { expect, test, type Page } from "@playwright/test";
import { scoreSessionCode, signInAsAdmin } from "./helpers";

test.use({ viewport: { width: 390, height: 844 } });
const club = { id: "loading-club", name: "Riverside club", avatarUrl: "/spark.png", role: "ADMIN", membersCount: 1, sessionsCount: 0, isPasswordProtected: false, isTutorial: false };
const member = { id: "loading-player", name: "Riverside player", gender: "FEMALE", partnerPreference: "ANY", status: "CORE", preferredPool: "B", elo: 1000, matchesPlayed: 0, wins: 0, losses: 0, isClaimed: true, role: "ADMIN" };
const snapshot = { club, viewer: { id: "loading-account", name: "Ari", playerId: member.id, isAdmin: false, isQuickAccess: false }, clubMembers: [member], sessions: [], claimRequests: [] };
async function mockedApp(page: Page) {
  const state = { delay: 0, authDelay: 0, clubsDelay: 0, statsGate: null as Promise<void> | null, statsStatus: 200, clubsStatus: 200, status: 200, name: club.name, requests: [] as string[], snapshots: 0, stats: 0 };
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url()); const path = url.pathname;
    let data: unknown = {};
    let status = 200;
    if (path === "/api/auth/session") {
      if (state.authDelay) await new Promise(resolve => setTimeout(resolve, state.authDelay));
      data = { user: { id: "loading-account", name: "Ari", isQuickAccess: false }, expires: "2099-01-01T00:00:00Z" };
    }
    else if (path === "/api/user/me") data = { user: { id: "loading-account", name: "Ari", gender: "FEMALE", isQuickAccess: false } };
    else if (path === "/api/clubs") {
      if (state.clubsDelay) await new Promise(resolve => setTimeout(resolve, state.clubsDelay));
      status = state.clubsStatus;
      data = status === 200 ? [club, { ...club, id: "other-loading-club", name: "Other club" }] : { error: "Unable to load clubs." };
    }
    else if (path === "/api/clubs/loading-club") {
      state.snapshots++; state.requests.push(url.pathname + url.search);
      const name = state.name; status = state.status;
      if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
      data = status === 200 ? { ...snapshot, club: { ...club, name, readOnly: url.searchParams.get("view") === "global" } } : { error: "Unable to load club." };
    } else if (path.endsWith("/stats")) {
      state.stats++;
      if (state.statsGate) await state.statsGate;
      status = state.statsStatus;
      data = status === 200 ? { user: member, recentSessions: [], matchHistory: [], profile: { matchHistory: [] } } : { error: "Unable to load statistics." };
    } else if (path.endsWith("/achievements")) data = { achievements: [], showcase: [], unseen: [], earned: [] };
    await route.fulfill({ status, json: data });
  });
  await page.goto("/?chooser=1");
  await expect(page.getByRole("button", { name: /Riverside club Admin/ })).toBeVisible();
  return state;
}
const switcher = (page: Page, name = club.name) => page.getByRole("button", { name: `Switch club, current ${name}`, exact: true });

test("reopening a saved club shows one loading view until the dashboard is ready", async ({ page }) => {
  const state = await mockedApp(page);
  state.authDelay = 250; state.clubsDelay = 250; state.delay = 400;
  let releaseStats!: () => void;
  state.statsGate = new Promise(resolve => { releaseStats = resolve; });
  await page.evaluate(() => {
    localStorage.setItem("pc-club:loading-account", "loading-club");
    sessionStorage.clear();
  });
  await page.addInitScript(() => {
    const screens: string[] = [];
    Object.assign(window, { startupScreens: screens });
    const record = () => {
      const screen = document.querySelector(".app-launch-screen") ? "app loading"
        : document.querySelector(".chooser-intro") ? "club chooser"
        : document.querySelector(".club-activity-totals") ? "dashboard"
        : document.querySelector(".club-switcher") ? "club loading"
        : document.querySelector('[role="status"]') ? "app loading" : null;
      if (screen && screens.at(-1) !== screen) screens.push(screen);
    };
    new MutationObserver(record).observe(document, { subtree: true, childList: true, characterData: true });
  });
  try {
    await page.goto("/");
    await expect(page.getByRole("status", { name: "Loading Anti-Selek" })).toBeVisible();
    await expect.poll(() => state.stats).toBe(1);
    await expect(page.getByRole("status", { name: "Loading Anti-Selek" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Club activity" })).toBeHidden();
    await page.screenshot({ path: "test-results/club-loading/startup-390.png" });
  } finally { releaseStats(); }
  await expect(page.getByRole("button", { name: "New session", exact: true })).toBeVisible();
  const screens = await page.evaluate(() => (window as unknown as { startupScreens: string[] }).startupScreens);
  expect(screens).toEqual(["app loading", "dashboard"]);
  expect(state.snapshots).toBe(1);
});

test("cold launch failures reveal a recoverable screen", async ({ page }) => {
  const state = await mockedApp(page);
  state.status = 503;
  await page.goto("/club/loading-club");
  await expect(page.getByRole("status", { name: "Loading Anti-Selek" })).toBeHidden();
  await expect(page.getByRole("main").getByRole("alert").filter({ visible: true })).toHaveText("Unable to load club.");
  state.status = 200;
  state.statsStatus = 503;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("region", { name: "Club activity" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Club activity" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading Anti-Selek" })).toBeHidden();
  state.clubsStatus = 503;
  await page.goto("/");
  await expect(page.getByRole("alert").filter({ hasText: "Unable to load clubs." })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading Anti-Selek" })).toBeHidden();
});

test("direct session, history, and profile opens finish startup with real authentication", async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto(`/session/${scoreSessionCode}`);
  await expect(page.getByRole("button", { name: "Court 1 options" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading Anti-Selek" })).toBeHidden();
  await page.goto(`/session/${scoreSessionCode}/history`);
  await expect(page.getByRole("region", { name: "Session match history" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading Anti-Selek" })).toBeHidden();
  await page.goto("/profile/user-admin-e2e?clubId=community-score-e2e");
  await expect(page.getByRole("heading", { name: "Admin E2E", exact: true })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading Anti-Selek" })).toBeHidden();
});

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

test("an unknown cold club keeps the launch view until ready and global access stays separate", async ({ page }) => {
  const state = await mockedApp(page); state.delay = 800;
  await page.goto("/club/loading-club?view=global");
  await expect(page.getByRole("status", { name: "Loading Anti-Selek" })).toBeVisible();
  await expect(switcher(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Manage club", exact: true })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Profile", exact: true })).toHaveCount(0);
  expect(state.requests).toEqual(["/api/clubs/loading-club?view=global"]);
});
