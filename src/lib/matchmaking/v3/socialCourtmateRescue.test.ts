import { describe, expect, it } from "vitest";
import { PartnerPreference, PlayerGender, SessionMode, SessionType } from "../../../types/enums";
import type { BenchmarkPlayer } from "./socialCoverageBenchmark";
import { auditSocialCourtmateNearBestSelection } from "./socialCoverageBenchmark";
import { findBestRotationBatchSelection } from "./socialBatch";
import type { SocialHistoryMatch, V3DoublesPartition } from "./types";

function makePlayers(count: number, maleCount = count) {
  return Array.from({ length: count }, (_value, index) => {
    const gender = index < maleCount ? PlayerGender.MALE : PlayerGender.FEMALE;
    return {
      userId: `P${index + 1}`,
      matchesPlayed: 0,
      matchmakingBaseline: 0,
      availableSince: new Date("2026-10-03T00:00:00.000Z"),
      arrivalPriorityAt: null,
      restTurns: 0,
      strength: 1,
      pointDiff: 0,
      gender,
      partnerPreference: gender === PlayerGender.FEMALE ? PartnerPreference.FEMALE_FLEX : PartnerPreference.OPEN,
      mixedSideOverride: null,
      lastPartnerId: null,
      isBusy: false,
      isPaused: false,
    } satisfies BenchmarkPlayer;
  });
}

function match(
  id: string,
  team1: [string, string],
  team2: [string, string],
  courtType: "MIXED" | "UPPER" | "LOWER"
): SocialHistoryMatch {
  return {
    id,
    team1,
    team2,
    socialVariety: {
      version: 1,
      basis: "EFFECTIVE_MIXED_SIDE",
      courtType,
      effectiveSideByUserId: {},
    },
  };
}

function partition(team1: [string, string], team2: [string, string]): V3DoublesPartition {
  return { team1, team2 };
}

describe("independent courtmate-near-best oracle", () => {
  it("certifies Gmax separately and never admits a two-pair sacrifice for one or two courts", () => {
    const players = makePlayers(8);
    const completed = [match("old-clique", ["P1", "P2"], ["P3", "P4"], "UPPER")];

    const oneCourt = auditSocialCourtmateNearBestSelection(players, completed, [{
      ids: ["P1", "P2", "P3", "P4"],
      partition: partition(["P1", "P2"], ["P3", "P4"]),
    }], 1);
    expect(oneCourt.complete).toBe(true);
    expect(oneCourt.courtmateGainMaximumCertified).toBe(true);
    expect(oneCourt.courtmateGainMaximum).toBe(6);
    expect(oneCourt.selectedObjective?.newCourtmatePairs).toBe(0);
    expect(oneCourt.courtmateGainMaximum! - oneCourt.selectedObjective!.newCourtmatePairs).toBeGreaterThan(1);

    const twoCourt = auditSocialCourtmateNearBestSelection(players, completed, [
      { ids: ["P1", "P2", "P3", "P4"], partition: partition(["P1", "P2"], ["P3", "P4"]) },
      { ids: ["P5", "P6", "P7", "P8"], partition: partition(["P5", "P6"], ["P7", "P8"]) },
    ], 2);
    expect(twoCourt.complete).toBe(true);
    expect(twoCourt.courtmateGainMaximumCertified).toBe(true);
    expect(twoCourt.courtmateGainMaximum).toBe(10);
    expect(twoCourt.selectedObjective?.newCourtmatePairs).toBe(6);
    expect(twoCourt.courtmateGainMaximum! - twoCourt.selectedObjective!.newCourtmatePairs).toBeGreaterThan(1);

    const admittedChoices = twoCourt.bestAdmittedChoices!.map(({ ids, partition: selectedPartition }) => ({
      ids,
      partition: selectedPartition,
    }));
    const certifiedAdmitted = auditSocialCourtmateNearBestSelection(players, completed, admittedChoices, 2);
    expect(certifiedAdmitted.selectedObjective?.newCourtmatePairs).toBeGreaterThanOrEqual(
      certifiedAdmitted.courtmateGainMaximum! - 1
    );
    expect(certifiedAdmitted.selectedObjective).toEqual(certifiedAdmitted.bestObjective);
    expect(certifiedAdmitted.admittedCandidateCount).toBeLessThan(certifiedAdmitted.candidateCount);
  });

  it("retains negative signed T when appending a type expires the only old type", () => {
    const players = makePlayers(14, 7);
    const completed: SocialHistoryMatch[] = [
      match("old-male", ["P1", "P2"], ["P3", "P4"], "UPPER"),
      match("old-female", ["P8", "P9"], ["P10", "P11"], "LOWER"),
    ];
    for (let round = 0; round < 5; round += 1) {
      completed.push(match(`mixed-a-${round}`, ["P1", "P8"], ["P5", "P12"], "MIXED"));
      completed.push(match(`mixed-b-${round}`, ["P2", "P9"], ["P6", "P13"], "MIXED"));
    }
    const selected = [{
      ids: ["P1", "P2", "P8", "P9"],
      partition: partition(["P1", "P8"], ["P2", "P9"]),
    }];
    const audit = auditSocialCourtmateNearBestSelection(players, completed, selected, 1);
    const typeWindows = audit.selectedObjective && audit.courtmateGainMaximum !== null
      ? audit.selectedObjective.signedRollingTypeDelta
      : null;
    expect(typeWindows).not.toBeNull();
    expect(Number(typeWindows) / Number(audit.rollingTypeDenominator)).toBe(-2);
  });

  it("keeps fairness absolute and starvation safety absolute in the production class", () => {
    const selected = [{
      ids: ["P1", "P2", "P3", "P4"],
      partition: partition(["P1", "P2"], ["P3", "P4"]),
    }];
    const countUnequal = makePlayers(5);
    countUnequal[4].matchesPlayed = 0;
    for (let index = 0; index < 4; index += 1) countUnequal[index].matchesPlayed = 1;
    const fairnessAudit = auditSocialCourtmateNearBestSelection(countUnequal, [], selected, 1, false);
    expect(fairnessAudit.selectedFairnessCertified).toBe(false);

    const overdue = makePlayers(5);
    overdue[4].restTurns = 4;
    const starvationAudit = auditSocialCourtmateNearBestSelection(overdue, [], selected, 1, true);
    expect(starvationAudit.selectedFairnessCertified).toBe(true);
    expect(starvationAudit.selectedStarvationCertified).toBe(false);
    const withoutStarvation = auditSocialCourtmateNearBestSelection(overdue, [], selected, 1, false);
    expect(withoutStarvation.selectedFairnessCertified).toBe(true);
    expect(withoutStarvation.selectedStarvationCertified).toBe(true);
  });

  it("leaves near-best Gmax uncertified when the optimizer hits an early branch limit", () => {
    const result = findBestRotationBatchSelection(makePlayers(14, 7), {
      courtCount: 1,
      rotationPlayerCount: 14,
      sessionMode: SessionMode.MIXICANO,
      sessionType: SessionType.SOCIAL_MIX,
      respectPlayerRest: true,
      completedMatches: [],
      socialHistoryMatches: [],
      socialPriorityPolicy: "courtmate-near-best",
      searchLimits: { maxBranches: 0 },
      randomFn: () => 0,
    });
    expect(result.debug.searchLimitReached).toBe(true);
    expect(result.priorityCertified).toBe(false);
    expect(result.courtmateGainMaximumCertified).toBe(false);
  });

  it("matches the engine's actual post-batch courtmate profile to the independent oracle", () => {
    const players = makePlayers(8);
    const result = findBestRotationBatchSelection(players, {
      courtCount: 1,
      rotationPlayerCount: 14,
      sessionMode: SessionMode.MIXICANO,
      sessionType: SessionType.SOCIAL_MIX,
      respectPlayerRest: true,
      completedMatches: [],
      socialHistoryMatches: [],
      socialPriorityPolicy: "courtmate-near-best",
      randomFn: () => 0,
    });
    expect(result.selection?.selections).toHaveLength(1);
    expect(result.courtmateGainMaximumCertified).toBe(true);
    const audit = auditSocialCourtmateNearBestSelection(players, [], result.selection!.selections.map((selection) => ({
      ids: selection.ids,
      partition: selection.partition,
    })), 1);
    expect(result.chosenPostBatchCourtmateCoverage).toEqual(audit.selectedObjective?.ascendingCoverageProfile);
    expect(audit.selectedObjective).toEqual(audit.bestObjective);
  });
});
