import { describe, expect, it } from "vitest";
import { SessionMode, SessionType } from "../../../types/enums";
import { getExactPartitionKey } from "./rematch";
import { findBestSingleCourtSelectionV3 } from "./singleCourt";
import { buildSocialVarietyContext } from "./socialVariety";
import type { MatchmakerV3Player, V3CompletedMatch, V3DoublesPartition } from "./types";

const makePlayers = (strengths = [1000, 1000, 1000, 1000]): MatchmakerV3Player[] => strengths.map((strength, index) => ({
  userId: `P${index}`, strength, matchesPlayed: 0, matchmakingBaseline: 0,
  availableSince: new Date("2026-04-01"), restTurns: 0, gender: "MALE", partnerPreference: "OPEN",
}));
const repeated: V3DoublesPartition = { team1: ["P0", "P1"], team2: ["P2", "P3"] };
const fresh: V3DoublesPartition = { team1: ["P0", "P2"], team2: ["P1", "P3"] };
const history: V3CompletedMatch[] = [{ ...repeated, completedAt: new Date("2026-04-01") }];

describe("Balanced explanation of the final distinct contenders", () => {
  it("does not call a unique admissible layout a deterministic tie when the baseline is replayed", () => {
    const result = findBestSingleCourtSelectionV3(makePlayers([1000, 1100, 1500, 2000]), {
      sessionMode: SessionMode.MEXICANO, sessionType: SessionType.ELO, randomFn: () => 0,
    });
    expect(result.selection?.balanceGap).toBe(200);
    expect(result.debug.balanceGuardrail?.ceilingFeasible).toBe(false);
    expect(result.debug.finalTieBreak).toBeNull();
  });

  it.each([0, 0.37])("reports the same final tie across enumeration orders after exact rematch filtering (random %s)", (randomValue) => {
    const roster = makePlayers();
    // Freeze a neutral entropy context to isolate only the late tie breakers.
    const context = buildSocialVarietyContext(roster, [], { sessionMode: SessionMode.MEXICANO });
    const orders = [roster, [roster[0], roster[2], roster[3], roster[1]], [...roster].reverse()];
    const results = orders.map((players) => findBestSingleCourtSelectionV3(players, {
      sessionMode: SessionMode.MEXICANO, sessionType: SessionType.ELO, completedMatches: history,
      socialVarietyContext: context, randomFn: () => randomValue,
    }));
    for (const result of results) {
      expect(result.selection?.exactRematchPenalty).toBe(0);
      expect(result.debug.finalTieBreak).toBe(randomValue === 0 ? "DETERMINISTIC" : "RANDOM");
    }
    if (randomValue !== 0) {
      expect(new Set(results.map((result) => getExactPartitionKey(result.selection!.partition))).size).toBe(1);
    }
  });

  it("reports exact rematch only when it leaves one best otherwise-equivalent layout", () => {
    const roster = makePlayers();
    const context = buildSocialVarietyContext(roster, [], { sessionMode: SessionMode.MEXICANO });
    const allowed = new Set([getExactPartitionKey(repeated), getExactPartitionKey(fresh)]);
    const result = findBestSingleCourtSelectionV3(roster, {
      sessionMode: SessionMode.MEXICANO, sessionType: SessionType.ELO, completedMatches: history,
      socialVarietyContext: context, randomFn: () => 0,
      selectionConstraints: { normalizePartition: ({ partition }) => allowed.has(getExactPartitionKey(partition)) ? partition : null },
    });
    expect(getExactPartitionKey(result.selection!.partition)).toBe(getExactPartitionKey(fresh));
    expect(result.debug.finalTieBreak).toBe("EXACT_REMATCH");
  });

  it("clears late tie explanations when one layout wins on stronger entropy", () => {
    const roster = makePlayers();
    const allowed = new Set([getExactPartitionKey(repeated), getExactPartitionKey(fresh)]);
    const result = findBestSingleCourtSelectionV3(roster, {
      sessionMode: SessionMode.MEXICANO, sessionType: SessionType.ELO, completedMatches: history, randomFn: () => 0.37,
      selectionConstraints: { normalizePartition: ({ partition }) => allowed.has(getExactPartitionKey(partition)) ? partition : null },
    });
    expect(getExactPartitionKey(result.selection!.partition)).toBe(getExactPartitionKey(fresh));
    expect(result.debug.finalTieBreak).toBeNull();
  });
});
