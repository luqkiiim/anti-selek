// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PartnerPreference,
  PlayerGender,
  SessionPool,
  SessionType,
} from "@/types/enums";
import type { Player } from "@/components/session/sessionTypes";
import { SessionFinishView } from "./SessionFinishView";

function createPlayer({
  userId,
  name,
  avatarUrl = null,
  sessionPoints = 0,
  isGuest = false,
}: {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  sessionPoints?: number;
  isGuest?: boolean;
}): Player {
  return {
    userId,
    sessionPoints,
    isPaused: false,
    isGuest,
    gender: PlayerGender.UNSPECIFIED,
    partnerPreference: PartnerPreference.OPEN,
    pool: SessionPool.A,
    needsMoreRest: false,
    user: { id: userId, name, avatarUrl, elo: 1000 },
  };
}

const players = [
  createPlayer({
    userId: "u1",
    name: "Aiman Rahman",
    avatarUrl: "https://cdn.test/aiman.jpg",
    sessionPoints: 84,
  }),
  createPlayer({ userId: "u2", name: "Siti Noor", sessionPoints: 80 }),
  createPlayer({ userId: "u3", name: "Farah Lim", sessionPoints: 76 }),
  createPlayer({ userId: "u4", name: "Amir Guest", isGuest: true, sessionPoints: 72 }),
];

const pointDiffByUserId = new Map<string, number>([
  ["u1", 31],
  ["u2", 18],
  ["u3", -2],
  ["u4", -8],
]);

const playerStatsByUserId = new Map([
  ["u1", { played: 8, wins: 7, losses: 1 }],
  ["u2", { played: 8, wins: 6, losses: 2 }],
  ["u3", { played: 8, wins: 5, losses: 3 }],
  ["u4", { played: 8, wins: 4, losses: 4 }],
]);

const baseProps = {
  sessionName: "Thursday Social",
  sessionType: SessionType.POINTS,
  players,
  pointDiffByUserId,
  playerStatsByUserId,
};

describe("SessionFinishView", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    vi.useRealTimers();
    container.remove();
    document.body.innerHTML = "";
  });

  it("shows a settled recap by default with ranked winners and readable standings", async () => {
    await act(async () => root.render(<SessionFinishView {...baseProps} sessionDate="2026-09-20" />));

    expect(container.querySelector("h1")?.textContent).toBe("That's a wrap!");
    expect(container.textContent).toContain("Thursday Social");
    expect(container.textContent).toContain("20 Sep 2026");
    expect(container.querySelector("[data-celebrating]")?.getAttribute("data-celebrating")).toBe("false");
    expect(container.querySelector('[aria-label="Top finishers"]')?.textContent).toContain("Aiman Rahman");
    expect(container.querySelector('[aria-label="Top finishers"]')?.textContent).toContain("+31 diff");
    expect(container.querySelector("thead")?.textContent).toContain("Pts");
    const rows = Array.from(container.querySelectorAll("tbody tr"));
    expect(rows).toHaveLength(4);
    expect(rows[0]?.textContent).toContain("Aiman Rahman");
    expect(rows[3]?.textContent).toContain("Amir Guest");
    expect(container.querySelector('button[aria-label="View Amir Guest\'s profile"]')).toBeNull();
  });

  it("starts on a requested celebration and can replay after the recap has settled", async () => {
    vi.useFakeTimers();
    await act(async () => root.render(<SessionFinishView {...baseProps} celebrate={false} />));
    expect(container.querySelector("[data-celebrating]")?.getAttribute("data-celebrating")).toBe("false");

    await act(async () => root.render(<SessionFinishView {...baseProps} celebrate />));
    await act(async () => { vi.advanceTimersByTime(0); });
    expect(container.querySelector("[data-celebrating]")?.getAttribute("data-celebrating")).toBe("true");

    await act(async () => { vi.advanceTimersByTime(2200); });
    expect(container.querySelector("[data-celebrating]")?.getAttribute("data-celebrating")).toBe("false");

    const replayButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Replay winner celebration"]',
    );
    expect(replayButton).not.toBeNull();
    await act(async () => replayButton?.click());
    expect(container.querySelector("[data-celebrating]")?.getAttribute("data-celebrating")).toBe("true");
    vi.useRealTimers();
  });

  it("shows the ladder score label and net win score while retaining the winner record", async () => {
    await act(async () => {
      root.render(
        <SessionFinishView
          {...baseProps}
          sessionType={SessionType.LADDER}
          players={[players[0]]}
          onShareResults={() => undefined}
          sharingResults
        />,
      );
    });

    expect(container.querySelector("thead")?.textContent).toContain("Ladder");
    expect(container.querySelector("tbody tr")?.children[2]?.textContent).toBe("+6");
    expect(container.querySelector('[aria-label="Top finishers"]')?.textContent).toContain("7-1");
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Replay winner celebration"]')).not.toBeNull();
    expect(container.querySelector<HTMLButtonElement>('button:disabled')?.textContent).toContain("Preparing recap…");
  });

  it("keeps passed highlights compact and invokes the recap share callback", async () => {
    let shareCount = 0;
    await act(async () => {
      root.render(
        <SessionFinishView
          {...baseProps}
          highlights={[
            { id: "wins", label: "Most wins", name: "Aiman Rahman", value: "7 wins" },
            { id: "diff", label: "Best difference", name: "Siti Noor", value: "+18" },
            { id: "ignored", label: "Other", name: "Farah Lim", value: "5 wins" },
          ]}
          onShareResults={() => { shareCount += 1; }}
        />,
      );
    });

    expect(container.querySelectorAll('[aria-label="Session highlights"] article')).toHaveLength(2);
    const shareButton = container.querySelector<HTMLButtonElement>('button:not([aria-label])');
    expect(shareButton?.textContent).toContain("Share recap");
    await act(async () => shareButton?.click());
    expect(shareCount).toBe(1);
  });

  it("does not crown an empty session and preserves the optional interclub slot", async () => {
    await act(async () => {
      root.render(
        <SessionFinishView
          {...baseProps}
          players={players.slice(0, 2)}
          playerStatsByUserId={new Map([
            ["u1", { played: 0, wins: 0, losses: 0 }],
            ["u2", { played: 0, wins: 0, losses: 0 }],
          ])}
          highlights={[{ id: "wins", label: "Most wins", name: "Aiman Rahman", value: "0 wins" }]}
        >
          <aside>Club A 3–2 Club B</aside>
        </SessionFinishView>,
      );
    });

    expect(container.querySelector('[aria-label="Top finishers"]')).toBeNull();
    expect(container.querySelector('[aria-label="Session highlights"]')).toBeNull();
    expect(container.textContent).toContain("No completed games yet.");
    expect(container.textContent).toContain("Club A 3–2 Club B");
    expect(container.querySelector("thead")?.textContent).toContain("Pts");
  });

  it("renders an empty result message when there are no players", async () => {
    await act(async () => root.render(<SessionFinishView {...baseProps} players={[]} />));
    expect(container.textContent).toContain("No final results have been recorded.");
    expect(container.querySelector('[aria-label="Top finishers"]')).toBeNull();
  });
});
