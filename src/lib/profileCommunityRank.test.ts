import { describe, expect, it } from "vitest";
import { buildProfileCommunityRankWindow } from "./profileCommunityRank";

describe("profileCommunityRank", () => {
  it("reconstructs the previous rank by rolling back the recent community window", () => {
    const result = buildProfileCommunityRankWindow(
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

  it("ignores players outside the tracked community leaderboard", () => {
    const result = buildProfileCommunityRankWindow(
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
    const result = buildProfileCommunityRankWindow(
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
    const result = buildProfileCommunityRankWindow(
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
