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
        communityName: string;
        sessionCode: string;
        playersCount: number;
        courtsCount: number;
      };
    }>;
  });
}

async function getCommunitySnapshot(page: Page, communityId: string) {
  return page.evaluate(async (targetCommunityId) => {
    const response = await fetch(`/api/communities/${targetCommunityId}`);
    if (!response.ok) {
      throw new Error(`Failed to load community: ${response.status}`);
    }

    return response.json() as Promise<{
      community: { name: string };
      communityPulse: {
        metrics: {
          completedTournaments: number;
          recentMatches: number;
        };
        hotPlayers: unknown[];
        rivalries: unknown[];
        partnerships: unknown[];
        latestStory: { session: { name: string } } | null;
      };
    }>;
  }, communityId);
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

async function resetPlayground(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/tutorial-playground/reset", {
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`Failed to reset playground: ${response.status}`);
    }

    return response.json() as Promise<{
      playground: {
        communityId: string;
        communityName: string;
        sessionCode: string;
        playersCount: number;
        courtsCount: number;
      };
    }>;
  });
}

async function getAdminOnboardingProgress(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/tutorial-progress/admin-onboarding");
    if (!response.ok) {
      throw new Error(`Failed to load onboarding progress: ${response.status}`);
    }

    return response.json() as Promise<{
      completedStepIds: string[];
      steps: Array<{ id: string; title: string; completed: boolean }>;
    }>;
  });
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

  test("opens the sandbox tutorial and keeps tutorial UI out of real clubs", async ({
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
    await expect(
      page.getByRole("heading", { name: "Tutorial playground" })
    ).toBeVisible();
    await expect(page.getByText("Getting started", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Go there" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Open players" }).first())
      .toBeVisible();
    await expect(page.getByText("Completed steps (4)")).toHaveCount(0);
    await expect(page.getByText("Review practice players").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const { playground } = await getPlaygroundSummary(page);
    const onboardingProgress = await getAdminOnboardingProgress(page);
    expect(onboardingProgress.completedStepIds).toEqual(["admin-community"]);

    expect(playground.communityName).toBe("Tutorial playground");
    expect(playground.playersCount).toBe(13);
    expect(playground.courtsCount).toBe(2);
    const communitySnapshot = await getCommunitySnapshot(
      page,
      playground.communityId
    );
    expect(communitySnapshot.community.name).toBe("Tutorial playground");
    expect(communitySnapshot.communityPulse.metrics.completedTournaments).toBe(3);
    expect(communitySnapshot.communityPulse.metrics.recentMatches).toBe(18);
    expect(communitySnapshot.communityPulse.hotPlayers.length).toBeGreaterThan(0);
    expect(communitySnapshot.communityPulse.rivalries.length).toBeGreaterThan(0);
    expect(communitySnapshot.communityPulse.partnerships.length).toBeGreaterThan(0);
    expect(communitySnapshot.communityPulse.latestStory?.session.name).toBe(
      "Weekend Cup"
    );

    await expect(page.getByText("Hot players").first()).toBeVisible();
    await expect(page.getByText("Top rivalry").first()).toBeVisible();
    await expect(page.getByText("Partner chemistry").first()).toBeVisible();
    await expect(page.getByText("Latest story").first()).toBeVisible();
    await expect(page.getByText("Power rankings").first()).toBeVisible();
    await expect(page.getByText("Farah").first()).toBeVisible();
    await expect(page.getByText("Danish").first()).toBeVisible();
    await expect(page.getByText("Aiman").first()).toBeVisible();
    await expect(page.getByText("Haziq").first()).toBeVisible();
    await expect(page.getByText("Weekend Cup").first()).toBeVisible();

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

    await page.getByRole("button", { name: "Tournaments" }).click();
    await expect(page.getByText("Past Tournaments").first()).toBeVisible();
    await expect(page.getByText("Warm-up Cup").first()).toBeVisible();
    await expect(page.getByText("Evening Rally").first()).toBeVisible();
    await expect(page.getByText("Weekend Cup").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Rollback" })).toHaveCount(0);

    await page.goto(`/community/${playground.communityId}/admin?tab=players`);
    await expect(page.getByRole("heading", { name: "Club controls" }))
      .toBeVisible();
    await expect
      .poll(async () => (await getAdminOnboardingProgress(page)).completedStepIds)
      .toContain("players");

    await page.goto(`/community/${playground.communityId}?tab=host`);
    await expect(page.getByText("Create a test tournament").first()).toBeVisible();
    await page.locator('[data-tutorial-target="admin-onboarding-session-name"]')
      .filter({ visible: true })
      .fill("Tutorial Walkthrough Test");
    await page.locator('[data-tutorial-target="admin-onboarding-host-players"]')
      .filter({ visible: true })
      .click();
    const playersModal = page
      .getByRole("dialog")
      .filter({ has: page.getByRole("heading", { name: "Add Players" }) });
    await expect(playersModal).toBeVisible();
    await playersModal.getByRole("button", { name: "Select All" }).click();
    await playersModal.getByRole("button", { name: "Done" }).click();
    await page.locator('[data-tutorial-target="admin-onboarding-create-session"]')
      .filter({ visible: true })
      .click();
    await expect(page).toHaveURL(/\/session\/.+/);
    await expect
      .poll(async () => (await getAdminOnboardingProgress(page)).completedStepIds)
      .toContain("host-session");
    await expect
      .poll(async () => (await getAdminOnboardingProgress(page)).completedStepIds)
      .toContain("session-workflow");

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

    const scoreInputs = page.locator('input[data-tutorial-target="admin-onboarding-score-input"]');
    await expect(scoreInputs.first()).toBeVisible();
    await scoreInputs.nth(0).fill("21");
    await scoreInputs.nth(1).fill("15");
    await page.getByRole("button", { name: "Submit Score" }).first().click();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect
      .poll(async () => (await getAdminOnboardingProgress(page)).completedStepIds)
      .toContain("score-match");

    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("button", { name: "End Session" }).click();
    await page.getByRole("button", { name: "Confirm End Session" }).click();
    await expect
      .poll(async () => (await getAdminOnboardingProgress(page)).completedStepIds)
      .toContain("end-session");

    const resetResult = await resetPlayground(page);
    expect(resetResult.playground.communityName).toBe("Tutorial playground");
    expect(resetResult.playground.playersCount).toBe(13);
    expect(resetResult.playground.courtsCount).toBe(2);
    const resetCommunitySnapshot = await getCommunitySnapshot(
      page,
      resetResult.playground.communityId
    );
    expect(resetCommunitySnapshot.community.name).toBe("Tutorial playground");
    expect(resetCommunitySnapshot.communityPulse.metrics.completedTournaments).toBe(3);
    expect(resetCommunitySnapshot.communityPulse.metrics.recentMatches).toBe(18);

    await page.goto(`/community/${hostCommunityId}`);
    await expect(page.getByRole("heading", { name: "E2E Host Club" }))
      .toBeVisible();
    await expect(page.getByText("Tutorial playground")).toHaveCount(0);
    await expect(page.getByText("Getting started", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("admin-onboarding-coachmark")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });
});
