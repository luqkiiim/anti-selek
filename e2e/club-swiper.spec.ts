import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
} from "@playwright/test";

import { hostClubId, signInAsAdmin } from "./helpers";

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});

test("club mobile swiper pages one tab at a time", async ({
  context,
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto(`/club/${hostClubId}`);
  await expect(
    page.getByRole("heading", { name: "E2E Host Club" })
  ).toBeVisible();

  const nav = page.locator('nav[aria-label="Club navigation"]');
  const pager = page.locator("div.app-swipe-track.overflow-x-auto").first();
  await expect(nav).toBeVisible();
  await expect(pager).toBeVisible();

  const client = await context.newCDPSession(page);

  await expectActiveTab(nav, "Overview");

  await swipePager(page, client, pager, {
    name: "hard-left-1",
    fromX: 0.88,
    toX: 0.14,
  });
  await expectActiveTab(nav, "Tournaments");
  await expectPagerHeightToMatchActiveSection(pager, "tournaments", {
    expectInactivePanelTaller: true,
  });

  await swipePager(page, client, pager, {
    name: "hard-left-2",
    fromX: 0.88,
    toX: 0.14,
  });
  await expectActiveTab(nav, "Host setup");

  await swipePager(page, client, pager, {
    name: "hard-left-3",
    fromX: 0.88,
    toX: 0.14,
  });
  await expectActiveTab(nav, "Leaderboard");

  await swipePager(page, client, pager, {
    name: "hard-left-4",
    fromX: 0.88,
    toX: 0.14,
  });
  await expectActiveTab(nav, "Player profile");

  await swipePager(page, client, pager, {
    name: "extra-left-at-edge",
    fromX: 0.88,
    toX: 0.14,
  });
  await expectActiveTab(nav, "Player profile");

  await swipePager(page, client, pager, {
    name: "hard-right-1",
    fromX: 0.14,
    toX: 0.88,
  });
  await expectActiveTab(nav, "Leaderboard");

  const beforeWeakSwipe = await getActiveTab(nav);
  await swipePager(page, client, pager, {
    name: "weak-left",
    fromX: 0.55,
    toX: 0.47,
  });
  expect(await getActiveTab(nav)).toBe(beforeWeakSwipe);

  const beforeVerticalDrag = await getActiveTab(nav);
  await swipePager(page, client, pager, {
    name: "vertical-drag",
    fromX: 0.5,
    toX: 0.48,
    fromY: 0.2,
    toY: 0.75,
  });
  expect(await getActiveTab(nav)).toBe(beforeVerticalDrag);

  const pagerState = await pager.evaluate((node) => {
    const track = node.firstElementChild;
    if (!track) return null;

    const pagerStyles = getComputedStyle(node);
    const trackStyles = getComputedStyle(track);
    return {
      clientWidth: node.clientWidth,
      overflowX: pagerStyles.overflowX,
      scrollLeft: node.scrollLeft,
      scrollSnapType: trackStyles.scrollSnapType,
    };
  });

  expect(pagerState?.overflowX).toMatch(/auto|scroll/);
  expect(pagerState?.scrollSnapType).toContain("mandatory");
  expect(
    Math.abs(
      (pagerState?.scrollLeft ?? 0) - (pagerState?.clientWidth ?? 0) * 3
    )
  ).toBeLessThan(4);
});

test("club mobile swiper handles fast flicks without skipping tabs", async ({
  context,
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto(`/club/${hostClubId}`);
  await expect(
    page.getByRole("heading", { name: "E2E Host Club" })
  ).toBeVisible();

  const nav = page.locator('nav[aria-label="Club navigation"]');
  const pager = page.locator("div.app-swipe-track.overflow-x-auto").first();
  await expect(nav).toBeVisible();
  await expect(pager).toBeVisible();

  const client = await context.newCDPSession(page);

  await expectActiveTab(nav, "Overview");

  await swipePager(page, client, pager, {
    name: "fast-left-1",
    fromX: 0.92,
    toX: 0.08,
    steps: 3,
    frameDelayMs: 6,
  });
  await expectActiveTab(nav, "Tournaments");

  await swipePager(page, client, pager, {
    name: "fast-left-2",
    fromX: 0.92,
    toX: 0.08,
    steps: 3,
    frameDelayMs: 6,
  });
  await expectActiveTab(nav, "Host setup");

  await swipePager(page, client, pager, {
    name: "fast-right-1",
    fromX: 0.08,
    toX: 0.92,
    steps: 3,
    frameDelayMs: 6,
  });
  await expectActiveTab(nav, "Tournaments");
});

async function getActiveTab(nav: Locator) {
  return nav.locator('[aria-current="page"]').getAttribute("title");
}

async function expectActiveTab(nav: Locator, expectedTab: string) {
  await expect.poll(() => getActiveTab(nav)).toBe(expectedTab);
}

async function expectPagerHeightToMatchActiveSection(
  pager: Locator,
  section: string,
  {
    expectInactivePanelTaller = false,
  }: {
    expectInactivePanelTaller?: boolean;
  } = {}
) {
  const heights = await pager.evaluate((node, activeSection) => {
    const panels = Array.from(
      node.querySelectorAll<HTMLElement>("[data-club-section]")
    );
    const activePanel = panels.find(
      (panel) => panel.dataset.clubSection === activeSection
    );

    return {
      activeHeight: activePanel?.getBoundingClientRect().height ?? 0,
      maxPanelHeight: Math.max(
        0,
        ...panels.map((panel) => panel.getBoundingClientRect().height)
      ),
      pagerHeight: node.getBoundingClientRect().height,
    };
  }, section);

  expect(Math.abs(heights.pagerHeight - heights.activeHeight)).toBeLessThan(4);

  if (expectInactivePanelTaller) {
    expect(heights.maxPanelHeight - heights.activeHeight).toBeGreaterThan(24);
  }
}

async function swipePager(
  page: Page,
  client: CDPSession,
  pager: Locator,
  {
    name,
    fromX,
    toX,
    fromY = 0.45,
    toY = fromY,
    steps = 9,
    frameDelayMs = 16,
  }: {
    name: string;
    fromX: number;
    toX: number;
    fromY?: number;
    toY?: number;
    steps?: number;
    frameDelayMs?: number;
  }
) {
  await test.step(name, async () => {
    const box = await pager.boundingBox();
    if (!box) {
      throw new Error("Club pager is not visible.");
    }

    const viewport = page.viewportSize();
    if (!viewport) {
      throw new Error("Mobile viewport is not available.");
    }

    const visibleTop = Math.max(box.y, 0);
    const visibleBottom = Math.min(box.y + box.height, viewport.height - 128);
    if (visibleBottom <= visibleTop) {
      throw new Error("Club pager has no visible swipe area.");
    }

    const startX = box.x + box.width * fromX;
    const endX = box.x + box.width * toX;
    const visibleHeight = visibleBottom - visibleTop;
    const startY = visibleTop + visibleHeight * fromY;
    const endY = visibleTop + visibleHeight * toY;

    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [buildTouchPoint(startX, startY)],
    });

    for (let step = 1; step <= steps; step += 1) {
      const progress = step / steps;
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          buildTouchPoint(
            startX + (endX - startX) * progress,
            startY + (endY - startY) * progress
          ),
        ],
      });
      if (frameDelayMs > 0) {
        await page.waitForTimeout(frameDelayMs);
      }
    }

    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await page.waitForTimeout(320);
  });
}

function buildTouchPoint(x: number, y: number) {
  return {
    x,
    y,
    radiusX: 2,
    radiusY: 2,
    force: 1,
  };
}
