import { describe, expect, it } from "vitest";
import type { ClubPageMember } from "@/components/club/clubTypes";
import {
  ClubPlayerStatus,
  PartnerPreference,
  PlayerGender,
} from "@/types/enums";
import { getClubLeaderboard } from "./clubLeaderboard";

function createMember(overrides: Partial<ClubPageMember> = {}): ClubPageMember {
  return {
    id: "player-1",
    name: "Player One",
    status: ClubPlayerStatus.CORE,
    needsMoreRest: false,
    gender: PlayerGender.MALE,
    partnerPreference: PartnerPreference.OPEN,
    elo: 1000,
    wins: 0,
    losses: 0,
    matchesPlayed: 1,
    isClaimed: true,
    role: "MEMBER",
    ...overrides,
  };
}

describe("getClubLeaderboard", () => {
  it("only ranks core players with recorded club matches", () => {
    const leaderboard = getClubLeaderboard([
      createMember({
        id: "unplayed",
        name: "Unplayed",
        elo: 2000,
        matchesPlayed: 0,
      }),
      createMember({
        id: "played-low",
        name: "Played Low",
        elo: 1000,
        matchesPlayed: 1,
      }),
      createMember({
        id: "occasional",
        name: "Occasional",
        status: ClubPlayerStatus.OCCASIONAL,
        elo: 3000,
        matchesPlayed: 5,
      }),
      createMember({
        id: "played-high",
        name: "Played High",
        elo: 1200,
        matchesPlayed: 2,
      }),
    ]);

    expect(leaderboard.map((member) => member.id)).toEqual([
      "played-high",
      "played-low",
    ]);
  });
});
