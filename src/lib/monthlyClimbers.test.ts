import { describe, expect, it } from "vitest";
import { buildClubPulse, type ClubPulseMatchSource, type ClubPulseSessionSource } from "./clubPulse";

const members = ["Alice", "Ben", "Cara", "Dan"].map((name) => ({ id: name, name, elo: 1000, status: "CORE" }));
const session: ClubPulseSessionSource = {
  id: "s", code: "S", name: "Games", type: "POINTS", status: "ACTIVE", isTest: false,
  createdAt: "2026-09-01T00:00:00Z", players: members.map(user => ({ user })),
};
const now = new Date("2026-09-20T12:00:00Z");
function match(id: string, date: string | null, deltas: number[]): ClubPulseMatchSource {
  return {
    id, completedAt: date, session, winnerTeam: 1,
    team1User1Id: "Alice", team1User2Id: "Ben", team2User1Id: "Cara", team2User2Id: "Dan",
    team1User1: members[0], team1User2: members[1], team2User1: members[2], team2User2: members[3],
    team1Score: 21, team2Score: 19, team1EloChange: 10, team2EloChange: -10,
    eloAdjustments: deltas.map((delta, i) => ({ userId: members[i].id, delta, beforeElo: 1000, afterElo: 1000 + delta })),
  };
}
const calculate = (completedMatches: ClubPulseMatchSource[]) => buildClubPulse({ members, sessions: [session], completedMatches, now });

describe("monthly climbers", () => {
  it("uses Malaysia month boundaries and completed games in active sessions", () => {
    const result = calculate([
      match("previous", "2026-08-31T15:59:59Z", [100, 0, 0, 0]),
      match("start", "2026-08-31T16:00:00Z", [10, 5, 0, 0]),
      match("loss", "2026-09-02T00:00:00Z", [-7, 0, 0, 0]),
      match("future", "2026-09-21T00:00:00Z", [100, 0, 0, 0]),
      match("missing", null, [100, 0, 0, 0]),
    ]);
    expect(result.monthlyClimbersMonth).toBe("September 2026");
    expect(result.monthlyClimbers.map(p => [p.user.name, p.ratingGain])).toEqual([["Ben", 5], ["Alice", 3]]);
  });
  it("excludes occasional members and guest appearances before ranking", () => {
    const result = buildClubPulse({
      members: members.map(p => ({ ...p, status: p.id === "Alice" ? "OCCASIONAL" : "CORE" })),
      sessions: [{ ...session, players: members.map(user => ({ user, isGuest: user.id === "Ben" })) }],
      completedMatches: [match("game", "2026-09-02T00:00:00Z", [40, 30, 20, 10])], now,
    });
    expect(result.monthlyClimbers.map(p => p.user.name)).toEqual(["Cara", "Dan"]);
  });
  it("does not inflate gains when an individual rating adjustment is missing", () => {
    const incomplete = match("incomplete", "2026-09-03T00:00:00Z", [-20, 1, 1, 1]);
    incomplete.eloAdjustments = incomplete.eloAdjustments!.filter(p => p.userId !== "Alice");
    const result = calculate([match("first", "2026-09-02T00:00:00Z", [10, 5, 0, 0]), incomplete]);
    expect(result.monthlyClimbers.some(p => p.user.id === "Alice")).toBe(false);
  });
  it("limits to three after netting losses and uses names to break ties", () => {
    const result = calculate([match("one", "2026-09-02T00:00:00Z", [10, 20, 30, 40]), match("two", "2026-09-03T00:00:00Z", [0, -10, -20, -30])]);
    expect(result.monthlyClimbers.map(p => [p.user.name, p.ratingGain])).toEqual([["Alice", 10], ["Ben", 10], ["Cara", 10]]);
    expect(calculate([match("negative", "2026-09-02T00:00:00Z", [-1, 0, -2, 0])]).monthlyClimbers).toEqual([]);
  });
});
