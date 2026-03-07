import { describe, expect, it } from "vitest";
import {
  collectGuestUserIds,
  computeRollbackEloDeltas,
  type CompletedMatchEloChange,
} from "./sessionLifecycle";

describe("session lifecycle rollback", () => {
  it("reverses completed-match Elo deltas for core players and ignores guests", () => {
    const matches: CompletedMatchEloChange[] = [
      {
        team1User1Id: "A",
        team1User2Id: "GUEST_X",
        team2User1Id: "B",
        team2User2Id: "C",
        team1EloChange: 8,
        team2EloChange: -8,
      },
      {
        team1User1Id: "A",
        team1User2Id: "B",
        team2User1Id: "C",
        team2User2Id: "D",
        team1EloChange: -5,
        team2EloChange: 5,
      },
    ];
    const isGuestByUserId = new Map<string, boolean>([
      ["A", false],
      ["B", false],
      ["C", false],
      ["D", false],
      ["GUEST_X", true],
    ]);

    const deltas = computeRollbackEloDeltas(matches, isGuestByUserId);

    expect(deltas.get("A")).toBe(-3);
    expect(deltas.get("B")).toBe(13);
    expect(deltas.get("C")).toBe(3);
    expect(deltas.get("D")).toBe(-5);
    expect(deltas.has("GUEST_X")).toBe(false);
  });

  it("drops zero-sum deltas to avoid unnecessary updates", () => {
    const matches: CompletedMatchEloChange[] = [
      {
        team1User1Id: "A",
        team1User2Id: "B",
        team2User1Id: "C",
        team2User2Id: "D",
        team1EloChange: 4,
        team2EloChange: -4,
      },
      {
        team1User1Id: "A",
        team1User2Id: "B",
        team2User1Id: "C",
        team2User2Id: "D",
        team1EloChange: -4,
        team2EloChange: 4,
      },
    ];

    const deltas = computeRollbackEloDeltas(matches, new Map());

    expect(deltas.size).toBe(0);
  });

  it("collects unique guest user IDs and ignores core players", () => {
    const guestUserIds = collectGuestUserIds([
      { userId: "A", isGuest: false },
      { userId: "GUEST_X", isGuest: true },
      { userId: "GUEST_Y", isGuest: true },
      { userId: "GUEST_X", isGuest: true },
    ]);

    expect(guestUserIds).toEqual(["GUEST_X", "GUEST_Y"]);
  });
});
