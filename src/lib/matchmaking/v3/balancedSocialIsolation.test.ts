import { describe, expect, it } from "vitest";
import { resolveSocialCandidatePolicy } from "../../../app/api/sessions/[code]/generate-match/socialCandidateAcceptance";
import { SessionMode, SessionType } from "../../../types/enums";
import { findBestRotationBatchSelection } from "./socialBatch";
import type { MatchmakerV3Player, V3CompletedMatch } from "./types";

/**
 * Golden Balanced outputs from the unchanged pre-default matcher source set,
 * SHA-256 29796f62c251f29fbd471ba9368470456dc8feeed0dbf7603f8e21ded8610dd9.
 * The focused projections cover Points and Elo, both rotation modes, normal
 * rest handling, completed history, a locked player, and an overdue player.
 */
const balancedCases = [
  { name: "points-mexicano-8", count: 8, courts: 1, mode: SessionMode.MEXICANO, type: SessionType.POINTS, seed: 4729 },
  { name: "elo-mixicano-8", count: 8, courts: 1, mode: SessionMode.MIXICANO, type: SessionType.ELO, seed: 104729 },
] as const;

function makeRoster(count: number, type: SessionType): MatchmakerV3Player[] {
  const upperCount = Math.ceil(count / 2);
  return Array.from({ length: count }, (_unused, index) => {
    const isUpper = index < upperCount;
    return {
      userId: `P${index + 1}`,
      strength: type === SessionType.ELO
        ? 890 + (count - index) * 31 + (index % 3) * 7
        : 8 + (count - index) * 0.7 + (index % 3) * 0.15,
      pointDiff: ((index * 5) % 9) - 4,
      matchesPlayed: 0,
      matchmakingBaseline: 0,
      availableSince: new Date(Date.UTC(2026, 9, 1, 0, index)),
      restTurns: index === count - 1 ? 3 : 0,
      gender: isUpper ? "MALE" : "FEMALE",
      partnerPreference: isUpper ? "OPEN" : "FEMALE_FLEX",
    };
  });
}

function makeHistory(mode: SessionMode): V3CompletedMatch[] {
  const mixedPairing: [string, string] = ["P1", "P5"];
  const mixedPairingTwo: [string, string] = ["P2", "P6"];
  const standardPairing: [string, string] = ["P1", "P2"];
  const standardPairingTwo: [string, string] = ["P3", "P4"];
  return Array.from({ length: 4 }, (_unused, index) => ({
    id: `history-${index + 1}`,
    team1: mode === SessionMode.MIXICANO
      ? mixedPairing
      : index % 2 === 0 ? standardPairing : ["P1", "P3"],
    team2: mode === SessionMode.MIXICANO
      ? mixedPairingTwo
      : index % 2 === 0 ? standardPairingTwo : ["P2", "P4"],
    completedAt: new Date(Date.UTC(2026, 8, 30, index)),
  }));
}

function parkMiller(seed: number) {
  let state = seed;
  return () => {
    state = state * 48271 % 2147483647;
    return state / 2147483647;
  };
}

function runBalancedCase(testCase: typeof balancedCases[number]) {
  const players = makeRoster(testCase.count, testCase.type);
  const completedMatches = makeHistory(testCase.mode);
  return findBestRotationBatchSelection(players, {
    courtCount: testCase.courts,
    sessionMode: testCase.mode,
    sessionType: testCase.type,
    completedMatches,
    socialHistoryMatches: completedMatches,
    lockedPlayerIds: new Set(["P1"]),
    respectPlayerRest: true,
    randomFn: parkMiller(testCase.seed),
  });
}

function balancedProjection(result: ReturnType<typeof runBalancedCase>) {
  return {
    scheduleIndex: result.scheduleIndex,
    selections: result.selection?.selections.map((court) => ({
      ids: [...court.ids].sort(),
      team1: [...court.partition.team1].sort(),
      team2: [...court.partition.team2].sort(),
      balanceGap: court.balanceGap,
      pointDiffGap: court.pointDiffGap,
      courtType: court.socialVariety?.courtType ?? null,
      socialStarvation: court.socialStarvation,
    })) ?? null,
    batchMetrics: result.selection ? {
      maxBalanceGap: result.selection.maxBalanceGap,
      totalBalanceGap: result.selection.totalBalanceGap,
      totalPointDiffGap: result.selection.totalPointDiffGap,
      totalSocialVarietyGain: result.selection.totalSocialVarietyGain,
    } : null,
    balanceGuardrail: result.debug.balanceGuardrail ?? null,
    certificates: {
      fairness: result.fairnessCertified,
      schedule: result.scheduleCertified,
      starvation: result.starvationCertified,
      balance: result.debug.balanceCertified,
      replay: result.debug.replayCertified,
      coverage: result.debug.coverageGateCertified,
      searchLimitReached: result.debug.searchLimitReached,
    },
    experimentalSocialMetadata: {
      policy: result.socialPriorityPolicy ?? null,
      priorityCertified: result.priorityCertified ?? null,
      courtmateGainMaximum: result.courtmateGainMaximum ?? null,
      chosenCourtmateGain: result.chosenNewCourtmatePairCount ?? null,
      chosenRollingTypeGain: result.chosenRollingMatchTypeGain ?? null,
      bestRollingTypeGainAtGmax: result.bestRollingMatchTypeGainAtGmax ?? null,
    },
  };
}

describe("Balanced remains isolated from the production Social policy", () => {
  it.each([SessionType.POINTS, SessionType.ELO])("does not resolve a Social policy for Balanced %s", (sessionType) => {
    expect(resolveSocialCandidatePolicy(sessionType)).toBeUndefined();
    expect(resolveSocialCandidatePolicy(sessionType, "courtmate-beneficial-rescue")).toBeUndefined();
  });

  it("resolves beneficial-rescue only for Social", () => {
    expect(resolveSocialCandidatePolicy(SessionType.SOCIAL_MIX)).toBe("courtmate-beneficial-rescue");
  });

  it.each([SessionType.POINTS, SessionType.ELO])(
    "rejects every Social priority policy if directly requested for Balanced %s",
    (sessionType) => {
      const players = makeRoster(8, sessionType);
      const socialPolicies = [
        "courtmate-first",
        "courtmate-near-best",
        "courtmate-beneficial-rescue",
      ] as const;
      for (const socialPriorityPolicy of socialPolicies) {
        expect(() => findBestRotationBatchSelection(players, {
          courtCount: 2,
          sessionMode: SessionMode.MEXICANO,
          sessionType,
          socialPriorityPolicy,
        })).toThrow("socialPriorityPolicy is supported only for SOCIAL_MIX sessions.");
      }
    }
  );

  it("keeps frozen Balanced selection and balance metrics for Points and Elo", () => {
    const projections = balancedCases.map((testCase) => {
      const result = runBalancedCase(testCase);

      expect(result.selection?.selections).toHaveLength(testCase.courts);
      expect(result.debug.balanceCertified).toBe(true);
      expect(result.debug.balanceGuardrail?.baselineCertified).toBe(true);
      expect(result.fairnessCertified).toBe(true);
      expect(result.scheduleCertified).toBe(true);
      expect(result.starvationCertified).toBe(true);
      expect(result.debug.searchLimitReached).toBe(false);
      expect(result.selection?.selections.flatMap((court) => court.ids)).toContain("P1");
      expect(result.selection?.selections.flatMap((court) => court.ids)).toContain("P8");
      expect(result.socialPriorityPolicy).toBeUndefined();
      expect(result.priorityCertified).toBeUndefined();
      expect(result.courtmateGainMaximum).toBeUndefined();
      expect(result.chosenRollingMatchTypeGain).toBeUndefined();
      expect(result.debug.socialPriorityPolicy).toBeUndefined();
      expect(result.debug.priorityCertified).toBeUndefined();
      return { name: testCase.name, ...balancedProjection(result) };
    });

    expect(projections).toMatchInlineSnapshot(`
      [
        {
          "balanceGuardrail": {
            "absoluteCeiling": null,
            "allowedMaxBalanceGap": 1.5,
            "allowedTotalBalanceGap": null,
            "baselineCertified": true,
            "bestMaxBalanceGap": 0,
            "bestTotalBalanceGap": 0,
            "ceilingFeasible": true,
            "mode": "POINTS",
            "nearBestWindow": 1.5,
          },
          "batchMetrics": {
            "maxBalanceGap": 0.5499999999999989,
            "totalBalanceGap": 0.5499999999999989,
            "totalPointDiffGap": 0.5,
            "totalSocialVarietyGain": 3.4269524352746403,
          },
          "certificates": {
            "balance": true,
            "coverage": true,
            "fairness": true,
            "replay": true,
            "schedule": true,
            "searchLimitReached": false,
            "starvation": true,
          },
          "experimentalSocialMetadata": {
            "bestRollingTypeGainAtGmax": null,
            "chosenCourtmateGain": null,
            "chosenRollingTypeGain": null,
            "courtmateGainMaximum": null,
            "policy": null,
            "priorityCertified": null,
          },
          "name": "points-mexicano-8",
          "scheduleIndex": 0,
          "selections": [
            {
              "balanceGap": 0.5499999999999989,
              "courtType": null,
              "ids": [
                "P1",
                "P5",
                "P6",
                "P8",
              ],
              "pointDiffGap": 0.5,
              "socialStarvation": {
                "availableOverdueCount": 1,
                "highestLeftOutRestTurns": 0,
                "idealRestGap": 1,
                "leftOutOverdueCount": 0,
                "selectedOverdueCount": 1,
                "totalLeftOutRestTurns": 0,
              },
              "team1": [
                "P5",
                "P6",
              ],
              "team2": [
                "P1",
                "P8",
              ],
            },
          ],
        },
        {
          "balanceGuardrail": {
            "absoluteCeiling": 50,
            "allowedMaxBalanceGap": 30,
            "allowedTotalBalanceGap": null,
            "baselineCertified": true,
            "bestMaxBalanceGap": 0,
            "bestTotalBalanceGap": 0,
            "ceilingFeasible": true,
            "mode": "RATING",
            "nearBestWindow": 30,
          },
          "batchMetrics": {
            "maxBalanceGap": 12,
            "totalBalanceGap": 12,
            "totalPointDiffGap": 2,
            "totalSocialVarietyGain": 3.5338145914070473,
          },
          "certificates": {
            "balance": true,
            "coverage": true,
            "fairness": true,
            "replay": true,
            "schedule": true,
            "searchLimitReached": false,
            "starvation": true,
          },
          "experimentalSocialMetadata": {
            "bestRollingTypeGainAtGmax": null,
            "chosenCourtmateGain": null,
            "chosenRollingTypeGain": null,
            "courtmateGainMaximum": null,
            "policy": null,
            "priorityCertified": null,
          },
          "name": "elo-mixicano-8",
          "scheduleIndex": 0,
          "selections": [
            {
              "balanceGap": 12,
              "courtType": "MIXED",
              "ids": [
                "P1",
                "P3",
                "P7",
                "P8",
              ],
              "pointDiffGap": 2,
              "socialStarvation": {
                "availableOverdueCount": 1,
                "highestLeftOutRestTurns": 0,
                "idealRestGap": 1,
                "leftOutOverdueCount": 0,
                "selectedOverdueCount": 1,
                "totalLeftOutRestTurns": 0,
              },
              "team1": [
                "P1",
                "P8",
              ],
              "team2": [
                "P3",
                "P7",
              ],
            },
          ],
        },
      ]
    `);
  });
});
