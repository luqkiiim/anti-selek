import { expect, test, type Page } from "@playwright/test";
import { adminCredentials, hostClubId, scoreSessionCode } from "./helpers";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
async function login(page: Page, credentials = adminCredentials) {
  await page.goto("/signin");
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.getByLabel("Email", { exact: true }).fill(credentials.email);
  await page.getByLabel("Password", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/signin(?:\?|$)/);
}
const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main navigation" });
const sessionNav = (page: Page) => page.getByRole("navigation", { name: "Session navigation" });

test("canonical club tabs, Back/Forward, refresh, and profile overlays", async ({ page }) => {
  await login(page);
  await page.goto(`/club/${hostClubId}`);
  await expect(page.getByRole("heading", { name: "Ready for a rally?" })).toBeVisible();
  await mainNav(page).getByRole("button", { name: "Sessions", exact: true }).click();
  await expect(page).toHaveURL(/tab=sessions/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sessions", exact: true })).toBeVisible();
  await page.goBack();
  await expect(mainNav(page).getByRole("button", { name: "Club", exact: true })).toHaveAttribute("aria-current", "page");
  await page.goForward();
  await expect(mainNav(page).getByRole("button", { name: "Sessions", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Manage club", exact: true }).click();
  await page.getByRole("button", { name: "View Host Player 1 profile", exact: true }).click();
  await expect(page).toHaveURL(/member=user-host-1-e2e/);
  await page.reload();
  await expect(page.getByRole("dialog", { name: /Host Player 1 profile/ })).toBeVisible();
  await page.getByRole("button", { name: "Back to previous page" }).click();
  await expect(page.getByRole("dialog", { name: /Host Player 1 profile/ })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Players", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("club entry and direct session links use the same screen and preserve session tabs", async ({ page }) => {
  await login(page);
  await page.goto("/club/community-score-e2e?tab=sessions");
  await page.getByRole("button", { name: "Continue hosting", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/session/${scoreSessionCode}\\?tab=courts`));
  await expect(page.locator(".prototype-root .court-card")).toBeVisible();
  await expect(page.getByLabel("Team 1 score")).toBeVisible();
  await sessionNav(page).getByRole("button", { name: "Standings", exact: true }).click();
  await page.reload();
  await expect(sessionNav(page).getByRole("button", { name: "Standings", exact: true })).toHaveAttribute("aria-current", "page");
  await page.goto(`/session/${scoreSessionCode}`);
  await expect(page.locator(".prototype-root .court-card")).toBeVisible();
  await expect(page.getByLabel("Team 1 score")).toBeVisible();
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Match history", exact: true }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByRole("region", { name: "Session match history" })).toBeVisible();
});

test("standings retain every statistic at phone, tablet, and desktop sizes", async ({ page }) => {
  await login(page);
  await page.goto(`/session/${scoreSessionCode}?tab=standings`);
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const table = page.getByRole("table", { name: "Player standings" });
    await expect(table).toBeVisible();
    for (const label of ["Points", "Point difference", "Matches played", "Wins and losses"]) await expect(table.getByRole("columnheader", { name: label, exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/ui-ux-refinement/standings-${width}.png` });
  }
});

test("new club overview and direct profile avoid empty insight panels", async ({ page }) => {
  await login(page);
  await page.goto(`/club/${hostClubId}`);
  await expect(page.getByRole("button", { name: "New session", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Club highlights", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Partner chemistry", exact: true })).toHaveCount(0);
  await page.screenshot({ path: "test-results/ui-ux-refinement/club-empty-390.png" });
  await page.goto(`/profile/user-host-1-e2e?clubId=${hostClubId}`);
  await expect(page.getByRole("heading", { name: "Host Player 1", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No completed sessions yet.", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rating journey", exact: true })).toHaveCount(0);
  await expect(page.getByText("To connect a different profile", { exact: false })).toHaveCount(0);
});

test("a global club viewer has no operator controls", async ({ page }) => {
  await login(page, { email: "global-viewer-e2e@example.com", password: "Password123!" });
  await page.goto("/club/community-score-e2e?view=global");
  await expect(page.getByRole("button", { name: "View session", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Manage club", exact: true })).toHaveCount(0);
  await expect(mainNav(page).getByRole("button", { name: "Profile", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "View session", exact: true }).click();
  await expect(page).toHaveURL(/view=global&clubId=community-score-e2e/);
  await expect(page.locator(".court-card")).toBeVisible();
  await expect(page.getByLabel("Team 1 score")).toHaveCount(0);
  await sessionNav(page).getByRole("button", { name: "Players", exact: true }).click();
  await expect(page.getByRole("button", { name: "Manage players", exact: true })).toHaveCount(0);
});

test("setup prepares a session and the shared standby screen starts play", async ({ page }) => {
  await login(page);
  await page.goto(`/club/${hostClubId}?tab=setup`);
  await page.getByLabel("Session name", { exact: true }).fill("UI refinement setup");
  await page.getByRole("button", { name: /0 players/ }).click();
  const roster = page.getByRole("dialog", { name: "Who’s playing?", exact: true });
  for (let index = 0; index < 4; index++) await roster.getByRole("checkbox").nth(index).check();
  await roster.getByRole("button", { name: "Done · 4 players", exact: true }).click();
  await page.getByRole("button", { name: "Prepare session", exact: true }).click();
  await expect(page).toHaveURL(/\/session\//);
  await expect(page.getByText("Not started", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/ui-ux-refinement/standby-390.png" });
  await page.getByRole("button", { name: "Start session", exact: true }).click();
  await expect(page.locator(".court-card").first()).toBeVisible();
});

test("settled swipes add a single history entry", async ({ page, context }) => {
  await login(page);
  await page.goto(`/club/${hostClubId}?tab=club`);
  await expect(mainNav(page)).toBeVisible();
  const pager = page.locator(".page-pager");
  const box = await pager.boundingBox();
  expect(box).not.toBeNull();
  const count = await page.evaluate(() => history.length);
  const client = await context.newCDPSession(page);
  const y = box!.y + Math.min(180, box!.height / 2);
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box!.x + box!.width * .85, y }] });
  for (let step = 1; step <= 8; step++) {
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box!.x + box!.width * (.85 - step * .09), y }] });
    await page.waitForTimeout(20);
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page).toHaveURL(/tab=sessions/);
  await expect.poll(() => page.evaluate(() => history.length)).toBe(count + 1);
  await page.goBack();
  await expect(mainNav(page).getByRole("button", { name: "Club", exact: true })).toHaveAttribute("aria-current", "page");
});

test("participant submission, opponent approval, results, and score correction survive unification", async ({ page, browser }) => {
  const opponentContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    await login(page, { email: "score-player-1@example.com", password: "Password123!" });
    await page.goto(`/session/${scoreSessionCode}`);
    await page.getByLabel("Team 1 score").fill("21");
    await page.getByLabel("Team 2 score").fill("18");
    await page.getByRole("button", { name: "Save score", exact: true }).click();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page.getByText("Waiting for score approval", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve score", exact: true })).toHaveCount(0);
    const opponent = await opponentContext.newPage();
    await login(opponent, { email: "score-player-2@example.com", password: "Password123!" });
    await opponent.goto(`/session/${scoreSessionCode}`);
    await opponent.getByRole("button", { name: "Approve score", exact: true }).click();
    await expect(opponent.getByText("Waiting for score approval", { exact: true })).toHaveCount(0);
    await login(page);
    await page.goto(`/session/${scoreSessionCode}`);
    await page.getByRole("button", { name: "More options", exact: true }).click();
    await page.getByRole("button", { name: "End session", exact: true }).click();
    await page.getByRole("dialog", { name: "End this session?", exact: true }).getByRole("button", { name: "End session", exact: true }).click();
    await expect(page.locator('[aria-labelledby="session-finish-title"]')).toBeVisible();
    await page.getByRole("button", { name: "Match history", exact: true }).click();
    await page.getByLabel("Open actions for Court 1", { exact: true }).click();
    await page.getByRole("button", { name: "Correct score", exact: true }).click();
    const correction = page.getByRole("dialog", { name: "Correct match score", exact: true });
    await correction.getByLabel("Team A corrected score", { exact: true }).fill("21");
    await correction.getByLabel("Team B corrected score", { exact: true }).fill("17");
    await correction.getByRole("button", { name: "Save correction", exact: true }).click();
    await expect(page.getByText("Score corrected.", { exact: true })).toBeVisible();
  } finally { await opponentContext.close(); }
});

async function prepareFixtureSession(page: Page, options: Record<string, unknown> = {}) {
  const response = await page.request.post('/api/sessions', { data: {
    name: 'UI refinement verification', clubId: hostClubId, courtCount: 1,
    scoringType: 'POINTS', matchmakingStyle: 'BALANCED', balanceMetric: 'RATING',
    pairingMode: 'OPEN', collabFormat: 'FREE_PLAY', autoQueueEnabled: false,
    respectPlayerRest: true, poolsEnabled: false, crossoverFrequency: 'BALANCED',
    playerIds: ['user-admin-e2e', 'user-host-1-e2e', 'user-host-2-e2e', 'user-host-3-e2e'],
    ...options,
  } });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()).code as string;
}

test('staff retains session controls and has no club administration access', async ({ page }) => {
  await login(page);
  await page.goto(`/club/${hostClubId}/admin`);
  await page.getByRole('button', { name: 'Edit Host Player 1', exact: true }).click();
  await page.getByRole('button', { name: 'Make staff', exact: true }).click();
  await expect(page.getByText('Host Player 1 is now staff.', { exact: true })).toBeVisible();
  await login(page, { email: 'host-player-1@example.com', password: 'Password123!' });
  await page.goto(`/club/${hostClubId}?tab=setup`);
  await expect(page.getByRole('heading', { name: 'Make it your session.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Manage club', exact: true })).toHaveCount(0);
  const code = await prepareFixtureSession(page);
  expect((await page.request.post(`/api/sessions/${code}/start`)).ok()).toBe(true);
  await page.goto(`/session/${code}`);
  await page.getByRole('button', { name: 'More options' }).click();
  await expect(page.getByRole('button', { name: 'Session settings', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'End session', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete session', exact: true })).toHaveCount(0);
  expect((await page.request.patch(`/api/clubs/${hostClubId}/members/user-host-2-e2e`, { data: { elo: 1200 } })).status()).toBe(403);
  await page.goto(`/club/${hostClubId}/admin`);
  await expect(page.locator('.prototype-root [role=alert]')).toHaveText('You do not have access to manage this club.');
});

test('a player joins using the exact owned club profile', async ({ page }) => {
  await login(page);
  const code = await prepareFixtureSession(page, { name: 'Self join verification' });
  expect((await page.request.post(`/api/sessions/${code}/start`)).ok()).toBe(true);
  await login(page, { email: 'host-player-4@example.com', password: 'Password123!' });
  await page.goto(`/session/${code}?tab=players`);
  await page.getByRole('button', { name: 'Join session', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Join session', exact: true })).toHaveCount(0);
  const data = await (await page.request.get(`/api/sessions/${code}`)).json();
  expect(data.selectedSelf).toMatchObject({ playerId: 'user-host-4-e2e', profileClubId: hostClubId });
  expect(data.players.some((player: { userId: string }) => player.userId === 'user-host-4-e2e')).toBe(true);
  await page.getByRole('button', { name: 'Pause Host Player 4', exact: true }).click();
  await page.getByRole('button', { name: 'Resume Host Player 4', exact: true }).click();
  await page.getByRole('button', { name: 'Rest options for Host Player 4', exact: true }).click();
  await page.getByRole('button', { name: 'Skip next match', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Rest options', exact: true })).toHaveCount(0);
  const updated = await (await page.request.get(`/api/sessions/${code}`)).json();
  expect(updated.players.find((player: { userId: string }) => player.userId === 'user-host-4-e2e').skipNextMatchAt).toBeTruthy();
  await expect(page.getByRole('button', { name: 'Manage players', exact: true })).toHaveCount(0);
});

test('administration scroll survives overlays, cross-route navigation, and Back', async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 390, height: 550 });
  await page.goto(`/club/${hostClubId}/admin?tab=players`);
  const scroll = page.locator('.pc-scroll.with-tabs');
  await page.getByRole('button', { name: 'View Host Player 7 profile', exact: true }).scrollIntoViewIfNeeded();
  const previous = await scroll.evaluate(node => node.scrollTop);
  expect(previous).toBeGreaterThan(100);
  await page.getByRole('button', { name: 'View Host Player 7 profile', exact: true }).click();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => scroll.evaluate(node => node.scrollTop)).toBeCloseTo(previous, 0);
  await mainNav(page).getByRole('button', { name: 'Sessions', exact: true }).click();
  await expect(page).toHaveURL(/tab=sessions/);
  await page.goBack();
  await expect(page).toHaveURL(/admin\?tab=players/);
  await expect.poll(() => scroll.evaluate(node => node.scrollTop)).toBeCloseTo(previous, 0);
});

test('cold links retain authentication callbacks and legacy destination aliases', async ({ page }) => {
  const destination = `/session/${scoreSessionCode}?tab=standings`;
  await page.goto(destination);
  await expect(page).toHaveURL(/signin\?callbackUrl=/);
  expect(new URL(page.url()).searchParams.get('callbackUrl')).toBe(destination);
  await page.getByLabel('Email', { exact: true }).fill(adminCredentials.email);
  await page.getByLabel('Password', { exact: true }).fill(adminCredentials.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/session/${scoreSessionCode}\\?tab=standings`));
  await page.goto(`/?club=${hostClubId}&tab=leaderboard`);
  await expect(page).toHaveURL(new RegExp(`/club/${hostClubId}\\?tab=rankings`));
  await page.goto(`/community/${hostClubId}?tab=tournaments`);
  await expect(mainNav(page).getByRole('button', { name: 'Sessions', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('incomplete global links remain read-only even for a host account', async ({ page }) => {
  await login(page);
  await page.goto(`/session/${scoreSessionCode}?view=global`);
  await expect(page.locator('.prototype-root [role=alert]')).toHaveText('This read-only session link needs a valid club.');
  await expect(page.getByRole('button', { name: 'More options' })).toHaveCount(0);
});

test('interclub invitation review, representation, and profile scope remain available', async ({ page }) => {
  await login(page);
  await page.goto(`/club/${hostClubId}?tab=setup`);
  await page.getByText('More options', { exact: true }).click();
  await page.getByRole('button', { name: 'Club collaboration', exact: true }).click();
  await expect(page).toHaveURL(/tools=advanced/);
  await expect(page.getByText('New tournament', { exact: true })).toBeVisible();
  const ids = ['user-host-2-e2e', 'user-host-3-e2e', 'user-score-1-e2e', 'user-score-2-e2e'];
  const scoreClub = 'community-score-e2e';
  const code = await prepareFixtureSession(page, {
    name: 'Interclub verification', partnerClubId: scoreClub, collabFormat: 'INTERCLUB', playerIds: ids,
    playerConfigs: ids.map((playerId, index) => ({ playerId, profileClubId: index < 2 ? hostClubId : scoreClub, representingClubId: index < 2 ? hostClubId : scoreClub, pool: 'B' })),
  });
  await page.goto(`/session/${code}`);
  await expect(page.getByRole('button', { name: 'Start session', exact: true })).toBeDisabled();
  await page.goto(`/club/${scoreClub}?tab=sessions`);
  const achievement = page.getByRole('dialog', { name: 'New club achievement', exact: true });
  if (await achievement.waitFor({ state: 'visible', timeout: 1500 }).then(() => true).catch(() => false)) await achievement.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Accept invitation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Accept invitation', exact: true })).toHaveCount(0);
  expect((await page.request.post(`/api/sessions/${code}/start`)).ok()).toBe(true);
  await page.goto(`/session/${code}`);
  await expect(page.getByRole('region', { name: 'Interclub score', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create matches', exact: true }).click();
  await expect(page.getByLabel('Team 1 score')).toBeVisible();
  await sessionNav(page).getByRole('button', { name: 'Standings', exact: true }).click();
  await page.getByRole('button', { name: "View Score Player 1's profile", exact: true }).click();
  await expect(page.getByRole('dialog', { name: /Score Player 1 profile/ })).toHaveAttribute('data-club-id', scoreClub);
});
