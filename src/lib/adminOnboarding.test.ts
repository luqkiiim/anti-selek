import { describe, expect, it } from "vitest";
import { getHostSessionOnboardingOverride } from "./adminOnboarding";

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
    });
  });
});
