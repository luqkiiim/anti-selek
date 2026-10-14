import { expect, test, type Page, type Route } from "@playwright/test";
import { adminCredentials, hostClubId } from "./helpers";

test.use({ viewport: { width: 390, height: 844 } });
const createdCodes: string[] = [];
test.beforeEach(() => { createdCodes.length = 0; });
test.afterEach(async ({ page }) => {
  // Do not leave live sessions that alter other suites' club overview fixtures.
  for (const code of createdCodes) {
    const response = await page.request.delete(`/api/sessions/${code}/delete`);
    expect(response.ok(), await response.text()).toBe(true);
  }
});
type Snapshot = { status: string; players: Array<{ userId: string; profileClubId?: string | null; representingClubId?: string | null; user: { name: string }; isGuest: boolean }> };
async function login(page: Page) {
  await page.goto("/signin");
  await page.getByLabel("Email", { exact: true }).fill(adminCredentials.email);
  await page.getByLabel("Password", { exact: true }).fill(adminCredentials.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/signin(?:\?|$)/);
}
async function read(page: Page, code: string): Promise<Snapshot> {
  const response = await page.request.get(`/api/sessions/${code}`);
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
async function setupAndStart(page: Page, includeHost = true) {
  await page.goto(`/club/${hostClubId}?tab=setup`);
  await page.getByLabel("Session name", { exact: true }).fill("Live member addition regression");
  await page.getByRole("button", { name: /0 players/ }).click();
  const roster = page.getByRole("dialog", { name: "Who’s playing?", exact: true });
  const names = includeHost ? ["Admin E2E", "Host Player 1", "Host Player 2", "Host Player 3"] : ["Host Player 1", "Host Player 2", "Host Player 3", "Host Player 4"];
  for (const name of names) await roster.locator(".setup-person").filter({ has: page.getByText(name, { exact: true }) }).getByRole("checkbox").check();
  await roster.getByRole("button", { name: "Done · 4 players", exact: true }).click();
  await page.getByRole("button", { name: "Prepare session", exact: true }).click();
  await expect(page).toHaveURL(/\/session\//);
  const code = new URL(page.url()).pathname.split("/").pop()!;
  createdCodes.push(code);
  await page.getByRole("button", { name: "Start session", exact: true }).click();
  await expect.poll(async () => (await read(page, code)).status).toBe("ACTIVE");
  await page.getByRole("navigation", { name: "Session navigation" }).getByRole("button", { name: "Players", exact: true }).click();
  return code;
}
async function openPicker(page: Page) {
  await page.getByRole("button", { name: "Manage players", exact: true }).click();
  await page.getByRole("button", { name: "Add club members", exact: true }).click();
  return page.getByRole("dialog", { name: "Add club members", exact: true });
}

for (const includeHost of [true, false]) {
  test(`adds the selected member after starting, with the host ${includeHost ? "already playing" : "not playing"}`, async ({ page }) => {
    await login(page);
    const code = await setupAndStart(page, includeHost);
    const before = await read(page, code);
    const picker = await openPicker(page);
    await picker.getByLabel("Search club members", { exact: true }).fill("Host Player 5");
    const responsePromise = page.waitForResponse(response => response.url().endsWith(`/api/sessions/${code}/join`) && response.request().method() === "POST");
    await picker.locator(".pm-player-card").filter({ hasText: "Host Player 5" }).getByRole("button", { name: "Add to session", exact: true }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    expect(response.request().postDataJSON()).toEqual({ playerId: "user-host-5-e2e", profileClubId: hostClubId, pool: "A" });
    const players = page.getByRole("dialog", { name: "Players", exact: true });
    await expect(players.getByText("Host Player 5", { exact: true })).toBeVisible();
    await expect(players.getByText("5 players", { exact: true })).toBeVisible();
    const after = await read(page, code);
    expect(after.players.map(player => player.userId).sort()).toEqual([...before.players.map(player => player.userId), "user-host-5-e2e"].sort());
    expect(after.players.find(player => player.userId === "user-host-5-e2e")).toMatchObject({ profileClubId: hostClubId, isGuest: false });
    await players.getByRole("button", { name: "Close", exact: true }).click();
    await page.reload();
    await expect(page.getByRole("button", { name: "Pause Host Player 5", exact: true })).toBeVisible();

    if (includeHost) {
      const guestPicker = await openPicker(page);
      await guestPicker.getByLabel("Search club members", { exact: true }).fill("Live regression guest");
      await guestPicker.getByRole("button", { name: "Add “Live regression guest” as a guest", exact: true }).click();
      await guestPicker.locator(".pm-form select").first().selectOption("FEMALE");
      await guestPicker.getByRole("button", { name: "Add guest", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Players", exact: true }).getByText("Live regression guest", { exact: true })).toBeVisible();
      const withGuest = await read(page, code);
      expect(withGuest.players).toHaveLength(6);
      expect(withGuest.players.find(player => player.user.name === "Live regression guest")?.isGuest).toBe(true);
    }
  });
}

test("an unchanged success response stays in the picker and a real retry adds the member", async ({ page }) => {
  await login(page);
  const code = await setupAndStart(page);
  const before = await read(page, code);
  const url = `**/api/sessions/${code}/join`;
  const unchangedResponse = (route: Route) => route.fulfill({ status: 200, json: before });
  await page.route(url, unchangedResponse);
  const picker = await openPicker(page);
  const add = picker.locator(".pm-player-card").filter({ hasText: "Host Player 5" }).getByRole("button", { name: "Add to session", exact: true });
  await add.click();
  await expect(picker.getByRole("alert")).toHaveText("Host Player 5 wasn’t added. Try again.");
  expect((await read(page, code)).players).toHaveLength(4);
  await page.unroute(url, unchangedResponse);
  await add.click();
  await expect(page.getByRole("dialog", { name: "Players", exact: true }).getByText("Host Player 5", { exact: true })).toBeVisible();
  expect((await read(page, code)).players).toHaveLength(5);
});

for (const collabFormat of ["FREE_PLAY", "INTERCLUB"]) {
  test(`adds a partner club member to the exact profile in ${collabFormat}`, async ({ page }) => {
    await login(page);
    const partnerClubId = "community-score-e2e";
    const ids = ["user-host-1-e2e", "user-host-2-e2e", "user-score-1-e2e", "user-score-2-e2e"];
    const prepared = await page.request.post("/api/sessions", { data: {
      name: "Live partner member addition", clubId: hostClubId, partnerClubId, collabFormat, courtCount: 1,
      scoringType: "POINTS", matchmakingStyle: "BALANCED", balanceMetric: "RATING", pairingMode: "OPEN",
      autoQueueEnabled: false, respectPlayerRest: true, poolsEnabled: false, crossoverFrequency: "BALANCED",
      playerIds: ids, playerConfigs: ids.map((playerId, index) => ({ playerId, profileClubId: index < 2 ? hostClubId : partnerClubId, representingClubId: index < 2 ? hostClubId : partnerClubId, pool: "A" })),
    } });
    expect(prepared.ok(), await prepared.text()).toBe(true);
    const code = (await prepared.json()).code as string;
    createdCodes.push(code);
    expect((await page.request.patch(`/api/sessions/${code}/collab`, { data: { status: "ACCEPTED" } })).ok()).toBe(true);
    expect((await page.request.post(`/api/sessions/${code}/start`)).ok()).toBe(true);
    await page.goto(`/session/${code}?tab=players`);
    const picker = await openPicker(page);
    await picker.getByLabel("Search club members", { exact: true }).fill("Score Player 3");
    await picker.locator(".pm-player-card").filter({ hasText: "Score Player 3" }).getByRole("button", { name: "Add to session", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Players", exact: true }).getByText("Score Player 3", { exact: true })).toBeVisible();
    const snapshot = await read(page, code);
    expect(snapshot.players).toHaveLength(5);
    expect(snapshot.players.find(player => player.userId === "user-score-3-e2e")).toMatchObject({ profileClubId: partnerClubId, representingClubId: collabFormat === "INTERCLUB" ? partnerClubId : null });
  });
}
