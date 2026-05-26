import { expect, test, type Page } from "@playwright/test";
import { hostCommunityId, signInAsAdmin } from "./helpers";

const mobileViewport = { width: 393, height: 727 };

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );

  expect(overflow).toBeLessThanOrEqual(1);
}

async function getPlaygroundSummary(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/tutorial-playground");
    if (!response.ok) {
      throw new Error(`Failed to load tutorial playground: ${response.status}`);
    }

    return response.json() as Promise<{
      playground: {
        communityId: string;
        sessionCode: string;
        playersCount: number;
        courtsCount: number;
      };
    }>;
  });
}

async function getCommunityMembers(page: Page, communityId: string) {
  return page.evaluate(async (targetCommunityId) => {
    const response = await fetch(`/api/communities/${targetCommunityId}/members`);
    if (!response.ok) {
      throw new Error(`Failed to load members: ${response.status}`);
    }

    return response.json() as Promise<
      Array<{ name: string; email: string | null; isClaimed: boolean }>
    >;
  }, communityId);
}

async function getSessionSnapshot(page: Page, sessionCode: string) {
  return page.evaluate(async (code) => {
    const response = await fetch(`/api/sessions/${code}`);
    if (!response.ok) {
      throw new Error(`Failed to load session: ${response.status}`);
    }

    return response.json() as Promise<{
      players: unknown[];
      courts: unknown[];
      isTutorialCommunity: boolean;
    }>;
  }, sessionCode);
}

async function expectCoachmarkInViewport(page: Page) {
  const coachmark = page.getByTestId("admin-onboarding-coachmark");
  await expect(coachmark).toBeVisible();

  const bounds = await coachmark.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });

  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight);
  await expect(page.getByTestId("admin-onboarding-spotlight")).toBeVisible();
  await expectNoHorizontalOverflow(page);
}

test.describe("tutorial playground mobile walkthrough", () => {
  test.use({
    viewport: mobileViewport,
    isMobile: true,
    hasTouch: true,
  });

  test("opens the sandbox tutorial and keeps tutorial UI out of real communities", async ({
    page,
  }) => {
    await signInAsAdmin(page);

    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Open tutorial playground" })
    ).toBeVisible();
    await expect(page.getByText("Getting started", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Open tutorial playground" }).click();
    await expect(page).toHaveURL(/\/community\/.+/);
    await expect(page.getByText("Tutorial playground").first()).toBeVisible();
    await expect(page.getByText("Getting started", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Go there" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Open scoring" }).first())
      .toBeVisible();
    await expect(page.getByText("Completed steps (4)")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const { playground } = await getPlaygroundSummary(page);
    expect(playground.playersCount).toBe(13);
    expect(playground.courtsCount).toBe(2);

    const members = await getCommunityMembers(page, playground.communityId);
    const fakeMembers = members.filter(
      (member) => !member.isClaimed && member.email === null
    );
    expect(fakeMembers.map((member) => member.name).sort()).toEqual([
      "Aiman",
      "Aina",
      "Amir",
      "Danish",
      "Farah",
      "Haziq",
      "Irfan",
      "Mira",
      "Nadia",
      "Rafi",
      "Siti",
      "Yana",
      "Zul",
    ]);
    expect(fakeMembers.every((member) => member.name.length < 9)).toBe(true);

    await page.goto(`/session/${playground.sessionCode}`);
    await expect(page.getByText("Practice rally")).toBeVisible();
    await expect(page.getByText("Tutorial playground").first()).toBeVisible();

    const sessionSnapshot = await getSessionSnapshot(
      page,
      playground.sessionCode
    );
    expect(sessionSnapshot.isTutorialCommunity).toBe(true);
    expect(sessionSnapshot.players).toHaveLength(13);
    expect(sessionSnapshot.courts).toHaveLength(2);

    await expectCoachmarkInViewport(page);
    await expect(page.getByTestId("admin-onboarding-coachmark")).toContainText(
      "Score a practice match"
    );
    await expect(page.getByText("Tutorial hint")).toBeVisible();

    await page.goto(`/community/${hostCommunityId}`);
    await expect(page.getByRole("heading", { name: "E2E Host Club" }))
      .toBeVisible();
    await expect(page.getByText("Tutorial playground")).toHaveCount(0);
    await expect(page.getByText("Getting started", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("admin-onboarding-coachmark")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });
});
