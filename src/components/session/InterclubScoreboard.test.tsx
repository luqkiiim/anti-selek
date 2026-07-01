// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { InterclubScoreboard } from "./InterclubScoreboard";
import type { InterclubScoreboard as InterclubScoreboardModel } from "@/app/session/[code]/sessionViewModel";

const scoreboard: InterclubScoreboardModel = {
  rows: [
    {
      clubId: "community-1",
      clubName: "Northside Club",
      avatarUrl: "https://cdn.test/northside.png",
      matchWins: 3,
      pointsFor: 104,
      pointsAgainst: 96,
      pointDiff: 8,
    },
    {
      clubId: "community-2",
      clubName: "Anti-SeleK Club",
      avatarUrl: null,
      matchWins: 2,
      pointsFor: 96,
      pointsAgainst: 104,
      pointDiff: -8,
    },
  ],
  leaderClubId: "community-1",
  resultLabel: "Northside Club leads",
  statusLabel: "Live",
};

describe("InterclubScoreboard", () => {
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
    document.body.innerHTML = "";
  });

  it("renders the approved club-vs-club card with image and initials fallback", async () => {
    await act(async () => {
      root.render(<InterclubScoreboard scoreboard={scoreboard} />);
    });

    const text = document.body.textContent ?? "";
    expect(text).toContain("Club vs Club standings");
    expect(text).toContain("Live");
    expect(text).toContain("Northside Club");
    expect(text).toContain("Anti-SeleK Club");
    expect(text).toContain("3");
    expect(text).toContain("2");
    expect(text).toContain("Match wins");
    expect(text).toContain("Points");
    expect(text).toContain("Point diff");
    expect(text).toContain("+8");
    expect(text).toContain("-8");

    const image = document.body.querySelector(
      'img[alt="Northside Club logo"]'
    ) as HTMLImageElement | null;
    expect(image?.src).toBe("https://cdn.test/northside.png");
    expect(text).toContain("AS");

    expect(text).not.toContain("Rubbers");
    expect(text).not.toContain("Ahead");
    expect(text).not.toContain("Leading");
    expect(text).not.toContain("Chasing");
  });
});
