// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CurrentTournamentsPanel } from "./CurrentTournamentsPanel";

type PanelProps = Parameters<typeof CurrentTournamentsPanel>[0];
type Tournament = PanelProps["tournaments"][number];

function makeTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: "session-1",
    code: "SESSION1",
    name: "Friday Club Night",
    type: "POINTS",
    status: "ACTIVE",
    players: [{ user: { id: "other-user" } }],
    ...overrides,
  };
}

describe("CurrentTournamentsPanel", () => {
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

  async function renderPanel(overrides: Partial<PanelProps> = {}) {
    const props: PanelProps = {
      tournaments: [makeTournament()],
      currentUserId: "current-user",
      currentClubId: "club-a",
      canManageClub: false,
      onOpenTournament: vi.fn(),
      onJoinTournament: vi.fn(),
      onReviewCollabTournament: vi.fn(),
      ...overrides,
    };

    await act(async () => {
      root.render(<CurrentTournamentsPanel {...props} />);
    });

    return props;
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

  it("lets non-participants view an active session without joining", async () => {
    const onOpenTournament = vi.fn();
    const onJoinTournament = vi.fn();

    await renderPanel({ onOpenTournament, onJoinTournament });

    await clickButton("View");

    expect(onOpenTournament).toHaveBeenCalledWith("SESSION1");
    expect(onJoinTournament).not.toHaveBeenCalled();

    await clickButton("Join");

    expect(onJoinTournament).toHaveBeenCalledWith("SESSION1");
  });

  it("keeps participant sessions as open links without a join action", async () => {
    await renderPanel({
      tournaments: [
        makeTournament({
          players: [{ user: { id: "current-user" } }],
        }),
      ],
    });

    expect(container.querySelector('a[href="/session/SESSION1"]')).toBeTruthy();
    expect(findButton("Join")).toBeUndefined();
  });

  it("keeps pending collab join disabled while view stays available", async () => {
    const onOpenTournament = vi.fn();
    const onJoinTournament = vi.fn();

    await renderPanel({
      onOpenTournament,
      onJoinTournament,
      tournaments: [
        makeTournament({
          collabStatus: "PENDING",
          clubs: [
            {
              id: "club-a",
              name: "Northside",
              role: "HOST",
              status: "ACCEPTED",
            },
            {
              id: "club-b",
              name: "Southside",
              role: "PARTNER",
              status: "PENDING",
            },
          ],
        }),
      ],
    });

    await clickButton("View");

    expect(onOpenTournament).toHaveBeenCalledWith("SESSION1");
    const pendingButton = findButton("Pending");
    expect(pendingButton?.disabled).toBe(true);
    expect(onJoinTournament).not.toHaveBeenCalled();
  });
});
