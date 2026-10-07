import { describe, expect, it } from "vitest";
import { SessionMode, SessionType } from "../../../types/enums";
import { auditSocialGeneralizationDecision } from "./socialGeneralizationAudit";
import { findBestRotationBatchSelection } from "./socialBatch";
import type {
  ActiveMatchmakerV3Player,
  MatchmakerV3Player,
  SocialHistoryMatch,
  V3DoublesPartition,
} from "./types";

type LegalCourt = {
  readonly ids: readonly [number, number, number, number];
  readonly partition: V3DoublesPartition;
  readonly mask: number;
  readonly balanceGap: number;
  readonly pairingKey: string;
};

type LegalSingleCourt = {
  readonly ids: readonly [string, string, string, string];
  readonly partition: V3DoublesPartition;
  readonly balanceGap: number;
  readonly pairingKey: string;
};

const PLAYER_COUNT = 18;
const SIDE_SIZE = 9;
const COURT_COUNT = 3;
const SELECTED_COUNT = 12;

function playerId(index: number) {
  return `P${index + 1}`;
}

function makeOpeningRoster(): MatchmakerV3Player[] {
  return Array.from({ length: PLAYER_COUNT }, (_unused, index) => {
    const upper = index < SIDE_SIZE;
    return {
      userId: playerId(index),
      matchesPlayed: 0,
      matchmakingBaseline: 0,
      availableSince: new Date("2026-10-03T00:00:00.000Z"),
      restTurns: 0,
      strength: 10 + (PLAYER_COUNT - index - 1) * 0.1,
      pointDiff: 0,
      gender: upper ? "MALE" : "FEMALE",
      partnerPreference: upper ? "OPEN" : "FEMALE_FLEX",
      mixedSideOverride: upper ? "UPPER" : "LOWER",
      isBusy: false,
      isPaused: false,
      arrivalPriorityAt: null,
    };
  });
}

function pairKey(left: number, right: number) {
  return [playerId(left), playerId(right)].sort().join("+");
}

function layoutKey(partition: V3DoublesPartition) {
  return [
    [...partition.team1].sort().join("+"),
    [...partition.team2].sort().join("+"),
  ].sort().join("/");
}

function courtPairingKey(partition: V3DoublesPartition) {
  return [
    pairKey(Number(partition.team1[0].slice(1)) - 1, Number(partition.team1[1].slice(1)) - 1),
    pairKey(Number(partition.team2[0].slice(1)) - 1, Number(partition.team2[1].slice(1)) - 1),
  ].sort().join("/");
}

/** Enumerates MIXICANO courts directly from side counts and the three pairings of four IDs. */
function enumerateLegalCourts(): LegalCourt[] {
  const courts: LegalCourt[] = [];
  for (let a = 0; a < PLAYER_COUNT - 3; a += 1) {
    for (let b = a + 1; b < PLAYER_COUNT - 2; b += 1) {
      for (let c = b + 1; c < PLAYER_COUNT - 1; c += 1) {
        for (let d = c + 1; d < PLAYER_COUNT; d += 1) {
          const ids = [a, b, c, d] as const;
          const upperCount = ids.filter((index) => index < SIDE_SIZE).length;
          const courtType = upperCount === 0 || upperCount === 4 ? "OWN_SIDE"
            : upperCount === 2 ? "MIXED" : null;
          if (!courtType) continue;
          const pairings: Array<[[number, number], [number, number]]> = [
            [[a, b], [c, d]],
            [[a, c], [b, d]],
            [[a, d], [b, c]],
          ];
          for (const teams of pairings) {
            if (courtType === "MIXED" && teams.some((team) =>
              team.filter((index) => index < SIDE_SIZE).length !== 1)) continue;
            const strengths = ids.map((index) => 10 + (PLAYER_COUNT - index - 1) * 0.1);
            const strength = (index: number) => strengths[ids.indexOf(index)];
            const balanceGap = Math.abs(
              (strength(teams[0][0]) + strength(teams[0][1])) / 2 -
              (strength(teams[1][0]) + strength(teams[1][1])) / 2,
            );
            const partition: V3DoublesPartition = {
              team1: teams[0].map(playerId) as [string, string],
              team2: teams[1].map(playerId) as [string, string],
            };
            courts.push({
              ids,
              partition,
              mask: ids.reduce((mask, index) => mask | (1 << index), 0),
              balanceGap,
              pairingKey: courtPairingKey(partition),
            });
          }
        }
      }
    }
  }
  return courts;
}

function parkMiller(seed: number) {
  let state = Math.abs(Math.floor(seed)) % 2_147_483_647;
  if (state === 0) state = 1;
  return () => {
    state = (state * 48_271) % 2_147_483_647;
    return state / 2_147_483_647;
  };
}

function fnv1aUnit(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) / 0xffff_ffff;
}

function independentOpeningWinner(seed: number, allCourts: readonly LegalCourt[]) {
  const zeroGapCourts = allCourts.filter((court) => court.balanceGap === 0);
  const random = parkMiller(seed);
  // The harness consumes one rank salt per roster member, then one combined
  // layout-hash salt. No additional side-balanced salts are used in this arm.
  for (let index = 0; index < PLAYER_COUNT; index += 1) random();
  const pairingSalt = random();
  let batches = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestKeys: string[] | null = null;
  let bestCount = 0;

  // All candidates before the last tie have an attainable absolute lower
  // bound of zero balance gap. This enumerates only that exact frontier.
  for (let leftIndex = 0; leftIndex < zeroGapCourts.length; leftIndex += 1) {
    const left = zeroGapCourts[leftIndex];
    for (let middleIndex = leftIndex + 1; middleIndex < zeroGapCourts.length; middleIndex += 1) {
      const middle = zeroGapCourts[middleIndex];
      if ((left.mask & middle.mask) !== 0) continue;
      const pairMask = left.mask | middle.mask;
      for (let rightIndex = middleIndex + 1; rightIndex < zeroGapCourts.length; rightIndex += 1) {
        const right = zeroGapCourts[rightIndex];
        if ((pairMask & right.mask) !== 0) continue;
        batches += 1;
        const batchKey = [left.pairingKey, middle.pairingKey, right.pairingKey].sort().join("|");
        const score = fnv1aUnit(`${pairingSalt.toPrecision(15)}:${batchKey}`);
        if (score < bestScore) {
          bestScore = score;
          bestKeys = [left.pairingKey, middle.pairingKey, right.pairingKey].sort();
          bestCount = 1;
        } else if (score === bestScore) {
          bestCount += 1;
        }
      }
    }
  }
  return { legalCourtCount: allCourts.length, zeroGapCourtCount: zeroGapCourts.length, batches, bestScore, bestKeys, bestCount };
}

function independentFirstRefillWinner(seed: number, fixture: FirstRefillFixture): {
  readonly candidates: readonly LegalSingleCourt[];
  readonly minimumBalanceGap: number;
  readonly salt: number;
  readonly winningKey: string;
} {
  const upper = fixture.neverPlayedFreeIds.filter((id) => Number(id.slice(1)) <= SIDE_SIZE);
  const lower = fixture.neverPlayedFreeIds.filter((id) => Number(id.slice(1)) > SIDE_SIZE);
  if (upper.length !== 3 || lower.length !== 3) throw new Error("Expected the actual first-refill pool to be 3+3 fresh players.");
  const candidates: LegalSingleCourt[] = [];
  for (let upperLeft = 0; upperLeft < upper.length; upperLeft += 1) {
    for (let upperRight = upperLeft + 1; upperRight < upper.length; upperRight += 1) {
      for (let lowerLeft = 0; lowerLeft < lower.length; lowerLeft += 1) {
        for (let lowerRight = lowerLeft + 1; lowerRight < lower.length; lowerRight += 1) {
          const chosenUpper = [upper[upperLeft], upper[upperRight]] as const;
          const chosenLower = [lower[lowerLeft], lower[lowerRight]] as const;
          const partitions: V3DoublesPartition[] = [
            { team1: [chosenUpper[0], chosenLower[0]], team2: [chosenUpper[1], chosenLower[1]] },
            { team1: [chosenUpper[0], chosenLower[1]], team2: [chosenUpper[1], chosenLower[0]] },
          ];
          for (const partition of partitions) {
            const team1Strength = partition.team1.reduce((sum, id) => sum + strengthForUserId(id), 0) / 2;
            const team2Strength = partition.team2.reduce((sum, id) => sum + strengthForUserId(id), 0) / 2;
            const ids = [...partition.team1, ...partition.team2].sort() as [string, string, string, string];
            candidates.push({
              ids,
              partition,
              balanceGap: Math.abs(team1Strength - team2Strength),
              pairingKey: layoutKey(partition),
            });
          }
        }
      }
    }
  }
  // In this actual 6-fresh-player refill state, the fairness class selects four
  // fresh players. Every legal selection is 2+2, so all 18 layouts have G=6,
  // signed T=2, the same C-profile, 2 new partner pairs, and 4 new opponent
  // pairs. With empty histories for these players, their per-player C/P/O
  // entropy increments are identical (3/1/2 distinct edges, 17 opportunities);
  // replay, cadence, and repeat penalties are also identical. The exact late
  // winner is therefore minimum strength gap, then the combined salted hash.
  const minimumBalanceGap = Math.min(...candidates.map((candidate) => candidate.balanceGap));

  // The opening consumes 18 player scores and one layout salt. At the first
  // refill, ten available players consume scores and the next draw is its salt.
  const random = parkMiller(seed);
  for (let draw = 0; draw < PLAYER_COUNT + 1 + 10; draw += 1) random();
  const salt = random();
  const finalists = candidates.filter((candidate) => candidate.balanceGap === minimumBalanceGap);
  const winner = finalists.reduce((best, candidate) =>
    fnv1aUnit(`${salt.toPrecision(15)}:${candidate.pairingKey}`) <
      fnv1aUnit(`${salt.toPrecision(15)}:${best.pairingKey}`) ? candidate : best
  );
  return { candidates, minimumBalanceGap, salt, winningKey: winner.pairingKey };
}

function strengthForUserId(userId: string) {
  const index = Number(userId.slice(1)) - 1;
  return 10 + (PLAYER_COUNT - index - 1) * 0.1;
}

const openingFixtures = [
  { seed: 1, keys: ["P1+P16/P11+P6", "P14+P18/P15+P17", "P3+P9/P5+P7"] },
  { seed: 4729, keys: ["P1+P14/P11+P4", "P12+P7/P13+P6", "P16+P3/P17+P2"] },
  { seed: 104729, keys: ["P11+P6/P12+P5", "P13+P8/P17+P4", "P14+P3/P15+P2"] },
] as const;

// Frozen from the validated report at
// benchmarks/generated/social-readiness/full-2026-10-07-v1/legacy-100-18-9-9-3c/
// frontier-18-9-9-3c.json (SHA-256
// 45f18d29d64fec9d8245b274f4f665b09a38b30de5cf02157051bfeeb453555f).
// Keeping these compact histories in source makes the oracle test independent
// of ignored generated artifacts while retaining an auditable fixture origin.
type FirstRefillFixture = {
  readonly seed: number;
  readonly completedIds: readonly [string, string, string, string];
  readonly historyType: "MIXED" | "UPPER" | "LOWER";
  readonly historyTeam1: readonly [string, string];
  readonly historyTeam2: readonly [string, string];
  readonly neverPlayedFreeIds: readonly string[];
  readonly selected: V3DoublesPartition;
};

const firstRefillFixtures: readonly FirstRefillFixture[] = [
  {
    seed: 1,
    completedIds: ["P15", "P17", "P14", "P18"],
    historyType: "LOWER",
    historyTeam1: ["P15", "P17"], historyTeam2: ["P14", "P18"],
    neverPlayedFreeIds: ["P2", "P4", "P8", "P10", "P12", "P13"],
    selected: { team1: ["P4", "P10"], team2: ["P12", "P2"] },
  },
  {
    seed: 4729,
    completedIds: ["P2", "P17", "P3", "P16"],
    historyType: "MIXED",
    historyTeam1: ["P2", "P17"], historyTeam2: ["P3", "P16"],
    neverPlayedFreeIds: ["P5", "P8", "P9", "P10", "P15", "P18"],
    selected: { team1: ["P15", "P8"], team2: ["P18", "P5"] },
  },
  {
    seed: 104729,
    completedIds: ["P3", "P14", "P15", "P2"],
    historyType: "MIXED",
    historyTeam1: ["P3", "P14"], historyTeam2: ["P15", "P2"],
    neverPlayedFreeIds: ["P1", "P7", "P9", "P10", "P16", "P18"],
    selected: { team1: ["P16", "P1"], team2: ["P7", "P10"] },
  },
];

function makeFirstRefillAuditInput(fixture: FirstRefillFixture) {
  const roster = makeOpeningRoster();
  const completedIds = new Set(fixture.completedIds);
  const availableIds = new Set([...fixture.completedIds, ...fixture.neverPlayedFreeIds]);
  const structuralRoster = roster.map((player, index) => ({ userId: player.userId, side: index < SIDE_SIZE ? "UPPER" as const : "LOWER" as const }));
  const availablePlayers = roster.filter((player) => availableIds.has(player.userId)).map((player, index) => {
    const matchesPlayed = completedIds.has(player.userId) ? 1 : 0;
    const restTurns = matchesPlayed > 0 ? 0 : 1;
    return {
      ...player,
      matchesPlayed,
      matchmakingBaseline: matchesPlayed,
      restTurns,
      effectiveMatchCount: matchesPlayed,
      randomScore: index / 20,
      rank: index,
    } as ActiveMatchmakerV3Player;
  });
  const sideById = Object.fromEntries(roster.map((player, index) => [player.userId, index < SIDE_SIZE ? "UPPER" : "LOWER"]));
  const completedHistory: SocialHistoryMatch[] = [{
    id: "M1",
    team1: [...fixture.historyTeam1] as [string, string],
    team2: [...fixture.historyTeam2] as [string, string],
    socialVariety: {
      version: 1,
      basis: "EFFECTIVE_MIXED_SIDE",
      courtType: fixture.historyType,
      effectiveSideByUserId: Object.fromEntries(fixture.completedIds.map((id) => [id, sideById[id]])) as
        Record<string, "UPPER" | "LOWER" | null>,
    },
  }];
  const ids = [...fixture.selected.team1, ...fixture.selected.team2];
  return {
    structuralRoster,
    availablePlayers,
    completedHistory,
    selected: [{ ids, partition: fixture.selected }],
    courtCount: 1,
    rotationPlayerCount: PLAYER_COUNT,
    respectStarvation: true,
    maxBatches: 10_000,
    maxSearchNodes: 100_000,
  };
}

describe("independent 18-player / 3-court beneficial-rescue exactness", () => {
  it.each(openingFixtures)("matches the exact fresh-opening winner for seed $seed", ({ seed, keys }) => {
    const legalCourts = enumerateLegalCourts();
    const oracle = independentOpeningWinner(seed, legalCourts);
    expect(oracle.legalCourtCount).toBe(3348);
    expect(oracle.zeroGapCourtCount).toBe(206);
    expect(oracle.batches).toBe(32107);
    expect(oracle.bestCount).toBe(1);
    expect(oracle.bestKeys).toEqual([...keys].sort());

    // For every legal opening layout, the selected 12 players have identical
    // fairness, 18 fresh C edges, the same post-batch C profile (12 at 3/17;
    // six at 0), signed T=6, no replay/cadence/repeat penalties, six new partner
    // edges, twelve new opponent edges, and the same relationship entropy.
    // Each assigned player has both types feasible and receives one first type
    // (delta T=0.5); 9+9 players give every player 17 feasible C/P/O peers.
    // Therefore the remaining strict ranking is balance gap, point-difference
    // gap, then the default combined salted pairing hash. This proof is scoped
    // to the default combined-score mode: all three courts are identical and
    // the combined hash sorts their keys, so this certifies the unordered
    // triple, not a per-physical-court ordering. It does not model side-balanced
    // tie salts.

    const result = findBestRotationBatchSelection(makeOpeningRoster(), {
      courtCount: COURT_COUNT,
      respectPlayerRest: true,
      rotationPlayerCount: PLAYER_COUNT,
      completedMatches: [],
      socialHistoryMatches: [],
      randomFn: parkMiller(seed),
      socialPriorityPolicy: "courtmate-beneficial-rescue",
      sessionMode: SessionMode.MIXICANO,
      sessionType: SessionType.SOCIAL_MIX,
    });
    expect(result.selection).not.toBeNull();
    if (!result.selection) throw new Error(`seed ${seed}: matcher returned no opening`);

    const chosen = result.selection.selections;
    const chosenIds = chosen.flatMap((court) => court.ids);
    expect(new Set(chosenIds).size).toBe(SELECTED_COUNT);
    expect(chosen.map((court) => layoutKey(court.partition)).sort()).toEqual(oracle.bestKeys);
    expect(chosen.map((court) => courtPairingKey(court.partition)).sort()).toEqual(oracle.bestKeys);
    expect(result.fairnessCertified).toBe(true);
    expect(result.starvationCertified).toBe(true);
    expect(result.courtmateGainMaximumCertified).toBe(true);
    expect(result.priorityCertified).toBe(true);
    expect(result.varietyOptimal).toBe(true);
    expect(result.debug.searchLimitReached).toBe(false);
    expect(result.courtmateGainMaximum).toBe(18);
    expect(result.chosenNewCourtmatePairCount).toBe(18);
    expect(result.chosenCourtmateGainDeficit).toBe(0);
    expect(result.bestRollingMatchTypeGainAtGmax).toBe(6);
    expect(result.chosenRollingMatchTypeGain).toBe(6);
    expect(result.selection.maxBalanceGap).toBe(0);
    expect(result.selection.totalBalanceGap).toBe(0);
    expect(result.selection.totalPointDiffGap).toBe(0);
  });

  it.each(firstRefillFixtures)("independently certifies the first completed-history 18/3 refill for seed $seed", (fixture) => {
    const winner = independentFirstRefillWinner(fixture.seed, fixture);
    expect(winner.candidates).toHaveLength(18);
    expect(winner.candidates.every((candidate) =>
      candidate.ids.every((id) => fixture.neverPlayedFreeIds.includes(id)) &&
      candidate.partition.team1.some((id) => Number(id.slice(1)) <= SIDE_SIZE) &&
      candidate.partition.team1.some((id) => Number(id.slice(1)) > SIDE_SIZE) &&
      candidate.partition.team2.some((id) => Number(id.slice(1)) <= SIDE_SIZE) &&
      candidate.partition.team2.some((id) => Number(id.slice(1)) > SIDE_SIZE)
    )).toBe(true);
    expect(winner.winningKey).toBe(layoutKey(fixture.selected));

    const audit = auditSocialGeneralizationDecision(makeFirstRefillAuditInput(fixture));
    expect(audit.status).toBe("certified");
    expect(audit.complete).toBe(true);
    expect(audit.selectedValid).toBe(true);
    expect(audit.selectedFairnessCertified).toBe(true);
    expect(audit.selectedStarvationCertified).toBe(true);
    expect(audit.selectedCourtmateGain).toBe(6);
    expect(audit.courtmateGainMaximum).toBe(6);
    expect(audit.selectedSignedRollingTypeGain).toBe(2);
    expect(audit.bestSignedRollingTypeGainAtGmax).toBe(2);
    expect(audit.beneficialRescueAdmitted).toBe(true);
  });
});
