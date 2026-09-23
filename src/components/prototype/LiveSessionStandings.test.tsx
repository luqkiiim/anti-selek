// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSessionStandings, type LiveSessionStandingRow } from "./LiveSessionStandings";
import { deriveLiveSessionPlayerStats } from "./deriveLiveSessionStandings";
import type { CompletedMatchInfo } from "@/components/session/sessionTypes";

vi.mock("./Primitives", () => ({
  Avatar: ({ name }: { name: string }) => <span aria-label={name} />,
  Sheet: ({ open, title, children, onClose }: { open: boolean; title: string; children: React.ReactNode; onClose: () => void }) => open ? <div role="dialog" aria-label={title}><button onClick={onClose}>Close</button>{children}</div> : null,
}));

function row(
  userId: string,
  name: string,
  group: "A" | "B",
  canOpenMember = true,
): LiveSessionStandingRow {
  return {
    userId,
    name,
    group,
    score: 8,
    matchesPlayed: 3,
    wins: 2,
    losses: 1,
    pointDiff: 6,
    canOpenMember,
  };
}

function match(
  id: string,
  status: string,
  team1Score: number | undefined,
  team2Score: number | undefined,
): CompletedMatchInfo {
  return {
    id,
    status,
    team1User1Id: "a",
    team1User2Id: "b",
    team2User1Id: "c",
    team2User2Id: "d",
    team1Score,
    team2Score,
    winnerTeam:
      team1Score !== undefined && team2Score !== undefined && team1Score < team2Score
        ? 2
        : 1,
  };
}

describe("deriveLiveSessionPlayerStats", () => {
  it("counts only completed matches with valid scores", () => {
    const stats = deriveLiveSessionPlayerStats(
      ["a", "b", "c", "d", "unused"],
      [
        match("completed-win", "COMPLETED", 21, 15),
        match("completed-loss", "COMPLETED", 18, 21),
        match("pending", "PENDING_APPROVAL", 21, 2),
        match("unscored", "COMPLETED", undefined, undefined),
        match("tied", "COMPLETED", 10, 10),
      ],
    );

    expect(stats.get("a")).toEqual({ matchesPlayed: 2, wins: 1, losses: 1, pointDiff: 3 });
    expect(stats.get("c")).toEqual({ matchesPlayed: 2, wins: 1, losses: 1, pointDiff: -3 });
    expect(stats.get("unused")).toEqual({ matchesPlayed: 0, wins: 0, losses: 0, pointDiff: 0 });
  });

  it("counts a player at most once when malformed match data repeats their id", () => {
    const stats = deriveLiveSessionPlayerStats(
      ["a"],
      [{
        ...match("duplicate", "COMPLETED", 21, 13),
        team1User2Id: "a",
      }],
    );

    expect(stats.get("a")).toEqual({ matchesPlayed: 1, wins: 1, losses: 0, pointDiff: 8 });
  });
});

describe("LiveSessionStandings", () => {
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
    container.remove();
    document.body.innerHTML = "";
  });

  it("keeps input rank order and defers secondary stats until a row is opened", async () => {
    expect(typeof LiveSessionStandings).toBe("function");
    await act(async () => {
      root.render(
        <LiveSessionStandings
          rows={[row("a", "Aiman Rahman", "A"), row("b", "Haziq Azman", "B")]}
          groupsEnabled={false}
        />,
      );
    });

    const entries = Array.from(container.querySelectorAll("li"));
    expect(entries).toHaveLength(2);
    expect(entries[0]?.textContent).toContain("Aiman Rahman");
    expect(entries[1]?.textContent).toContain("Haziq Azman");
    expect(container.textContent).toContain("2W · 1L");
    expect(container.textContent).not.toContain("Matches played");
    await act(async () => entries[0].querySelector<HTMLButtonElement>("button")?.click());
    const detail = container.querySelector('[role="dialog"]');
    expect(detail?.textContent).toContain("Matches played");
    expect(detail?.textContent).toContain("+6");
  });

  it("filters and reranks rows by the selected group", async () => {
    await act(async () => {
      root.render(
        <LiveSessionStandings
          rows={[row("a", "Aiman Rahman", "A"), row("b", "Haziq Azman", "B"), row("c", "Mira Lee", "B")]}
          groupsEnabled
          groupAName="Competitive"
          groupBName="Social"
        />,
      );
    });

    const filter = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Social",
    );
    await act(async () => filter?.click());

    const entries = Array.from(container.querySelectorAll("li"));
    expect(entries).toHaveLength(2);
    expect(entries[0]?.textContent).toContain("Haziq Azman");
    expect(entries[0]?.querySelector('[aria-label="Rank 1"]')?.textContent).toBe("1");
    expect(entries[1]?.textContent).toContain("Mira Lee");
    expect(container.textContent).not.toContain("Aiman Rahman");
  });

  it("opens a member profile from details while keeping guest details read-only", async () => {
    const onOpenMember = vi.fn();
    await act(async () => {
      root.render(
        <LiveSessionStandings
          rows={[row("member", "Aiman Rahman", "A"), row("guest", "Guest Player", "A", false)]}
          groupsEnabled={false}
          onOpenMember={onOpenMember}
        />,
      );
    });

    const memberButton = container.querySelector<HTMLButtonElement>('button[aria-label="View Aiman Rahman\'s session stats"]');
    expect(memberButton).not.toBeNull();
    await act(async () => memberButton?.click());
    expect(onOpenMember).not.toHaveBeenCalled();
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find(button => button.textContent === "View profile")?.click());
    expect(onOpenMember).toHaveBeenCalledWith("member");
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="View Guest Player\'s session stats"]')?.click());
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("Matches played");
    expect(container.querySelector('[role="dialog"]')?.textContent).not.toContain("View profile");
  });
});
