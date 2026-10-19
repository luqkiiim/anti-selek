import { expect, test, type Page } from "@playwright/test";
import { scoreSessionCode, signInAsAdmin } from "./helpers";

test.use({ viewport: { width: 390, height: 844 } });

function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

async function openClear(page: Page) {
  await page.getByRole("button", { name: "Court 1 options", exact: true }).click();
  await page.getByRole("dialog", { name: "Court 1 options", exact: true }).getByRole("button", { name: "Clear court", exact: true }).click();
  return page.getByRole("dialog", { name: "Clear court?", exact: true });
}

for (const delayedRead of ["existing poll", "follow-up refresh"] as const) {
  test(`confirmed clear removes player names without waiting for ${delayedRead}`, async ({ page }) => {
    await signInAsAdmin(page);
    const endpoint = `/api/sessions/${scoreSessionCode}`;
    const response = await page.request.get(endpoint);
    expect(response.ok()).toBe(true);
    const snapshot = await response.json();
    const match = snapshot.courts[0].currentMatch;
    const cleared = { ...snapshot, courts: snapshot.courts.map((court: { id: string }) => court.id === snapshot.courts[0].id ? { ...court, currentMatch: null } : court) };
    const read = gate(), readStarted = gate(), mutation = gate(), accepted = gate();
    let holdRead = false, committed = false, mutations = 0;
    await page.route(`**${endpoint}**`, async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === endpoint && route.request().method() === "GET") {
        const body = committed ? cleared : snapshot;
        if (holdRead) { readStarted.release(); await read.promise; }
        await route.fulfill({ json: body });
      } else if (path === endpoint + "/generate-match") {
        mutations++;
        await mutation.promise;
        committed = true;
        await route.fulfill({ json: { ok: true, undoneMatchId: match.id, autoAssignedMatch: null, queuedMatchCleared: false, queuedMatch: null } });
        accepted.release();
      } else await route.continue();
    });
    try {
      await page.goto(`/session/${scoreSessionCode}`);
      const court = page.locator(".court-card").first();
      await expect(court.getByRole("button", { name: "Player actions for Score Player 1", exact: true })).toBeVisible();
      const dialog = await openClear(page);
      holdRead = true;
      if (delayedRead === "existing poll") {
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        await readStarted.promise;
      }
      await dialog.getByRole("button", { name: "Clear court", exact: true }).click();
      await expect(dialog.getByRole("button", { name: "Clear court", exact: true })).toBeDisabled();
      await expect(court.locator(".team-row")).toHaveCount(2);
      mutation.release();
      await accepted.promise;
      await expect(dialog).toBeHidden({ timeout: 500 });
      await expect(court.locator(".team-row")).toHaveCount(0, { timeout: 500 });
      await expect(court.getByRole("button", { name: /Create/ })).toBeVisible();
      read.release();
      await expect(court.locator(".team-row")).toHaveCount(0);
      expect(mutations).toBe(1);
    } finally { mutation.release(); read.release(); }
  });
}

test("a rejected clear keeps the lineup and allows recovery", async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto(`/session/${scoreSessionCode}`);
  const court = page.locator(".court-card").first();
  await expect(court.locator(".team-row")).toHaveCount(2);
  await page.route(`**/api/sessions/${scoreSessionCode}/generate-match`, route => route.fulfill({ status: 409, json: { error: "This match has changed. Refresh and try again." } }));
  const dialog = await openClear(page);
  await dialog.getByRole("button", { name: "Clear court", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("This match has changed. Refresh and try again.");
  await expect(dialog.getByRole("button", { name: "Clear court", exact: true })).toBeEnabled();
  await expect(court.locator(".team-row")).toHaveCount(2);
});

test("a real clear commits the empty court and preserves its players", async ({ page }) => {
  await signInAsAdmin(page);
  const endpoint = `/api/sessions/${scoreSessionCode}`;
  const before = await (await page.request.get(endpoint)).json();
  await page.goto(`/session/${scoreSessionCode}`);
  const court = page.locator(".court-card").first();
  await expect(court.locator(".team-row")).toHaveCount(2);
  const dialog = await openClear(page);
  const response = page.waitForResponse(response => new URL(response.url()).pathname === endpoint + "/generate-match" && response.request().method() === "POST");
  const started = Date.now();
  await dialog.getByRole("button", { name: "Clear court", exact: true }).click();
  const accepted = await response;
  const confirmedAt = Date.now();
  expect(accepted.ok()).toBe(true);
  expect((await accepted.json()).undoneMatchId).toBe(before.courts[0].currentMatch.id);
  await expect(court.locator(".team-row")).toHaveCount(0, { timeout: 500 });
  await expect(dialog).toBeHidden({ timeout: 500 });
  console.log(JSON.stringify({ clearPostMs: confirmedAt - started, clearedWithinMsOfResponse: Date.now() - confirmedAt }));
  const after = await (await page.request.get(endpoint)).json();
  expect(after.courts[0].currentMatch).toBeNull();
  expect(after.players.map((p: { userId: string }) => p.userId).sort()).toEqual(before.players.map((p: { userId: string }) => p.userId).sort());
});
