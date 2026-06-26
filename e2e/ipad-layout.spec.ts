import { expect, test } from "@playwright/test";

import {
  createStartedHostSession,
  hostClubId,
  signInAsAdmin,
} from "./helpers";

test.describe("iPad club navigation layout", () => {
  test.use({
    viewport: { width: 768, height: 1024 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });

  test("club hub keeps phone navigation in portrait", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto(`/club/${hostClubId}`);

    await expect(
      page.getByRole("heading", { name: "E2E Host Club" })
    ).toBeVisible();

    const bottomNav = page.locator('nav[aria-label="Club navigation"]');
    const pager = page.locator("div.app-swipe-track.overflow-x-auto").first();
    const desktopTabs = page.locator('[aria-label="Club section tabs"]');

    await expect(bottomNav).toBeVisible();
    await expect(pager).toBeVisible();
    await expect(desktopTabs).toBeHidden();

    const pagerState = await pager.evaluate((node) => {
      const track = node.firstElementChild;
      if (!track) return null;

      return {
        pagerWidth: node.clientWidth,
        firstPanelWidth:
          track.firstElementChild instanceof HTMLElement
            ? track.firstElementChild.getBoundingClientRect().width
            : 0,
        overflowX: getComputedStyle(node).overflowX,
        scrollSnapType: getComputedStyle(track).scrollSnapType,
      };
    });

    expect(pagerState?.overflowX).toMatch(/auto|scroll/);
    expect(pagerState?.scrollSnapType).toContain("mandatory");
    expect(
      Math.abs(
        (pagerState?.firstPanelWidth ?? 0) - (pagerState?.pagerWidth ?? 0)
      )
    ).toBeLessThan(4);
  });
});

test.describe("iPad session navigation layout", () => {
  test.use({
    viewport: { width: 1024, height: 768 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });

  test("session keeps phone navigation while allowing two-column landscape courts", async ({
    page,
  }) => {
    await signInAsAdmin(page);
    await createStartedHostSession(page, {
      sessionName: "E2E iPad Landscape Session",
      courtCount: 2,
    });

    await expect(
      page.locator('nav[aria-label="Session navigation"]')
    ).toBeVisible();
    await expect(page.getByText("Court board")).toBeVisible();

    const courtCards = page.locator("[data-live-court-card]");
    await expect(courtCards).toHaveCount(2);

    const firstBox = await courtCards.nth(0).boundingBox();
    const secondBox = await courtCards.nth(1).boundingBox();

    expect(firstBox).not.toBeNull();
    expect(secondBox).not.toBeNull();
    expect(
      Math.abs((firstBox?.y ?? 0) - (secondBox?.y ?? 0))
    ).toBeLessThan(8);
    expect(secondBox?.x ?? 0).toBeGreaterThan(
      (firstBox?.x ?? 0) + (firstBox?.width ?? 0) * 0.8
    );
  });
});

test.describe("desktop club navigation layout", () => {
  test.use({
    viewport: { width: 1280, height: 900 },
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
  });

  test("club hub switches to desktop tabs at xl", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto(`/club/${hostClubId}`);

    await expect(
      page.getByRole("heading", { name: "E2E Host Club" })
    ).toBeVisible();

    await expect(page.locator('[aria-label="Club section tabs"]')).toBeVisible();
    await expect(page.locator('nav[aria-label="Club navigation"]')).toBeHidden();
    await expect(
      page.locator("div.app-swipe-track.overflow-x-auto").first()
    ).toBeHidden();
  });
});
