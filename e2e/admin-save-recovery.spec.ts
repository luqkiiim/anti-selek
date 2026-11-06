import { expect, test, type Page } from "@playwright/test";

// Every application API is mocked. Run with npm run test:e2e:admin (no database setup).
const clubId = "admin-recovery-club";
const player = {
  id: "local-player", ownerUserId: null, name: "Alex Local", avatarUrl: null,
  gender: "MALE", partnerPreference: "OPEN", mixedSideOverride: null,
  email: "alex@example.test", isActive: true, createdAt: "2026-01-01T00:00:00.000Z",
  status: "CORE", preferredPool: "B", elo: 1100, wins: 3, losses: 2,
  matchesPlayed: 5, isClaimed: false, isOwner: false, role: "MEMBER",
};
async function mockAdmin(page: Page, claimed = false, advanced = false, globalAdmin = false) {
  const state = { players: [{ ...player, isClaimed: claimed, ownerUserId: claimed ? "other-account" : null }], failRefresh: false, unknownWrite: false, ratingConflict: false, rating: player.elo, writes: [] as Array<{ path: string; body: Record<string, unknown> }>, unrelatedReads: [] as string[] };
  await page.route("**/api/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/auth/session") return json({ user: { id: "admin-account", name: "Admin", email: "admin@example.test", isAdmin: globalAdmin }, expires: "2099-01-01T00:00:00.000Z" });
    if (path === `/api/clubs/${clubId}`) {
      if (state.failRefresh) return json({ error: "Snapshot unavailable" }, 503);
      return json({ viewer: { id: "admin-account", playerId: null, name: "Admin", isAdmin: globalAdmin, email: "admin@example.test", elo: 1000, gender: "MALE", partnerPreference: "OPEN" }, club: { id: clubId, name: "Recovery Club", role: "ADMIN", viewerIsOwner: true, isPasswordProtected: false, isTutorial: false, membersCount: state.players.length, sessionsCount: 0 }, clubMembers: state.players, sessions: [], claimRequests: [] });
    }
    if (path === `/api/clubs/${clubId}/join-requests`) return json({ allowJoinRequests: true, requests: [], candidates: [], warnings: [{ code: "HISTORY_UNAVAILABLE", message: "Some Player history is unavailable." }] });
    if (path === `/api/clubs/${clubId}/members` && request.method() === "GET") return json(state.players);
    if (path === `/api/clubs/${clubId}/claim-requests`) return json([]);
    if (path === `/api/clubs/${clubId}/members/local-player/rating`) {
      if (request.method() === "GET") return json({ rating: state.rating, history: [] });
      const body = request.postDataJSON(); state.writes.push({ path, body });
      if (state.ratingConflict) {
        state.rating = 1175;
        return json({ error: "Rating changed since you opened this panel. Reopen it to review the latest rating." }, 409);
      }
      state.rating = body.rating;
      state.players[0] = { ...state.players[0], elo: state.rating };
      return json({ rating: state.rating });
    }
    if (path === `/api/clubs/${clubId}/members` && request.method() === "POST") {
      const body = request.postDataJSON(); state.writes.push({ path, body });
      const created = { ...player, id: "new-player", name: body.name, gender: body.gender, status: body.status, elo: body.initialRating ?? 1000 };
      state.players.push(created); state.failRefresh = true;
      return json(created, 201);
    }
    if (path === `/api/clubs/${clubId}/members/local-player` && request.method() === "PATCH") {
      const body = request.postDataJSON(); state.writes.push({ path, body });
      state.players[0] = { ...state.players[0], ...body };
      if (state.unknownWrite) return route.abort("failed");
      state.failRefresh = true;
      return json(state.players[0]);
    }
    if (path.endsWith("/password") && request.method() === "POST") { state.writes.push({ path, body: { password: "[redacted]" } }); return json({ success: true }); }
    if (path.endsWith("/invitations")) return json({ invitation: null });
    if (path.includes("/stats") || path.endsWith("/achievements")) state.unrelatedReads.push(path);
    return json({});
  });
  await page.goto(`/club/${clubId}/admin?tab=players${advanced ? "&tools=advanced" : ""}`);
  await expect(page.getByRole("button", { name: "Edit Alex Local", exact: true })).toBeVisible();
  return state;
}

test("confirmed creation closes before refresh failure and a refresh retry never repeats the write", async ({ page }) => {
  const state = await mockAdmin(page);
  await expect(page.getByText("Some Player history is unavailable.")).toBeVisible();
  await page.getByRole("button", { name: "Add player", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Add player", exact: true });
  await editor.getByLabel("Name", { exact: true }).fill("New Player");
  await editor.getByLabel("Gender", { exact: true }).selectOption("FEMALE");
  await editor.getByLabel("Rating", { exact: true }).fill("1450");
  await editor.getByRole("button", { name: "Add player", exact: true }).click();
  await expect(editor).not.toBeVisible();
  await expect(page.getByText("Player added.", { exact: true })).toBeVisible();
  await expect(page.getByText("Saved. Couldn’t refresh the latest details.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit New Player", exact: true })).toBeVisible();
  expect(state.writes).toEqual([{ path: `/api/clubs/${clubId}/members`, body: { name: "New Player", status: "CORE", gender: "FEMALE", initialRating: 1450 } }]);
  state.failRefresh = false;
  await page.getByRole("button", { name: "Refresh details", exact: true }).click();
  await expect(page.getByText("Saved. Couldn’t refresh the latest details.", { exact: true })).not.toBeVisible();
  expect(state.writes).toHaveLength(1);
  expect(state.unrelatedReads).toEqual([]);
});

test("another account's member has club pairing preferences without personal identity edits", async ({ page }) => {
  const state = await mockAdmin(page, true);
  await page.getByRole("button", { name: "Edit Alex Local", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit Alex Local", exact: true });
  await expect(editor).toBeVisible();
  await editor.getByText("Advanced pairing", { exact: true }).click();
  await editor.getByLabel("Mixed-pairing level", { exact: true }).selectOption("LOWER");
  await expect(editor.getByLabel("Rating", { exact: true })).toHaveCount(0);
  await editor.getByRole("combobox", { name: /^Membership/ }).selectOption("OCCASIONAL");
  await editor.getByLabel("Preferred game group", { exact: true }).selectOption("A");
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(editor).not.toBeVisible();
  await expect(page.getByText("Saved. Couldn’t refresh the latest details.", { exact: true })).toBeVisible();
  expect(state.writes).toEqual([{ path: `/api/clubs/${clubId}/members/local-player`, body: { status: "OCCASIONAL", preferredPool: "A", mixedSideOverride: "LOWER", partnerPreference: "OPEN" } }]);
});

test("a lost write response preserves the editor and offers a read-only recovery", async ({ page }) => {
  const state = await mockAdmin(page); state.unknownWrite = true;
  await page.getByRole("button", { name: "Edit Alex Local", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit Alex Local", exact: true });
  await editor.getByLabel("Name", { exact: true }).fill("Edited Alex");
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(editor.getByRole("alert")).toHaveText("Couldn’t confirm the save. Refresh to check.");
  await expect(editor.getByLabel("Name", { exact: true })).toHaveValue("Edited Alex");
  await expect(editor.getByRole("button", { name: "Save changes", exact: true })).toBeDisabled();
  await editor.getByRole("button", { name: "Refresh details", exact: true }).click();
  await expect(editor.getByRole("alert")).toHaveCount(0);
  expect(state.writes).toHaveLength(1);
  await editor.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit Edited Alex", exact: true })).toBeVisible();
});


test("promotion confirms the new role and its sheet stays closable after refresh fails", async ({ page }) => {
  const state = await mockAdmin(page, true);
  await page.getByRole("button", { name: "Edit Alex Local", exact: true }).click();
  await page.getByRole("dialog", { name: "Edit Alex Local", exact: true }).getByRole("button", { name: "Promote to admin", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Change Alex Local to admin?", exact: true });
  await confirmation.getByRole("button", { name: "Confirm change", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit Alex Local", exact: true });
  await expect(editor.getByText("Alex Local is now admin.", { exact: true })).toBeVisible();
  await expect(editor.getByText("Saved. Couldn’t refresh the latest details.", { exact: true })).toBeVisible();
  await expect(editor.getByRole("button", { name: "Close", exact: true })).toBeEnabled();
  await editor.getByRole("button", { name: "Close", exact: true }).click();
  await expect(editor).not.toBeVisible();
  expect(state.writes).toEqual([{ path: `/api/clubs/${clubId}/members/local-player`, body: { role: "ADMIN" } }]);
});

test("old admin bookmarks replace the URL and stay in the current interface", async ({ page }) => {
  await mockAdmin(page, true, true);
  await expect(page).toHaveURL(`/club/${clubId}/admin?tab=players`);
  await expect(page.locator(".product-root")).toBeVisible();
  await expect(page.locator(".specialist-app")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit Alex Local", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit Alex Local", exact: true }).getByText("Advanced pairing", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Emergency password reset", exact: true })).toHaveCount(0);
});

test("old creation bookmark uses the current editor after commit and keeps the new player during a failed refresh", async ({ page }) => {
  const state = await mockAdmin(page, false, true);
  await page.getByRole("button", { name: "Add player", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Add player", exact: true });
  await editor.getByLabel("Name", { exact: true }).fill("Advanced Player");
  await editor.getByLabel("Gender", { exact: true }).selectOption("MALE");
  await editor.getByRole("button", { name: "Add player", exact: true }).click();
  await expect(editor).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Advanced Player", exact: true })).toBeVisible();
  await expect(page.getByText("Saved. Couldn’t refresh the latest details.", { exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].body).toMatchObject({ name: "Advanced Player" });
  state.failRefresh = false;
  await page.getByRole("button", { name: "Refresh details", exact: true }).click();
  await expect(page.getByText("Saved. Couldn’t refresh the latest details.", { exact: true })).not.toBeVisible();
  expect(state.writes).toHaveLength(1);
});

test("rating conflict keeps the draft and reopening uses the latest expected rating", async ({ page }) => {
  const state = await mockAdmin(page, true);
  state.ratingConflict = true;
  await page.getByRole("button", { name: "Edit Alex Local", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit Alex Local", exact: true });
  await editor.getByRole("button", { name: "Adjust rating", exact: true }).click();
  const adjustment = page.getByRole("dialog", { name: "Adjust rating", exact: true });
  await expect(adjustment.getByText("Current rating: 1100", { exact: true })).toBeVisible();
  await adjustment.getByLabel("New rating", { exact: true }).fill("1300");
  await adjustment.getByRole("textbox", { name: /^Reason/ }).fill("Correct initial rating");
  await expect(adjustment.getByLabel("New rating", { exact: true })).toHaveValue("1300");
  await expect(adjustment.getByRole("textbox", { name: /^Reason/ })).toHaveValue("Correct initial rating");
  await expect(adjustment.getByRole("button", { name: "Save adjustment", exact: true })).toBeEnabled();
  await adjustment.getByRole("button", { name: "Save adjustment", exact: true }).click();
  await expect(adjustment.getByRole("alert")).toHaveText("Rating changed since you opened this panel. Reopen it to review the latest rating.");
  await expect(adjustment.getByLabel("New rating", { exact: true })).toHaveValue("1300");
  await expect(adjustment.getByRole("textbox", { name: /^Reason/ })).toHaveValue("Correct initial rating");
  expect(state.writes).toHaveLength(1);
  await adjustment.getByRole("button", { name: "Cancel", exact: true }).click();
  state.ratingConflict = false;
  await editor.getByRole("button", { name: "Adjust rating", exact: true }).click();
  await expect(adjustment.getByText("Current rating: 1175", { exact: true })).toBeVisible();
  await adjustment.getByLabel("New rating", { exact: true }).fill("1300");
  await adjustment.getByRole("textbox", { name: /^Reason/ }).fill("Reviewed current rating");
  await adjustment.getByRole("button", { name: "Save adjustment", exact: true }).click();
  await expect(adjustment).not.toBeVisible();
  await expect(editor.getByText("Rating updated", { exact: true })).toBeVisible();
  expect(state.writes.map(write => write.body)).toEqual([
    { rating: 1300, expectedRating: 1100, reason: "Correct initial rating" },
    { rating: 1300, expectedRating: 1175, reason: "Reviewed current rating" },
  ]);
});


test("global admin recovery stays in the current player editor", async ({ page }) => {
  const state = await mockAdmin(page, true, false, true);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole("button", { name: "Edit Alex Local", exact: true }).click();
  await page.getByRole("button", { name: "Emergency password reset", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Emergency password reset", exact: true });
  await sheet.getByLabel("New password", { exact: true }).fill("FixtureOnly123!");
  await sheet.getByLabel("Confirm password", { exact: true }).fill("FixtureOnly123!");
  await sheet.screenshot({ path: "test-results-admin/current-interface/emergency-recovery-390.png" });
  await sheet.getByRole("button", { name: "Set emergency password", exact: true }).click();
  await expect(sheet).not.toBeVisible();
  await expect(page.getByText("Emergency password set.", { exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(1);
});
