import { describe, expect, it } from "vitest";
import controlFixture from "./socialCourtmateBeneficialRescueControl.json";
import { SessionMode, SessionType } from "../../../types/enums";
import { findBestRotationBatchSelection } from "./socialBatch";
import type { MatchmakerV3Player, SocialHistoryMatch } from "./types";

type HistoryFixture = readonly [readonly number[], "MIXED" | "OWN_SIDE"];

function parkMiller(seed: number) {
  let state = Math.abs(Math.floor(seed)) % 2_147_483_647;
  if (state === 0) state = 1;
  return () => {
    state = (state * 48_271) % 2_147_483_647;
    return state / 2_147_483_647;
  };
}

function makePlayers(count: number): MatchmakerV3Player[] {
  const upperCount = Math.floor(count / 2);
  return Array.from({ length: count }, (_value, index) => {
    const upper = index < upperCount;
    return {
      userId: `P${index}`,
      matchesPlayed: 0,
      matchmakingBaseline: 0,
      availableSince: new Date("2026-10-03T00:00:00.000Z"),
      arrivalPriorityAt: null,
      restTurns: 1,
      strength: 10 + (count - index - 1) * 0.1,
      pointDiff: 0,
      gender: upper ? "FEMALE" : "MALE",
      partnerPreference: upper ? "OPEN" : "FEMALE_FLEX",
      mixedSideOverride: upper ? "UPPER" : "LOWER",
      isBusy: false,
      isPaused: false,
    };
  });
}

function makeFixtureHistory(fixtures: readonly HistoryFixture[]): SocialHistoryMatch[] {
  return fixtures.map(([indexes], index) => {
    const upper = indexes.filter((player) => player < 4).map((player) => `P${player}`);
    const lower = indexes.filter((player) => player >= 4).map((player) => `P${player}`);
    const teams = upper.length === 2 && lower.length === 2
      ? [[upper[0], lower[0]], [upper[1], lower[1]]]
      : [[...indexes.slice(0, 2).map((player) => `P${player}`)], [...indexes.slice(2, 4).map((player) => `P${player}`)]];
    return {
      id: `control-history-${index + 1}`,
      team1: teams[0] as [string, string],
      team2: teams[1] as [string, string],
      completedAt: new Date(Date.UTC(2025, 0, index + 1)),
    };
  });
}

function partitionKey(partition: { team1: readonly string[]; team2: readonly string[] }) {
  return [partition.team1, partition.team2].map((team) => [...team].sort().join("+")).sort().join("/");
}

function projectResult(result: ReturnType<typeof findBestRotationBatchSelection>) {
  const selection = result.selection;
  return JSON.parse(JSON.stringify({
    scheduleIndex: result.scheduleIndex,
    fairnessCertified: result.fairnessCertified,
    starvationCertified: result.starvationCertified,
    replayCertified: result.replayCertified,
    replayEnvelopeStatus: result.replayEnvelopeStatus,
    coverageGateCertified: result.coverageGateCertified,
    coverageGateStatus: result.coverageGateStatus,
    varietyOptimal: result.varietyOptimal,
    priorityCertified: result.priorityCertified,
    searchLimitReached: result.debug.searchLimitReached,
    courtmateGainMaximumCertified: result.courtmateGainMaximumCertified,
    courtmateGainMaximum: result.courtmateGainMaximum,
    chosenCourtmateGainDeficit: result.chosenCourtmateGainDeficit,
    bestRollingMatchTypeGainAtGmax: result.bestRollingMatchTypeGainAtGmax,
    chosenRollingMatchTypeGain: result.chosenRollingMatchTypeGain,
    chosenNewCourtmatePairCount: result.chosenNewCourtmatePairCount,
    chosenPostBatchCourtmateCoverage: result.chosenPostBatchCourtmateCoverage,
    failureReason: result.debug.failureReason,
    selection: selection && {
      courts: selection.selections.map((court) => ({
        ids: [...court.ids].sort(),
        partition: partitionKey(court.partition),
        balanceGap: court.balanceGap,
        pointDiffGap: court.pointDiffGap,
        randomScore: court.randomScore,
        pairingRandomScore: court.pairingRandomScore,
        socialVariety: court.socialVariety,
        socialVarietyGains: court.socialVarietyGains,
        socialStarvation: court.socialStarvation,
        sharedCourtRepeatPenalty: court.sharedCourtRepeatPenalty,
        sharedCourtEncounterFrequencyPenalty: court.sharedCourtEncounterFrequencyPenalty,
        partnerRepeatPenalty: court.partnerRepeatPenalty,
        opponentRepeatPenalty: court.opponentRepeatPenalty,
        exactRematchPenalty: court.exactRematchPenalty,
      })),
      restSummary: selection.restSummary,
      maxBalanceGap: selection.maxBalanceGap,
      totalBalanceGap: selection.totalBalanceGap,
      maxPointDiffGap: selection.maxPointDiffGap,
      totalPointDiffGap: selection.totalPointDiffGap,
      totalSharedCourtRepeatPenalty: selection.totalSharedCourtRepeatPenalty,
      totalSharedCourtEncounterFrequencyPenalty: selection.totalSharedCourtEncounterFrequencyPenalty,
      totalPartnerRepeatPenalty: selection.totalPartnerRepeatPenalty,
      totalOpponentRepeatPenalty: selection.totalOpponentRepeatPenalty,
      totalExactRematchPenalty: selection.totalExactRematchPenalty,
      totalSocialVarietyGains: selection.totalSocialVarietyGains,
      totalRelationshipEntropyGain: selection.totalRelationshipEntropyGain,
      totalPairingRandomScore: selection.totalPairingRandomScore,
      sidePairingLayoutKeys: selection.sidePairingLayoutKeys,
      sidePairingRandomScores: selection.sidePairingRandomScores,
    },
  }));
}

function makeCase(label: string) {
  if (label === "positive_signed_t") {
    return {
      players: makePlayers(8),
      history: makeFixtureHistory([
        [[0, 1, 2, 3], "OWN_SIDE"], [[2, 3, 5, 7], "MIXED"], [[1, 2, 5, 6], "MIXED"],
        [[1, 3, 5, 6], "MIXED"], [[1, 3, 4, 5], "MIXED"], [[0, 1, 4, 5], "MIXED"],
        [[0, 2, 5, 7], "MIXED"], [[2, 3, 4, 7], "MIXED"],
      ]),
      randomFn: parkMiller(4729),
    };
  }
  if (label === "tied_signed_t") {
    return {
      players: makePlayers(8),
      history: makeFixtureHistory([
        [[2, 3, 4, 7], "MIXED"], [[0, 1, 2, 3], "OWN_SIDE"], [[1, 2, 4, 5], "MIXED"],
        [[0, 3, 5, 6], "MIXED"],
      ]),
      randomFn: parkMiller(4729),
    };
  }
  if (label === "negative_gmax_recovery") {
    return {
      players: makePlayers(8),
      history: makeFixtureHistory([
        [[0, 2, 5, 7], "MIXED"], [[0, 2, 6, 7], "MIXED"], [[4, 5, 6, 7], "OWN_SIDE"],
        [[0, 1, 2, 3], "OWN_SIDE"], [[0, 3, 4, 5], "MIXED"], [[0, 1, 4, 6], "MIXED"],
        [[2, 3, 5, 6], "MIXED"], [[0, 3, 4, 6], "MIXED"], [[1, 2, 5, 7], "MIXED"],
        [[0, 3, 6, 7], "MIXED"], [[0, 3, 4, 6], "MIXED"],
      ]),
      randomFn: parkMiller(4729),
    };
  }
  if (label === "fairness_arrival_locked_player") {
    const players = makePlayers(10);
    for (let index = 0; index < players.length; index += 1) {
      players[index].arrivalPriorityAt = new Date(Date.UTC(2010, 0, index));
    }
    players[4].arrivalPriorityAt = new Date("2030-01-01T00:00:00.000Z");
    players[8].arrivalPriorityAt = new Date("2040-01-01T00:00:00.000Z");
    players[9].matchesPlayed = 1;
    return {
      players,
      history: [] as SocialHistoryMatch[],
      randomFn: parkMiller(4729),
      lockedPlayerIds: new Set(["P9"]),
    };
  }
  if (label === "overdue_starvation") {
    const players = makePlayers(10);
    players[8].restTurns = 5;
    players[9].restTurns = 6;
    return {
      players,
      history: [] as SocialHistoryMatch[],
      randomFn: parkMiller(104729),
    };
  }
  if (label === "schedule_rank") {
    const exactQuartet = (ids: readonly string[]) => ({
      isQuartetAllowed: (quartet: [{ userId: string }, { userId: string }, { userId: string }, { userId: string }]) =>
        quartet.map((player) => player.userId).sort().join("|") === [...ids].sort().join("|"),
    });
    return {
      players: makePlayers(8),
      history: makeFixtureHistory([[[0, 1, 4, 5], "MIXED"], [[2, 3, 6, 7], "MIXED"]]),
      randomFn: parkMiller(1),
      schedules: [
        { rank: 1, courts: [exactQuartet(["P0", "P2", "P4", "P6"]), exactQuartet(["P1", "P3", "P5", "P7"])] },
        { rank: 0, courts: [exactQuartet(["P0", "P1", "P4", "P5"]), exactQuartet(["P2", "P3", "P6", "P7"])] },
      ],
    };
  }
  if (label === "side_balanced_salt_zero" || label === "side_balanced_salt_nonzero") {
    return {
      players: makePlayers(8),
      history: [] as SocialHistoryMatch[],
      randomFn: () => label === "side_balanced_salt_zero" ? 0 : 0.517,
      pairingRandomMode: "side-balanced" as const,
    };
  }
  throw new Error(`Unknown frozen control fixture: ${label}`);
}

describe("beneficial-rescue original-control winner fixtures", () => {
  it("uses the hash-pinned original control and source manifest", () => {
    expect(controlFixture.controlEngineSha256).toBe("40538cb672c3a8cef256192b114dffb28bc853f8c1aa28790af40775f79b64e6");
    expect(controlFixture.controlManifestSha256).toBe("4e2a366de02eb9c5a0f7f4c3acb5b559cdca19d70f01c80b401a1fdeca79537b");
    expect(controlFixture.currentEngineSha256).toBe("3fac6611ba7d116aab040b36e2f5e13b9ddfd1cbdd5d81f43d5051c83294ceb7");
  });

  it.each(controlFixture.cases)("matches complete frozen winner projection for $label", ({ label, winnerProjection }) => {
    const fixture = makeCase(label);
    const { players, history, randomFn, ...scenarioOptions } = fixture;
    const result = findBestRotationBatchSelection(players, {
      courtCount: 2,
      rotationPlayerCount: players.filter((player) => !player.isPaused).length,
      sessionMode: SessionMode.MIXICANO,
      sessionType: SessionType.SOCIAL_MIX,
      respectPlayerRest: true,
      socialPriorityPolicy: "courtmate-beneficial-rescue",
      completedMatches: history,
      socialHistoryMatches: history,
      randomFn,
      ...scenarioOptions,
    });
    expect(result.priorityCertified).toBe(true);
    expect(result.debug.searchLimitReached).toBe(false);
    expect(projectResult(result)).toEqual(winnerProjection);
  });
});
