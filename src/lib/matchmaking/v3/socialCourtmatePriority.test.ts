import { describe, expect, it } from "vitest";
import { SessionMode, SessionType } from "../../../types/enums";
import { findBestRotationBatchSelection } from "./socialBatch";
import {
  compareCourtmateCoverageProfiles,
  createSocialCourtmatePriorityScorer,
} from "./socialCourtmatePriority";
import { buildSocialVarietyContext } from "./socialVariety";
import type { MatchmakerV3Player, SocialHistoryMatch, V3DoublesPartition } from "./types";

const makePlayers = (
  count: number,
  upperCount = count / 2,
  customize: (index: number) => Partial<MatchmakerV3Player> = () => ({})
): MatchmakerV3Player[] => Array.from({ length: count }, (_, index) => {
  const upper = index < upperCount;
  return {
    userId: `P${index}`,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    availableSince: new Date("2026-01-01T00:00:00.000Z"),
    strength: 1000,
    gender: upper ? "FEMALE" : "MALE",
    partnerPreference: upper ? "OPEN" : "FEMALE_FLEX",
    mixedSideOverride: upper ? "UPPER" : "LOWER",
    ...customize(index),
  };
});

function partition(
  team1: [string, string],
  team2: [string, string]
): V3DoublesPartition {
  return { team1, team2 };
}

function historyOf(...partitions: V3DoublesPartition[]): SocialHistoryMatch[] {
  return partitions.map((match, index) => ({ ...match, id: `completed-${index + 1}` }));
}

function contextFor(
  players: readonly MatchmakerV3Player[],
  history: readonly SocialHistoryMatch[] = []
) {
  return buildSocialVarietyContext(players, history, {
    sessionMode: SessionMode.MIXICANO,
    includePausedPlayers: true,
  });
}

function pairKey(left: string, right: string) {
  return left < right ? `${left}\u0000${right}` : `${right}\u0000${left}`;
}

function combinationsOfFour(ids: readonly string[]): string[][] {
  const results: string[][] = [];
  for (let a = 0; a < ids.length - 3; a += 1) {
    for (let b = a + 1; b < ids.length - 2; b += 1) {
      for (let c = b + 1; c < ids.length - 1; c += 1) {
        for (let d = c + 1; d < ids.length; d += 1) results.push([ids[a], ids[b], ids[c], ids[d]]);
      }
    }
  }
  return results;
}

type ManualMatchType = "MIXED" | "OWN_SIDE";
type ManualCourt = { partition: V3DoublesPartition; type: ManualMatchType };
type ManualObjective = {
  newCourtmatePairs: number;
  postCoverageAscending: number[];
  signedRollingTypeDeltaHalfUnits: number;
  postCoverageByPlayer: Map<string, number>;
};

function manualMatchType(
  partitionToClassify: V3DoublesPartition,
  upperIds: ReadonlySet<string>
): ManualMatchType | null {
  const lowerCount = (team: readonly string[]) => team.filter((id) => !upperIds.has(id)).length;
  const team1LowerCount = lowerCount(partitionToClassify.team1);
  const team2LowerCount = lowerCount(partitionToClassify.team2);
  if (team1LowerCount !== team2LowerCount) return null;
  return team1LowerCount === 1 ? "MIXED" : "OWN_SIDE";
}

function manualPartitions(ids: readonly string[], upperIds: ReadonlySet<string>): ManualCourt[] {
  const [a, b, c, d] = ids;
  const partitions = [
    partition([a, b], [c, d]),
    partition([a, c], [b, d]),
    partition([a, d], [b, c]),
  ];
  return partitions.flatMap((candidate) => {
    const type = manualMatchType(candidate, upperIds);
    return type ? [{ partition: candidate, type }] : [];
  });
}

function enumerateTwoCourtLayouts(
  players: readonly MatchmakerV3Player[],
  upperIds: ReadonlySet<string>
): Array<[ManualCourt, ManualCourt]> {
  const ids = players.map((player) => player.userId);
  const layouts: Array<[ManualCourt, ManualCourt]> = [];
  for (const firstIds of combinationsOfFour(ids).filter((combination) => combination.includes(ids[0]))) {
    const firstIdSet = new Set(firstIds);
    const secondIds = ids.filter((id) => !firstIdSet.has(id));
    for (const firstCourt of manualPartitions(firstIds, upperIds)) {
      for (const secondCourt of manualPartitions(secondIds, upperIds)) {
        layouts.push([firstCourt, secondCourt]);
      }
    }
  }
  return layouts;
}

/** Independent raw-history oracle; it intentionally does not use the scorer. */
function scoreManualBatch(
  players: readonly MatchmakerV3Player[],
  history: readonly SocialHistoryMatch[],
  currentCourts: readonly ManualCourt[],
  upperIds: ReadonlySet<string>
): ManualObjective {
  const ids = players.map((player) => player.userId);
  const priorPairs = new Set<string>();
  const coveredByPlayer = new Map(ids.map((id) => [id, new Set<string>()]));
  const priorTypeAppearances = new Map(ids.map((id) => [id, [] as Array<ManualMatchType | null>]));
  for (const prior of history) {
    const courtmates = [...prior.team1, ...prior.team2];
    for (let leftIndex = 0; leftIndex < courtmates.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < courtmates.length; rightIndex += 1) {
        const left = courtmates[leftIndex];
        const right = courtmates[rightIndex];
        priorPairs.add(pairKey(left, right));
        coveredByPlayer.get(left)!.add(right);
        coveredByPlayer.get(right)!.add(left);
      }
    }
    const type = manualMatchType(prior, upperIds);
    for (const id of courtmates) priorTypeAppearances.get(id)!.push(type);
  }

  const newPairs = new Set<string>();
  const gainsByPlayer = new Map(ids.map((id) => [id, new Set<string>()]));
  const selectedTypeByPlayer = new Map<string, ManualMatchType>();
  for (const court of currentCourts) {
    const courtmates = [...court.partition.team1, ...court.partition.team2];
    for (const id of courtmates) selectedTypeByPlayer.set(id, court.type);
    for (let leftIndex = 0; leftIndex < courtmates.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < courtmates.length; rightIndex += 1) {
        const left = courtmates[leftIndex];
        const right = courtmates[rightIndex];
        const key = pairKey(left, right);
        if (priorPairs.has(key)) continue;
        newPairs.add(key);
        gainsByPlayer.get(left)!.add(right);
        gainsByPlayer.get(right)!.add(left);
      }
    }
  }

  const postCoverageByPlayer = new Map(ids.map((id) => [
    id,
    coveredByPlayer.get(id)!.size + gainsByPlayer.get(id)!.size,
  ]));
  let signedRollingTypeDeltaHalfUnits = 0;
  for (const id of ids) {
    const beforeWindow = priorTypeAppearances.get(id)!.slice(-6);
    const beforeTypes = new Set(beforeWindow.filter((type): type is ManualMatchType => type !== null));
    const afterWindow = [...beforeWindow, selectedTypeByPlayer.get(id)!].slice(-6);
    const afterTypes = new Set(afterWindow.filter((type): type is ManualMatchType => type !== null));
    signedRollingTypeDeltaHalfUnits += afterTypes.size - beforeTypes.size;
  }
  return {
    newCourtmatePairs: newPairs.size,
    postCoverageAscending: [...postCoverageByPlayer.values()].sort((left, right) => left - right),
    signedRollingTypeDeltaHalfUnits,
    postCoverageByPlayer,
  };
}

function compareManualObjectives(left: ManualObjective, right: ManualObjective) {
  if (left.newCourtmatePairs !== right.newCourtmatePairs) {
    return left.newCourtmatePairs - right.newCourtmatePairs;
  }
  for (let index = 0; index < left.postCoverageAscending.length; index += 1) {
    if (left.postCoverageAscending[index] !== right.postCoverageAscending[index]) {
      return left.postCoverageAscending[index] - right.postCoverageAscending[index];
    }
  }
  return left.signedRollingTypeDeltaHalfUnits - right.signedRollingTypeDeltaHalfUnits;
}

const zeroRandom = () => 0;
const socialOptions = {
  courtCount: 1,
  sessionMode: SessionMode.MIXICANO,
  sessionType: SessionType.SOCIAL_MIX,
  randomFn: zeroRandom,
  socialPriorityPolicy: "courtmate-first" as const,
};

describe("Social courtmate-priority scorer", () => {
  it("counts the six courtmate, two partner, and four opponent pairs independent of seat order", () => {
    const players = makePlayers(14, 7);
    const scorer = createSocialCourtmatePriorityScorer(contextFor(players), []);
    const original = partition(["P0", "P7"], ["P1", "P8"]);
    const reversedSeatsAndTeams = partition(["P8", "P1"], ["P7", "P0"]);

    expect(scorer.getPartitionMetrics(original)).toMatchObject({
      newCourtmatePairs: 6,
      newPartnerPairs: 2,
      newOpponentPairs: 4,
    });
    expect(scorer.getPartitionMetrics(reversedSeatsAndTeams)).toMatchObject({
      newCourtmatePairs: 6,
      newPartnerPairs: 2,
      newOpponentPairs: 4,
    });
  });

  it("does not count courtmates or other relationships again after completed exposure", () => {
    const players = makePlayers(14, 7);
    const completed = partition(["P0", "P7"], ["P1", "P8"]);
    const history = historyOf(completed);
    const scorer = createSocialCourtmatePriorityScorer(contextFor(players, history), history);

    expect(scorer.getPartitionMetrics(completed)).toMatchObject({
      newCourtmatePairs: 0,
      newPartnerPairs: 0,
      newOpponentPairs: 0,
    });
  });

  it("keeps the full structural vocabulary above thirteen and through temporary availability changes", () => {
    const available = makePlayers(16, 8);
    const temporarilyUnavailable = available.map((player, index) => ({
      ...player,
      ...(index === 0 ? { isBusy: true } : {}),
      ...(index === 1 ? { isPaused: true } : {}),
    }));
    const baselineContext = contextFor(available);
    const unavailableContext = contextFor(temporarilyUnavailable);
    const scorer = createSocialCourtmatePriorityScorer(unavailableContext, []);
    const entry = scorer.getPostBatchCourtmateCoverageProfile(new Map()).find((item) => item.userId === "P0");

    expect(unavailableContext.playersByUserId.size).toBe(16);
    expect(unavailableContext.playersByUserId.get("P0")?.courtmates.opportunities.size).toBe(15);
    expect(unavailableContext.playersByUserId.get("P0")?.courtmates.opportunities.size)
      .toBe(baselineContext.playersByUserId.get("P0")?.courtmates.opportunities.size);
    expect(entry).toMatchObject({ userId: "P0", covered: 0, possible: 15 });
    expect(scorer.getMaximumSingleMatchCourtmateGain("P0")).toBe(3);
  });

  it("uses exact coverage fractions to favor equal raw gain for the least-covered players", () => {
    const players = makePlayers(14, 7);
    const history = historyOf(partition(["P2", "P7"], ["P3", "P8"]));
    const scorer = createSocialCourtmatePriorityScorer(contextFor(players, history), history);
    const gainToLeastCovered = scorer.getPostBatchCourtmateCoverageProfile(new Map([
      ["P0", 1], ["P1", 1],
    ]));
    const gainToAlreadyCovered = scorer.getPostBatchCourtmateCoverageProfile(new Map([
      ["P2", 1], ["P3", 1],
    ]));

    expect(compareCourtmateCoverageProfiles(gainToLeastCovered, gainToAlreadyCovered)).toBeGreaterThan(0);
  });

  it("deduplicates overlapping batch relationships and adds disjoint-court gains", () => {
    const players = makePlayers(14, 7);
    const scorer = createSocialCourtmatePriorityScorer(contextFor(players), []);
    const first = partition(["P0", "P7"], ["P1", "P8"]);
    const second = partition(["P2", "P9"], ["P3", "P10"]);
    const one = scorer.getPartitionMetrics(first);
    const repeated = scorer.getBatchMetrics([first, first]);
    const disjointOne = scorer.getPartitionMetrics(first);
    const disjointTwo = scorer.getPartitionMetrics(second);
    const disjointBatch = scorer.getBatchMetrics([first, second]);

    expect(repeated).toMatchObject({
      newCourtmatePairs: one.newCourtmatePairs,
      newPartnerPairs: one.newPartnerPairs,
      newOpponentPairs: one.newOpponentPairs,
    });
    expect(disjointBatch.newCourtmatePairs).toBe(disjointOne.newCourtmatePairs + disjointTwo.newCourtmatePairs);
    expect(disjointBatch.newPartnerPairs).toBe(disjointOne.newPartnerPairs + disjointTwo.newPartnerPairs);
    expect(disjointBatch.newOpponentPairs).toBe(disjointOne.newOpponentPairs + disjointTwo.newOpponentPairs);
    expect(disjointBatch.rollingMatchTypeGainUnits)
      .toBe(disjointOne.rollingMatchTypeGainUnits + disjointTwo.rollingMatchTypeGainUnits);
  });

  it("uses signed six-appearance type gains for expiration, recovery, and equal T across different ratios", () => {
    const players = makePlayers(14, 7);
    const mixed = partition(["P0", "P7"], ["P1", "P8"]);
    const upperOnly = partition(["P0", "P1"], ["P2", "P3"]);
    const lowerOnly = partition(["P7", "P8"], ["P9", "P10"]);
    const mixedForUpperPair = partition(["P0", "P7"], ["P1", "P8"]);
    const mixedForOtherUpperPair = partition(["P2", "P9"], ["P3", "P10"]);

    const expiringHistory = historyOf(
      upperOnly,
      lowerOnly,
      ...Array.from({ length: 5 }, () => mixed)
    );
    const expiringScorer = createSocialCourtmatePriorityScorer(contextFor(players, expiringHistory), expiringHistory);
    expect(expiringScorer.getPartitionMetrics(mixed).rollingMatchTypeGainUnits).toBeLessThan(BigInt(0));

    const recoveredHistory = historyOf(
      upperOnly,
      ...Array.from({ length: 6 }, () => mixedForUpperPair),
      ...Array.from({ length: 6 }, () => mixedForOtherUpperPair)
    );
    const recoveryScorer = createSocialCourtmatePriorityScorer(contextFor(players, recoveredHistory), recoveredHistory);
    expect(recoveryScorer.getPartitionMetrics(upperOnly).rollingMatchTypeGainUnits).toBeGreaterThan(BigInt(0));

    const fiveToOneHistory = historyOf(
      ...Array.from({ length: 5 }, () => mixed),
      upperOnly,
      lowerOnly
    );
    const threeToThreeHistory = historyOf(
      ...Array.from({ length: 3 }, () => mixed),
      ...Array.from({ length: 3 }, () => upperOnly),
      ...Array.from({ length: 3 }, () => lowerOnly)
    );
    const fiveToOne = createSocialCourtmatePriorityScorer(contextFor(players, fiveToOneHistory), fiveToOneHistory);
    const threeToThree = createSocialCourtmatePriorityScorer(contextFor(players, threeToThreeHistory), threeToThreeHistory);
    expect(fiveToOne.getPartitionMetrics(mixed).rollingMatchTypeGainUnits).toBe(BigInt(0));
    expect(threeToThree.getPartitionMetrics(mixed).rollingMatchTypeGainUnits).toBe(BigInt(0));
  });

  it("ages a valid unknown type through an out-of-order dated history as a real window slot", () => {
    const players = makePlayers(14, 7);
    const mixed = partition(["P0", "P7"], ["P1", "P8"]);
    const upperOnly = partition(["P0", "P1"], ["P2", "P3"]);
    const validButUnclassified = partition(["P0", "P1"], ["P2", "P7"]);
    const history: SocialHistoryMatch[] = [
      ...Array.from({ length: 4 }, (_, index) => ({
        ...mixed,
        id: `mixed-${index}`,
        completedAt: new Date(`2026-03-0${index + 2}T00:00:00.000Z`),
      })),
      { ...upperOnly, id: "own-first", completedAt: new Date("2026-03-01T00:00:00.000Z") },
      { ...validButUnclassified, id: "unknown-last", completedAt: new Date("2026-03-06T00:00:00.000Z") },
    ];
    const scorer = createSocialCourtmatePriorityScorer(contextFor(players, history), history);

    // Chronological order is OWN_SIDE, four MIXED appearances, then a valid
    // unclassified appearance. The next MIXED match pushes OWN_SIDE out.
    expect(scorer.getPartitionMetrics(mixed).rollingMatchTypeGainUnits).toBeLessThan(BigInt(0));
  });

  it("uses a finite denominator when only one match type is structurally feasible", () => {
    const players = makePlayers(4, 4);
    const onlyOwnSide = partition(["P0", "P1"], ["P2", "P3"]);
    const scorer = createSocialCourtmatePriorityScorer(contextFor(players), []);

    expect(scorer.rollingTypeDenominator).toBe(BigInt(1));
    expect(scorer.typeEligiblePlayerCount).toBe(4);
    expect(scorer.getPartitionMetrics(onlyOwnSide).rollingMatchTypeGainUnits).toBe(BigInt(4));
    expect(scorer.toNormalizedRollingTypeGain(BigInt(4))).toBe(4);
  });
});

describe("courtmate-first matcher contract", () => {
  it("matches an independent four-player-set oracle for maximum new completed-only courtmates", () => {
    const players = makePlayers(8, 4, () => ({ restTurns: 1 }));
    const completed: V3DoublesPartition[] = [partition(["P4", "P5"], ["P6", "P7"])];
    const oldCourtPairs = new Set(completed.flatMap((match) => {
      const ids = [...match.team1, ...match.team2];
      return ids.flatMap((id, index) => ids.slice(index + 1).map((peer) => pairKey(id, peer)));
    }));
    const oracleMaximum = Math.max(...combinationsOfFour(players.map((player) => player.userId)).map((ids) =>
      ids.flatMap((id, index) => ids.slice(index + 1).map((peer) => pairKey(id, peer)))
        .filter((key) => !oldCourtPairs.has(key)).length
    ));
    const result = findBestRotationBatchSelection(players, {
      ...socialOptions,
      completedMatches: completed,
    });
    const chosenIds = result.selection!.selections[0].ids;
    const chosenPairs = chosenIds.flatMap((id, index) => chosenIds.slice(index + 1).map((peer) => pairKey(id, peer)));
    const independentlyCountedGain = chosenPairs.filter((key) => !oldCourtPairs.has(key)).length;

    expect(result.priorityCertified).toBe(true);
    expect(result.chosenNewCourtmatePairCount).toBe(oracleMaximum);
    expect(independentlyCountedGain).toBe(oracleMaximum);
  });

  it("matches an independent two-court lexicographic oracle and its per-player coverage diagnostics", () => {
    const players = makePlayers(8, 4, () => ({ restTurns: 1 }));
    const upperIds = new Set(players.slice(0, 4).map((player) => player.userId));
    const upperOnly = partition(["P0", "P1"], ["P2", "P3"]);
    const lowerOnly = partition(["P4", "P5"], ["P6", "P7"]);
    const firstMixedCohort = partition(["P0", "P4"], ["P1", "P5"]);
    const secondMixedCohort = partition(["P2", "P6"], ["P3", "P7"]);
    const history = historyOf(
      upperOnly,
      lowerOnly,
      ...Array.from({ length: 5 }, () => firstMixedCohort),
      secondMixedCohort
    );
    const candidates = enumerateTwoCourtLayouts(players, upperIds);
    const candidateScores = candidates.map((layout) => ({
      layout,
      score: scoreManualBatch(players, history, layout, upperIds),
    }));
    const oracleBest = candidateScores.reduce((best, candidate) =>
      compareManualObjectives(candidate.score, best.score) > 0 ? candidate : best
    );
    const sameCohortProfiles = candidateScores.filter((candidate) => candidate.score.newCourtmatePairs === 4);
    const hasEqualCButDifferentEquity = sameCohortProfiles.some((candidate, index) =>
      sameCohortProfiles.slice(index + 1).some((other) =>
        candidate.score.postCoverageAscending.some((count, countIndex) =>
          count !== other.score.postCoverageAscending[countIndex]
        )
      )
    );
    const result = findBestRotationBatchSelection(players, {
      ...socialOptions,
      courtCount: 2,
      completedMatches: history,
    });
    const selectedCourts = result.selection!.selections.map((selection) => ({
      partition: selection.partition,
      type: manualMatchType(selection.partition, upperIds)!,
    }));
    const selectedScore = scoreManualBatch(players, history, selectedCourts, upperIds);
    const reportedCoverage = new Map(
      result.chosenPostBatchCourtmateCoverage!.map((entry) => [entry.userId, entry])
    );

    expect(candidates.length).toBeGreaterThan(0);
    expect(new Set(candidateScores.map((candidate) => candidate.score.newCourtmatePairs)).size).toBeGreaterThan(1);
    expect(hasEqualCButDifferentEquity).toBe(true);
    expect(new Set(candidateScores.map((candidate) => candidate.score.signedRollingTypeDeltaHalfUnits)).size).toBeGreaterThan(1);
    expect(compareManualObjectives(selectedScore, oracleBest.score)).toBe(0);
    expect(result.chosenNewCourtmatePairCount).toBe(selectedScore.newCourtmatePairs);
    expect(result.chosenRollingMatchTypeGain).toBeCloseTo(selectedScore.signedRollingTypeDeltaHalfUnits / 2, 12);
    for (const player of players) {
      expect(reportedCoverage.get(player.userId)).toMatchObject({
        userId: player.userId,
        covered: selectedScore.postCoverageByPlayer.get(player.userId),
        possible: 7,
      });
    }
  });

  it("lets courtmate gain outrank an ordinary replay preference", () => {
    const players = makePlayers(8, 4, (index) => ({ restTurns: index < 4 ? 0 : 1 }));
    const completed = [partition(["P4", "P5"], ["P6", "P7"])];
    const result = findBestRotationBatchSelection(players, {
      ...socialOptions,
      completedMatches: completed,
    });
    const selectedIds = new Set(result.selection!.selections[0].ids);

    expect([...selectedIds]).toEqual(expect.arrayContaining(["P0", "P1", "P2", "P3"]));
    expect(result.chosenNewCourtmatePairCount).toBe(6);
    expect(result.chosenImmediateReplayCount).toBe(4);
    expect(result.debug.coverageGateStatus).toBe("DISABLED");
    expect(result.debug.replayEnvelopeStatus).toBe("DISABLED");
  });

  it("keeps count fairness ahead of a higher-court-mate set", () => {
    const players = makePlayers(8, 4, (index) => ({
      matchesPlayed: index < 4 ? 0 : 1,
      restTurns: 1,
    }));
    const completed = [partition(["P0", "P1"], ["P2", "P3"])];
    const result = findBestRotationBatchSelection(players, {
      ...socialOptions,
      completedMatches: completed,
    });

    expect(new Set(result.selection!.selections[0].ids)).toEqual(new Set(["P0", "P1", "P2", "P3"]));
    expect(result.chosenNewCourtmatePairCount).toBe(0);
    expect(result.selection!.selections[0].players.map((player) => player.effectiveMatchCount)).toEqual([0, 0, 0, 0]);
  });

  it("keeps the earlier-arrival group ahead of higher courtmate gain when counts tie", () => {
    const players = makePlayers(8, 4, (index) => ({
      arrivalPriorityAt: index < 4 ? "2024-01-01T00:00:00.000Z" : "2025-01-01T00:00:00.000Z",
      restTurns: 1,
    }));
    const completed = [partition(["P0", "P1"], ["P2", "P3"])];
    const result = findBestRotationBatchSelection(players, {
      ...socialOptions,
      completedMatches: completed,
    });

    expect(new Set(result.selection!.selections[0].ids)).toEqual(new Set(["P0", "P1", "P2", "P3"]));
    expect(result.chosenNewCourtmatePairCount).toBe(0);
    expect(result.selection!.selections[0].players.map((player) => player.effectiveMatchCount)).toEqual([0, 0, 0, 0]);
  });

  it("selects overdue players across a two-court batch before maximizing courtmate gain", () => {
    const players = makePlayers(12, 6, (index) => ({ restTurns: index < 4 ? 3 : 2 }));
    const completed = [partition(["P0", "P1"], ["P2", "P3"])];
    const result = findBestRotationBatchSelection(players, {
      ...socialOptions,
      courtCount: 2,
      completedMatches: completed,
    });
    const selected = new Set(result.selection!.selections.flatMap((court) => court.ids));

    expect(result.priorityCertified).toBe(true);
    expect(["P0", "P1", "P2", "P3"].every((id) => selected.has(id))).toBe(true);
    expect(result.selection!.selections[0].socialStarvation?.leftOutOverdueCount).toBe(0);
  });

  it("keeps courtmate priority inactive with standard gate certification, rejects Balanced opt-in, and marks limited search uncertified", () => {
    const players = makePlayers(8, 4, () => ({ restTurns: 1 }));
    const defaultOptions = {
      courtCount: 1,
      sessionMode: SessionMode.MIXICANO,
      sessionType: SessionType.SOCIAL_MIX,
      randomFn: zeroRandom,
    };
    const standard = findBestRotationBatchSelection(players, defaultOptions);
    expect(standard.socialPriorityPolicy).toBeUndefined();
    expect(standard.priorityCertified).toBeUndefined();
    expect(standard.coverageGateStatus).toBe("CERTIFIED");
    expect(standard.replayEnvelopeStatus).toBe("CERTIFIED");
    expect(standard.coverageGateCertified).toBe(true);
    expect(standard.replayCertified).toBe(true);
    expect(() => findBestRotationBatchSelection(players, {
      ...defaultOptions,
      sessionType: SessionType.POINTS,
      socialPriorityPolicy: "courtmate-first",
    })).toThrow(/only for SOCIAL_MIX/);

    const limited = findBestRotationBatchSelection(players, {
      ...socialOptions,
      searchLimits: { maxBranches: 0 },
    });
    expect(limited.debug.searchLimitReached).toBe(true);
    expect(limited.priorityCertified).toBe(false);
  });
});
