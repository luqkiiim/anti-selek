import { describe, expect, it } from "vitest";
import { SessionMode, SessionType } from "../../../types/enums";
import { findBestRotationBatchSelection, measureRotationStarvationIntervention } from "./socialBatch";
import { buildSocialVarietyContext, createSocialHorizonCoverageScorer, createSocialVarietyCoverageScorer } from "./socialVariety";
import type { SocialVarietyContext, SocialVarietyHistogram } from "./socialVariety";
import type {
  ActiveMatchmakerV3Player,
  MatchmakerV3Player,
  V3CompletedMatch,
  V3DoublesPartition,
  V3SelectionConstraints,
} from "./types";

type Player = MatchmakerV3Player & { restTurns: number };
type Profile = {
  rank: number;
  courts: Array<V3SelectionConstraints<ActiveMatchmakerV3Player> | undefined>;
};
type OracleCourt = { ids: string[]; minimumBalanceGap: number };
type OracleBatch = {
  ids: string[];
  players: Player[];
  rank: number;
  maximumBalanceGap: number;
  totalBalanceGap: number;
  /** Combined normalized entropy across match type, courtmates, partners and opponents. */
  totalEntropyGain: number;
};

const compareWords = (left: readonly number[], right: readonly number[]) => {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    if (a !== b) return a < b ? -1 : 1;
  }
  return 0;
};

function immediateReplayCount(restTurns: readonly number[]) {
  return restTurns.filter((turns) => turns === 0).length;
}

function softCadenceWord(restTurns: readonly number[]) {
  return [...restTurns].sort((a, b) => a - b).map((turns) => (turns === 0 ? 0 : -turns));
}

type SplitCadenceCandidate = {
  restTurns: number[];
  gains: { matchType: number; courtmates: number; partners: number; opponents: number };
};

type OracleFraction = { numerator: bigint; denominator: bigint };
const ORACLE_BIG_ZERO = BigInt(0);
const ORACLE_BIG_ONE = BigInt(1);

const oracleFraction = (numerator: bigint, denominator: bigint): OracleFraction => {
  if (denominator <= ORACLE_BIG_ZERO) throw new Error("Oracle fraction denominator must be positive");
  let a = numerator < ORACLE_BIG_ZERO ? -numerator : numerator;
  let b = denominator;
  while (b !== ORACLE_BIG_ZERO) [a, b] = [b, a % b];
  const divisor = a || ORACLE_BIG_ONE;
  const sign = numerator < ORACLE_BIG_ZERO ? -ORACLE_BIG_ONE : ORACLE_BIG_ONE;
  return { numerator: sign * (numerator < ORACLE_BIG_ZERO ? -numerator : numerator) / divisor, denominator: denominator / divisor };
};

function addOracleFractions(left: OracleFraction, right: OracleFraction): OracleFraction {
  return oracleFraction(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator
  );
}

function compareOracleFractions(left: OracleFraction, right: OracleFraction) {
  const difference = left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < ORACLE_BIG_ZERO ? -1 : difference > ORACLE_BIG_ZERO ? 1 : 0;
}

function meanOracleFractions(values: readonly OracleFraction[]): OracleFraction {
  if (!values.length) return oracleFraction(ORACLE_BIG_ZERO, ORACLE_BIG_ONE);
  const sum = values.reduce((total, value) => addOracleFractions(total, value), oracleFraction(ORACLE_BIG_ZERO, ORACLE_BIG_ONE));
  return oracleFraction(sum.numerator, sum.denominator * BigInt(values.length));
}

/** Independent exact model for the certified first-exposure gate. */
function oracleCoverageReplayEnvelope<T extends {
  restTurns: readonly number[];
  firstExposureCoverage: OracleFraction;
}>(candidates: readonly T[], respectPlayerRest = true) {
  if (!candidates.length) {
    return {
      bestImmediateReplayCount: null,
      allowedImmediateReplayCount: null,
      bestCoverageFrontier: oracleFraction(ORACLE_BIG_ZERO, ORACLE_BIG_ONE),
      candidates: [] as T[],
    };
  }
  if (!respectPlayerRest) {
    return {
      bestImmediateReplayCount: null,
      allowedImmediateReplayCount: null,
      bestCoverageFrontier: oracleFraction(ORACLE_BIG_ZERO, ORACLE_BIG_ONE),
      candidates: [...candidates],
    };
  }
  const bestImmediateReplayCount = Math.min(...candidates.map((candidate) => immediateReplayCount(candidate.restTurns)));
  const allowedImmediateReplayCount = bestImmediateReplayCount + 1;
  const bestReplayCandidates = candidates.filter((candidate) => immediateReplayCount(candidate.restTurns) === bestImmediateReplayCount);
  const bestCoverageFrontier = [...bestReplayCandidates]
    .map((candidate) => candidate.firstExposureCoverage)
    .sort(compareOracleFractions)
    .at(-1)!;
  return {
    bestImmediateReplayCount,
    allowedImmediateReplayCount,
    bestCoverageFrontier,
    candidates: candidates.filter((candidate) => {
      const replayCount = immediateReplayCount(candidate.restTurns);
      if (replayCount === bestImmediateReplayCount) return true;
      return replayCount === allowedImmediateReplayCount &&
        compareOracleFractions(candidate.firstExposureCoverage, bestCoverageFrontier) > 0;
    }),
  };
}

function oracleEntropyScore(gain: number, sessionType: SessionType) {
  return sessionType === SessionType.SOCIAL_MIX ? gain : Math.round(gain * 1e12) / 1e12;
}

function canonicalOracleSum(values: readonly number[]) {
  return [...values].sort((left, right) => left - right).reduce((sum, value) => sum + value, 0);
}

function combinedEntropyGain(gains: SplitCadenceCandidate["gains"]) {
  const relationship = canonicalOracleSum([gains.courtmates, gains.partners, gains.opponents]);
  return canonicalOracleSum([gains.matchType, relationship]);
}

/** Freeze the batch minimum first; never compare candidates with a pairwise +1 tolerance. */
function oracleReplayEnvelope<T extends { restTurns: readonly number[] }>(candidates: readonly T[], respectPlayerRest = true) {
  if (!candidates.length) return { bestImmediateReplayCount: null, allowedImmediateReplayCount: null, candidates: [] as T[] };
  if (!respectPlayerRest) return { bestImmediateReplayCount: null, allowedImmediateReplayCount: null, candidates: [...candidates] };
  const bestImmediateReplayCount = Math.min(...candidates.map((candidate) => immediateReplayCount(candidate.restTurns)));
  const allowedImmediateReplayCount = bestImmediateReplayCount + 1;
  return {
    bestImmediateReplayCount,
    allowedImmediateReplayCount,
    candidates: candidates.filter((candidate) => immediateReplayCount(candidate.restTurns) <= allowedImmediateReplayCount),
  };
}

function chooseSplitCadence(candidates: readonly SplitCadenceCandidate[], sessionType: SessionType, respectPlayerRest = true) {
  const envelope = oracleReplayEnvelope(candidates, respectPlayerRest);
  return [...envelope.candidates].sort((left, right) =>
    oracleEntropyScore(combinedEntropyGain(right.gains), sessionType) -
      oracleEntropyScore(combinedEntropyGain(left.gains), sessionType) ||
    (respectPlayerRest
      ? compareWords(softCadenceWord(left.restTurns), softCadenceWord(right.restTurns))
      : 0)
  )[0];
}

type FixedLayout = { ids: string[]; partition: V3DoublesPartition };

function fixedLayouts(...layouts: FixedLayout[]): V3SelectionConstraints<ActiveMatchmakerV3Player> {
  const byQuartet = new Map(layouts.map((layout) => [quartetKey(layout.ids), layout.partition]));
  return {
    isQuartetAllowed: (players) => byQuartet.has(quartetKey(players.map((player) => player.userId))),
    normalizePartition: ({ players }) => byQuartet.get(quartetKey(players.map((player) => player.userId))) ?? null,
  };
}

function ownSideChoices(): [FixedLayout, FixedLayout] {
  const men = ["m0", "m1", "m2", "m3"];
  const women = ["f0", "f1", "f2", "f3"];
  return [
    { ids: men, partition: { team1: ["m0", "m1"], team2: ["m2", "m3"] } },
    { ids: women, partition: { team1: ["f0", "f1"], team2: ["f2", "f3"] } },
  ];
}

function standardMixedRoster(restById: Readonly<Record<string, number>> = {}) {
  return [
    ...Array.from({ length: 7 }, (_value, index) => makePlayer(`m${index}`, {
      matchesPlayed: 5,
      gender: "MALE",
      partnerPreference: "OPEN",
      restTurns: restById[`m${index}`] ?? 1,
    })),
    ...Array.from({ length: 7 }, (_value, index) => makePlayer(`f${index}`, {
      matchesPlayed: 5,
      gender: "FEMALE",
      partnerPreference: "FEMALE_FLEX",
      restTurns: restById[`f${index}`] ?? 1,
    })),
  ];
}

function repeatedHistory(layout: FixedLayout, count: number): V3CompletedMatch[] {
  return Array.from({ length: count }, () => ({
    team1: [layout.partition.team1[0], layout.partition.team1[1]],
    team2: [layout.partition.team2[0], layout.partition.team2[1]],
  }));
}

type OracleCoverageFacet = "courtmates" | "partners" | "opponents" | "matchType";
type HorizonCoverageFacet = "courtmates" | "partners" | "opponents";
const horizonCaps: Readonly<Record<HorizonCoverageFacet, number>> = { courtmates: 13, opponents: 12, partners: 6 };
const horizonWeights: Readonly<Record<HorizonCoverageFacet, number>> = { courtmates: 3, opponents: 2, partners: 1 };

/** Recomputes first-exposure coverage directly from opportunity/count sets. */
function oracleFirstExposureCoverage(
  partitionsToPlay: readonly V3DoublesPartition[],
  context: SocialVarietyContext,
  sessionMode: SessionMode
): OracleFraction {
  const activeFacets: OracleCoverageFacet[] = sessionMode === SessionMode.MIXICANO
    ? ["courtmates", "partners", "opponents", "matchType"]
    : ["courtmates", "partners", "opponents"];
  const eligiblePlayers = [...context.playersByUserId].filter(([, facets]) =>
    activeFacets.some((facet) => facets[facet].opportunities.size > 0)
  );
  if (!eligiblePlayers.length) return oracleFraction(ORACLE_BIG_ZERO, ORACLE_BIG_ONE);
  const additions = new Map<string, Map<OracleCoverageFacet, Set<string>>>();
  const remember = (userId: string, facet: OracleCoverageFacet, experience: string) => {
    let byFacet = additions.get(userId);
    if (!byFacet) {
      byFacet = new Map();
      additions.set(userId, byFacet);
    }
    let experiences = byFacet.get(facet);
    if (!experiences) {
      experiences = new Set();
      byFacet.set(facet, experiences);
    }
    experiences.add(experience);
  };

  for (const partition of partitionsToPlay) {
    const team1 = partition.team1;
    const team2 = partition.team2;
    const ids = [...team1, ...team2];
    const sides = ids.map((id) => context.effectiveSideByUserId.get(id) ?? null);
    let matchType: string | null = null;
    if (sessionMode === SessionMode.MIXICANO && sides.every((side) => side !== null)) {
      if (sides.every((side) => side === sides[0])) matchType = "OWN_SIDE";
      else {
        const teamHasOppositeSides = (team: readonly string[]) =>
          context.effectiveSideByUserId.get(team[0]) !== context.effectiveSideByUserId.get(team[1]);
        if (teamHasOppositeSides(team1) && teamHasOppositeSides(team2)) matchType = "MIXED";
      }
    }
    for (const [team, opponents] of [[team1, team2], [team2, team1]] as const) {
      for (let seat = 0; seat < team.length; seat += 1) {
        const userId = team[seat];
        const partner = team[1 - seat];
        remember(userId, "courtmates", partner);
        remember(userId, "partners", partner);
        for (const opponent of opponents) {
          remember(userId, "courtmates", opponent);
          remember(userId, "opponents", opponent);
        }
        if (matchType) remember(userId, "matchType", matchType);
      }
    }
  }

  let total = oracleFraction(ORACLE_BIG_ZERO, ORACLE_BIG_ONE);
  const eligibleCount = BigInt(eligiblePlayers.length);
  for (const [userId, histograms] of eligiblePlayers) {
    const feasibleFacets = activeFacets.filter((facet) => histograms[facet].opportunities.size > 0);
    const byFacet = additions.get(userId);
    for (const facet of feasibleFacets) {
      const histogram = histograms[facet];
      const possible = BigInt(histogram.opportunities.size);
      const newExposures = [...(byFacet?.get(facet) ?? [])].filter((experience) =>
        histogram.opportunities.has(experience) && (histogram.counts.get(experience) ?? 0) === 0
      );
      if (newExposures.length > 0) {
        total = addOracleFractions(total, oracleFraction(
          BigInt(newExposures.length),
          eligibleCount * BigInt(feasibleFacets.length) * possible
        ));
      }
    }
  }
  return total;
}

/** Independent completed-relationship 3:2:1 marginal model; match type is absent. */
function oracleHorizonCoverageGain(
  partitionsToPlay: readonly V3DoublesPartition[],
  context: SocialVarietyContext
): OracleFraction {
  const additions = new Map<string, Map<HorizonCoverageFacet, Set<string>>>();
  const remember = (userId: string, facet: HorizonCoverageFacet, experience: string) => {
    const byFacet = additions.get(userId) ?? new Map<HorizonCoverageFacet, Set<string>>();
    const experiences = byFacet.get(facet) ?? new Set<string>();
    experiences.add(experience);
    byFacet.set(facet, experiences);
    additions.set(userId, byFacet);
  };
  for (const partition of partitionsToPlay) {
    const teams = [partition.team1, partition.team2] as const;
    for (let side = 0; side < 2; side += 1) {
      const team = teams[side];
      const opponents = teams[1 - side];
      for (let seat = 0; seat < 2; seat += 1) {
        const userId = team[seat];
        const partner = team[1 - seat];
        remember(userId, "courtmates", partner);
        remember(userId, "partners", partner);
        for (const opponent of opponents) {
          remember(userId, "courtmates", opponent);
          remember(userId, "opponents", opponent);
        }
      }
    }
  }

  const eligible = [...context.playersByUserId].flatMap(([userId, histograms]) => {
    const facets = (Object.keys(horizonCaps) as HorizonCoverageFacet[]).flatMap((facet) => {
      const histogram = histograms[facet];
      const denominator = Math.min(horizonCaps[facet], histogram.opportunities.size);
      return denominator > 0 ? [{ facet, denominator, histogram }] : [];
    });
    return facets.length ? [{ userId, facets, activeWeight: facets.reduce((sum, item) => sum + horizonWeights[item.facet], 0) }] : [];
  });
  if (!eligible.length) return oracleFraction(ORACLE_BIG_ZERO, ORACLE_BIG_ONE);

  let gain = oracleFraction(ORACLE_BIG_ZERO, ORACLE_BIG_ONE);
  for (const player of eligible) {
    for (const item of player.facets) {
      const covered = [...item.histogram.opportunities].filter((experience) =>
        (item.histogram.counts.get(experience) ?? 0) > 0
      ).length;
      const already = Math.min(item.denominator, covered);
      const possible = [...(additions.get(player.userId)?.get(item.facet) ?? [])].filter((experience) =>
        item.histogram.opportunities.has(experience) && (item.histogram.counts.get(experience) ?? 0) === 0
      ).length;
      const newlyCovered = Math.min(Math.max(0, item.denominator - already), possible);
      if (!newlyCovered) continue;
      gain = addOracleFractions(gain, oracleFraction(
        BigInt(newlyCovered * horizonWeights[item.facet]),
        BigInt(eligible.length * player.activeWeight * item.denominator)
      ));
    }
  }
  return gain;
}

function oracleHistogram(opportunities: readonly string[], counts: Readonly<Record<string, number>> = {}): SocialVarietyHistogram {
  const countMap = new Map(Object.entries(counts).filter(([, count]) => count > 0));
  const total = [...countMap.values()].reduce((sum, count) => sum + count, 0);
  const countLogCountSum = [...countMap.values()].reduce((sum, count) => sum + count * Math.log(count), 0);
  return { opportunities: new Set(opportunities), counts: countMap, total, countLogCountSum };
}

function oracleHorizonContext(
  playerFacets: Readonly<Record<string, Partial<Record<HorizonCoverageFacet, { opportunities: string[]; counts?: Record<string, number> }>>>>,
  sessionMode = SessionMode.MEXICANO
): SocialVarietyContext {
  const empty = () => oracleHistogram([]);
  return {
    sessionMode,
    effectiveSideByUserId: new Map(),
    playersByUserId: new Map(Object.entries(playerFacets).map(([userId, facets]) => [userId, {
      courtmates: facets.courtmates ? oracleHistogram(facets.courtmates.opportunities, facets.courtmates.counts) : empty(),
      partners: facets.partners ? oracleHistogram(facets.partners.opportunities, facets.partners.counts) : empty(),
      opponents: facets.opponents ? oracleHistogram(facets.opponents.opportunities, facets.opponents.counts) : empty(),
      matchType: empty(),
    }])),
  };
}

function horizonGateFixture(bestReplayCount: number) {
  const groups = ["A", "B", "C"] as const;
  const layouts = groups.map((group): FixedLayout => ({
    ids: [0, 1, 2, 3].map((index) => `${group}${index}`),
    partition: { team1: [`${group}0`, `${group}1`], team2: [`${group}2`, `${group}3`] },
  }));
  const replayCounts = [bestReplayCount, bestReplayCount + 1, bestReplayCount + 2];
  const players = groups.flatMap((group, groupIndex) => [0, 1, 2, 3].map((index) => makePlayer(`${group}${index}`, {
    matchesPlayed: 5,
    restTurns: index < replayCounts[groupIndex] ? 0 : 1,
  })));
  const playerFacets: Record<string, Partial<Record<HorizonCoverageFacet, { opportunities: string[]; counts?: Record<string, number> }>>> = {
    A0: {
      courtmates: { opportunities: ["A1", "A2", "A3"], counts: { A1: 1, A2: 1, A3: 1 } },
      partners: { opportunities: ["A1", "A4"], counts: { A1: 1 } },
      opponents: { opportunities: ["A2", "A3"], counts: { A2: 1, A3: 1 } },
    },
    B0: {
      courtmates: { opportunities: ["B1", "B2", "B3"], counts: { B2: 1, B3: 1 } },
      partners: { opportunities: ["B1", "B4"], counts: { B4: 1 } },
      opponents: { opportunities: ["B2", "B3"], counts: { B2: 1, B3: 1 } },
    },
    C0: {
      courtmates: { opportunities: ["C1", "C2", "C3"] },
      partners: { opportunities: ["C1", "C4"] },
      opponents: { opportunities: ["C2", "C3"] },
    },
  };
  for (const group of groups) {
    for (let index = 1; index < 4; index += 1) playerFacets[`${group}${index}`] = {};
  }
  const context = oracleHorizonContext(playerFacets);
  return { players, layouts, context };
}

function runFixedOneCourt(
  players: Player[],
  sessionType: SessionType,
  layouts: FixedLayout[],
  socialHistoryMatches: V3CompletedMatch[] = [],
  sessionMode: SessionMode = SessionMode.MIXICANO
) {
  const profile: Profile = { rank: 0, courts: [fixedLayouts(...layouts)] };
  return findBestRotationBatchSelection(players, {
    courtCount: 1,
    sessionMode,
    sessionType,
    rotationPlayerCount: 14,
    schedules: [profile],
    socialHistoryMatches,
    socialVarietyContext: buildSocialVarietyContext(players, socialHistoryMatches, { sessionMode }),
    randomFn: () => 0,
  });
}

function selectedFacetGain(
  result: ReturnType<typeof findBestRotationBatchSelection>,
  facet: "matchType" | "courtmates" | "partners" | "opponents"
) {
  return result.selection?.selections[0]?.socialVarietyGains?.[facet] ?? 0;
}

function selectedRelationshipGain(result: ReturnType<typeof findBestRotationBatchSelection>) {
  return selectedFacetGain(result, "courtmates") + selectedFacetGain(result, "partners") + selectedFacetGain(result, "opponents");
}

function batchRelationshipGain(result: ReturnType<typeof findBestRotationBatchSelection>) {
  const gains = result.selection?.totalSocialVarietyGains;
  return (gains?.courtmates ?? 0) + (gains?.partners ?? 0) + (gains?.opponents ?? 0);
}

function selectedOwnSideType(result: ReturnType<typeof findBestRotationBatchSelection>) {
  const type = result.selection?.selections[0]?.socialVariety?.courtType;
  return type === "MIXED" ? "MIXED" : type ? "OWN_SIDE" : null;
}

function quartetKey(ids: readonly string[]) {
  return [...ids].sort().join("|");
}

function makePlayer(userId: string, overrides: Partial<Player> = {}): Player {
  return {
    userId,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    availableSince: new Date("2026-01-01T00:00:00Z"),
    strength: 1000,
    restTurns: 0,
    isBusy: false,
    isPaused: false,
    gender: "MALE",
    partnerPreference: "OPEN",
    ...overrides,
  };
}

function makeActivePlayer(player: Player, rank: number): ActiveMatchmakerV3Player {
  return {
    ...player,
    effectiveMatchCount: Math.max(player.matchesPlayed, player.matchmakingBaseline),
    restTurns: player.restTurns,
    randomScore: 0,
    rank,
  };
}

function allowedQuartets(...quartets: string[][]): V3SelectionConstraints<ActiveMatchmakerV3Player> {
  const allowed = new Set(quartets.map(quartetKey));
  return {
    isQuartetAllowed: (players) => allowed.has(quartetKey(players.map((player) => player.userId))),
  };
}

function partitions(ids: readonly string[]) {
  const [a, b, c, d] = ids;
  return [
    { team1: [a, b], team2: [c, d] },
    { team1: [a, c], team2: [b, d] },
    { team1: [a, d], team2: [b, c] },
  ] as const;
}

function isLegalForMode(
  partition: ReturnType<typeof partitions>[number],
  playersById: ReadonlyMap<string, Player>,
  mode: SessionMode
) {
  if (mode !== SessionMode.MIXICANO) return true;
  const lowerCount = (team: readonly string[]) => team.filter((id) => {
    const player = playersById.get(id);
    return player?.gender === "FEMALE" || player?.partnerPreference === "FEMALE_FLEX";
  }).length;
  const left = lowerCount(partition.team1);
  const right = lowerCount(partition.team2);
  // MIXICANO permits both same-side courts and one-per-side doubles.
  return left === right;
}

function minimumBalanceGap(ids: readonly string[], playersById: ReadonlyMap<string, Player>, mode: SessionMode) {
  const validGaps = partitions(ids)
    .filter((partition) => isLegalForMode(partition, playersById, mode))
    .map((partition) => {
      const average = (team: readonly string[]) => team.reduce((sum, id) => sum + playersById.get(id)!.strength, 0) / 2;
      return Math.abs(average(partition.team1) - average(partition.team2));
    });
  return validGaps.length ? Math.min(...validGaps) : null;
}

function choose<T>(items: readonly T[], size: number) {
  const result: T[][] = [];
  const current: T[] = [];
  const visit = (start: number) => {
    if (current.length === size) {
      result.push([...current]);
      return;
    }
    for (let index = start; index <= items.length - (size - current.length); index += 1) {
      current.push(items[index]);
      visit(index + 1);
      current.pop();
    }
  };
  visit(0);
  return result;
}

/** Enumerate the fixture's legal quartets and every disjoint court assignment independently. */
function enumerateOracleBatches(
  players: Player[],
  profiles: Profile[],
  courtCount: number,
  mode: SessionMode
): OracleBatch[] {
  const playersById = new Map(players.map((player) => [player.userId, player]));
  const batches: OracleBatch[] = [];
  for (const profile of profiles) {
    if (profile.courts.length !== courtCount) continue;
    const courts: OracleCourt[][] = profile.courts.map((constraints) =>
      choose(players, 4).flatMap((quartet) => {
        const activeQuartet = quartet.map((player) => makeActivePlayer(player, players.indexOf(player))) as [
          ActiveMatchmakerV3Player, ActiveMatchmakerV3Player,
          ActiveMatchmakerV3Player, ActiveMatchmakerV3Player,
        ];
        if (constraints?.isQuartetAllowed && !constraints.isQuartetAllowed(activeQuartet)) return [];
        const ids = quartet.map((player) => player.userId);
        const gap = minimumBalanceGap(ids, playersById, mode);
        return gap === null ? [] : [{ ids, minimumBalanceGap: gap }];
      })
    );
    const visit = (court: number, chosen: OracleCourt[], used: Set<string>) => {
      if (court === courtCount) {
        const selectedIds = chosen.flatMap((candidate) => candidate.ids);
        const selectedPlayers = selectedIds.map((id) => playersById.get(id)!);
        const gaps = chosen.map((candidate) => candidate.minimumBalanceGap);
        batches.push({
          ids: selectedIds,
          players: selectedPlayers,
          rank: profile.rank,
          maximumBalanceGap: Math.max(...gaps),
          totalBalanceGap: gaps.reduce((sum, gap) => sum + gap, 0),
          totalEntropyGain: 0,
        });
        return;
      }
      for (const candidate of courts[court]) {
        if (candidate.ids.some((id) => used.has(id))) continue;
        const nextUsed = new Set(used);
        candidate.ids.forEach((id) => nextUsed.add(id));
        visit(court + 1, [...chosen, candidate], nextUsed);
      }
    };
    visit(0, [], new Set());
  }
  return batches;
}

function arrivalTime(player: Player) {
  if (!player.arrivalPriorityAt) return null;
  const value = player.arrivalPriorityAt instanceof Date
    ? player.arrivalPriorityAt.getTime()
    : new Date(player.arrivalPriorityAt).getTime();
  return Number.isFinite(value) ? value : null;
}

function fairnessAndArrivalWord(players: readonly Player[]) {
  const counts = players.map((player) => Math.max(player.matchesPlayed, player.matchmakingBaseline)).sort((a, b) => a - b);
  const arrivals = players.map(arrivalTime).filter((value): value is number => value !== null).sort((a, b) => a - b);
  const word = [...counts, -arrivals.length, ...arrivals];
  while (word.length < players.length * 2 + 1) word.push(Number.POSITIVE_INFINITY);
  return word;
}

function starvationWord(batch: OracleBatch, roster: readonly Player[], rotationPlayerCount: number) {
  const idealRestGap = Math.max(0, Math.ceil((rotationPlayerCount - 4) / 4));
  const selected = new Set(batch.ids);
  const leftOut = roster.filter((player) => player.restTurns > idealRestGap && !selected.has(player.userId));
  return [leftOut.length, leftOut.length ? Math.max(...leftOut.map((player) => player.restTurns)) : 0,
    leftOut.reduce((sum, player) => sum + player.restTurns, 0)];
}

function compareRotationClass(
  left: OracleBatch,
  right: OracleBatch,
  roster: readonly Player[],
  rotationPlayerCount: number
) {
  return compareWords(fairnessAndArrivalWord(left.players), fairnessAndArrivalWord(right.players)) ||
    left.rank - right.rank ||
    compareWords(starvationWord(left, roster, rotationPlayerCount), starvationWord(right, roster, rotationPlayerCount));
}

function oracleBestBatch(
  batches: OracleBatch[],
  roster: Player[],
  rotationPlayerCount: number,
  sessionType: SessionType,
  balanceWindow = 0,
  sessionMode = SessionMode.MEXICANO
) {
  // Candidate totals already contain the mode-valid facets; mode must not add a separate type tier.
  void sessionMode;
  const rotationSorted = [...batches].sort((left, right) => compareRotationClass(left, right, roster, rotationPlayerCount));
  const bestRotation = rotationSorted[0];
  if (!bestRotation) throw new Error("Oracle fixture has no legal batches");
  let admissible = rotationSorted.filter((candidate) => compareRotationClass(candidate, bestRotation, roster, rotationPlayerCount) === 0);
  if (sessionType === SessionType.POINTS || sessionType === SessionType.ELO) {
    const bestGap = Math.min(...admissible.map((candidate) => candidate.maximumBalanceGap));
    const ceiling = sessionType === SessionType.ELO ? 50 : Number.POSITIVE_INFINITY;
    const allowedGap = bestGap <= ceiling ? Math.min(bestGap + balanceWindow, ceiling) : bestGap;
    admissible = admissible.filter((candidate) => candidate.maximumBalanceGap <= allowedGap);
  }
  const replayEnvelope = oracleReplayEnvelope(admissible.map((candidate) => ({
    candidate,
    restTurns: candidate.players.map((player) => player.restTurns),
  })));
  admissible = replayEnvelope.candidates.map(({ candidate }) => candidate);
  const bestEntropyGain = Math.max(...admissible.map((candidate) => oracleEntropyScore(candidate.totalEntropyGain, sessionType)));
  admissible = admissible.filter((candidate) => oracleEntropyScore(candidate.totalEntropyGain, sessionType) === bestEntropyGain);
  return [...admissible].sort((left, right) =>
    compareWords(
      softCadenceWord(left.players.map((player) => player.restTurns)),
      softCadenceWord(right.players.map((player) => player.restTurns))
    ) || left.maximumBalanceGap - right.maximumBalanceGap || left.totalBalanceGap - right.totalBalanceGap
  )[0];
}

function selectedIds(result: ReturnType<typeof findBestRotationBatchSelection>) {
  return result.selection?.selections.flatMap((selection) => selection.ids).sort() ?? [];
}

function selectedLayouts(result: ReturnType<typeof findBestRotationBatchSelection>) {
  return result.selection?.selections.map((selection) => {
    const teamKey = (team: readonly string[]) => [...team].sort().join("+");
    return {
      ids: [...selection.ids].sort(),
      teams: [teamKey(selection.partition.team1), teamKey(selection.partition.team2)].sort(),
    };
  }) ?? [];
}

const rotationTypes = [
  SessionType.SOCIAL_MIX,
  SessionType.POINTS,
  SessionType.ELO,
] as const;

describe("independent cadence oracle", () => {
  it("uses the zero-rest envelope and ascending soft vector", () => {
    expect(immediateReplayCount([0, 3, 3, 3])).toBeGreaterThan(immediateReplayCount([1, 1, 2, 2]));
    expect(compareWords(softCadenceWord([1, 1, 4, 4]), softCadenceWord([1, 2, 2, 2]))).toBeGreaterThan(0);
  });

  it.each(rotationTypes)("freezes a global best+1 replay envelope before combined entropy in %s", (sessionType) => {
    const candidate = (restTurns: number[], gains: SplitCadenceCandidate["gains"]): SplitCadenceCandidate => ({ restTurns, gains });
    const zeroReplay = candidate([1, 1, 1, 1], { matchType: 0, courtmates: 0.1, partners: 0, opponents: 0 });
    const oneReplay = candidate([0, 1, 1, 1], { matchType: 0, courtmates: 0.2, partners: 0.2, opponents: 0.2 });
    const twoReplay = candidate([0, 0, 1, 1], { matchType: 0, courtmates: 0.9, partners: 0.9, opponents: 0.9 });
    const zeroBaseline = oracleReplayEnvelope([zeroReplay, oneReplay, twoReplay]);
    expect(zeroBaseline.bestImmediateReplayCount).toBe(0);
    expect(zeroBaseline.allowedImmediateReplayCount).toBe(1);
    expect(zeroBaseline.candidates).toEqual([zeroReplay, oneReplay]);
    expect(chooseSplitCadence([zeroReplay, oneReplay, twoReplay], sessionType)).toBe(oneReplay);
    expect(chooseSplitCadence([twoReplay, zeroReplay, oneReplay], sessionType)).toBe(oneReplay);

    const threeReplay = {
      ...twoReplay, restTurns: [0, 0, 0, 1], gains: { matchType: 1, courtmates: 1, partners: 1, opponents: 1 },
    };
    const oneReplayBaseline = oracleReplayEnvelope([oneReplay, twoReplay, threeReplay]);
    expect(oneReplayBaseline.bestImmediateReplayCount).toBe(1);
    expect(oneReplayBaseline.allowedImmediateReplayCount).toBe(2);
    expect(oneReplayBaseline.candidates).toHaveLength(2);
    expect(chooseSplitCadence([oneReplay, twoReplay, threeReplay], sessionType)).toBe(twoReplay);
  });

  it.each(rotationTypes)("admits best+1 only above the frozen best-replay coverage frontier in %s", (sessionType) => {
    const candidate = (restTurns: number[], coverage: OracleFraction, entropy: number) => ({
      restTurns,
      firstExposureCoverage: coverage,
      entropy,
    });
    const bestHighCoverageLowerEntropy = candidate([1, 1, 1, 1], oracleFraction(BigInt(3), BigInt(4)), 5);
    const bestLowCoverageHigherEntropy = candidate([1, 1, 1, 1], oracleFraction(BigInt(1), BigInt(4)), 7);
    const equalCoverageHighEntropy = candidate([0, 1, 1, 1], oracleFraction(BigInt(3), BigInt(4)), 200);
    const belowFrontierHighEntropy = candidate([0, 1, 1, 1], oracleFraction(BigInt(1), BigInt(2)), 100);
    const admittedLowerCoverage = candidate([0, 1, 1, 1], oracleFraction(BigInt(7), BigInt(8)), 8);
    const admittedHigherCoverageLowerEntropy = candidate([0, 1, 1, 1], oracleFraction(ORACLE_BIG_ONE, ORACLE_BIG_ONE), 6);
    const twoReplaysEvenMoreCoverage = candidate([0, 0, 1, 1], oracleFraction(ORACLE_BIG_ONE, ORACLE_BIG_ONE), 300);
    const envelope = oracleCoverageReplayEnvelope([
      bestHighCoverageLowerEntropy,
      bestLowCoverageHigherEntropy,
      equalCoverageHighEntropy,
      belowFrontierHighEntropy,
      admittedLowerCoverage,
      admittedHigherCoverageLowerEntropy,
      twoReplaysEvenMoreCoverage,
    ]);

    expect(envelope.bestImmediateReplayCount).toBe(0);
    expect(envelope.allowedImmediateReplayCount).toBe(1);
    expect(envelope.bestCoverageFrontier).toEqual(oracleFraction(BigInt(3), BigInt(4)));
    expect(envelope.candidates).toEqual([
      bestHighCoverageLowerEntropy,
      bestLowCoverageHigherEntropy,
      admittedLowerCoverage,
      admittedHigherCoverageLowerEntropy,
    ]);

    // The frozen frontier comes from every exact-best-replay batch, not just
    // the entropy winner: B's lower coverage does not remove it, and C cannot
    // pass by comparing only with B or an evolving incumbent.
    // Coverage is admission only. Once admitted, entropy wins even when a
    // lower-coverage +1 candidate faces a higher-coverage +1 alternative.
    const chosen = [...envelope.candidates].sort((left, right) =>
      oracleEntropyScore(right.entropy, sessionType) - oracleEntropyScore(left.entropy, sessionType)
    )[0];
    expect(chosen).toBe(admittedLowerCoverage);
  });

  it("treats a feasible singleton as a meaningful first exposure and ignores players with no active facets", () => {
    const singletonGain = meanOracleFractions([oracleFraction(ORACLE_BIG_ONE, ORACLE_BIG_ONE)]);
    expect(compareOracleFractions(singletonGain, oracleFraction(ORACLE_BIG_ZERO, ORACLE_BIG_ONE))).toBeGreaterThan(0);
    expect(compareOracleFractions(meanOracleFractions([]), oracleFraction(ORACLE_BIG_ZERO, ORACLE_BIG_ONE))).toBe(0);
  });

  it("uses the independent capped horizon marginal at five-to-six partners and saturates after six", () => {
    const peerIds = Array.from({ length: 13 }, (_value, index) => `P${index + 1}`);
    const partitionFor = (partner: string): V3DoublesPartition => ({
      team1: ["P0", partner], team2: ["X", "Y"],
    });
    const makeContext = (coveredCount: number) => oracleHorizonContext({
      P0: { partners: { opportunities: peerIds, counts: Object.fromEntries(peerIds.slice(0, coveredCount).map((id) => [id, 1])) } },
    });
    const beforeSixth = makeContext(5);
    const atSix = makeContext(6);
    const sixthPartner = partitionFor("P6");
    const seventhPartner = partitionFor("P7");
    const expectedSixth = oracleHorizonCoverageGain([sixthPartner], beforeSixth);
    const expectedSeventh = oracleHorizonCoverageGain([seventhPartner], atSix);
    const scorerBefore = createSocialHorizonCoverageScorer(beforeSixth);
    const scorerAtCap = createSocialHorizonCoverageScorer(atSix);

    expect(expectedSixth).toEqual(oracleFraction(ORACLE_BIG_ONE, BigInt(6)));
    expect(scorerBefore.toNormalizedScore(scorerBefore.getPartitionGainUnits(sixthPartner))).toBeCloseTo(1 / 6, 14);
    expect(scorerBefore.toNormalizedScore(scorerBefore.getPartitionGainUnits(sixthPartner))).toBeCloseTo(
      Number(expectedSixth.numerator) / Number(expectedSixth.denominator), 14
    );
    expect(expectedSeventh).toEqual(oracleFraction(ORACLE_BIG_ZERO, ORACLE_BIG_ONE));
    expect(scorerAtCap.getPartitionGainUnits(seventhPartner)).toBe(BigInt(0));

    const selected: V3DoublesPartition = { team1: ["P0", "P1"], team2: ["P2", "P3"] };
    const courtmatePeers = Array.from({ length: 13 }, (_value, index) => `P${index + 1}`);
    const courtmatesOneShort = oracleHorizonContext({
      P0: { courtmates: { opportunities: courtmatePeers, counts: Object.fromEntries(courtmatePeers.filter((id) => id !== "P3").map((id) => [id, 1])) } },
    });
    const courtmatesAtCap = oracleHorizonContext({
      P0: { courtmates: { opportunities: courtmatePeers, counts: Object.fromEntries(courtmatePeers.map((id) => [id, 1])) } },
    });
    const opponentPeers = Array.from({ length: 12 }, (_value, index) => `P${index + 2}`);
    const opponentsOneShort = oracleHorizonContext({
      P0: { opponents: { opportunities: opponentPeers, counts: Object.fromEntries(opponentPeers.filter((id) => id !== "P3").map((id) => [id, 1])) } },
    });
    const opponentsAtCap = oracleHorizonContext({
      P0: { opponents: { opportunities: opponentPeers, counts: Object.fromEntries(opponentPeers.map((id) => [id, 1])) } },
    });
    expect(oracleHorizonCoverageGain([selected], courtmatesOneShort)).toEqual(oracleFraction(ORACLE_BIG_ONE, BigInt(13)));
    expect(createSocialHorizonCoverageScorer(courtmatesOneShort).toNormalizedScore(
      createSocialHorizonCoverageScorer(courtmatesOneShort).getPartitionGainUnits(selected)
    )).toBeCloseTo(1 / 13, 14);
    expect(createSocialHorizonCoverageScorer(courtmatesAtCap).getPartitionGainUnits(selected)).toBe(BigInt(0));
    expect(oracleHorizonCoverageGain([selected], opponentsOneShort)).toEqual(oracleFraction(ORACLE_BIG_ONE, BigInt(12)));
    expect(createSocialHorizonCoverageScorer(opponentsOneShort).toNormalizedScore(
      createSocialHorizonCoverageScorer(opponentsOneShort).getPartitionGainUnits(selected)
    )).toBeCloseTo(1 / 12, 14);
    expect(createSocialHorizonCoverageScorer(opponentsAtCap).getPartitionGainUnits(selected)).toBe(BigInt(0));
  });

  it("activates the type facet from the actual search mode, not a reused Mixed context", () => {
    const roster = standardMixedRoster();
    const mixed: FixedLayout = {
      ids: ["m0", "m1", "f0", "f1"],
      partition: { team1: ["m0", "f0"], team2: ["m1", "f1"] },
    };
    const mixedContext = buildSocialVarietyContext(roster, [], { sessionMode: SessionMode.MIXICANO });
    const mixedModeOracle = oracleFirstExposureCoverage([mixed.partition], mixedContext, SessionMode.MIXICANO);
    const openModeOracle = oracleFirstExposureCoverage([mixed.partition], mixedContext, SessionMode.MEXICANO);
    const mixedModeScorer = createSocialVarietyCoverageScorer(mixedContext, SessionMode.MIXICANO);
    const openModeScorer = createSocialVarietyCoverageScorer(mixedContext, SessionMode.MEXICANO);
    expect(compareOracleFractions(mixedModeOracle, openModeOracle)).toBeGreaterThan(0);
    expect(mixedModeScorer.toNormalizedScore(mixedModeScorer.getPartitionGainUnits(mixed.partition))).toBeCloseTo(
      Number(mixedModeOracle.numerator) / Number(mixedModeOracle.denominator), 12
    );
    expect(openModeScorer.toNormalizedScore(openModeScorer.getPartitionGainUnits(mixed.partition))).toBeCloseTo(
      Number(openModeOracle.numerator) / Number(openModeOracle.denominator), 12
    );
  });

  it("threads an open-session mode through production coverage even when the supplied context is Mixed", () => {
    const roster = standardMixedRoster();
    const staleMixedContext = buildSocialVarietyContext(roster, [], { sessionMode: SessionMode.MIXICANO });
    const openContext = buildSocialVarietyContext(roster, [], { sessionMode: SessionMode.MEXICANO });
    const result = findBestRotationBatchSelection(roster, {
      courtCount: 1,
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.SOCIAL_MIX,
      rotationPlayerCount: 14,
      socialVarietyContext: staleMixedContext,
      randomFn: () => 0,
    });
    const chosenPartitions = result.selection?.selections.map((selection) => selection.partition) ?? [];
    const expectedOpen = oracleFirstExposureCoverage(chosenPartitions, openContext, SessionMode.MEXICANO);
    const wronglyMixed = oracleFirstExposureCoverage(chosenPartitions, staleMixedContext, SessionMode.MIXICANO);
    expect(result.selection).not.toBeNull();
    expect(result.debug.bestMinimumReplayCoverageGain).toBeCloseTo(
      Number(expectedOpen.numerator) / Number(expectedOpen.denominator), 12
    );
    expect(result.debug.bestMinimumReplayCoverageGain).not.toBeCloseTo(
      Number(wronglyMixed.numerator) / Number(wronglyMixed.denominator), 12
    );
    expect(result.debug.coverageGateCertified).toBe(true);

    const horizonWithStaleContext = findBestRotationBatchSelection(roster, {
      courtCount: 1,
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.SOCIAL_MIX,
      rotationPlayerCount: 14,
      socialVarietyContext: staleMixedContext,
      coverageGainMetric: "social-horizon-321",
      randomFn: () => 0,
    });
    const horizonWithOpenContext = findBestRotationBatchSelection(roster, {
      courtCount: 1,
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.SOCIAL_MIX,
      rotationPlayerCount: 14,
      socialVarietyContext: openContext,
      coverageGainMetric: "social-horizon-321",
      randomFn: () => 0,
    });
    const horizonOracle = oracleHorizonCoverageGain(
      horizonWithOpenContext.selection!.selections.map((selection) => selection.partition), openContext
    );
    expect(horizonWithStaleContext.debug.coverageGainMetric).toBe("social-horizon-321");
    expect(horizonWithStaleContext.debug.bestMinimumReplayCoverageGain).toBeCloseTo(
      horizonWithOpenContext.debug.bestMinimumReplayCoverageGain!, 14
    );
    expect(horizonWithStaleContext.debug.chosenImmediateCoverageGain).toBeCloseTo(
      Number(horizonOracle.numerator) / Number(horizonOracle.denominator), 14
    );
  });

  it("keeps paused roster members in the horizon structural denominator", () => {
    const roster = standardMixedRoster().map((player, index) => ({ ...player, isPaused: index === 13 }));
    const activeContext = buildSocialVarietyContext(roster, [], { sessionMode: SessionMode.MEXICANO });
    const fullStructuralContext = buildSocialVarietyContext(roster, [], {
      sessionMode: SessionMode.MEXICANO,
      includePausedPlayers: true,
    });
    expect(activeContext.playersByUserId.size).toBe(13);
    expect(fullStructuralContext.playersByUserId.size).toBe(14);
    const result = findBestRotationBatchSelection(roster, {
      courtCount: 1,
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.SOCIAL_MIX,
      rotationPlayerCount: 14,
      lockedPlayerIds: new Set(["m0", "m1", "f0", "f1"]),
      socialHistoryMatches: [],
      socialVarietyContext: activeContext,
      coverageGainMetric: "social-horizon-321",
      randomFn: () => 0,
    });
    const chosenPartitions = result.selection!.selections.map((selection) => selection.partition);
    const expectedFullRoster = oracleHorizonCoverageGain(chosenPartitions, fullStructuralContext);
    const wrongActiveOnly = oracleHorizonCoverageGain(chosenPartitions, activeContext);

    expect(result.debug.bestMinimumReplayCoverageGain).toBeCloseTo(
      Number(expectedFullRoster.numerator) / Number(expectedFullRoster.denominator), 14
    );
    expect(result.debug.bestMinimumReplayCoverageGain).not.toBeCloseTo(
      Number(wrongActiveOnly.numerator) / Number(wrongActiveOnly.denominator), 14
    );
  });

  it.each(rotationTypes)("uses the capped 3:2:1 first-exposure gate for dynamic replay minima in %s", (sessionType) => {
    for (const bestReplayCount of [0, 1]) {
      const { players, layouts, context } = horizonGateFixture(bestReplayCount);
      const profile: Profile = { rank: 0, courts: [fixedLayouts(...layouts)] };
      const gains = layouts.map((layout) => oracleHorizonCoverageGain([layout.partition], context));
      expect(gains[0]).toEqual(oracleFraction(ORACLE_BIG_ZERO, ORACLE_BIG_ONE));
      expect(compareOracleFractions(gains[1]!, gains[0]!)).toBeGreaterThan(0);
      expect(compareOracleFractions(gains[2]!, gains[1]!)).toBeGreaterThan(0);

      const result = findBestRotationBatchSelection(players, {
        courtCount: 1,
        sessionMode: SessionMode.MEXICANO,
        sessionType,
        rotationPlayerCount: 14,
        schedules: [profile],
        socialVarietyContext: context,
        coverageGainMetric: "social-horizon-321",
        randomFn: () => 0,
      });

      expect(selectedIds(result)).toEqual(layouts[1]!.ids.sort());
      expect(result.debug.coverageGainMetric).toBe("social-horizon-321");
      expect(result.debug.bestImmediateReplayCount).toBe(bestReplayCount);
      expect(result.debug.allowedImmediateReplayCount).toBe(bestReplayCount + 1);
      expect(result.debug.chosenImmediateReplayCount).toBe(bestReplayCount + 1);
      expect(result.debug.bestMinimumReplayCoverageGain).toBeCloseTo(0, 14);
      expect(result.debug.chosenImmediateCoverageGain).toBeCloseTo(
        Number(gains[1]!.numerator) / Number(gains[1]!.denominator), 14
      );
      expect(result.debug.replayCertified).toBe(true);
      expect(result.debug.coverageGateCertified).toBe(true);
      expect(result.debug.coverageGateStatus).toBe("CERTIFIED");
      expect(result.debug.chosenReplayCoverageEligible).toBe(true);
      expect(result.varietyOptimal).toBe(true);
    }
  });

  it.each(rotationTypes)("recomputes the coverage threshold from a nonzero replay minimum and disables both gates on opt-out in %s", (sessionType) => {
    const candidate = (restTurns: number[], score: OracleFraction, entropy: number) => ({
      restTurns, firstExposureCoverage: score, entropy,
    });
    const oneReplay = candidate([0, 1, 1, 1], oracleFraction(BigInt(1), BigInt(3)), 1);
    const secondOneReplay = candidate([0, 1, 1, 1], oracleFraction(BigInt(1), BigInt(4)), 2);
    const twoReplay = candidate([0, 0, 1, 1], oracleFraction(BigInt(1), BigInt(2)), 10);
    const threeReplay = candidate([0, 0, 0, 1], oracleFraction(ORACLE_BIG_ONE, ORACLE_BIG_ONE), 100);
    const envelope = oracleCoverageReplayEnvelope([oneReplay, secondOneReplay, twoReplay, threeReplay]);
    expect(envelope.bestImmediateReplayCount).toBe(1);
    expect(envelope.allowedImmediateReplayCount).toBe(2);
    expect(envelope.bestCoverageFrontier).toEqual(oracleFraction(BigInt(1), BigInt(3)));
    expect(envelope.candidates).toEqual([oneReplay, secondOneReplay, twoReplay]);
    const chosen = [...envelope.candidates].sort((left, right) =>
      oracleEntropyScore(right.entropy, sessionType) - oracleEntropyScore(left.entropy, sessionType)
    )[0];
    expect(chosen).toBe(twoReplay);

    const disabled = oracleCoverageReplayEnvelope([oneReplay, secondOneReplay, twoReplay, threeReplay], false);
    expect(disabled.bestImmediateReplayCount).toBeNull();
    expect(disabled.allowedImmediateReplayCount).toBeNull();
    expect(disabled.candidates).toHaveLength(4);
  });

  it.each(rotationTypes)("uses one combined four-facet entropy score rather than a match-type tier in %s", (sessionType) => {
    const typeHeavy: SplitCadenceCandidate = {
      restTurns: [1, 1, 1, 1], gains: { matchType: 0.9, courtmates: 0, partners: 0, opponents: 0 },
    };
    const relationshipHeavyWithOneReplay: SplitCadenceCandidate = {
      restTurns: [0, 2, 2, 2], gains: { matchType: 0.5, courtmates: 0.4, partners: 0.4, opponents: 0.4 },
    };
    expect(combinedEntropyGain(relationshipHeavyWithOneReplay.gains)).toBeGreaterThan(combinedEntropyGain(typeHeavy.gains));
    expect(chooseSplitCadence([typeHeavy, relationshipHeavyWithOneReplay], sessionType)).toBe(relationshipHeavyWithOneReplay);
  });

  it.each(rotationTypes)("uses deterministic combined-score buckets and soft cadence only for final ties in %s", (sessionType) => {
    const smootherButSlightlyLower: SplitCadenceCandidate = {
      restTurns: [3, 3, 3, 3], gains: { matchType: 0.5, courtmates: 0, partners: 0, opponents: 0 },
    };
    const shorterRestButSlightlyHigher: SplitCadenceCandidate = {
      restTurns: [2, 2, 2, 2], gains: { matchType: 0.5 + 2e-13, courtmates: 0, partners: 0, opponents: 0 },
    };
    if (sessionType === SessionType.SOCIAL_MIX) {
      expect(chooseSplitCadence([smootherButSlightlyLower, shorterRestButSlightlyHigher], sessionType))
        .toBe(shorterRestButSlightlyHigher);
    } else {
      expect(oracleEntropyScore(combinedEntropyGain(smootherButSlightlyLower.gains), sessionType))
        .toBe(oracleEntropyScore(combinedEntropyGain(shorterRestButSlightlyHigher.gains), sessionType));
      expect(chooseSplitCadence([shorterRestButSlightlyHigher, smootherButSlightlyLower], sessionType))
        .toBe(smootherButSlightlyLower);
    }
  });

  it.each(rotationTypes)("does not use a pairwise +1 comparison and disables cadence cleanly when rest is ignored in %s", (sessionType) => {
    const zero: SplitCadenceCandidate = { restTurns: [1, 1, 1, 1], gains: { matchType: 0, courtmates: 0.1, partners: 0, opponents: 0 } };
    const one: SplitCadenceCandidate = { restTurns: [0, 1, 1, 1], gains: { matchType: 0, courtmates: 0.2, partners: 0.2, opponents: 0.2 } };
    const two: SplitCadenceCandidate = { restTurns: [0, 0, 1, 1], gains: { matchType: 0, courtmates: 0.9, partners: 0.9, opponents: 0.9 } };
    const three: SplitCadenceCandidate = { restTurns: [0, 0, 0, 1], gains: { matchType: 0, courtmates: 1, partners: 1, opponents: 1 } };
    const onceFrozen = oracleReplayEnvelope([zero, one, two, three]);
    expect(onceFrozen.candidates).toEqual([zero, one]);
    expect(chooseSplitCadence([zero, one, two, three], sessionType, false)).toBe(three);
    expect(oracleReplayEnvelope([zero, one, two, three], false).allowedImmediateReplayCount).toBeNull();
  });

  it.each(rotationTypes)("selects the higher-relationship-entropy group ahead of softer rest when zero counts tie for %s", (sessionType) => {
    const [men, women] = ownSideChoices();
    const players = standardMixedRoster({
      m0: 1, m1: 1, m2: 1, m3: 1,
      f0: 2, f1: 2, f2: 2, f3: 2,
    });
    const history = repeatedHistory(women, 20);
    const maleOnly = runFixedOneCourt(players, sessionType, [men], history, SessionMode.MEXICANO);
    const femaleOnly = runFixedOneCourt(players, sessionType, [women], history, SessionMode.MEXICANO);
    const combined = runFixedOneCourt(players, sessionType, [men, women], history, SessionMode.MEXICANO);

    expect(selectedFacetGain(maleOnly, "matchType")).toBe(0);
    expect(selectedFacetGain(femaleOnly, "matchType")).toBe(0);
    expect(selectedRelationshipGain(maleOnly)).toBeGreaterThan(selectedRelationshipGain(femaleOnly));
    expect(maleOnly.selection?.restSummary.restTurnVector.filter((turns) => turns === 0)).toHaveLength(0);
    expect(femaleOnly.selection?.restSummary.restTurnVector.filter((turns) => turns === 0)).toHaveLength(0);
    expect(selectedIds(combined)).toEqual(men.ids.sort());
    expect(softCadenceWord(combined.selection!.restSummary.restTurnVector)).toEqual([-1, -1, -1, -1]);
  });

  it.each(rotationTypes)("falls through to soft cadence when relationship gains tie and type is inactive for %s", (sessionType) => {
    const [men, women] = ownSideChoices();
    const players = standardMixedRoster({
      m0: 1, m1: 1, m2: 1, m3: 1,
      f0: 2, f1: 2, f2: 2, f3: 2,
    });
    const maleOnly = runFixedOneCourt(players, sessionType, [men], [], SessionMode.MEXICANO);
    const femaleOnly = runFixedOneCourt(players, sessionType, [women], [], SessionMode.MEXICANO);
    const combined = runFixedOneCourt(players, sessionType, [men, women], [], SessionMode.MEXICANO);

    expect(selectedRelationshipGain(maleOnly)).toBeCloseTo(selectedRelationshipGain(femaleOnly), 12);
    expect(selectedFacetGain(maleOnly, "matchType")).toBe(0);
    expect(selectedFacetGain(femaleOnly, "matchType")).toBe(0);
    expect(selectedIds(combined)).toEqual(women.ids.sort());
    expect(softCadenceWord(combined.selection!.restSummary.restTurnVector)).toEqual([-2, -2, -2, -2]);
  });

  it.each(rotationTypes)("admits a one-replay OWN_SIDE court when combined entropy improves within best+1 for %s", (sessionType) => {
    const mixed: FixedLayout = {
      ids: ["m0", "m1", "f0", "f1"],
      partition: { team1: ["m0", "f0"], team2: ["m1", "f1"] },
    };
    const [ownMen] = ownSideChoices();
    const players = standardMixedRoster({
      m0: 1, m1: 1, m2: 1, m3: 0, m4: 0,
      f0: 1, f1: 1, f2: 1, f3: 0, f4: 0,
    });
    const history = repeatedHistory(mixed, 20);
    const mixedOnly = runFixedOneCourt(players, sessionType, [mixed], history);
    const ownSideOnly = runFixedOneCourt(players, sessionType, [ownMen], history);
    const combined = runFixedOneCourt(players, sessionType, [mixed, ownMen], history);

    expect(immediateReplayCount(mixedOnly.selection!.restSummary.restTurnVector)).toBe(0);
    expect(immediateReplayCount(ownSideOnly.selection!.restSummary.restTurnVector)).toBe(1);
    expect(ownSideOnly.selection!.totalSocialVarietyGain).toBeGreaterThan(mixedOnly.selection!.totalSocialVarietyGain!);
    expect(selectedIds(combined)).toEqual(ownMen.ids.sort());
    expect(selectedOwnSideType(combined)).toBe("OWN_SIDE");
    expect(combined.debug.bestImmediateReplayCount).toBe(0);
    expect(combined.debug.allowedImmediateReplayCount).toBe(1);
    expect(combined.debug.chosenImmediateReplayCount).toBe(1);
    expect(combined.debug.replayCertified).toBe(true);
    expect(combined.debug.replayEnvelopeStatus).toBe("CERTIFIED");
  });

  it.each(rotationTypes)("recomputes best+1 from the strongest class when its minimum already has one replay for %s", (sessionType) => {
    const oneReplay: FixedLayout = {
      ids: ["a", "b", "c", "d"],
      partition: { team1: ["a", "b"], team2: ["c", "d"] },
    };
    const twoReplay: FixedLayout = {
      ids: ["a", "b", "e", "f"],
      partition: { team1: ["a", "e"], team2: ["b", "f"] },
    };
    const threeReplay: FixedLayout = {
      ids: ["a", "b", "g", "h"],
      partition: { team1: ["a", "g"], team2: ["b", "h"] },
    };
    const players = [
      makePlayer("a", { matchesPlayed: 5, restTurns: 0 }),
      makePlayer("b", { matchesPlayed: 5, restTurns: 1 }),
      makePlayer("c", { matchesPlayed: 5, restTurns: 1 }),
      makePlayer("d", { matchesPlayed: 5, restTurns: 1 }),
      makePlayer("e", { matchesPlayed: 5, restTurns: 0 }),
      makePlayer("f", { matchesPlayed: 5, restTurns: 1 }),
      makePlayer("g", { matchesPlayed: 5, restTurns: 0 }),
      makePlayer("h", { matchesPlayed: 5, restTurns: 0 }),
    ];
    const history = repeatedHistory(oneReplay, 30);
    const profile: Profile = { rank: 0, courts: [fixedLayouts(oneReplay, twoReplay, threeReplay)] };
    const result = findBestRotationBatchSelection(players, {
      courtCount: 1,
      sessionMode: SessionMode.MEXICANO,
      sessionType,
      rotationPlayerCount: 8,
      schedules: [profile],
      socialHistoryMatches: history,
      socialVarietyContext: buildSocialVarietyContext(players, history, { sessionMode: SessionMode.MEXICANO }),
      randomFn: () => 0,
    });
    expect(immediateReplayCount(oneReplay.ids.map((id) => players.find((player) => player.userId === id)!.restTurns))).toBe(1);
    expect(immediateReplayCount(twoReplay.ids.map((id) => players.find((player) => player.userId === id)!.restTurns))).toBe(2);
    expect(immediateReplayCount(threeReplay.ids.map((id) => players.find((player) => player.userId === id)!.restTurns))).toBe(3);
    expect(selectedIds(result)).toEqual(twoReplay.ids.sort());
    expect(result.debug.bestImmediateReplayCount).toBe(1);
    expect(result.debug.allowedImmediateReplayCount).toBe(2);
    expect(result.debug.chosenImmediateReplayCount).toBe(2);
    expect(result.debug.coverageGateCertified).toBe(true);
    expect(result.debug.coverageGateStatus).toBe("CERTIFIED");
    expect(result.debug.chosenReplayCoverageEligible).toBe(true);
  });

  it.each(rotationTypes)("keeps the replay-free Mixed batch when combined entropy ties and its soft cadence wins for %s", (sessionType) => {
    const mixed: FixedLayout = {
      ids: ["m0", "m1", "f0", "f1"],
      partition: { team1: ["m0", "f0"], team2: ["m1", "f1"] },
    };
    const [ownMen] = ownSideChoices();
    const players = standardMixedRoster({
      m0: 1, m1: 1, m2: 1, m3: 0,
      f0: 1, f1: 1,
    });
    const mixedOnly = runFixedOneCourt(players, sessionType, [mixed]);
    const ownSideOnly = runFixedOneCourt(players, sessionType, [ownMen]);
    const combined = runFixedOneCourt(players, sessionType, [mixed, ownMen]);

    expect(mixedOnly.selection!.totalSocialVarietyGain).toBeCloseTo(ownSideOnly.selection!.totalSocialVarietyGain!, 12);
    expect(immediateReplayCount(mixedOnly.selection!.restSummary.restTurnVector)).toBe(0);
    expect(immediateReplayCount(ownSideOnly.selection!.restSummary.restTurnVector)).toBe(1);
    expect(selectedIds(combined)).toEqual(mixed.ids.sort());
    expect(selectedOwnSideType(combined)).toBe("MIXED");
    expect(combined.debug.bestImmediateReplayCount).toBe(0);
    expect(combined.debug.allowedImmediateReplayCount).toBe(1);
    expect(combined.debug.chosenImmediateReplayCount).toBe(0);
  });

  it.each(rotationTypes)("keeps OWN_SIDE opportunities inside the one-court best+1 replay envelope for %s", (sessionType) => {
    const available = [
      ...Array.from({ length: 5 }, (_value, index) => makePlayer(`m${index}`, {
        matchesPlayed: 5, gender: "MALE", partnerPreference: "OPEN", restTurns: index < 3 ? 1 : 0,
      })),
      ...Array.from({ length: 5 }, (_value, index) => makePlayer(`f${index}`, {
        matchesPlayed: 5, gender: "FEMALE", partnerPreference: "FEMALE_FLEX", restTurns: index < 3 ? 1 : 0,
      })),
    ];
    const busy = [
      makePlayer("m5", { matchesPlayed: 5, gender: "MALE", isBusy: true, restTurns: 0 }),
      makePlayer("m6", { matchesPlayed: 5, gender: "MALE", isBusy: true, restTurns: 0 }),
      makePlayer("f5", { matchesPlayed: 5, gender: "FEMALE", partnerPreference: "FEMALE_FLEX", isBusy: true, restTurns: 0 }),
      makePlayer("f6", { matchesPlayed: 5, gender: "FEMALE", partnerPreference: "FEMALE_FLEX", isBusy: true, restTurns: 0 }),
    ];
    const mixed: FixedLayout = {
      ids: ["m0", "m1", "f0", "f1"],
      partition: { team1: ["m0", "f0"], team2: ["m1", "f1"] },
    };
    const [ownMen] = ownSideChoices();
    const history = repeatedHistory(mixed, 30);
    const roster = [...available, ...busy];
    const context = buildSocialVarietyContext(roster, history, { sessionMode: SessionMode.MIXICANO });
    const mixedCoverage = oracleFirstExposureCoverage([mixed.partition], context, SessionMode.MIXICANO);
    const ownCoverage = oracleFirstExposureCoverage([ownMen.partition], context, SessionMode.MIXICANO);
    expect(compareOracleFractions(ownCoverage, mixedCoverage)).toBeGreaterThan(0);
    const profile: Profile = { rank: 0, courts: [fixedLayouts(mixed, ownMen)] };
    const availableBatches = [mixed, ownMen].map((layout) => ({
      type: layout.ids.every((id) => id.startsWith("m")) ? "OWN_SIDE" : "MIXED",
      zeroRestCount: immediateReplayCount(layout.ids.map((id) => available.find((player) => player.userId === id)!.restTurns)),
    }));
    const minimumFor = (type: "MIXED" | "OWN_SIDE") => Math.min(...availableBatches
      .filter((batch) => batch.type === type).map((batch) => batch.zeroRestCount));
    expect(minimumFor("MIXED")).toBe(0);
    expect(minimumFor("OWN_SIDE")).toBe(1);

    const result = findBestRotationBatchSelection(roster, {
      courtCount: 1,
      sessionMode: SessionMode.MIXICANO,
      sessionType,
      rotationPlayerCount: 14,
      schedules: [profile],
      socialHistoryMatches: history,
      socialVarietyContext: context,
      randomFn: () => 0,
    });
    expect(selectedOwnSideType(result)).toBe("OWN_SIDE");
    expect(result.debug.bestImmediateReplayCount).toBe(0);
    expect(result.debug.allowedImmediateReplayCount).toBe(1);
    expect(result.debug.chosenImmediateReplayCount).toBe(1);
    expect(result.debug.bestMinimumReplayCoverageGain).toBeCloseTo(Number(mixedCoverage.numerator) / Number(mixedCoverage.denominator), 12);
    expect(result.debug.chosenImmediateCoverageGain).toBeCloseTo(Number(ownCoverage.numerator) / Number(ownCoverage.denominator), 12);
    expect(result.debug.coverageGateCertified).toBe(true);
    expect(result.debug.coverageGateStatus).toBe("CERTIFIED");
    expect(result.debug.chosenReplayCoverageEligible).toBe(true);
  });

  it.each(rotationTypes)("compares the best+1 replay envelope over all eight selected players across two courts for %s", (sessionType) => {
    const a0: FixedLayout = { ids: ["a", "b", "c", "d"], partition: { team1: ["a", "b"], team2: ["c", "d"] } };
    const a1: FixedLayout = { ids: ["e", "f", "g", "h"], partition: { team1: ["e", "f"], team2: ["g", "h"] } };
    const b0: FixedLayout = { ids: ["e", "f", "i", "x"], partition: { team1: ["e", "f"], team2: ["i", "x"] } };
    const b1: FixedLayout = { ids: ["a", "b", "j", "y"], partition: { team1: ["a", "b"], team2: ["j", "y"] } };
    const players = [...new Set([...a0.ids, ...a1.ids, ...b0.ids, ...b1.ids, "z0", "z1"])].map((userId) =>
      makePlayer(userId, {
        matchesPlayed: 5,
        restTurns: userId === "i" ? 0 : ["x", "j", "y"].includes(userId) ? 2 : 1,
      })
    );
    const history = [
      ...repeatedHistory(a0, 20),
      ...repeatedHistory(a1, 20),
    ];
    const context = buildSocialVarietyContext(players, history, { sessionMode: SessionMode.MEXICANO });
    const profileFor = (first: FixedLayout[], second: FixedLayout[]): Profile => ({
      rank: 0,
      courts: [fixedLayouts(...first), fixedLayouts(...second)],
    });
    const run = (profile: Profile, coverageGainMetric?: "social-horizon-321") => findBestRotationBatchSelection(players, {
      courtCount: 2,
      sessionMode: SessionMode.MEXICANO,
      sessionType,
      rotationPlayerCount: 14,
      schedules: [profile],
      socialHistoryMatches: history,
      socialVarietyContext: context,
      ...(coverageGainMetric ? { coverageGainMetric } : {}),
      randomFn: () => 0,
    });
    const bestRestOnly = run(profileFor([a0], [a1]));
    const oneReplayHigherEntropy = run(profileFor([b0], [b1]));
    const combined = run(profileFor([a0, b0], [a1, b1]));
    expect(immediateReplayCount(bestRestOnly.selection!.restSummary.restTurnVector)).toBe(0);
    expect(immediateReplayCount(oneReplayHigherEntropy.selection!.restSummary.restTurnVector)).toBe(1);
    expect(oneReplayHigherEntropy.selection!.totalSocialVarietyGain)
      .toBeGreaterThan(bestRestOnly.selection!.totalSocialVarietyGain!);
    expect(selectedIds(combined)).toEqual(selectedIds(oneReplayHigherEntropy));
    expect(combined.selection?.selections).toHaveLength(2);
    expect(combined.selection?.selections.flatMap((selection) => selection.players)).toHaveLength(8);
    expect(combined.debug.bestImmediateReplayCount).toBe(0);
    expect(combined.debug.allowedImmediateReplayCount).toBe(1);
    expect(combined.debug.chosenImmediateReplayCount).toBe(1);
    expect(combined.debug.coverageGateCertified).toBe(true);
    expect(combined.debug.coverageGateStatus).toBe("CERTIFIED");
    expect(combined.debug.chosenReplayCoverageEligible).toBe(true);

    const horizonA = oracleHorizonCoverageGain([a0.partition, a1.partition], context);
    const horizonB = oracleHorizonCoverageGain([b0.partition, b1.partition], context);
    expect(compareOracleFractions(horizonB, horizonA)).toBeGreaterThan(0);
    const horizonCombined = run(profileFor([a0, b0], [a1, b1]), "social-horizon-321");
    expect(selectedIds(horizonCombined)).toEqual(selectedIds(oneReplayHigherEntropy));
    expect(horizonCombined.selection?.selections.flatMap((selection) => selection.players)).toHaveLength(8);
    expect(horizonCombined.debug.coverageGainMetric).toBe("social-horizon-321");
    expect(horizonCombined.debug.bestImmediateReplayCount).toBe(0);
    expect(horizonCombined.debug.allowedImmediateReplayCount).toBe(1);
    expect(horizonCombined.debug.chosenImmediateReplayCount).toBe(1);
    expect(horizonCombined.debug.bestMinimumReplayCoverageGain).toBeCloseTo(
      Number(horizonA.numerator) / Number(horizonA.denominator), 14
    );
    expect(horizonCombined.debug.chosenImmediateCoverageGain).toBeCloseTo(
      Number(horizonB.numerator) / Number(horizonB.denominator), 14
    );
    expect(horizonCombined.debug.coverageGateCertified).toBe(true);
    expect(horizonCombined.debug.chosenReplayCoverageEligible).toBe(true);
  });

  it.each(rotationTypes)("matches the brute-force 3-court oracle through the cadence-bound DFS for %s", (sessionType) => {
    const a0 = ["a0", "a1", "a2", "a3"];
    const a1 = ["b0", "b1", "b2", "b3"];
    const a2 = ["c0", "c1", "c2", "c3"];
    // Each B court is disjoint from its same-index A court and overlaps each
    // other A court. This leaves exactly the all-A and all-B legal batches.
    const b0 = ["b0", "b1", "c0", "x"];
    const b1 = ["a0", "a1", "c1", "c2"];
    const b2 = ["a2", "a3", "b2", "y"];
    const restById: Record<string, number> = {
      a0: 1, a1: 1, a2: 1, a3: 1,
      b0: 1, b1: 1, b2: 1, b3: 0,
      c0: 1, c1: 1, c2: 1, c3: 0,
      x: 2, y: 2,
    };
    const players = Object.keys(restById).map((userId) => makePlayer(userId, { restTurns: restById[userId] }));
    const profile: Profile = {
      rank: 0,
      courts: [allowedQuartets(a0, b0), allowedQuartets(a1, b1), allowedQuartets(a2, b2)],
    };
    const legalBatches = enumerateOracleBatches(players, [profile], 3, SessionMode.MEXICANO);
    expect(legalBatches).toHaveLength(2);
    const expected = oracleBestBatch(legalBatches, players, 14, sessionType, 0, SessionMode.MEXICANO);
    expect(expected!.ids).toContain("x");
    expect(expected!.ids).toContain("y");

    const result = findBestRotationBatchSelection(players, {
      courtCount: 3,
      sessionMode: SessionMode.MEXICANO,
      sessionType,
      rotationPlayerCount: 14,
      schedules: [profile],
      searchLimits: { maxBranches: 50_000, maxMs: 30_000 },
      randomFn: () => 0,
    });
    expect(result.selection).not.toBeNull();
    expect(result.varietyOptimal).toBe(true);
    expect(selectedIds(result)).toEqual(expected!.ids.sort());
  });

  it("does not prune a higher-entropy 3-court batch just because its soft rest vector is worse", () => {
    const a0: FixedLayout = { ids: ["a0", "a1", "a2", "a3"], partition: { team1: ["a0", "a1"], team2: ["a2", "a3"] } };
    const a1: FixedLayout = { ids: ["b0", "b1", "b2", "b3"], partition: { team1: ["b0", "b1"], team2: ["b2", "b3"] } };
    const a2: FixedLayout = { ids: ["c0", "c1", "c2", "c3"], partition: { team1: ["c0", "c1"], team2: ["c2", "c3"] } };
    const b0: FixedLayout = { ids: ["b0", "b1", "c0", "x"], partition: { team1: ["b0", "b1"], team2: ["c0", "x"] } };
    const b1: FixedLayout = { ids: ["a0", "a1", "c1", "c2"], partition: { team1: ["a0", "a1"], team2: ["c1", "c2"] } };
    const b2: FixedLayout = { ids: ["a2", "a3", "b2", "y"], partition: { team1: ["a2", "a3"], team2: ["b2", "y"] } };
    const a = [a0, a1, a2];
    const b = [b0, b1, b2];
    const bHistory = b.flatMap((layout) => repeatedHistory(layout, 12));
    const playerIds = [...new Set([...a, ...b].flatMap((layout) => layout.ids))];
    const restById: Record<string, number> = Object.fromEntries(playerIds.map((id) => [id, 1]));
    restById.x = 3;
    restById.y = 3;
    const roster = playerIds.map((id) => makePlayer(id, { matchesPlayed: 5, restTurns: restById[id] }));
    const profileFor = (layouts: FixedLayout[][]): Profile => ({
      rank: 0,
      courts: layouts.map((courtLayouts) => fixedLayouts(...courtLayouts)),
    });
    const optionsFor = (layouts: FixedLayout[][]) => ({
      courtCount: 3,
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.SOCIAL_MIX,
      rotationPlayerCount: 14,
      schedules: [profileFor(layouts)],
      socialHistoryMatches: bHistory,
      socialVarietyContext: buildSocialVarietyContext(roster, bHistory, { sessionMode: SessionMode.MEXICANO }),
      searchLimits: { maxBranches: 50_000, maxMs: 30_000 },
      randomFn: () => 0,
    });
    const allA = findBestRotationBatchSelection(roster, optionsFor([[a0], [a1], [a2]]));
    const allB = findBestRotationBatchSelection(roster, optionsFor([[b0], [b1], [b2]]));
    const combined = findBestRotationBatchSelection(roster, optionsFor([[a0, b0], [a1, b1], [a2, b2]]));

    expect(allA.selection).not.toBeNull();
    expect(allB.selection).not.toBeNull();
    expect(allA.selection!.totalSocialVarietyGain ?? 0).toBeGreaterThan(allB.selection!.totalSocialVarietyGain ?? 0);
    expect(softCadenceWord(allB.selection!.restSummary.restTurnVector))
      .toEqual(expect.arrayContaining([-3, -3]));
    expect(compareWords(
      softCadenceWord(allB.selection!.restSummary.restTurnVector),
      softCadenceWord(allA.selection!.restSummary.restTurnVector)
    )).toBeLessThan(0);
    expect(combined.varietyOptimal).toBe(true);
    expect(selectedIds(combined)).toEqual(selectedIds(allA));
  });

  it("keeps the one-replay best+1 branch through the 3-court DFS when combined entropy improves", () => {
    const a0: FixedLayout = { ids: ["a1", "a2", "a3", "a4"], partition: { team1: ["a1", "a3"], team2: ["a2", "a4"] } };
    const a1: FixedLayout = { ids: ["b1", "b2", "b3", "b4"], partition: { team1: ["b1", "b3"], team2: ["b2", "b4"] } };
    const a2: FixedLayout = { ids: ["c1", "c2", "c3", "c4"], partition: { team1: ["c1", "c2"], team2: ["c3", "c4"] } };
    const b0: FixedLayout = { ids: ["b1", "b2", "c1", "x"], partition: { team1: ["b1", "b2"], team2: ["c1", "x"] } };
    const b1: FixedLayout = { ids: ["a1", "a2", "c2", "y"], partition: { team1: ["a1", "a2"], team2: ["c2", "y"] } };
    const b2: FixedLayout = { ids: ["a3", "a4", "b3", "b4"], partition: { team1: ["a3", "b3"], team2: ["a4", "b4"] } };
    const allMixed = [a0, a1, a2];
    const typeFavoredBatch = [b0, b1, b2];
    const playerIds = [...new Set([...allMixed, ...typeFavoredBatch].flatMap((layout) => layout.ids))];
    const maleIds = new Set(["a3", "a4", "b1", "b2", "c1", "c3", "x"]);
    const players = playerIds.map((userId) => makePlayer(userId, {
      matchesPlayed: 5,
      restTurns: userId === "x" ? 0 : 1,
      gender: maleIds.has(userId) ? "MALE" : "FEMALE",
      partnerPreference: maleIds.has(userId) ? "OPEN" : "FEMALE_FLEX",
    }));
    const xMixedPrior: FixedLayout = {
      ids: ["x", "b1", "a1", "a2"],
      partition: { team1: ["x", "a1"], team2: ["b1", "a2"] },
    };
    const yMixedPrior: FixedLayout = {
      ids: ["b1", "b2", "a1", "y"],
      partition: { team1: ["b1", "a1"], team2: ["b2", "y"] },
    };
    const history = [
      ...allMixed.flatMap((layout) => repeatedHistory(layout, 8)),
      ...repeatedHistory(xMixedPrior, 1),
      ...repeatedHistory(yMixedPrior, 1),
    ];
    const profileFor = (layouts: FixedLayout[][]): Profile => ({
      rank: 0,
      courts: layouts.map((courtLayouts) => fixedLayouts(...courtLayouts)),
    });
    const run = (layouts: FixedLayout[][], coverageGainMetric?: "social-horizon-321") => findBestRotationBatchSelection(players, {
      courtCount: 3,
      sessionMode: SessionMode.MIXICANO,
      sessionType: SessionType.SOCIAL_MIX,
      rotationPlayerCount: 14,
      schedules: [profileFor(layouts)],
      socialHistoryMatches: history,
      socialVarietyContext: buildSocialVarietyContext(players, history, { sessionMode: SessionMode.MIXICANO }),
      ...(coverageGainMetric ? { coverageGainMetric } : {}),
      searchLimits: { maxBranches: 50_000, maxMs: 30_000 },
      randomFn: () => 0,
    });
    const mixedOnly = run([[a0], [a1], [a2]]);
    const typeFavoredOnly = run([[b0], [b1], [b2]]);
    const combined = run([[a0, b0], [a1, b1], [a2, b2]]);

    const mixedSelection = mixedOnly.selection;
    const typeFavoredSelection = typeFavoredOnly.selection;
    const combinedSelection = combined.selection;
    if (!mixedSelection || !typeFavoredSelection || !combinedSelection) {
      throw new Error("The constrained three-court batches should all have certified selections.");
    }
    expect(immediateReplayCount(mixedSelection.restSummary.restTurnVector)).toBe(0);
    expect(immediateReplayCount(typeFavoredSelection.restSummary.restTurnVector)).toBe(1);
    expect(typeFavoredSelection.totalSocialVarietyGain).toBeGreaterThan(mixedSelection.totalSocialVarietyGain!);
    expect(combined.varietyOptimal).toBe(true);
    expect(immediateReplayCount(combinedSelection.restSummary.restTurnVector)).toBe(1);
    expect(selectedIds(combined)).toEqual(selectedIds(typeFavoredOnly));
    expect(combined.debug.bestImmediateReplayCount).toBe(0);
    expect(combined.debug.allowedImmediateReplayCount).toBe(1);
    expect(combined.debug.chosenImmediateReplayCount).toBe(1);
    expect(combined.debug.replayCertified).toBe(true);
    expect(combined.debug.replayEnvelopeStatus).toBe("CERTIFIED");
    expect(combined.debug.coverageGateCertified).toBe(true);
    expect(combined.debug.coverageGateStatus).toBe("CERTIFIED");
    expect(combined.debug.chosenReplayCoverageEligible).toBe(true);
    expect(combinedSelection.selections.map((selection) => selection.socialVariety?.courtType))
      .toEqual(["UPPER", "LOWER", "MIXED"]);

    const context = buildSocialVarietyContext(players, history, { sessionMode: SessionMode.MIXICANO });
    const horizonA = oracleHorizonCoverageGain(allMixed.map((layout) => layout.partition), context);
    const horizonB = oracleHorizonCoverageGain(typeFavoredBatch.map((layout) => layout.partition), context);
    expect(compareOracleFractions(horizonB, horizonA)).toBeGreaterThan(0);
    const horizonCombined = run([[a0, b0], [a1, b1], [a2, b2]], "social-horizon-321");
    expect(selectedIds(horizonCombined)).toEqual(selectedIds(typeFavoredOnly));
    expect(horizonCombined.varietyOptimal).toBe(true);
    expect(immediateReplayCount(horizonCombined.selection!.restSummary.restTurnVector)).toBe(1);
    expect(horizonCombined.debug.bestImmediateReplayCount).toBe(0);
    expect(horizonCombined.debug.allowedImmediateReplayCount).toBe(1);
    expect(horizonCombined.debug.chosenImmediateReplayCount).toBe(1);
    expect(horizonCombined.debug.chosenImmediateCoverageGain).toBeCloseTo(
      Number(horizonB.numerator) / Number(horizonB.denominator), 14
    );
    expect(horizonCombined.debug.coverageGateCertified).toBe(true);
    expect(horizonCombined.debug.chosenReplayCoverageEligible).toBe(true);
  });

  it.each(rotationTypes)("uses soft rest only after the combined entropy gains tie for %s", (sessionType) => {
    const a0: FixedLayout = {
      ids: ["m0", "m1", "f0", "f1"],
      partition: { team1: ["m0", "f0"], team2: ["m1", "f1"] },
    };
    const a1: FixedLayout = {
      ids: ["m2", "m3", "f2", "f3"],
      partition: { team1: ["m2", "f2"], team2: ["m3", "f3"] },
    };
    const b0: FixedLayout = {
      ids: ["m0", "m4", "f0", "f4"],
      partition: { team1: ["m0", "f0"], team2: ["m4", "f4"] },
    };
    const b1: FixedLayout = {
      ids: ["m1", "m2", "f1", "f2"],
      partition: { team1: ["m1", "f1"], team2: ["m2", "f2"] },
    };
    const rest3 = new Set(["m1", "f1"]);
    const rest2 = new Set(["m4", "f4"]);
    const players = [
      ...Array.from({ length: 7 }, (_value, index) => makePlayer(`m${index}`, {
        gender: "MALE", restTurns: rest3.has(`m${index}`) ? 3 : rest2.has(`m${index}`) ? 2 : 1,
      })),
      ...Array.from({ length: 7 }, (_value, index) => makePlayer(`f${index}`, {
        gender: "FEMALE", partnerPreference: "FEMALE_FLEX",
        restTurns: rest3.has(`f${index}`) ? 3 : rest2.has(`f${index}`) ? 2 : 1,
      })),
    ];
    const profile: Profile = {
      rank: 0,
      courts: [fixedLayouts(a0, b0), fixedLayouts(a1, b1)],
    };
    const batches = enumerateOracleBatches(players, [profile], 2, SessionMode.MIXICANO);
    expect(batches).toHaveLength(3);
    const oracle = oracleBestBatch(batches, players, 14, sessionType, 0, SessionMode.MIXICANO);
    expect(oracle!.ids.sort()).toEqual(["m0", "m1", "m2", "m4", "f0", "f1", "f2", "f4"].sort());
    const restTurns = oracle!.players.map((player) => player.restTurns);
    expect(immediateReplayCount(restTurns)).toBe(0);
    expect(softCadenceWord(restTurns)).toEqual([-1, -1, -1, -1, -2, -2, -3, -3]);

    const run = (left: FixedLayout, right: FixedLayout[]) => findBestRotationBatchSelection(players, {
      courtCount: 2,
      sessionMode: SessionMode.MIXICANO,
      sessionType,
      rotationPlayerCount: 14,
      schedules: [{ rank: 0, courts: [fixedLayouts(left), fixedLayouts(...right)] }],
      socialVarietyContext: buildSocialVarietyContext(players, [], { sessionMode: SessionMode.MIXICANO }),
      randomFn: () => 0,
    });
    const candidateA = run(a0, [a1]);
    const candidateB = run(b0, [b1]);
    const candidateC = run(b0, [a1]);
    const gainLayers = [candidateA, candidateB, candidateC].map((candidate) => ({
      type: oracleEntropyScore(candidate.selection?.totalSocialVarietyGains?.matchType ?? 0, sessionType),
      relationship: oracleEntropyScore(batchRelationshipGain(candidate), sessionType),
    }));
    const referenceGain = gainLayers[0];
    if (!referenceGain) throw new Error("The three fixed batches should have entropy measurements.");
    expect(gainLayers.every((gains) => gains.type === referenceGain.type && gains.relationship === referenceGain.relationship)).toBe(true);

    const result = findBestRotationBatchSelection(players, {
      courtCount: 2,
      sessionMode: SessionMode.MIXICANO,
      sessionType,
      rotationPlayerCount: 14,
      schedules: [profile],
      socialVarietyContext: buildSocialVarietyContext(players, [], { sessionMode: SessionMode.MIXICANO }),
      randomFn: () => 0,
    });
    expect(selectedIds(result)).toEqual(oracle!.ids.sort());
    expect(result.selection?.selections.map((selection) => selection.socialVariety?.courtType)).toEqual(["MIXED", "MIXED"]);
  });

  it.each(rotationTypes)("freezes one replay envelope over the full two-court batch in %s", (sessionType) => {
    const layout = (ids: string[], team1: [string, string], team2: [string, string]): FixedLayout => ({
      ids,
      partition: { team1, team2 },
    });
    const a0 = layout(["pAB", "pAC", "F0", "F1"], ["pAB", "pAC"], ["F0", "F1"]);
    const a1 = layout(["pBA", "pCA", "G0", "G1"], ["pCA", "pBA"], ["G0", "G1"]);
    const b0 = layout(["pBA", "pBC", "X", "F1"], ["pBC", "pBA"], ["X", "F1"]);
    const b1 = layout(["pAB", "pCB", "G0", "G1"], ["pAB", "pCB"], ["G0", "G1"]);
    const c0 = layout(["pCA", "pCB", "Q0", "F0"], ["pCA", "pCB"], ["Q0", "F0"]);
    const c1 = layout(["pAC", "pBC", "Q2", "G1"], ["pAC", "pBC"], ["Q2", "G1"]);
    const genders: Record<string, "MALE" | "FEMALE"> = {
      pAB: "MALE", pAC: "FEMALE", pBA: "FEMALE", pBC: "MALE", pCA: "MALE", pCB: "FEMALE",
      F0: "MALE", F1: "FEMALE", G0: "MALE", G1: "FEMALE", X: "MALE",
      Q0: "FEMALE", Q2: "MALE", unused: "FEMALE",
    };
    const players = Object.entries(genders).map(([userId, gender]) => makePlayer(userId, {
      matchesPlayed: 5,
      gender,
      partnerPreference: gender === "FEMALE" ? "FEMALE_FLEX" : "OPEN",
      restTurns: userId === "X" || userId === "Q0" || userId === "Q2" ? 0 : 1,
    }));
    const profile: Profile = {
      rank: 0,
      courts: [fixedLayouts(a0, b0, c0), fixedLayouts(a1, b1, c1)],
    };
    const batches = enumerateOracleBatches(players, [profile], 2, SessionMode.MIXICANO);
    expect(batches).toHaveLength(3);
    const replayCount = (batch: OracleBatch) => immediateReplayCount(batch.players.map((player) => player.restTurns));
    const byReplayCount = [...batches].sort((left, right) => replayCount(left) - replayCount(right));
    expect(byReplayCount.map(replayCount)).toEqual([0, 1, 2]);
    expect(byReplayCount[2]!.ids).toContain("Q0");
    expect(byReplayCount[2]!.ids).toContain("Q2");

    const history = [...repeatedHistory(a0, 20), ...repeatedHistory(a1, 20)];
    const context = buildSocialVarietyContext(players, history, { sessionMode: SessionMode.MIXICANO });
    const run = (court0: FixedLayout[], court1: FixedLayout[], coverageGainMetric?: "social-horizon-321") => findBestRotationBatchSelection(players, {
      courtCount: 2,
      sessionMode: SessionMode.MIXICANO,
      sessionType,
      rotationPlayerCount: 14,
      schedules: [{ rank: 0, courts: [fixedLayouts(...court0), fixedLayouts(...court1)] }],
      socialHistoryMatches: history,
      socialVarietyContext: context,
      ...(coverageGainMetric ? { coverageGainMetric } : {}),
      randomFn: () => 0,
    });
    const candidateA = run([a0], [a1]);
    const candidateB = run([b0], [b1]);
    const candidateC = run([c0], [c1]);
    expect(candidateB.selection!.totalSocialVarietyGain).toBeGreaterThan(candidateA.selection!.totalSocialVarietyGain!);
    expect(candidateC.selection!.totalSocialVarietyGain).toBeGreaterThan(candidateB.selection!.totalSocialVarietyGain!);

    const combined = run([a0, b0, c0], [a1, b1, c1]);
    expect(selectedIds(combined)).toEqual(selectedIds(candidateB));
    expect(combined.debug.bestImmediateReplayCount).toBe(0);
    expect(combined.debug.allowedImmediateReplayCount).toBe(1);
    expect(combined.debug.chosenImmediateReplayCount).toBe(1);
    expect(combined.debug.replayCertified).toBe(true);
    expect(combined.debug.replayEnvelopeStatus).toBe("CERTIFIED");

    const horizonA = oracleHorizonCoverageGain([a0.partition, a1.partition], context);
    const horizonB = oracleHorizonCoverageGain([b0.partition, b1.partition], context);
    const horizonC = oracleHorizonCoverageGain([c0.partition, c1.partition], context);
    expect(compareOracleFractions(horizonB, horizonA)).toBeGreaterThan(0);
    expect(compareOracleFractions(horizonC, horizonB)).toBeGreaterThan(0);
    const horizonCombined = run([a0, b0, c0], [a1, b1, c1], "social-horizon-321");
    expect(selectedIds(horizonCombined)).toEqual(selectedIds(candidateB));
    expect(horizonCombined.selection?.selections.flatMap((selection) => selection.players)).toHaveLength(8);
    expect(horizonCombined.debug.bestImmediateReplayCount).toBe(0);
    expect(horizonCombined.debug.allowedImmediateReplayCount).toBe(1);
    expect(horizonCombined.debug.chosenImmediateReplayCount).toBe(1);
    expect(horizonCombined.debug.chosenImmediateCoverageGain).toBeCloseTo(
      Number(horizonB.numerator) / Number(horizonB.denominator), 14
    );
    expect(horizonCombined.debug.coverageGateCertified).toBe(true);
    expect(horizonCombined.debug.chosenReplayCoverageEligible).toBe(true);
  });

  it.each(rotationTypes)("keeps count fairness ahead of rest smoothing and starvation for %s", (sessionType) => {
    const ids = ["A0", "A1", "A2", "A3", "B0", "B1", "B2", "B3"];
    const players = ids.map((userId, index) => makePlayer(userId, {
      matchesPlayed: index < 4 || index < 7 ? 5 : 6,
      // The count-fair quartet has zero rest; the worse fairness class has
      // substantially more rest and crosses the safety-net threshold.
      restTurns: index < 4 ? 0 : 5,
    }));
    const allowed = allowedQuartets(ids.slice(0, 4), ids.slice(4));
    const profile: Profile = { rank: 0, courts: [allowed] };
    const oracle = oracleBestBatch(enumerateOracleBatches(players, [profile], 1, SessionMode.MEXICANO), players, 14, sessionType);
    const result = findBestRotationBatchSelection(players, {
      courtCount: 1, sessionMode: SessionMode.MEXICANO, sessionType,
      rotationPlayerCount: 14, schedules: [profile], randomFn: () => 0,
    });
    expect(oracle!.ids.sort()).toEqual(ids.slice(0, 4).sort());
    expect(selectedIds(result)).toEqual(oracle!.ids.sort());
  });

  it("lets the existing Balanced envelope reject a smoother but out-of-envelope group", () => {
    for (const sessionType of [SessionType.POINTS, SessionType.ELO]) {
      const a = ["A0", "A1", "A2", "A3"];
      const b = ["B0", "B1", "B2", "B3"];
      const players = [
        ...a.map((userId) => makePlayer(userId, { restTurns: 0 })),
        ...b.map((userId, index) => makePlayer(userId, {
          restTurns: 3,
          strength: [900, 900, 900, 1100][index],
        })),
      ];
      const aLayout: FixedLayout = { ids: a, partition: { team1: [a[0], a[1]], team2: [a[2], a[3]] } };
      const history = repeatedHistory(aLayout, 20);
      const context = buildSocialVarietyContext(players, history, { sessionMode: SessionMode.MEXICANO });
      const profile: Profile = { rank: 0, courts: [allowedQuartets(a, b)] };
      const oracle = oracleBestBatch(enumerateOracleBatches(players, [profile], 1, SessionMode.MEXICANO), players, 14, sessionType, 0);
      const bOnly = findBestRotationBatchSelection(players, {
        courtCount: 1, sessionMode: SessionMode.MEXICANO, sessionType,
        rotationPlayerCount: 14, schedules: [{ rank: 0, courts: [allowedQuartets(b)] }],
        socialHistoryMatches: history, socialVarietyContext: context,
        balanceGuardrailPolicy: { nearBestWindow: 0 }, randomFn: () => 0,
      });
      const result = findBestRotationBatchSelection(players, {
        courtCount: 1, sessionMode: SessionMode.MEXICANO, sessionType,
        rotationPlayerCount: 14, schedules: [profile],
        socialHistoryMatches: history, socialVarietyContext: context,
        balanceGuardrailPolicy: { nearBestWindow: 0 }, randomFn: () => 0,
      });
      expect(oracle!.ids.sort()).toEqual(a.sort());
      expect(bOnly.selection?.restSummary.restTurnVector.filter((turns) => turns === 0)).toHaveLength(0);
      expect(bOnly.selection!.totalSocialVarietyGain).toBeGreaterThan(result.selection!.totalSocialVarietyGain!);
      expect(selectedIds(result)).toEqual(oracle!.ids.sort());
      expect(result.selection?.maxBalanceGap).toBe(result.selection?.balanceGuardrail?.bestMaxBalanceGap);
      expect(result.selection?.maxBalanceGap).toBeLessThanOrEqual(result.selection?.balanceGuardrail?.allowedMaxBalanceGap ?? -1);
      expect(result.debug.bestImmediateReplayCount).toBe(4);
      expect(result.debug.allowedImmediateReplayCount).toBe(5);
      expect(result.debug.chosenImmediateReplayCount).toBe(4);
      expect(result.debug.coverageGateCertified).toBe(true);
      expect(result.debug.coverageGateStatus).toBe("CERTIFIED");
      expect(result.debug.chosenReplayCoverageEligible).toBe(true);

      const horizonBOnly = findBestRotationBatchSelection(players, {
        courtCount: 1, sessionMode: SessionMode.MEXICANO, sessionType,
        rotationPlayerCount: 14, schedules: [{ rank: 0, courts: [allowedQuartets(b)] }],
        socialHistoryMatches: history, socialVarietyContext: context,
        balanceGuardrailPolicy: { nearBestWindow: 0 },
        coverageGainMetric: "social-horizon-321", randomFn: () => 0,
      });
      const horizonResult = findBestRotationBatchSelection(players, {
        courtCount: 1, sessionMode: SessionMode.MEXICANO, sessionType,
        rotationPlayerCount: 14, schedules: [profile],
        socialHistoryMatches: history, socialVarietyContext: context,
        balanceGuardrailPolicy: { nearBestWindow: 0 },
        coverageGainMetric: "social-horizon-321", randomFn: () => 0,
      });
      const horizonA = oracleHorizonCoverageGain([aLayout.partition], context);
      const horizonB = oracleHorizonCoverageGain([{
        team1: [b[0], b[1]], team2: [b[2], b[3]],
      }], context);
      expect(compareOracleFractions(horizonB, horizonA)).toBeGreaterThan(0);
      expect(selectedIds(horizonBOnly)).toEqual(b.sort());
      expect(selectedIds(horizonResult)).toEqual(a.sort());
      expect(horizonResult.selection?.maxBalanceGap).toBe(horizonResult.selection?.balanceGuardrail?.bestMaxBalanceGap);
      expect(horizonResult.selection?.maxBalanceGap).toBeLessThanOrEqual(horizonResult.selection?.balanceGuardrail?.allowedMaxBalanceGap ?? -1);
      expect(horizonBOnly.selection?.maxBalanceGap).toBeGreaterThan(horizonResult.selection?.balanceGuardrail?.allowedMaxBalanceGap ?? Infinity);
      expect(horizonResult.debug.coverageGainMetric).toBe("social-horizon-321");
      expect(horizonResult.debug.bestImmediateReplayCount).toBe(4);
      expect(horizonResult.debug.allowedImmediateReplayCount).toBe(5);
      expect(horizonResult.debug.chosenImmediateReplayCount).toBe(4);
      expect(horizonResult.debug.coverageGateCertified).toBe(true);
      expect(horizonResult.debug.chosenReplayCoverageEligible).toBe(true);
    }
  });

  it("keeps the replay-baseline schedule index when it differs from the Balanced baseline profile", () => {
    for (const sessionType of [SessionType.POINTS, SessionType.ELO]) {
      const a = ["A0", "A1", "A2", "A3"];
      const b = ["B0", "B1", "B2", "B3"];
      const players = [
        ...a.map((userId, index) => makePlayer(userId, { matchesPlayed: 5, strength: 1000, restTurns: index === 0 ? 0 : 1 })),
        ...b.map((userId) => makePlayer(userId, { matchesPlayed: 5, strength: 1000, restTurns: 1 })),
      ];
      const profiles: Profile[] = [
        { rank: 0, courts: [allowedQuartets(a)] },
        { rank: 0, courts: [allowedQuartets(b)] },
      ];
      const result = findBestRotationBatchSelection(players, {
        courtCount: 1,
        sessionMode: SessionMode.MEXICANO,
        sessionType,
        rotationPlayerCount: 14,
        schedules: profiles,
        balanceGuardrailPolicy: { nearBestWindow: 0 },
        randomFn: () => 0,
      });
      expect(result.balanceCertified).toBe(true);
      expect(result.selection?.maxBalanceGap).toBe(0);
    expect(result.debug.bestImmediateReplayCount).toBe(0);
    expect(result.debug.allowedImmediateReplayCount).toBe(1);
    expect(result.debug.chosenImmediateReplayCount).toBe(0);
    expect(result.debug.coverageGateCertified).toBe(true);
    expect(result.debug.coverageGateStatus).toBe("CERTIFIED");
    expect(result.debug.chosenReplayCoverageEligible).toBe(true);
      expect(result.scheduleIndex).toBe(1);
      expect(selectedIds(result)).toEqual(b.sort());
      expect(result.selection?.selections.every((selection) => selection.ids.every((id) => b.includes(id)))).toBe(true);
    }
  });

  it.each(rotationTypes)("counts starvation only when it changes the selected set for %s", (sessionType) => {
    const overdue = ["A0", "A1", "A2", "A3"];
    const rested = ["B0", "B1", "B2", "B3"];
    const players = [
      ...overdue.map((userId, index) => makePlayer(userId, { restTurns: index === 0 ? 4 : 0 })),
      ...rested.map((userId) => makePlayer(userId, { restTurns: 3 })),
    ];
    const profile: Profile = { rank: 0, courts: [allowedQuartets(overdue, rested)] };
    const overdueLayout: FixedLayout = {
      ids: overdue,
      partition: { team1: [overdue[0], overdue[1]], team2: [overdue[2], overdue[3]] },
    };
    const history = repeatedHistory(overdueLayout, 20);
    const measured = measureRotationStarvationIntervention(players, {
      courtCount: 1,
      sessionMode: SessionMode.MEXICANO,
      sessionType,
      rotationPlayerCount: 14,
      schedules: [profile],
      socialHistoryMatches: history,
      socialVarietyContext: buildSocialVarietyContext(players, history, { sessionMode: SessionMode.MEXICANO }),
      randomFn: () => 0,
    });
    expect(measured.measurementComplete).toBe(true);
    expect(measured.selectedSetChanged).toBe(true);
    expect(selectedIds(measured.production)).toEqual(overdue.sort());
    expect(selectedIds(measured.withoutStarvation)).toEqual(rested.sort());
  });

  it.each(rotationTypes)("reports no starvation intervention when every available player is mandatory by batch size for %s", (sessionType) => {
    const onlyLegalCourt = ["P0", "P1", "P2", "P3"];
    const players = onlyLegalCourt.map((userId, index) => makePlayer(userId, { restTurns: index === 0 ? 4 : 0 }));
    const profile: Profile = { rank: 0, courts: [allowedQuartets(onlyLegalCourt)] };
    const measured = measureRotationStarvationIntervention(players, {
      courtCount: 1,
      sessionMode: SessionMode.MEXICANO,
      sessionType,
      rotationPlayerCount: 14,
      schedules: [profile],
      randomFn: () => 0,
    });
    expect(measured.measurementComplete).toBe(true);
    expect(selectedIds(measured.production)).toEqual(onlyLegalCourt);
    expect(selectedIds(measured.withoutStarvation)).toEqual(onlyLegalCourt);
    expect(measured.selectedSetChanged).toBe(false);
  });

  it("marks starvation diagnostics unknown when either search cannot certify", () => {
    const ids = ["U0", "U1", "U2", "U3"];
    const players = ids.map((userId, index) => makePlayer(userId, { restTurns: index === 0 ? 4 : 0 }));
    const profile: Profile = { rank: 0, courts: [allowedQuartets(ids)] };
    const measured = measureRotationStarvationIntervention(players, {
      courtCount: 1,
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.SOCIAL_MIX,
      rotationPlayerCount: 14,
      schedules: [profile],
      coverageGainMetric: "social-horizon-321",
      searchLimits: { maxBranches: 0, maxMs: 30_000 },
      randomFn: () => 0,
    });
    expect(measured.measurementComplete).toBe(false);
    expect(measured.selectedSetChanged).toBeNull();
    expect(measured.production.selection).toBeNull();
    expect(measured.production.debug.replayCertified).toBe(false);
    expect(measured.production.debug.replayEnvelopeStatus).toBe("UNCERTIFIED");
    expect(measured.production.debug.coverageGateCertified).toBe(false);
    expect(measured.production.debug.coverageGateStatus).toBe("UNCERTIFIED");
    expect(measured.production.debug.bestImmediateReplayCount).toBeNull();
    expect(measured.production.debug.allowedImmediateReplayCount).toBeNull();
    expect(measured.production.debug.chosenImmediateReplayCount).toBeNull();
  });

  it.each(rotationTypes)("disables replay and soft cadence without disabling starvation when rest is ignored for %s", (sessionType) => {
    const overdue = ["A0", "A1", "A2", "A3"];
    const rested = ["B0", "B1", "B2", "B3"];
    const players = [
      ...overdue.map((userId, index) => makePlayer(userId, { restTurns: index === 0 ? 4 : 0 })),
      ...rested.map((userId) => makePlayer(userId, { restTurns: 3 })),
    ];
    const profile: Profile = { rank: 0, courts: [allowedQuartets(overdue, rested)] };
    const overdueLayout: FixedLayout = {
      ids: overdue,
      partition: { team1: [overdue[0], overdue[1]], team2: [overdue[2], overdue[3]] },
    };
    const history = repeatedHistory(overdueLayout, 20);
    const measured = measureRotationStarvationIntervention(players, {
      courtCount: 1,
      sessionMode: SessionMode.MEXICANO,
      sessionType,
      rotationPlayerCount: 14,
      schedules: [profile],
      socialHistoryMatches: history,
      socialVarietyContext: buildSocialVarietyContext(players, history, { sessionMode: SessionMode.MEXICANO }),
      coverageGainMetric: "social-horizon-321",
      respectPlayerRest: false,
      randomFn: () => 0,
    });
    expect(measured.measurementComplete).toBe(true);
    expect(measured.selectedSetChanged).toBe(true);
    expect(selectedIds(measured.production)).toEqual(overdue.sort());
    expect(measured.production.debug.replayEnvelopeStatus).toBe("DISABLED");
    expect(measured.production.debug.replayCertified).toBe(true);
    expect(measured.production.debug.coverageGateStatus).toBe("DISABLED");
    expect(measured.production.debug.coverageGateCertified).toBe(true);
    expect(measured.production.debug.chosenReplayCoverageEligible).toBeNull();
    expect(measured.production.debug.coverageGainMetric).toBe("social-horizon-321");
    expect(measured.production.debug.bestMinimumReplayCoverageGain).toBeNull();
    const horizonOracle = oracleHorizonCoverageGain(
      measured.production.selection!.selections.map((selection) => selection.partition),
      buildSocialVarietyContext(players, history, { sessionMode: SessionMode.MEXICANO })
    );
    expect(measured.production.debug.chosenImmediateCoverageGain).toBeCloseTo(
      Number(horizonOracle.numerator) / Number(horizonOracle.denominator), 14
    );
  });

  it("replays identical random draws without perturbing the production RNG stream", () => {
    const overdue = ["A0", "A1", "A2", "A3"];
    const rested = ["B0", "B1", "B2", "B3"];
    const players = [
      ...overdue.map((userId, index) => makePlayer(userId, { restTurns: index === 0 ? 4 : 0 })),
      ...rested.map((userId) => makePlayer(userId, { restTurns: 3 })),
    ];
    const profile: Profile = { rank: 0, courts: [allowedQuartets(overdue, rested)] };
    const options = {
      courtCount: 1,
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.SOCIAL_MIX,
      rotationPlayerCount: 14,
      schedules: [profile],
    };
    const makeRandom = () => {
      let value = 104729;
      let calls = 0;
      return {
        randomFn: () => {
          calls += 1;
          value = value * 48271 % 2147483647;
          return value / 2147483647;
        },
        calls: () => calls,
      };
    };
    const measuredRandom = makeRandom();
    const measured = measureRotationStarvationIntervention(players, { ...options, randomFn: measuredRandom.randomFn });
    const directRandom = makeRandom();
    const direct = findBestRotationBatchSelection(players, { ...options, randomFn: directRandom.randomFn });
    expect(measured.measurementComplete).toBe(true);
    expect(selectedLayouts(measured.production)).toEqual(selectedLayouts(direct));
    expect(measuredRandom.calls()).toBe(directRandom.calls());
  });
});
