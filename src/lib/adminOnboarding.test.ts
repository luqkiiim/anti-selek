import { describe, expect, it } from "vitest";
import { buildAdminOnboardingProgress } from "./adminOnboarding";
describe("current practice destinations", () => {
  it("retains persisted step identifiers and progress with current destinations", () => {
    const progress = buildAdminOnboardingProgress({ completedStepIds: ["players", "host-session"], dismissedAt: "2026-01-01", primaryClubId: "club-1", primarySessionCode: "SESSION1", hasAdminClub: true, hasScoredMatch: true, hasCompletedSession: false });
    expect(progress.dismissed).toBe(true);
    expect(progress.completedStepIds).toEqual(["admin-community", "players", "host-session", "score-match"]);
    expect(progress.steps.find(step => step.id === "host-session")?.href).toBe("/club/club-1?tab=setup");
    expect(progress.steps.find(step => step.id === "end-session")?.href).toBe("/session/SESSION1?tab=courts");
    expect(progress.steps.find(step => step.id === "reset-cleanup")?.href).toBe("/club/club-1/admin?tab=settings");
  });
});
