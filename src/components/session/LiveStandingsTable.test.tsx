// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  PartnerPreference,
  PlayerGender,
  SessionPool,
  SessionType,
} from "@/types/enums";
import { LiveStandingsTable } from "./LiveStandingsTable";
import type { Player } from "./sessionTypes";

function createPlayer(
  userId: string,
  name: string,
  representingClubId?: string
): Player {
  return {
    userId,
    representingClubId,
    sessionPoints: userId === "u1" ? 1248 : 1216,
    isPaused: false,
    isGuest: false,
    gender: PlayerGender.MALE,
    partnerPreference: PartnerPreference.OPEN,
    pool: SessionPool.A,
    needsMoreRest: false,
    user: {
      id: userId,
      name,
      avatarUrl: null,
      elo: 1000,
    },
  };
}

const players = [
  createPlayer("u1", "Aiman Rahman", "community-1"),
  createPlayer("u2", "Haziq Azman", "community-2"),
];

function renderTable({
  interclubClubToneById,
}: {
  interclubClubToneById?: Record<string, "blue" | "red">;
}) {
  return (
    <LiveStandingsTable
      sessionType={SessionType.ELO}
      players={players}
      currentUserId="viewer"
      pointDiffByUserId={
        new Map([
          ["u1", 28],
          ["u2", -7],
        ])
      }
      getPlayerProfileHref={(player) => `/profile/${player.userId}`}
      calculatePlayerSessionStats={(userId) => ({
        played: 2,
        wins: userId === "u1" ? 2 : 1,
        losses: userId === "u1" ? 0 : 1,
      })}
      poolsEnabled={false}
      interclubClubToneById={interclubClubToneById}
    />
  );
}

describe("LiveStandingsTable", () => {
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

  it("only adds row colors for interclub club tones", async () => {
    await act(async () => {
      root.render(
        renderTable({
          interclubClubToneById: {
            "community-1": "blue",
            "community-2": "red",
          },
        })
      );
    });

    const rows = Array.from(document.body.querySelectorAll("tbody tr"));
    expect(rows[0]?.getAttribute("data-interclub-club-tone")).toBe("blue");
    expect(rows[1]?.getAttribute("data-interclub-club-tone")).toBe("red");
    expect(rows[0]?.querySelector("td")?.className).toContain("bg-sky-50/70");
    expect(rows[1]?.querySelector("td")?.className).toContain("bg-rose-50/70");
    expect(document.body.textContent).not.toContain("Northside");
    expect(document.body.textContent).not.toContain("Anti-SeleK");
  });

  it("keeps existing white rows when no interclub tones are passed", async () => {
    await act(async () => {
      root.render(renderTable({}));
    });

    const firstCell = document.body.querySelector("tbody tr td");
    expect(firstCell?.className).toContain("bg-white");
    expect(firstCell?.className).not.toContain("bg-sky-50/70");
    expect(firstCell?.className).not.toContain("bg-rose-50/70");
  });
});
