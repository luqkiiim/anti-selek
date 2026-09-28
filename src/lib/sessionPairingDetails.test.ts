import { describe, expect, it } from "vitest";
import { buildSessionPairingDetails, type PairingDetailsMatch } from "./sessionPairingDetails";

const players = [
  { id: "a", name: "A", elo: 1200 },
  { id: "b", name: "B", elo: 1000 },
  { id: "c", name: "C", elo: 1100 },
  { id: "d", name: "D", elo: 1000 },
];
function match(id: string, start: number, end: number, order = [0, 1, 2, 3]): PairingDetailsMatch {
  return {
    id, status: "COMPLETED",
    createdAt: new Date(start * 60_000), completedAt: new Date(end * 60_000),
    team1User1: players[order[0]], team1User2: players[order[1]],
    team2User1: players[order[2]], team2User2: players[order[3]],
  };
}

describe("session pairing details", () => {
  it("counts each relationship across earlier games, including reversed teams", () => {
    const current = match("current", 60, 70);
    const details = buildSessionPairingDetails(current, [
      current, match("same", 10, 20), match("swapped", 21, 30, [2, 3, 0, 1]),
      match("different", 31, 40, [0, 2, 1, 3]),
    ]);
    expect(details.team1AverageRating).toBe(1100);
    expect(details.team2AverageRating).toBe(1050);
    expect(details.ratingGap).toBe(50);
    expect(details.partnerPairs.map((pair) => pair.count)).toEqual([2, 2]);
    expect(details.opponentPairs.map((pair) => pair.count)).toEqual([2, 3, 3, 2]);
    expect(details.sharedCourtPairs.map((pair) => pair.count)).toEqual([3, 3, 3, 3, 3, 3]);
    expect(details.gamesPlayedByPlayer).toEqual({ a: 3, b: 3, c: 3, d: 3 });
  });

  it("excludes current, later, unfinished and overlapping games regardless of input order", () => {
    const current = match("current", 60, 70);
    const details = buildSessionPairingDetails(current, [
      match("later", 80, 90), current, match("overlapping", 55, 65),
      { ...match("unfinished", 30, 40), status: "IN_PROGRESS" },
      { ...match("pending", 10, 20), status: "PENDING_APPROVAL" },
    ]);
    expect(details.partnerPairs.map((pair) => pair.count)).toEqual([1, 1]);
    expect(details.gamesPlayedByPlayer.a).toBe(1);
  });

  it("shows zero for a first game and unknown for missing ratings or timestamps", () => {
    const current = match("current", 60, 70);
    const details = buildSessionPairingDetails({ ...current, team1User1: { id: "a", name: "A" } }, [current]);
    expect(details.ratingGap).toBeNull();
    expect(details.team1AverageRating).toBeNull();
    expect(details.partnerPairs.map((pair) => pair.count)).toEqual([0, 0]);
    const unknown = buildSessionPairingDetails({ ...current, createdAt: new Date("invalid") }, []);
    expect(unknown.partnerPairs.map((pair) => pair.count)).toEqual([null, null]);
  });

  it("limits unknown completion data to the affected players and pairs", () => {
    const current = match("current", 60, 70);
    const earlier = {
      ...match("unknown", 10, 20), completedAt: null,
      team2User1: { id: "x", name: "X" }, team2User2: { id: "y", name: "Y" },
    };
    const details = buildSessionPairingDetails(current, [earlier]);
    expect(details.partnerPairs.map((pair) => pair.count)).toEqual([null, 0]);
    expect(details.opponentPairs.map((pair) => pair.count)).toEqual([0, 0, 0, 0]);
    expect(details.gamesPlayedByPlayer).toEqual({ a: null, b: null, c: 0, d: 0 });
  });

  it("counts an earlier completed game when only its completion timestamp is available", () => {
    const details = buildSessionPairingDetails(match("current", 60, 70), [
      { ...match("earlier", 10, 20), createdAt: "" },
    ]);
    expect(details.partnerPairs.map((pair) => pair.count)).toEqual([1, 1]);
  });
});
