import { describe, expect, it, vi } from "vitest";
import {
  collectGuestUserIds,
  computeRollbackEloDeltas,
  reverseSessionEloChanges,
  type CompletedMatchEloChange,
} from "./sessionLifecycle";

describe("session lifecycle rollback", () => {
  it("reverses completed-match Elo deltas for core players and ignores guests", () => {
    const matches: CompletedMatchEloChange[] = [
      {
        team1Player1Id: "A",
        team1Player2Id: "GUEST_X",
        team2Player1Id: "B",
        team2Player2Id: "C",
        team1EloChange: 8,
        team2EloChange: -8,
      },
      {
        team1Player1Id: "A",
        team1Player2Id: "B",
        team2Player1Id: "C",
        team2Player2Id: "D",
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
        team1Player1Id: "A",
        team1Player2Id: "B",
        team2Player1Id: "C",
        team2Player2Id: "D",
        team1EloChange: 4,
        team2EloChange: -4,
      },
      {
        team1Player1Id: "A",
        team1Player2Id: "B",
        team2Player1Id: "C",
        team2Player2Id: "D",
        team1EloChange: -4,
        team2EloChange: 4,
      },
    ];

    const deltas = computeRollbackEloDeltas(matches, new Map());

    expect(deltas.size).toBe(0);
  });

  it("collects unique guest user IDs and ignores core players", () => {
    const guestUserIds = collectGuestUserIds([
      { playerId: "A", isGuest: false },
      { playerId: "GUEST_X", isGuest: true },
      { playerId: "GUEST_Y", isGuest: true },
      { playerId: "GUEST_X", isGuest: true },
    ]);

    expect(guestUserIds).toEqual(["GUEST_X", "GUEST_Y"]);
  });

  it("reverses club rating ledger entries before a live session is cleared", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      sessionPlayer: {
        findMany: vi.fn().mockResolvedValue([
          { playerId: "A", isGuest: false },
          { playerId: "B", isGuest: false },
        ]),
      },
      match: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "match-1",
            team1Player1Id: "A",
            team1Player2Id: "B",
            team2Player1Id: "C",
            team2Player2Id: "D",
            team1EloChange: 7,
            team2EloChange: -7,
          },
        ]),
      },
      matchEloAdjustment: {
        findMany: vi.fn().mockResolvedValue([
          { clubId: "club-1", playerId: "A", delta: 7 },
          { clubId: "club-1", playerId: "A", delta: 2 },
          { clubId: "club-1", playerId: "B", delta: -7 },
        ]),
      },
      clubMember: { updateMany },
      player: { updateMany: vi.fn() },
    };

    const reversedPlayers = await reverseSessionEloChanges(tx as never, {
      sessionId: "session-1",
      clubId: "club-1",
    });

    expect(reversedPlayers).toBe(2);
    expect(updateMany).toHaveBeenCalledWith({
      where: { clubId: "club-1", playerId: "A" },
      data: { elo: { increment: -9 } },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { clubId: "club-1", playerId: "B" },
      data: { elo: { increment: 7 } },
    });
  });
});
