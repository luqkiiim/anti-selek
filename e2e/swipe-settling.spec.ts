import { expect, test, type CDPSession, type Locator, type Page } from "@playwright/test";
import { scoreSessionCode, signInAsAdmin } from "./helpers";
import { expectCurrentUi } from "./current-ui";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

type Measurement = { elapsed: number; error: number; stableFrames: number; frames?: Array<{ time: number; left: number; moving: boolean }> };
type MeasuredPager = HTMLElement & { swipeMeasurement?: Promise<Measurement> };

async function measure(pager: Locator, index: number, trigger: "pointerup" | "click" | "touchend" = "pointerup") {
  await pager.evaluate((element, { index, trigger }) => {
    const node = element as MeasuredPager;
    node.swipeMeasurement = new Promise((resolve) => {
      const missingRelease = setTimeout(() => resolve({ elapsed: 1000, error: Math.abs(node.scrollLeft - index * node.clientWidth), stableFrames: 0 }), 1000);
      const start = () => {
        clearTimeout(missingRelease);
        const released = performance.now();
        let alignedAt = 0;
        let stableFrames = 0;
        const frames: NonNullable<Measurement["frames"]> = [];
        const frame = () => {
          frames.push({ time: performance.now() - released, left: node.scrollLeft, moving: node.hasAttribute("data-swipe-moving") });
          const error = Math.abs(node.scrollLeft - index * node.clientWidth);
          if (error < 4) {
            if (!stableFrames) alignedAt = performance.now();
            stableFrames++;
          } else stableFrames = 0;
          if (stableFrames >= 3 || performance.now() - released > 700) {
            resolve({ elapsed: (alignedAt || performance.now()) - released, error, stableFrames, frames });
          } else requestAnimationFrame(() => setTimeout(frame, 0));
        };
        // Read after the controller's callbacks update this frame, rather than
        // measuring the previous position when our callback runs first.
        requestAnimationFrame(() => setTimeout(frame, 0));
      };
      // Capture before the controller or React handlers start the release animation.
      (trigger === "click" ? document : node).addEventListener(trigger, start, { once: true, capture: true });
    });
  }, { index, trigger });
}

async function expectMeasured(pager: Locator) {
  const result = await pager.evaluate((node) => (node as MeasuredPager).swipeMeasurement!);
  if (result.elapsed > 300 || result.error >= 4) console.log("Settling trace:", JSON.stringify(result));
  expect(result.error).toBeLessThan(4);
  expect(result.stableFrames).toBeGreaterThanOrEqual(3);
  expect(result.elapsed).toBeLessThanOrEqual(300);
  test.info().annotations.push({ type: "settling", description: `${result.elapsed.toFixed(1)} ms to stable alignment` });
}

async function swipe(page: Page, client: CDPSession, pager: Locator, from: number, to: number, vertical = false, steps = 8, atY?: number) {
  const box = await pager.boundingBox();
  if (!box) throw new Error("Pager has no swipe area");
  const top = Math.max(0, box.y);
  const bottom = Math.min(box.y + box.height, page.viewportSize()!.height - 125);
  const y = atY ?? top + (vertical ? Math.min(220, (bottom - top) * 0.6) : Math.min(65, (bottom - top) * 0.2));
  const x = box.x + box.width * from;
  const end = box.x + box.width * to;
  const point = (x: number, y: number) => ({ x, y, radiusX: 2, radiusY: 2, force: 1 });
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(x, y)] });
  for (let i = 1; i <= steps; i++) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove", touchPoints: [point(x + (end - x) * i / steps, y - (vertical ? 140 * i / steps : 0))],
    });
    await page.waitForTimeout(16);
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function openModernClub(page: Page) {
  await page.goto("/club/community-score-e2e?tab=club");
  await expectCurrentUi(page, "club");
  await expect(page.getByRole("button", { name: "Continue hosting", exact: true })).toBeVisible();
}

const scenarios = [
  { name: "current club pager", kind: "club", nav: "Main navigation", initial: "Club", next: "Sessions", index: 0 },
  { name: "current session pager", kind: "session", nav: "Session navigation", initial: "Courts", next: "Standings", index: 1 },
];

for (const scenario of scenarios) {
  test(`${scenario.name} settles real touch swipes within 300 ms`, async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "Native swipe injection uses Chromium CDP; WebKit compatibility is tested separately.");
    test.setTimeout(120_000);
    await signInAsAdmin(page);
    if (scenario.kind === "club") {
      await openModernClub(page);
    } else {
      await page.goto(`/session/${scoreSessionCode}?tab=courts`);
      await expectCurrentUi(page, "session");
      await expect(page.getByRole("button", { name: "Court 1 options" })).toBeVisible();
    }
    const nav = page.getByRole("navigation", { name: scenario.nav, exact: true });
    const pager = page.locator('[data-swipe-pager="true"]').first();
    const selected = (name: string) => expect(nav.getByRole("button", { name, exact: true })).toHaveAttribute("aria-current", "page");
    await selected(scenario.initial);
    await expect(pager).toBeVisible();
    await expect.poll(() => pager.evaluate((node, index) => Math.abs(node.scrollLeft - node.clientWidth * index), scenario.index)).toBeLessThan(4);
    const client = await context.newCDPSession(page);
    if (scenario.kind === "session") {
      await page.getByRole("textbox", { name: "Team 1 score", exact: true }).fill("13");
    }

    await measure(pager, scenario.index + 1);
    await swipe(page, client, pager, 0.85, 0.18);
    await expectMeasured(pager);
    await selected(scenario.next);

    // A strong return flick must still move exactly one tab.
    let returnY: number | undefined;
    if (scenario.kind === "session") {
      const standings = page.getByRole("table", { name: "Player standings" });
      await expect(standings).toBeVisible();
      const row = await standings.locator("tbody tr").first().boundingBox();
      if (!row) throw new Error("Current standings rows are not visible");
      returnY = row.y + row.height / 2;
    }
    await measure(pager, scenario.index);
    await swipe(page, client, pager, 0.12, 0.9, false, 3, returnY);
    await expectMeasured(pager);
    await selected(scenario.initial);
    if (scenario.kind === "session") {
      await expect(page.getByRole("textbox", { name: "Team 1 score", exact: true })).toHaveValue("13");
      await expect(pager.locator(".pager-page[inert]")).toHaveCount(2);
    }

    await measure(pager, scenario.index);
    await swipe(page, client, pager, 0.55, 0.51);
    await expectMeasured(pager);
    await selected(scenario.initial);
    if (scenario.kind === "club") {
      // The current minimal club page can fit at 844px; use a short phone viewport.
      await page.setViewportSize({ width: 390, height: 550 });
      await expect.poll(() => pager.locator(".pager-page").first().evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
    }
    await swipe(page, client, pager, 0.5, 0.49, true);
    await selected(scenario.initial);
    if (scenario.kind === "club") {
      await expect.poll(() => pager.locator(".pager-page").first().evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    }

    await page.setViewportSize({ width: 768, height: 1024 });
    await expect.poll(() => pager.evaluate((node, index) => Math.abs(node.scrollLeft - node.clientWidth * index), scenario.index)).toBeLessThan(4);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await nav.getByRole("button", { name: scenario.next, exact: true }).click();
    await expect.poll(() => pager.evaluate((node, index) => Math.abs(node.scrollLeft - node.clientWidth * index), scenario.index + 1)).toBeLessThan(4);
    await selected(scenario.next);
    await expectCurrentUi(page, scenario.kind as "club" | "session");
    await page.screenshot({ path: `test-results/swipe-current-${scenario.kind}-768.png` });
    await client.detach();
  });
}

test("session swipes handle diagonal starts and reversals without dead gestures or skipped tabs", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "This regression uses native touch through Chromium CDP.");
  await signInAsAdmin(page);
  await page.goto(`/session/${scoreSessionCode}?tab=courts`);
  await expectCurrentUi(page, "session");
  await expect(page.getByRole("button", { name: "Court 1 options" })).toBeVisible();
  const pager = page.locator(".product-root .page-pager");
  const nav = page.getByRole("navigation", { name: "Session navigation", exact: true });
  const client = await context.newCDPSession(page);
  const box = await pager.boundingBox();
  if (!box) throw new Error("Session pager is not visible");
  const y = box.y + 55;
  const point = (x: number, y: number) => ({ x, y, radiusX: 3, radiusY: 3, force: 1 });
  const start = (x: number) => client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(x, y)] });
  const move = async (x: number, dy = 0, delay = 16) => {
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point(x, y + dy)] });
    if (delay) await page.waitForTimeout(delay);
  };
  const end = () => client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const expectSelected = (tab: string) => expect(nav.getByRole("button", { name: tab, exact: true })).toHaveAttribute("aria-current", "page");
  const resetCourts = async () => {
    await nav.getByRole("button", { name: "Courts", exact: true }).click();
    await expectSelected("Courts");
    await expect.poll(() => pager.evaluate(node => Math.abs(node.scrollLeft - node.clientWidth))).toBeLessThan(1);
    await expect(pager).not.toHaveAttribute("data-swipe-moving", "true");
  };

  await resetCourts();
  await start(300);
  await move(291, 8);
  for (const x of [270, 240, 210, 180, 150, 120]) await move(x, 8);
  // A tiny diagonal wobble must not disable the rest of a clearly horizontal drag.
  expect(await pager.evaluate(node => node.scrollLeft - node.clientWidth)).toBeGreaterThan(140);
  await measure(pager, 2);
  await end();
  await expectMeasured(pager);
  await expectSelected("Standings");

  await resetCourts();
  await start(250);
  for (const x of [220, 190, 160]) await move(x);
  await page.waitForTimeout(100);
  await move(190, 0, 6);
  await move(220, 0, 0);
  // Returning toward Courts while still on its right must not skip to Players.
  expect(await pager.evaluate(node => node.scrollLeft)).toBeGreaterThan(await pager.evaluate(node => node.clientWidth));
  await measure(pager, 1);
  await end();
  await expectMeasured(pager);
  await expectSelected("Courts");

  await resetCourts();
  await start(250);
  await move(220, 0, 0);
  await end();
  // Interrupt before the first tab transition can visually reach the next page.
  await start(150);
  const interrupted = await pager.evaluate(node => ({
    left: node.scrollLeft, width: node.clientWidth,
    tab: document.querySelector('nav[aria-label="Session navigation"] [aria-current="page"]')?.textContent,
  }));
  expect(interrupted.tab).toBe("Standings");
  expect(interrupted.left).toBeLessThan(interrupted.width * 1.5);
  await move(180, 0, 0);
  await move(210, 0, 0);
  await measure(pager, 1);
  await end();
  await expectMeasured(pager);
  await expectSelected("Courts");
  await client.detach();
});

test("WebKit finger TouchEvents survive pointer cancellation in both directions", async ({ page, browserName }) => {
  test.skip(browserName !== "webkit", "WebKit TouchEvent compatibility; this is not physical iPhone input.");
  await signInAsAdmin(page);
  await page.goto(`/session/${scoreSessionCode}?tab=courts`);
  await expectCurrentUi(page, "session");
  await expect(page.getByRole("button", { name: "Court 1 options" })).toBeVisible();
  const pager = page.locator(".product-root .page-pager");
  const nav = page.getByRole("navigation", { name: "Session navigation", exact: true });
  const box = await pager.boundingBox();
  if (!box) throw new Error("Session pager is not visible");
  const y = box.y + 55;
  for (const [from, to, index, tab] of [[300, 120, 2, "Standings"], [100, 280, 1, "Courts"]] as const) {
    const initialLeft = await pager.evaluate(node => node.scrollLeft);
    const point = (x: number) => ({ identifier: 7, clientX: x, clientY: y });
    await pager.dispatchEvent("pointerdown", { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: from, clientY: y });
    await pager.dispatchEvent("touchstart", { touches: [point(from)], changedTouches: [point(from)] });
    await pager.dispatchEvent("pointercancel", { pointerId: 1, pointerType: "touch", isPrimary: true });
    for (let i = 1; i <= 6; i++) {
      const touch = point(from + (to - from) * i / 6);
      await pager.dispatchEvent("touchmove", { touches: [touch], changedTouches: [touch], cancelable: true });
      await page.waitForTimeout(16);
    }
    const draggedLeft = await pager.evaluate(node => node.scrollLeft);
    expect(Math.abs(draggedLeft - initialLeft)).toBeGreaterThan(140);
    expect(Math.sign(draggedLeft - initialLeft)).toBe(Math.sign(from - to));
    await measure(pager, index, "touchend");
    await pager.dispatchEvent("touchend", { touches: [], changedTouches: [point(to)] });
    await expectMeasured(pager);
    await expect(nav.getByRole("button", { name: tab, exact: true })).toHaveAttribute("aria-current", "page");
  }
});

test("WebKit keeps shared pager animations bounded, interrupts taps, and respects reduced motion", async ({ page, browserName }) => {
  test.skip(browserName !== "webkit", "Safari compatibility coverage; native iOS swipes still require a physical device.");
  test.setTimeout(120_000);
  await signInAsAdmin(page);
  await openModernClub(page);
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  const pager = page.locator('[data-swipe-pager="true"]');
  await measure(pager, 1, "click");
  await nav.getByRole("button", { name: "Sessions", exact: true }).click();
  await expectMeasured(pager);
  await nav.getByRole("button", { name: "Profile", exact: true }).click();
  await nav.getByRole("button", { name: "Club", exact: true }).click();
  await expect.poll(() => pager.evaluate((node) => node.scrollLeft)).toBeLessThan(4);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await nav.getByRole("button", { name: "Sessions", exact: true }).click();
  await expect.poll(() => pager.evaluate((node) => Math.abs(node.scrollLeft - node.clientWidth))).toBeLessThan(4);
});
