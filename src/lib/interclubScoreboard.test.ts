import { describe, expect, it } from "vitest";
import type { SessionData } from "@/components/session/sessionTypes";
import { MatchStatus, SessionCollabFormat, SessionStatus } from "@/types/enums";
import { getInterclubScore } from "./interclubScoreboard";

const clubs = [
  { id: "a", name: "Alpha", role: "HOST", status: "ACCEPTED" },
  { id: "b", name: "Beta", role: "GUEST", status: "ACCEPTED" },
];

function session(overrides: Partial<SessionData> = {}): SessionData {
  return {
    collabFormat: SessionCollabFormat.INTERCLUB,
    status: SessionStatus.ACTIVE,
    clubs,
    matches: [],
    ...overrides,
  } as SessionData;
}

describe("getInterclubScore", () => {
  it("counts approved match wins and uses point difference to break a tie", () => {
    const result = getInterclubScore(session({
      matches: [
        { status: MatchStatus.COMPLETED, team1ClubId: "a", team2ClubId: "b", team1Score: 21, team2Score: 18, winnerTeam: 1 },
        { status: MatchStatus.COMPLETED, team1ClubId: "b", team2ClubId: "a", team1Score: 21, team2Score: 15, winnerTeam: 1 },
        { status: MatchStatus.PENDING_APPROVAL, team1ClubId: "a", team2ClubId: "b", team1Score: 21, team2Score: 0, winnerTeam: 1 },
      ] as SessionData["matches"],
    }));
    expect(result?.clubs.map((club) => club.wins)).toEqual([1, 1]);
    expect(result?.leaderId).toBe("b");
  });

  it("shows no scoreboard without exactly two accepted interclub clubs", () => {
    expect(getInterclubScore(session({ collabFormat: SessionCollabFormat.FREE_PLAY }))).toBeNull();
    expect(getInterclubScore(session({ clubs: [clubs[0]] }))).toBeNull();
  });

  it("recognizes a completed draw", () => {
    const result = getInterclubScore(session({ status: SessionStatus.COMPLETED }));
    expect(result).toMatchObject({ leaderId: null, completed: true });
  });
});
