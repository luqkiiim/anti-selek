import { describe, expect, it } from "vitest";
import type { Player } from "@/components/session/sessionTypes";
import { sessionFinishHighlights } from "./sessionFinishHighlights";

const players = ["a", "b"].map(id => ({ userId: id, user: { name: id } })) as Player[];
describe("session finish highlights", () => {
  it("does not manufacture records for an empty session or choose among ties", () => {
    expect(sessionFinishHighlights(players, new Map())).toEqual([]);
    const tied = { matchesPlayed: 2, wins: 2, losses: 0, pointDiff: 8 };
    expect(sessionFinishHighlights(players, new Map([["a", tied], ["b", tied]]))).toEqual([]);
  });
  it("uses scored records and names the outright leaders", () => {
    const result = sessionFinishHighlights(players, new Map([
      ["a", { matchesPlayed: 3, wins: 2, losses: 1, pointDiff: 3 }],
      ["b", { matchesPlayed: 3, wins: 1, losses: 2, pointDiff: 5 }],
    ]));
    expect(result.map(({ name, value }) => [name, value])).toEqual([["a", "2 wins"], ["b", "+5 points"]]);
  });
});
