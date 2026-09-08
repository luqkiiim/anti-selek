// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildAdminOnboardingProgress } from "@/lib/adminOnboarding";
import { AdminOnboardingChecklist } from "./AdminOnboardingChecklist";

let root: Root;
let container: HTMLDivElement;
let panel: HTMLElement;
const progress = buildAdminOnboardingProgress({
  completedStepIds: ["admin-community", "players", "host-session", "session-workflow", "score-match"],
  dismissedAt: null, primaryClubId: "club", primarySessionCode: "practice",
  hasAdminClub: true, hasScoredMatch: true, hasCompletedSession: false,
});

beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  panel = document.createElement("section");
  const target = document.createElement("button");
  target.dataset.tutorialTarget = "admin-onboarding-end-session";
  const bounds = { top: 100, left: 100, right: 200, bottom: 150, width: 100, height: 50 } as DOMRect;
  target.getClientRects = () => [bounds] as unknown as DOMRectList;
  target.getBoundingClientRect = () => bounds;
  target.scrollIntoView = vi.fn();
  panel.appendChild(target);
  document.body.append(panel, container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.useRealTimers();
});

async function renderGuide(onStepAction = vi.fn(() => true), spotlightEnabled = true) {
  await act(async () => root.render(<AdminOnboardingChecklist
    progress={progress} onDismiss={vi.fn()} onReopen={vi.fn()} onCompleteStep={vi.fn()}
    onStepAction={onStepAction} spotlightEnabled={spotlightEnabled}
  />));
  await act(async () => { await vi.advanceTimersByTimeAsync(400); });
  return onStepAction;
}

it("opens the local settings action instead of navigating to the same page", async () => {
  const onStepAction = await renderGuide();
  const link = container.querySelector<HTMLAnchorElement>('[data-testid="admin-onboarding-coachmark"] a')!;
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  await act(async () => { link.dispatchEvent(event); });
  expect(event.defaultPrevented).toBe(true);
  expect(onStepAction).toHaveBeenCalledWith(expect.objectContaining({ id: "end-session", href: "/session/practice#settings" }));
});

it("removes the spotlight when its panel becomes inaccessible", async () => {
  await renderGuide();
  expect(container.querySelector('[data-testid="admin-onboarding-spotlight"]')).not.toBeNull();
  await act(async () => {
    panel.setAttribute("aria-hidden", "true");
    await vi.advanceTimersByTimeAsync(50);
  });
  expect(container.querySelector('[data-testid="admin-onboarding-spotlight"]')).toBeNull();
});

it("keeps the checklist usable while a settings dialog suppresses the spotlight", async () => {
  await renderGuide(vi.fn(() => true), false);
  expect(container.textContent).toContain("Open tournament settings");
  expect(container.querySelector('[data-testid="admin-onboarding-spotlight"]')).toBeNull();
});
