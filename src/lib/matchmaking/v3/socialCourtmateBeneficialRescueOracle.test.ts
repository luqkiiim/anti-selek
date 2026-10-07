import { describe, expect, it } from "vitest";
import { PartnerPreference, PlayerGender, SessionMode, SessionType } from "../../../types/enums";
import type { BenchmarkPlayer } from "./socialCoverageBenchmark";
import {
  auditSocialCourtmateBeneficialRescueSelection,
  isCourtmateBeneficialRescueAdmitted,
} from "./socialCoverageBenchmark";
import { buildSocialVarietyContext, getSocialVarietySnapshot } from "./socialVariety";
import { findBestRotationBatchSelection } from "./socialBatch";
import type { SocialHistoryMatch } from "./types";

type HistoryFixture = readonly [readonly number[], "MIXED" | "OWN_SIDE"];

function makePlayers(): BenchmarkPlayer[] {
  return Array.from({ length: 8 }, (_value, index) => {
    const upper = index < 4;
    const gender = upper ? PlayerGender.FEMALE : PlayerGender.MALE;
    return {
      userId: `P${index}`,
      matchesPlayed: 0,
      matchmakingBaseline: 0,
      availableSince: new Date("2026-01-01T00:00:00.000Z"),
      arrivalPriorityAt: null,
      restTurns: 1,
      strength: 1000,
      pointDiff: 0,
      gender,
      partnerPreference: upper ? PartnerPreference.OPEN : PartnerPreference.FEMALE_FLEX,
      mixedSideOverride: upper ? "UPPER" : "LOWER",
      lastPartnerId: null,
      isBusy: false,
      isPaused: false,
    } satisfies BenchmarkPlayer;
  });
}

function makeCompletedHistory(
  players: BenchmarkPlayer[],
  fixtures: readonly HistoryFixture[]
): SocialHistoryMatch[] {
  const unstamped = fixtures.map(([indexes], index) => {
    const upper = indexes.filter((player) => player < 4).map((player) => `P${player}`);
    const lower = indexes.filter((player) => player >= 4).map((player) => `P${player}`);
    const teams = indexes.filter((player) => player < 4).length === 2
      ? [[upper[0], lower[0]], [upper[1], lower[1]]]
      : [[...indexes.slice(0, 2).map((player) => `P${player}`)],
        [...indexes.slice(2, 4).map((player) => `P${player}`)]];
    return {
      id: `completed-${index + 1}`,
      team1: teams[0] as [string, string],
      team2: teams[1] as [string, string],
    } satisfies SocialHistoryMatch;
  });
  const context = buildSocialVarietyContext(players, unstamped, {
    sessionMode: SessionMode.MIXICANO,
    includePausedPlayers: true,
  });
  return unstamped.map((match) => ({
    ...match,
    // The benchmark audits the same snapshot-inferred court type as completed history.
    socialVariety: getSocialVarietySnapshot(match, context),
  }));
}

function courtKeys(courts: readonly { ids: string[]; partition: { team1: string[]; team2: string[] } }[]) {
  return courts.map((court) => {
    const teams = [court.partition.team1, court.partition.team2]
      .map((team) => [...team].sort().join("+"))
      .sort();
    return `${[...court.ids].sort().join("|")}::${teams.join("/")}`;
  }).sort();
}

const policyOptions = {
  courtCount: 2,
  rotationPlayerCount: 14,
  sessionMode: SessionMode.MIXICANO,
  sessionType: SessionType.SOCIAL_MIX,
  respectPlayerRest: true,
  socialPriorityPolicy: "courtmate-beneficial-rescue" as const,
  randomFn: () => 0,
};

describe("independent courtmate-beneficial-rescue oracle", () => {
  it.each([
    ["A admits a strict positive rescue", 6, 0, 5, 1, true],
    ["B rejects a rescue tied with the full-gain frontier", 6, 1, 5, 1, false],
    ["C rejects a zero-benefit rescue", 6, 0, 5, 0, false],
    ["D admits recovery from a negative full-gain frontier", 6, -1, 5, 0, true],
  ] as const)("%s", (_label, gMax, tMax, gain, t, expected) => {
    expect(isCourtmateBeneficialRescueAdmitted(gain, gMax, BigInt(t), BigInt(tMax))).toBe(expected);
  });

  it("independently certifies positive, tied, and negative Gmax frontiers plus the strict Gmax reference", () => {
    const fixtureHistories: HistoryFixture[][] = [
      [
        [[0, 1, 2, 3], "OWN_SIDE"], [[2, 3, 5, 7], "MIXED"], [[1, 2, 5, 6], "MIXED"],
        [[1, 3, 5, 6], "MIXED"], [[1, 3, 4, 5], "MIXED"], [[0, 1, 4, 5], "MIXED"],
        [[0, 2, 5, 7], "MIXED"], [[2, 3, 4, 7], "MIXED"],
      ],
      [
        [[2, 3, 4, 7], "MIXED"], [[0, 1, 2, 3], "OWN_SIDE"], [[1, 2, 4, 5], "MIXED"],
        [[0, 3, 5, 6], "MIXED"],
      ],
      [
        [[0, 2, 5, 7], "MIXED"], [[0, 2, 6, 7], "MIXED"], [[4, 5, 6, 7], "OWN_SIDE"],
        [[0, 1, 2, 3], "OWN_SIDE"], [[0, 3, 4, 5], "MIXED"], [[0, 1, 4, 6], "MIXED"],
        [[2, 3, 5, 6], "MIXED"], [[0, 3, 4, 6], "MIXED"], [[1, 2, 5, 7], "MIXED"],
        [[0, 3, 6, 7], "MIXED"], [[0, 3, 4, 6], "MIXED"],
      ],
      [
        [[0, 1, 2, 3], "OWN_SIDE"], [[4, 5, 6, 7], "OWN_SIDE"],
        ...Array.from({ length: 5 }, () => [[0, 1, 4, 5], "MIXED"] as const),
        [[2, 3, 6, 7], "MIXED"],
      ],
    ];
    for (const fixtures of fixtureHistories) {
      const players = makePlayers();
      const completedMatches = makeCompletedHistory(players, fixtures);
      const result = findBestRotationBatchSelection(players, {
        ...policyOptions,
        completedMatches,
        socialHistoryMatches: completedMatches,
      });
      const strictResult = findBestRotationBatchSelection(players, {
        ...policyOptions,
        socialPriorityPolicy: "courtmate-first",
        completedMatches,
        socialHistoryMatches: completedMatches,
      });
      const selected = result.selection!.selections.map(({ ids, partition }) => ({ ids, partition }));
      const audit = auditSocialCourtmateBeneficialRescueSelection(players, completedMatches, selected, 2);

      expect(audit.complete).toBe(true);
      expect(audit.courtmateGainMaximumCertified).toBe(true);
      expect(audit.courtmateGainMaximum).toBe(result.courtmateGainMaximum);
      expect(audit.bestRollingMatchTypeGainAtGmax).toBe(
        BigInt(Math.round(result.bestRollingMatchTypeGainAtGmax! * Number(audit.rollingTypeDenominator)))
      );
      expect(audit.selectedObjective).toEqual(audit.bestObjective);
      expect(audit.admittedCandidateCount).toBeGreaterThan(0);
      expect(audit.strictBestGmaxChoices?.reduce((sum, choice) => sum + choice.newCourtmatePairs, 0))
        .toBe(audit.courtmateGainMaximum);
      expect(audit.strictBestGmaxObjective).not.toBeNull();
      expect(courtKeys(audit.strictBestGmaxChoices ?? [])).toEqual(courtKeys(
        strictResult.selection!.selections.map(({ ids, partition }) => ({ ids, partition }))
      ));
      expect(audit.bestRollingMatchTypeGainAtGmax).toBeGreaterThanOrEqual(
        audit.strictBestGmaxObjective!.signedRollingTypeDelta
      );
      const deficit = audit.courtmateGainMaximum! - audit.selectedObjective!.newCourtmatePairs;
      expect(deficit === 0 || deficit === 1).toBe(true);
      if (deficit === 1) {
        expect(audit.selectedObjective!.signedRollingTypeDelta).toBeGreaterThan(audit.bestRollingMatchTypeGainAtGmax!);
      }
    }
  });

  it("does not certify the independent Gmax pass when the productive search limit stops early", () => {
    const result = findBestRotationBatchSelection(makePlayers(), {
      ...policyOptions,
      searchLimits: { maxBranches: 0 },
    });

    expect(result.debug.searchLimitReached).toBe(true);
    expect(result.courtmateGainMaximumCertified).toBe(false);
    expect(result.priorityCertified).toBe(false);
  });
});
