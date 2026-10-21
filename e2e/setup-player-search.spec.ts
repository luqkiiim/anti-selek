import { expect, test } from "@playwright/test";
import { hostClubId, signInAsAdmin } from "./helpers";

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
  test(`player selection clears search and keeps the picked player visible at ${viewport.width}px`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize(viewport);
    await signInAsAdmin(page);
    await page.goto(`/club/${hostClubId}?tab=setup`);
    await page.locator(".setup-roster-summary").click();

    const roster = page.getByRole("dialog", { name: "Who’s playing?", exact: true });
    const search = roster.getByRole("textbox", { name: "Find a player", exact: true });
    const panel = roster.locator(".sheet-panel");
    const rowFor = (name: string) => roster.locator(".setup-roster-list .setup-person").filter({ has: page.getByText(name, { exact: true }) });

    for (const [index, name] of ["Host Player 7", "Host Player 2"].entries()) {
      // Type without clicking the search again after the first selection.
      if (index === 0) await search.fill(name);
      else await page.keyboard.type(name);
      await expect(search).toHaveValue(name);
      await expect(roster.locator(".setup-roster-list .setup-person")).toHaveCount(1);
      await rowFor(name).getByRole("checkbox").check();

      await expect(search).toHaveValue("");
      await expect(search).toBeFocused();
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
    await page.keyboard.type("Host Player 2");
    await rowFor("Host Player 2").getByRole("checkbox").uncheck();
    await expect(search).toHaveValue("Host Player 2");
    await expect(roster.locator(".setup-roster-tools")).toHaveText("1 selected");
  });
}
