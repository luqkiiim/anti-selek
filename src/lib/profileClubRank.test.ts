import { describe, expect, it } from "vitest";
import {
  buildClubLeaderboardRankMovements,
  buildProfileClubRankWindow,
} from "./profileClubRank";

describe("profileClubRank", () => {
  it("reconstructs the previous rank by rolling back the recent club window", () => {
    const result = buildProfileClubRankWindow(
      "u1",
      [
        { userId: "u1", name: "Alice", elo: 1030 },
        { userId: "u2", name: "Ben", elo: 1020 },
        { userId: "u3", name: "Cara", elo: 1015 },
      ],
      [
        {
          team1User1Id: "u1",
          team1User2Id: "u9",
          team2User1Id: "u2",
          team2User2Id: "u8",
          team1EloChange: 20,
          team2EloChange: -20,
        },
      ]
    );

    expect(result).toEqual({
      leaderboardSize: 3,
      currentRank: 1,
      previousRank: 3,
      rankDelta: 2,
    });
  });

  it("ignores players outside the tracked club leaderboard", () => {
    const result = buildProfileClubRankWindow(
      "u1",
      [
        { userId: "u1", name: "Alice", elo: 1000 },
        { userId: "u2", name: "Ben", elo: 1005 },
      ],
      [
        {
          team1User1Id: "u1",
          team1User2Id: "guest-1",
          team2User1Id: "guest-2",
          team2User2Id: "guest-3",
          team1EloChange: 10,
          team2EloChange: -10,
        },
      ]
    );

    expect(result).toEqual({
      leaderboardSize: 2,
      currentRank: 2,
      previousRank: 2,
      rankDelta: 0,
    });
  });

  it("returns null ranks when the target user is not on the leaderboard", () => {
    const result = buildProfileClubRankWindow(
      "missing",
      [{ userId: "u1", name: "Alice", elo: 1000 }],
      []
    );

    expect(result).toEqual({
      leaderboardSize: 1,
      currentRank: null,
      previousRank: null,
      rankDelta: null,
    });
  });

  it("keeps the same rank when there is no recent rank window to roll back", () => {
    const result = buildProfileClubRankWindow(
      "u1",
      [
        { userId: "u1", name: "Alice", elo: 1000 },
        { userId: "u2", name: "Ben", elo: 1010 },
      ],
      []
    );

    expect(result).toEqual({
      leaderboardSize: 2,
      currentRank: 2,
      previousRank: 2,
      rankDelta: 0,
    });
  });
});

describe("club leaderboard rank movements", () => {
  it("reports players moving up, down, and staying still after a rank window", () => {
    const result = buildClubLeaderboardRankMovements({
      members: [
        { userId: "alice", name: "Alice", elo: 1030 },
        { userId: "ben", name: "Ben", elo: 1020 },
        { userId: "cara", name: "Cara", elo: 1000 },
      ],
      matchesSinceWindowStart: [
        {
          team1User1Id: "alice",
          team1User2Id: "guest-1",
          team2User1Id: "ben",
          team2User2Id: "guest-2",
          team1EloChange: 20,
          team2EloChange: -20,
        },
      ],
    });

    expect(result.get("alice")).toEqual({
      currentRank: 1,
      previousRank: 2,
      rankDelta: 1,
    });
    expect(result.get("ben")).toEqual({
      currentRank: 2,
      previousRank: 1,
      rankDelta: -1,
    });
    expect(result.get("cara")).toEqual({
      currentRank: 3,
      previousRank: 3,
      rankDelta: 0,
    });
  });

  it("excludes occasional players from rank movement calculations", () => {
    const result = buildClubLeaderboardRankMovements({
      members: [
        { userId: "core-1", name: "Alice", elo: 1010 },
        {
          userId: "occasional-1",
          name: "Zed",
          elo: 1200,
          isLeaderboardEligible: false,
        },
      ],
      matchesSinceWindowStart: [],
    });

    expect(result.get("core-1")).toEqual({
      currentRank: 1,
      previousRank: 1,
      rankDelta: 0,
    });
    expect(result.has("occasional-1")).toBe(false);
  });

  it("resolves linked offline identities before rolling back match deltas", () => {
    const result = buildClubLeaderboardRankMovements({
      members: [
        { userId: "local-alice", name: "Alice", elo: 1030 },
        { userId: "ben", name: "Ben", elo: 1020 },
      ],
      matchesSinceWindowStart: [
        {
          team1User1Id: "linked-alice",
          team1User2Id: "guest-1",
          team2User1Id: "ben",
          team2User2Id: "guest-2",
          team1EloChange: 20,
          team2EloChange: -20,
        },
      ],
      resolveUserId: (userId) =>
        userId === "linked-alice" ? "local-alice" : userId,
    });

    expect(result.get("local-alice")).toEqual({
      currentRank: 1,
      previousRank: 2,
      rankDelta: 1,
    });
    expect(result.get("ben")).toEqual({
      currentRank: 2,
      previousRank: 1,
      rankDelta: -1,
    });
  });
});
