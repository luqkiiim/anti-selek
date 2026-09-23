// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LiveSessionStandings, type LiveSessionStandingRow } from "./LiveSessionStandings";
import { deriveLiveSessionPlayerStats } from "./deriveLiveSessionStandings";
import type { CompletedMatchInfo } from "@/components/session/sessionTypes";

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

  it("shows the compact standings columns in the supplied order", async () => {
    await act(async () => {
      root.render(
        <LiveSessionStandings
          rows={[row("a", "Aiman Rahman", "A"), row("b", "Haziq Azman", "B")]}
          groupsEnabled={false}
        />,
      );
    });

    const headers = Array.from(container.querySelectorAll("thead th"));
    expect(headers.map((header) => header.textContent)).toEqual(["", "Player", "Pts", "Diff", "MP", "W / L"]);
    expect(headers[0]?.getAttribute("aria-label")).toBe("Rank");
    const rows = Array.from(container.querySelectorAll("tbody tr"));
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain("Aiman Rahman");
    expect(rows[1]?.textContent).toContain("Haziq Azman");
    expect(Array.from(rows[0]?.children ?? []).map((cell, index) =>
      index === 1 ? cell.querySelector("[title]")?.textContent : cell.textContent,
    )).toEqual(["1", "Aiman Rahman", "8", "+6", "3", "2 / 1"]);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("uses Ladder for net-win sessions", async () => {
    await act(async () => {
      root.render(
        <LiveSessionStandings rows={[row("a", "Aiman Rahman", "A")]} groupsEnabled={false} scoreLabel="net wins" />,
      );
    });

    expect(Array.from(container.querySelectorAll("thead th")).map((header) => header.textContent)).toEqual([
      "", "Player", "Ladder", "Diff", "MP", "W / L",
    ]);
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

    const rows = Array.from(container.querySelectorAll("tbody tr"));
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain("Haziq Azman");
    expect(rows[0]?.querySelector('[aria-label="Rank 1"]')?.textContent).toBe("1");
    expect(rows[1]?.textContent).toContain("Mira Lee");
    expect(container.textContent).not.toContain("Aiman Rahman");
  });

  it("opens eligible member profiles directly and keeps guest rows static", async () => {
    const openedMemberIds: string[] = [];
    await act(async () => {
      root.render(
        <LiveSessionStandings
          rows={[
            { ...row("member", "Aiman Rahman", "A"), avatarUrl: "https://example.test/aiman.jpg" },
            row("guest", "Guest Player", "A", false),
          ]}
          groupsEnabled={false}
          onOpenMember={(userId) => openedMemberIds.push(userId)}
        />,
      );
    });

    const memberButton = container.querySelector<HTMLButtonElement>('button[aria-label="View Aiman Rahman\'s profile"]');
    expect(memberButton).not.toBeNull();
    const avatar = memberButton?.querySelector<HTMLImageElement>("img");
    expect(avatar?.getAttribute("src")).toBe("https://example.test/aiman.jpg");
    await act(async () => avatar?.click());
    await act(async () => memberButton?.click());
    expect(openedMemberIds).toEqual(["member", "member"]);
    expect(container.querySelector('button[aria-label="View Guest Player\'s profile"]')).toBeNull();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).toContain("Guest Player");
  });
});
