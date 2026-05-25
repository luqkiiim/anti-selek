import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminOnboardingChecklist } from "./AdminOnboardingChecklist";
import type { AdminOnboardingProgressPayload } from "@/lib/adminOnboarding";

function createProgress(
  overrides?: Partial<AdminOnboardingProgressPayload>
): AdminOnboardingProgressPayload {
  return {
    tutorialKey: "admin-onboarding",
    visible: true,
    dismissed: false,
    completedStepIds: ["admin-community"],
    primaryCommunityId: "community-1",
    primarySessionCode: "ABC123",
    steps: [
      {
        id: "admin-community",
        title: "Open your community",
        detail: "Use an admin community as the home base.",
        actionLabel: "Open",
        href: "/community/community-1",
        targetId: "admin-onboarding-dashboard-community",
        coachmark: "Open your admin community to continue.",
        completed: true,
        autoCompleted: true,
        manual: false,
      },
      {
        id: "reset-cleanup",
        title: "Optional cleanup",
        detail: "Know where reset community lives.",
        actionLabel: "Settings",
        href: "/community/community-1/admin?tab=settings",
        targetId: "admin-onboarding-reset-community",
        coachmark: "Use reset only when you want to clear test history.",
        completed: false,
        autoCompleted: false,
        manual: true,
      },
    ],
    ...overrides,
  };
}

describe("AdminOnboardingChecklist", () => {
  it("renders a compact checklist with progress and actions", () => {
    const markup = renderToStaticMarkup(
      <AdminOnboardingChecklist
        progress={createProgress()}
        onDismiss={() => undefined}
        onReopen={() => undefined}
        onCompleteStep={() => undefined}
      />
    );

    expect(markup).toContain("Getting started");
    expect(markup).toContain("1/2 admin steps");
    expect(markup).toContain("Press here next");
    expect(markup).toContain("Open your community");
    expect(markup).toContain("Optional cleanup");
    expect(markup).toContain("Mark reviewed");
    expect(markup).toContain('href="/community/community-1/admin?tab=settings"');
  });

  it("renders a small reopen action when dismissed", () => {
    const markup = renderToStaticMarkup(
      <AdminOnboardingChecklist
        progress={createProgress({ dismissed: true })}
        onDismiss={() => undefined}
        onReopen={() => undefined}
        onCompleteStep={() => undefined}
      />
    );

    expect(markup).toContain("Getting started");
    expect(markup).not.toContain("1/2 admin steps");
    expect(markup).not.toContain("Mark reviewed");
  });

  it("does not render when hidden or loading", () => {
    const hiddenMarkup = renderToStaticMarkup(
      <AdminOnboardingChecklist
        progress={createProgress({ visible: false })}
        onDismiss={() => undefined}
        onReopen={() => undefined}
        onCompleteStep={() => undefined}
      />
    );
    const loadingMarkup = renderToStaticMarkup(
      <AdminOnboardingChecklist
        progress={createProgress()}
        loading
        onDismiss={() => undefined}
        onReopen={() => undefined}
        onCompleteStep={() => undefined}
      />
    );

    expect(hiddenMarkup).toBe("");
    expect(loadingMarkup).toBe("");
  });
});
