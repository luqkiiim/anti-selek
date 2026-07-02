// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClubOverviewPulsePanel } from "./ClubOverviewPulsePanel";
import type { ClubPageSession } from "./clubTypes";

function makeTournament(
  overrides: Partial<ClubPageSession> = {}
): ClubPageSession {
  return {
    id: "session-1",
    code: "SESSION1",
    name: "Friday Club Night",
    type: "POINTS",
    status: "ACTIVE",
    isTest: false,
    createdAt: "2026-07-01T00:00:00.000Z",
    players: [{ user: { id: "other-user", name: "Other Player" } }],
    ...overrides,
  };
}

describe("ClubOverviewPulsePanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  async function renderPanel({
    activeTournaments = [makeTournament()],
    currentUserId = "current-user",
    onJoinTournament = vi.fn(),
    onOpenTournament = vi.fn(),
    viewerIsQuickAccess = false,
  }: {
    activeTournaments?: ClubPageSession[];
    currentUserId?: string | null;
    onJoinTournament?: (code: string) => void;
    onOpenTournament?: (code: string) => void;
    viewerIsQuickAccess?: boolean;
  } = {}) {
    await act(async () => {
      root.render(
        <ClubOverviewPulsePanel
          clubId="club-a"
          clubPulse={null}
          activeTournaments={activeTournaments}
          currentUserId={currentUserId}
          viewerIsQuickAccess={viewerIsQuickAccess}
          onJoinTournament={onJoinTournament}
          onOpenTournament={onOpenTournament}
          onOpenTournaments={vi.fn()}
          onOpenPlayerProfile={vi.fn()}
        />
      );
    });

    return { onJoinTournament, onOpenTournament };
  }

  function findButton(label: string) {
    return Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === label
    ) as HTMLButtonElement | undefined;
  }

  async function clickButton(label: string) {
    const button = findButton(label);
    expect(button).toBeTruthy();

    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  it("uses view as the non-participant primary action", async () => {
    const onOpenTournament = vi.fn();
    const onJoinTournament = vi.fn();

    await renderPanel({ onOpenTournament, onJoinTournament });

    await clickButton("View");

    expect(onOpenTournament).toHaveBeenCalledWith("SESSION1");
    expect(onJoinTournament).not.toHaveBeenCalled();

    await clickButton("Join");

    expect(onJoinTournament).toHaveBeenCalledWith("SESSION1");
  });

  it("keeps participants on the existing open action", async () => {
    const onOpenTournament = vi.fn();
    const onJoinTournament = vi.fn();

    await renderPanel({
      onOpenTournament,
      onJoinTournament,
      activeTournaments: [
        makeTournament({
          players: [
            { user: { id: "current-user", name: "Current Player" } },
          ],
        }),
      ],
    });

    await clickButton("Open");

    expect(onOpenTournament).toHaveBeenCalledWith("SESSION1");
    expect(findButton("Join")).toBeUndefined();
    expect(onJoinTournament).not.toHaveBeenCalled();
  });

  it("disables pending collab join while keeping view available", async () => {
    const onOpenTournament = vi.fn();
    const onJoinTournament = vi.fn();

    await renderPanel({
      onOpenTournament,
      onJoinTournament,
      activeTournaments: [
        makeTournament({
          collabStatus: "PENDING",
        }),
      ],
    });

    await clickButton("View");

    expect(onOpenTournament).toHaveBeenCalledWith("SESSION1");
    const pendingButton = findButton("Pending");
    expect(pendingButton?.disabled).toBe(true);
    expect(onJoinTournament).not.toHaveBeenCalled();
  });

  it("hides join for quick-access viewers while keeping view available", async () => {
    const onOpenTournament = vi.fn();
    const onJoinTournament = vi.fn();

    await renderPanel({
      viewerIsQuickAccess: true,
      onOpenTournament,
      onJoinTournament,
    });

    await clickButton("View");

    expect(onOpenTournament).toHaveBeenCalledWith("SESSION1");
    expect(findButton("Join")).toBeUndefined();
    expect(onJoinTournament).not.toHaveBeenCalled();
  });
});
