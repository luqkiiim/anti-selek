import { expect, test, type Locator, type Page } from "@playwright/test";
import { hostClubId, signInAsAdmin } from "./helpers";

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
  test(`player selection keeps search unfocused and the picked player visible at ${viewport.width}px`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize(viewport);
    await signInAsAdmin(page);
    await page.goto(`/club/${hostClubId}?tab=setup`);
    await page.locator(".setup-roster-summary").click();

    const roster = page.getByRole("dialog", { name: "Who’s playing?", exact: true });
    const search = roster.getByRole("textbox", { name: "Find a player", exact: true });
    const panel = roster.locator(".sheet-panel");
    const rowFor = (name: string) => roster.locator(".setup-roster-list .setup-person").filter({ has: page.getByText(name, { exact: true }) });

    await expect(search).not.toBeFocused();
    const unfilteredPlayer = rowFor("Host Player 6").getByRole("checkbox");
    await unfilteredPlayer.check();
    await expect(unfilteredPlayer).toBeChecked();
    await expect(search).not.toBeFocused();
    await unfilteredPlayer.uncheck();
    await expect(search).not.toBeFocused();
    await expect(roster.locator(".setup-roster-tools")).toHaveText("0 selected");

    for (const [index, name] of ["Host Player 7", "Host Player 2"].entries()) {
      await search.click();
      await expect(search).toBeFocused();
      await page.keyboard.type(name);
      await expect(search).toHaveValue(name);
      await expect(roster.locator(".setup-roster-list .setup-person")).toHaveCount(1);
      await rowFor(name).getByRole("checkbox").check();

      await expect(search).toHaveValue("");
      await expect(search).not.toBeFocused();
      await expect(roster.locator(".setup-roster-list .setup-person")).toHaveCount(8);
      await expect(rowFor(name).getByRole("checkbox")).toBeChecked();
      await expect(roster.locator(".setup-roster-tools")).toHaveText(`${index + 1} selected`);
      await expect.poll(async () => {
        const picked = await rowFor(name).boundingBox();
        const header = await roster.locator(".setup-roster-header").boundingBox();
        const done = await roster.locator(".setup-roster-done").boundingBox();
        return !!picked && !!header && !!done && picked.y >= header.y + header.height - 1 && picked.y + picked.height <= done.y + 1;
      }).toBe(true);
      if (index === 0) await expect.poll(() => panel.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
    }

    await expect(rowFor("Host Player 7").getByRole("checkbox")).toBeChecked();
    await search.click();
    await page.keyboard.type("Host Player 2");
    await rowFor("Host Player 2").getByRole("checkbox").uncheck();
    await expect(search).toHaveValue("Host Player 2");
    await expect(search).not.toBeFocused();
    await expect(roster.locator(".setup-roster-tools")).toHaveText("1 selected");
  });
}

async function simulateVisibleViewport(page: Page, height: number | null, offsetTop = 0) {
  await page.evaluate(({ height, offsetTop }) => {
    const viewport = window.visualViewport!;
    const previousHeight = viewport.height;
    const previousTop = viewport.offsetTop;
    if (height === null) {
      Reflect.deleteProperty(viewport, "height");
      Reflect.deleteProperty(viewport, "offsetTop");
    } else {
      Object.defineProperties(viewport, {
        height: { configurable: true, value: height },
        offsetTop: { configurable: true, value: offsetTop },
      });
    }
    if (viewport.height !== previousHeight) viewport.dispatchEvent(new Event("resize"));
    if (viewport.offsetTop !== previousTop) viewport.dispatchEvent(new Event("scroll"));
  }, { height, offsetTop });
}

async function expectTappableAboveKeyboard(target: Locator) {
  // Measure before Playwright can scroll the control into view on click.
  await expect.poll(() => target.evaluate((element) => {
    const viewport = window.visualViewport!;
    const rect = element.getBoundingClientRect();
    const center = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return rect.top >= viewport.offsetTop && rect.bottom <= viewport.offsetTop + viewport.height &&
      element.contains(center);
  }), { message: "expected the entire result to be visible and tappable above the keyboard" }).toBe(true);
}

test("setup and live player search stay above the on-screen keyboard", async ({ page, hasTouch }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsAdmin(page);
  await page.goto(`/club/${hostClubId}?tab=setup`);
  await page.getByLabel("Session name", { exact: true }).fill("Keyboard viewport session");
  await page.locator(".setup-roster-summary").click();

  const setup = page.getByRole("dialog", { name: "Who’s playing?", exact: true });
  const setupSearch = setup.getByRole("textbox", { name: "Find a player" });
  await setupSearch.focus();
  await simulateVisibleViewport(page, 300);
  await setupSearch.fill("Host Player 1");
  const setupMatch = setup.locator(".setup-person-select").filter({ hasText: "Host Player 1" });
  await expectTappableAboveKeyboard(setupMatch);
  const panel = setup.locator(".sheet-panel");
  const panelBottom = () => panel.evaluate((element) => Math.round(element.getBoundingClientRect().bottom));
  await expect.poll(panelBottom).toBe(300);
  await simulateVisibleViewport(page, 300, 32);
  await expect.poll(panelBottom).toBe(332);
  await expectTappableAboveKeyboard(setupMatch);
  if (hasTouch) await setupMatch.tap();
  else await setupMatch.click();
  await expect(setupMatch.getByRole("checkbox")).toBeChecked();
  await expect(setupSearch).toHaveValue("");
  await expect(setupSearch).toBeFocused();

  await setupSearch.fill("New Keyboard Player");
  const addNew = setup.getByRole("button", { name: "Add “New Keyboard Player”", exact: true });
  await expectTappableAboveKeyboard(addNew);
  if (hasTouch) await addNew.tap();
  else await addNew.click();
  const name = setup.getByRole("textbox", { name: "Name", exact: true });
  await expect(name).toHaveValue("New Keyboard Player");
  await name.blur();
  await simulateVisibleViewport(page, null);
  await expect.poll(panelBottom).toBe(844);
  await setup.getByRole("button", { name: "Cancel", exact: true }).click();
  await setupSearch.fill("Host Player 7");
  await setup.getByRole("checkbox", { name: /Host Player 7/ }).check();
  await setup.getByRole("button", { name: "Done · 2 players" }).click();
  await page.getByRole("button", { name: "Prepare session", exact: true }).click();
  await page.getByRole("button", { name: "Start session", exact: true }).click();
  await page.getByRole("navigation", { name: "Session navigation" }).getByRole("button", { name: "Players", exact: true }).click();
  await page.getByRole("button", { name: "Add players", exact: true }).click();

  const live = page.getByRole("dialog", { name: "Add players", exact: true });
  const liveSearch = live.getByRole("searchbox", { name: "Search club members" });
  await liveSearch.focus();
  await simulateVisibleViewport(page, 360, 24);
  await liveSearch.fill("Host Player 2");
  const liveMatch = live.getByRole("article").filter({ hasText: "Host Player 2" });
  const add = liveMatch.getByRole("button", { name: "Add to session", exact: true });
  await expectTappableAboveKeyboard(liveMatch);
  await expectTappableAboveKeyboard(add);
  if (hasTouch) await add.tap();
  else await add.click();
  await simulateVisibleViewport(page, null);
  const players = page.getByRole("dialog", { name: "Players", exact: true });
  await expect(players.getByText("Host Player 2", { exact: true })).toBeVisible();
});
