import { describe, expect, it } from "vitest";
import {
  buildAdminOnboardingProgress,
  getHostSessionOnboardingOverride,
} from "./adminOnboarding";

describe("getHostSessionOnboardingOverride", () => {
  it("points to the tournament name before the create button can be used", () => {
    expect(
      getHostSessionOnboardingOverride({
        newSessionName: "",
        selectedPlayerCount: 0,
        guestCount: 0,
      })
    ).toMatchObject({
      stepId: "host-session",
      targetId: "admin-onboarding-session-name",
      actionLabel: "Name tournament",
    });
  });

  it("points to player selection after a tournament name exists", () => {
    expect(
      getHostSessionOnboardingOverride({
        newSessionName: "Tutorial Test",
        selectedPlayerCount: 0,
        guestCount: 0,
      })
    ).toMatchObject({
      stepId: "host-session",
      targetId: "admin-onboarding-host-players",
      actionLabel: "Choose players",
    });
  });

  it("points to session creation only after setup has a name and roster", () => {
    expect(
      getHostSessionOnboardingOverride({
        newSessionName: "Tutorial Test",
        selectedPlayerCount: 4,
        guestCount: 0,
      })
    ).toMatchObject({
      stepId: "host-session",
      targetId: "admin-onboarding-create-session",
      actionLabel: "Create test session",
    });
  });
});

describe("buildAdminOnboardingProgress", () => {
  it("uses specific action labels for tutorial destinations", () => {
    const progress = buildAdminOnboardingProgress({
      completedStepIds: [],
      dismissedAt: null,
      primaryCommunityId: "community-1",
      primarySessionCode: "SESSION1",
      hasAdminCommunity: true,
      hasRosterPlayers: false,
      hasAnySession: false,
      hasRosteredSession: false,
      hasScoredMatch: false,
      hasCompletedSession: false,
    });

    expect(progress.steps.map((step) => step.actionLabel)).toEqual([
      "Open tutorial playground",
      "Open players",
      "Open host setup",
      "Open live session",
      "Open scoring",
      "Open session settings",
      "Reset playground",
    ]);
    expect(progress.steps.map((step) => step.title)).toEqual([
      "Open playground",
      "Review practice players",
      "Create a test tournament",
      "Explore the ongoing session",
      "Score a practice match",
      "End the test session",
      "Reset playground",
    ]);
  });
});
