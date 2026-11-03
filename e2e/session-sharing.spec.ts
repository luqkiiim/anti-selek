import { expect, test, type Page, type Route } from "@playwright/test";
import { hostClubId, signInAsAdmin } from "./helpers";

const selectedLocation = { venue: "Community Badminton Hall", venueMapUrl: "https://www.google.com/maps/search/?api=1&query=3.107%2C101.6" };
const suggestions = { suggestions: [{ placeId: "geoapify-hall", name: selectedLocation.venue, address: "Petaling Jaya, Selangor", mapUrl: selectedLocation.venueMapUrl }] };
async function mockLocationSearch(page: Page) {
  await page.route("**/api/clubs/*/locations", route => route.fulfill({ json: suggestions }));
}

test("expanded session details keep every input within the setup form", async ({ page }) => {
  await mockLocationSearch(page);
  await page.setViewportSize({ width: 320, height: 844 });
  await signInAsAdmin(page);
  await page.goto(`/club/${hostClubId}?tab=setup`);
  const details = page.locator(".session-setup details").filter({ has: page.locator("summary", { hasText: /^Session details$/ }) });
  await details.locator("summary").click();
  await page.getByRole("combobox", { name: "Location", exact: true }).fill("Community");
  await page.getByRole("option", { name: /Community Badminton Hall/ }).click();
  await expect(page.getByRole("link", { name: "Open in Google Maps" })).toHaveAttribute("href", selectedLocation.venueMapUrl);
  await page.getByLabel("Court 1 label", { exact: true }).fill("Court 5");
  await page.getByLabel("Court 2 label", { exact: true }).fill("Court 8");
  await page.getByRole("button", { name: "More courts", exact: true }).click();
  await page.getByLabel("Court 3 label", { exact: true }).fill("Removed court");
  await page.getByRole("button", { name: "Fewer courts", exact: true }).click();
  await expect(page.getByLabel("Court 3 label", { exact: true })).toHaveCount(0);
  await page.getByLabel("Starts", { exact: true }).fill("2026-11-04T23:00");
  await page.getByLabel("Duration (hours)", { exact: true }).fill("1.5");
  for (const width of [320, 375, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    const sizes = await details.locator("input, select, textarea").evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect();
      return { label: element.closest("label")?.textContent?.slice(0, 20), width: rect.width, left: rect.left, right: rect.right };
    }));
    for (const size of sizes) {
      expect(size, `${size.label} at ${width}px`).toMatchObject({ left: sizes[0].left, width: sizes[0].width });
      expect(size.right, `${size.label} at ${width}px`).toBeLessThanOrEqual(width);
    }
    expect(await details.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await page.getByLabel("Session name", { exact: true }).fill("Duration setup check");
  await page.screenshot({ path: "test-results/session-setup-details-mobile.png", fullPage: true });
  await page.locator(".setup-roster-summary").click();
  const roster = page.getByRole("dialog", { name: "Who’s playing?", exact: true });
  await roster.getByRole("checkbox").nth(0).check();
  await roster.getByRole("checkbox").nth(1).check();
  await roster.getByRole("button", { name: "Done · 2 players", exact: true }).click();
  const creation = page.waitForResponse(response => new URL(response.url()).pathname === "/api/sessions" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Prepare session", exact: true }).click();
  const response = await creation;
  expect(response.ok()).toBe(true);
  const created = await response.json();
  const snapshot = await (await page.request.get(`/api/sessions/${created.code}`)).json();
  expect(snapshot.details).toMatchObject({ startsAt: "2026-11-04T15:00:00.000Z", endsAt: "2026-11-04T16:30:00.000Z" });
  expect(snapshot.details).toMatchObject(selectedLocation);
  expect(snapshot.courts.map((court: { label: string }) => court.label)).toEqual(["Court 5", "Court 8"]);
  await page.getByRole("button", { name: "Share session", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Session message" })).toHaveValue(/11:00 pm–Thu, 5 Nov 2026, 0:30 am|11:00 pm–Thu, 5 Nov 2026, 12:30 am/);
  await expect(page.getByRole("textbox", { name: "Session message" })).not.toHaveValue(/\nDuration:|1\.5 hours/);
  await expect(page.getByRole("textbox", { name: "Session message" })).toHaveValue(/Courts: Court 5, Court 8/);
});

test("host saves booking details and copies an editable session message on mobile", async ({ page, context }) => {
  await mockLocationSearch(page);
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 320, height: 844 });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => { if (response.status() >= 500) errors.push(`${response.status()} ${response.url()}`); });
  await signInAsAdmin(page);
  const endpoint = "/api/sessions/session-score-e2e";
  expect((await page.request.post(endpoint + "/reset")).ok()).toBe(true);
  const initial = await (await page.request.get(endpoint)).json();
  const oldCourtBooking = { courtNumber: 1, startsAt: "2026-11-04T14:00:00.000Z", endsAt: "2026-11-04T17:00:00.000Z" };
  expect((await page.request.patch(endpoint + "/details", { data: { details: { ...initial.details, courtBookings: [oldCourtBooking] } } })).ok()).toBe(true);
  await page.goto("/session/session-score-e2e");
  await page.getByRole("button", { name: "Share session", exact: true }).click();
  const message = page.getByRole("textbox", { name: "Session message" });
  await expect(message).toHaveValue(/\nPlayers\n1\. /);
  await expect(message).toHaveValue(/Session: https:\/\/antiselek\.com\/session\/session-score-e2e\?tab=courts/);
  await expect(message).not.toHaveValue(/Players \(|anti-selek\.vercel\.app/);
  await expect(message).not.toHaveValue(/undefined|null|Fee:/);
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  await page.getByRole("combobox", { name: "Location", exact: true }).fill("Community");
  await page.getByRole("option", { name: /Community Badminton Hall/ }).click();
  await expect(page.getByRole("combobox", { name: "Location", exact: true })).toHaveValue(selectedLocation.venue);
  await page.getByRole("button", { name: "Edit map link", exact: true }).click();
  await page.getByLabel("Map link", { exact: true }).fill("https://maps.google.com/?q=badminton");
  await page.getByLabel("Court 1 label", { exact: true }).fill("Centre");
  await page.getByLabel("Starts", { exact: true }).fill("2026-11-04T23:00");
  await page.getByLabel("Duration (hours)", { exact: true }).fill("2");
  await expect(page.getByLabel("Ends", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Individual court times", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Court 1 starts", { exact: true })).toHaveCount(0);
  await page.getByLabel("Fee", { exact: true }).fill("RM20 per person");
  await page.getByLabel("Notes", { exact: true }).fill("Bring your own racket.\nArrive 10 minutes early.");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/session-details-320.png", fullPage: true });
  const saveResponse = page.waitForResponse(response => response.url().endsWith(endpoint + "/details") && response.request().method() === "PATCH");
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  expect((await saveResponse).ok()).toBe(true);
  await expect(message).toHaveValue(/Venue: Community Badminton Hall/);
  await expect(message).toHaveValue(/Courts: Centre/);
  await expect(message).toHaveValue(/5 Nov 2026/);
  await expect(message).toHaveValue(/\nWed, 4 Nov 2026, 11:00 pm–Thu, 5 Nov 2026, 1:00 am\n/);
  await expect(message).not.toHaveValue(/When:|Asia\/Kuala_Lumpur|Court 1:|\nDuration:|2 hours/);
  await expect(message).toHaveValue(/Fee: RM20 per person/);
  const snapshot = await (await page.request.get(endpoint)).json();
  expect(snapshot.details).toMatchObject({ startsAt: "2026-11-04T15:00:00.000Z", endsAt: "2026-11-04T17:00:00.000Z", timeZone: "Asia/Kuala_Lumpur", venue: "Community Badminton Hall" });
  expect(snapshot.details.courtBookings).toEqual([oldCourtBooking]);
  expect(snapshot.courts.find((court: { courtNumber: number }) => court.courtNumber === 1).label).toBe("Centre");
  const original = await message.inputValue();
  await message.fill(original + "\nSee you there!");
  await page.getByRole("button", { name: "Copy message", exact: true }).click();
  await expect(page.getByRole("button", { name: "Copied", exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(original + "\nSee you there!");
  await page.screenshot({ path: "test-results/session-share-320.png", fullPage: true });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("link", { name: "Community Badminton Hall" })).toBeVisible();
  await page.getByRole("button", { name: "Share session", exact: true }).click();
  await expect(message).toHaveValue(original);
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  await expect(page.getByLabel("Starts", { exact: true })).toHaveValue("2026-11-04T23:00");
  await expect(page.getByLabel("Duration (hours)", { exact: true })).toHaveValue("2");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Start session", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Session navigation" })).toBeVisible();
  await page.getByRole("button", { name: "More options", exact: true }).click();
  await page.getByRole("button", { name: "Share session", exact: true }).click();
  await expect(message).toHaveValue(/Community Badminton Hall/);
  await page.setViewportSize({ width: 1100, height: 900 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/session-share-1100.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("location lookups preserve other edits, ignore stale responses and select without another request", async ({ page }) => {
  let oldSearch: Route | undefined;
  let laterSearch: Route | undefined;
  const requests: Array<{ query?: string; placeId?: string }> = [];
  await page.route("**/api/clubs/*/locations", async route => {
    const body = route.request().postDataJSON();
    requests.push(body);
    if (body.query === "Old hall") oldSearch = route;
    else if (body.query === "Manual hall") laterSearch = route;
    else await route.fulfill({ json: suggestions });
  });
  await signInAsAdmin(page);
  await page.goto(`/club/${hostClubId}?tab=setup`);
  await page.locator(".session-setup summary").filter({ hasText: /^Session details$/ }).click();
  await page.getByLabel("Court 1 label", { exact: true }).fill("East");
  await page.getByLabel("Notes", { exact: true }).fill("Keep these edits");
  const location = page.getByRole("combobox", { name: "Location", exact: true });
  await location.fill("Old hall");
  await expect.poll(() => !!oldSearch).toBe(true);
  await location.fill("Community");
  const option = page.getByRole("option", { name: /Community Badminton Hall/ });
  await expect(option).toBeVisible();
  await oldSearch!.fulfill({ json: { suggestions: [{ placeId: "geoapify-old", name: "Old hall", address: "Wrong result", mapUrl: selectedLocation.venueMapUrl }] } });
  await expect(option).toBeVisible();
  await expect(page.getByRole("link", { name: "Powered by Geoapify", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "© OpenStreetMap contributors", exact: true })).toBeVisible();
  await location.press("ArrowDown");
  await location.press("Enter");
  await expect(location).toHaveValue(selectedLocation.venue);
  await expect(page.getByRole("link", { name: "Open in Google Maps" })).toHaveAttribute("href", selectedLocation.venueMapUrl);
  expect(requests).toEqual([{ query: "Old hall" }, { query: "Community" }]);
  await expect(page.getByLabel("Court 1 label", { exact: true })).toHaveValue("East");
  await expect(page.getByRole("textbox", { name: "Notes", exact: true })).toHaveValue("Keep these edits");

  await location.fill("Manual hall");
  await expect.poll(() => !!laterSearch).toBe(true);
  await location.fill("");
  await laterSearch!.fulfill({ json: suggestions });
  await expect(location).toHaveValue("");
  await expect(option).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open in Google Maps" })).toHaveCount(0);
  await page.getByRole("button", { name: "Add map link", exact: true }).click();
  await page.getByLabel("Map link", { exact: true }).fill("https://maps.google.com/?q=manual");
  await expect(location).toHaveValue("");
});

test("a slow location lookup shows progress and keeps its results after the field loses focus", async ({ page }) => {
  let pending: Route | undefined;
  let lookups = 0;
  await page.route("**/api/clubs/*/locations", route => { pending = route; lookups += 1; });
  await signInAsAdmin(page);
  await page.goto(`/club/${hostClubId}?tab=setup`);
  await page.locator(".session-setup summary").filter({ hasText: /^Session details$/ }).click();
  const location = page.getByRole("combobox", { name: "Location", exact: true });
  await location.fill("sk arena");
  await expect.poll(() => !!pending).toBe(true);
  await expect(page.getByRole("status").filter({ hasText: "Searching" })).toBeVisible({ timeout: 2_000 });
  await page.getByLabel("Court 1 label", { exact: true }).fill("East");
  await pending!.fulfill({ json: suggestions });
  await location.click();
  await expect(page.getByRole("option", { name: /Community Badminton Hall/ })).toBeVisible();
  expect(lookups).toBe(1);
});

test("a failed location lookup can be retried without changing the search text", async ({ page }) => {
  let lookups = 0;
  await page.route("**/api/clubs/*/locations", route => {
    lookups += 1;
    return route.fulfill(lookups === 1
      ? { status: 504, json: { error: "Location search timed out. Try again." } }
      : { json: suggestions });
  });
  await signInAsAdmin(page);
  await page.goto(`/club/${hostClubId}?tab=setup`);
  await page.locator(".session-setup summary").filter({ hasText: /^Session details$/ }).click();
  await page.getByRole("combobox", { name: "Location", exact: true }).fill("sk arena");
  await expect(page.getByRole("status").filter({ hasText: "timed out" })).toBeVisible();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("option", { name: /Community Badminton Hall/ })).toBeVisible();
  expect(lookups).toBe(2);
});
