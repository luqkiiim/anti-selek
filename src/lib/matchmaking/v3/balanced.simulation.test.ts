import { describe, expect, it } from "vitest";
import { SessionMode, SessionType } from "../../../types/enums";
import { calculateRestTurnsForPlayer } from "../restTurns";
import { getDoublesPartitions, getPartitionBalanceGap, isValidPartitionForMode } from "./balance";
import { findBestBatchSelectionV3 } from "./batch";
import { findBestSingleCourtSelectionV3 } from "./singleCourt";
import { buildSocialVarietyContext, buildSocialVarietySnapshot } from "./socialVariety";
import { createSimulationPlayers } from "./simulation";
import type { MatchmakerV3Player, SocialHistoryMatch, V3DoublesPartition } from "./types";

const compare = (left: number[], right: number[]) => {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return 0;
};

/** Independent legal single-court oracle, with balance measured inside the best rotation class. */
function rotationOracle(players: MatchmakerV3Player[], mode: SessionMode) {
  const available = players.filter((player) => !player.isPaused && !player.isBusy);
  const byId = new Map(players.map((player) => [player.userId, player]));
  const idealGap = Math.ceil((players.filter((player) => !player.isPaused).length - 4) / 4);
  const overdue = available.filter((player) => (player.restTurns ?? 0) > idealGap);
  let bestRotation: number[] | null = null;
  let bestBalance = Infinity;
  let balanceGaps: number[] = [];
  const rank = (ids: string[]) => {
    const selected = new Set(ids);
    const leftOut = overdue.filter((player) => !selected.has(player.userId));
    return [
      ...ids.map((id) => Math.max(byId.get(id)!.matchesPlayed, byId.get(id)!.matchmakingBaseline)).sort((a, b) => a - b),
      leftOut.length,
      Math.max(0, ...leftOut.map((player) => player.restTurns ?? 0)),
      leftOut.reduce((sum, player) => sum + (player.restTurns ?? 0), 0),
    ];
  };
  for (let a = 0; a < available.length - 3; a += 1) for (let b = a + 1; b < available.length - 2; b += 1)
    for (let c = b + 1; c < available.length - 1; c += 1) for (let d = c + 1; d < available.length; d += 1) {
      const ids = [a, b, c, d].map((index) => available[index].userId) as [string, string, string, string];
      const rotation = rank(ids);
      if (bestRotation && compare(rotation, bestRotation) > 0) continue;
      const legal = getDoublesPartitions(ids).filter((partition) => isValidPartitionForMode(partition, byId, mode));
      if (!legal.length) continue;
      const gaps = legal.map((partition) => getPartitionBalanceGap(partition, byId)!);
      const balance = Math.min(...gaps);
      if (!bestRotation || compare(rotation, bestRotation) < 0) {
        bestRotation = rotation;
        bestBalance = balance;
        balanceGaps = gaps;
      } else {
        bestBalance = Math.min(bestBalance, balance);
        balanceGaps.push(...gaps);
      }
    }
  return { bestRotation, bestBalance, balanceGaps, rank };
}

function summarizeVariety(players: MatchmakerV3Player[], history: SocialHistoryMatch[], mode: SessionMode) {
  const context = buildSocialVarietyContext(players, history, { sessionMode: mode });
  const facets = ["courtmates", "partners", "opponents"] as const;
  const values = [...context.playersByUserId.values()].flatMap((player) => facets.map((facet) => {
    const histogram = player[facet];
    return {
      coverage: [...histogram.counts].filter(([id, count]) => histogram.opportunities.has(id) && count > 0).length / histogram.opportunities.size,
      entropy: histogram.total > 0 && histogram.opportunities.size > 1
        ? (Math.log(histogram.total) - histogram.countLogCountSum / histogram.total) / Math.log(histogram.opportunities.size) : 0,
    };
  }));
  return {
    meanEntropy: values.reduce((sum, value) => sum + value.entropy, 0) / values.length,
    minimumCoverage: Math.min(...values.map((value) => value.coverage)),
    maximumPartnerCount: Math.max(...[...context.playersByUserId.values()].flatMap((player) => [...player.partners.counts.values()])),
    context,
  };
}

function simulate({ men, mode, sessionType, respectPlayerRest, matches, wideSkills = false }: {
  men: number; mode: SessionMode; sessionType: SessionType; respectPlayerRest: boolean; matches: number; wideSkills?: boolean;
}) {
  const players = createSimulationPlayers(14, {
    baseStrength: sessionType === SessionType.ELO ? 900 : 10,
    strengthStep: sessionType === SessionType.ELO ? (wideSkills ? 40 : 4) : (wideSkills ? 1 : 0.1),
  }).map((player, index) => ({ ...player, gender: index < men ? "MALE" : "FEMALE", partnerPreference: index < men ? "OPEN" : "FEMALE_FLEX" }));
  const completed: SocialHistoryMatch[] = [];
  const active = new Map<number, SocialHistoryMatch>();
  let seed = 104729;
  const randomFn = () => { seed = seed * 48271 % 2147483647; return seed / 2147483647; };
  const types: string[] = [];
  const podCounts = new Map<string, number>();
  const checkpoints: Array<{ matches: number; entropy: number; coverage: number }> = [];
  let maximumFairnessGap = 0;
  let maximumRestGap = 0;
  let maximumBalanceGap = 0;
  const legallyDeferred = new Set<string>();
  let unavoidableOverdueEvents = 0;
  let guardrailRestrictedEvents = 0;
  let ratingCeilingFallbackEvents = 0;
  const assign = (court: number, partition: V3DoublesPartition, id: string) => {
    const ids = [...partition.team1, ...partition.team2];
    active.set(court, { id, ...partition, socialVariety: buildSocialVarietySnapshot(partition, players) });
    for (const player of players) if (ids.includes(player.userId)) player.isBusy = true;
  };
  const opening = findBestBatchSelectionV3(players, { courtCount: 2, sessionMode: mode, sessionType, respectPlayerRest, randomFn });
  expect(opening.selection?.selections).toHaveLength(2);
  expect(opening.debug.balanceCertified).toBe(true);
  opening.selection!.selections.forEach((selection, court) => assign(court, selection.partition, `opening-${court}`));

  for (let event = 0; event < matches; event += 1) {
    const court = event % 2;
    const finished = active.get(court)!;
    const completedAt = new Date(Date.UTC(2026, 3, 1, 0, event + 1));
    completed.push({ ...finished, completedAt });
    active.delete(court);
    for (const player of players) if ([...finished.team1, ...finished.team2].includes(player.userId)) {
      player.matchesPlayed += 1;
      player.isBusy = false;
      player.availableSince = completedAt;
    }
    for (const player of players) player.restTurns = calculateRestTurnsForPlayer(player, completed);
    const counts = players.map((player) => player.matchesPlayed);
    maximumFairnessGap = Math.max(maximumFairnessGap, Math.max(...counts) - Math.min(...counts));
    expect(maximumFairnessGap).toBeLessThanOrEqual(1);
    const oracle = rotationOracle(players, mode);
    const history = [...completed, ...active.values()];
    const result = findBestSingleCourtSelectionV3(players, {
      sessionMode: mode, sessionType, respectPlayerRest, completedMatches: completed,
      socialHistoryMatches: history, randomFn,
    });
    const selection = result.selection!;
    expect(selection).not.toBeNull();
    expect(selection.ids.every((id) => !players.find((player) => player.userId === id)!.isBusy)).toBe(true);
    expect(oracle.rank(selection.ids)).toEqual(oracle.bestRotation);
    const ceilingImpossible = sessionType === SessionType.ELO && oracle.bestBalance > 50;
    const allowed = sessionType === SessionType.ELO ? (ceilingImpossible ? oracle.bestBalance : Math.min(50, oracle.bestBalance + 30)) : oracle.bestBalance + 1.5;
    if (ceilingImpossible) {
      ratingCeilingFallbackEvents += 1;
      expect(selection.balanceGap).toBe(oracle.bestBalance);
      expect(result.debug.balanceGuardrail?.ceilingFeasible).toBe(false);
    }
    if (oracle.balanceGaps.some((gap) => gap > allowed + 1e-10)) guardrailRestrictedEvents += 1;
    expect(selection.balanceGap).toBeLessThanOrEqual(allowed + 1e-10);
    expect(result.debug.balanceCertified).toBe(true);
    expect(result.debug.balanceGuardrail?.bestMaxBalanceGap).toBeCloseTo(oracle.bestBalance, 10);
    expect(selection.socialVarietyGains).toBeDefined();
    maximumBalanceGap = Math.max(maximumBalanceGap, selection.balanceGap);
    maximumRestGap = Math.max(maximumRestGap, ...selection.players.map((player) => player.restTurns));
    // Mixed parity can make an overdue player unavailable to the stronger fair
    // count profile. Prove that extra waiting came from that legal profile,
    // rather than entropy or the balance envelope overriding protection.
    for (const player of selection.players) {
      if (player.restTurns > 4) expect(legallyDeferred.has(player.userId)).toBe(true);
      legallyDeferred.delete(player.userId);
    }
    for (const player of players.filter((player) => !player.isBusy && (player.restTurns ?? 0) > 3 && !selection.ids.includes(player.userId))) {
      expect(oracle.bestRotation![4]).toBeGreaterThan(0);
      legallyDeferred.add(player.userId);
      unavoidableOverdueEvents += 1;
    }
    expect(maximumRestGap).toBeLessThanOrEqual(mode === SessionMode.MIXICANO ? 5 : 4);
    const menOnCourt = selection.ids.filter((id) => players.find((player) => player.userId === id)!.gender === "MALE").length;
    if (mode === SessionMode.MIXICANO) expect([0, 2, 4]).toContain(menOnCourt);
    types.push(menOnCourt === 4 ? "MENS" : menOnCourt === 0 ? "WOMENS" : "MIXED");
    const pod = selection.ids.slice().sort().join("|");
    podCounts.set(pod, (podCounts.get(pod) ?? 0) + 1);
    assign(court, selection.partition, `refill-${event}`);
    if ([100, 200, 400].includes(event + 1)) {
      const variety = summarizeVariety(players, [...completed, ...active.values()], mode);
      checkpoints.push({ matches: event + 1, entropy: variety.meanEntropy, coverage: variety.minimumCoverage });
      expect(variety.meanEntropy).toBeGreaterThan(0.9);
      expect(variety.minimumCoverage).toBeGreaterThanOrEqual(0.75);
      if (mode === SessionMode.MIXICANO) {
        // Observe late type recurrence without requiring a same-side quota.
        // Fair rotation, starvation, balance and relationship checks still apply.
        const recentTypes = types.slice(-100);
        console.info("Balanced late match-type diagnostic", JSON.stringify({
          sessionType, respectPlayerRest, completedMatches: event + 1,
          recentMatchTypeCounts: Object.fromEntries(["MIXED", "MENS", "WOMENS"].map((type) =>
            [type, recentTypes.filter((value) => value === type).length])),
          playerMatchTypeCounts: [...variety.context.playersByUserId].map(([userId, player]) =>
            ({ userId, counts: Object.fromEntries(player.matchType.counts) })),
        }));
      }
    }
  }
  const final = summarizeVariety(players, completed, mode);
  if (wideSkills) expect(guardrailRestrictedEvents).toBeGreaterThan(matches / 2);
  if (matches === 400) {
    // Keep the entropy trajectory in checkpoint diagnostics. After coverage
    // saturates, legal minimum-replay choices need not preserve its early peak;
    // the >0.9 breadth floor at each checkpoint still detects severe locking.
    // Widely separated ratings can make extreme partners permanently exceed
    // the safety ceiling; the shared roster vocabulary deliberately remains
    // broader than the momentary balance envelope.
    expect(final.minimumCoverage).toBeGreaterThanOrEqual(wideSkills ? 0.8 : 0.9);
  }
  // A four-person minority has only one legal own-side quartet. Every
  // own-side match for that group necessarily repeats that exact pod; keep
  // the ordinary pod-repeat cap for every other quartet.
  const hasOnlyOneOwnSidePod = mode === SessionMode.MIXICANO && [men, 14 - men].includes(4);
  if (hasOnlyOneOwnSidePod) {
    const minorityGender = men === 4 ? "MALE" : "FEMALE";
    const uniqueMinorityPod = players.filter((player) => player.gender === minorityGender).map((player) => player.userId).sort().join("|");
    const minorityOwnSideType = minorityGender === "MALE" ? "MENS" : "WOMENS";
    expect(podCounts.get(uniqueMinorityPod) ?? 0).toBe(types.filter((type) => type === minorityOwnSideType).length);
    const otherPodCounts = [...podCounts].filter(([pod]) => pod !== uniqueMinorityPod).map(([, count]) => count);
    expect(Math.max(0, ...otherPodCounts)).toBeLessThanOrEqual(Math.ceil(matches / 20));
  } else {
    expect(Math.max(...podCounts.values())).toBeLessThanOrEqual(Math.ceil(matches / 20));
  }
  expect(final.maximumPartnerCount).toBeLessThan(Math.ceil(matches * 4 / 14 / 3));
  const matchTypeCounts = Object.fromEntries(["MIXED", "MENS", "WOMENS"].map((type) => [type, types.filter((value) => value === type).length]));
  console.info("Balanced asynchronous simulation", JSON.stringify({ sessionType, mode, men, women: 14 - men, respectPlayerRest, wideSkills, matches, maximumFairnessGap, maximumRestGap, unavoidableOverdueEvents, guardrailRestrictedEvents, ratingCeilingFallbackEvents, maximumBalanceGap, maximumPodCount: Math.max(...podCounts.values()), maximumPartnerCount: final.maximumPartnerCount, matchTypeCounts, checkpoints }));
}

describe("Balanced organic variety with asynchronous two-court completion", () => {
  it.each([
    { men: 14, mode: SessionMode.MEXICANO, sessionType: SessionType.POINTS, respectPlayerRest: true, matches: 400 },
    { men: 14, mode: SessionMode.MEXICANO, sessionType: SessionType.ELO, respectPlayerRest: false, matches: 400 },
    { men: 7, mode: SessionMode.MIXICANO, sessionType: SessionType.POINTS, respectPlayerRest: true, matches: 400 },
    { men: 7, mode: SessionMode.MIXICANO, sessionType: SessionType.ELO, respectPlayerRest: false, matches: 400 },
    { men: 14, mode: SessionMode.MEXICANO, sessionType: SessionType.POINTS, respectPlayerRest: false, wideSkills: true, matches: 400 },
    { men: 14, mode: SessionMode.MEXICANO, sessionType: SessionType.ELO, respectPlayerRest: true, wideSkills: true, matches: 400 },
    ...[10, 4, 8].flatMap((men) => [SessionType.POINTS, SessionType.ELO].map((sessionType) => ({
      men, mode: SessionMode.MIXICANO, sessionType, respectPlayerRest: false, matches: 100,
    }))),
  ])("keeps fair, bounded, broad rotation for $sessionType $men/$mode with rest=$respectPlayerRest and wideSkills=$wideSkills ($matches matches)", simulate, 180_000);
});
