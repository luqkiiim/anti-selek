import {
  PlayerGender,
  SessionMode,
  SessionType,
} from "../../types/enums";
import { getEffectiveMixedSide } from "@/lib/mixedSide";

const ELO_BALANCE_GAP_NORMALIZER = 150;
const POINTS_BALANCE_GAP_NORMALIZER = 3;
const RECENT_HISTORY_LIMIT = 24;
const RECENT_HISTORY_DECAY = 0.85;
const EXACT_PARTITION_HISTORY_LIMIT = 8;
const EXACT_PARTITION_REPEAT_PENALTY = 4;
const COURTMATE_REPEAT_PENALTY = 0.5;
const PARTNER_REPEAT_PENALTY = 2;
const OPPONENT_REPEAT_PENALTY = 1;
const POD_REPEAT_PENALTY = 1.5;
const ELO_EXACT_PARTITION_BALANCE_TOLERANCE = 10;
const POINTS_EXACT_PARTITION_BALANCE_TOLERANCE = 1.5;

export interface DoublesPartition {
  team1: [string, string];
  team2: [string, string];
}

export interface MatchHistoryEntry {
  team1User1Id: string;
  team1User2Id: string;
  team2User1Id: string;
  team2User2Id: string;
  completedAt?: Date | null;
  createdAt?: Date;
}

export interface PartitionCandidate {
  userId: string;
  // Matchmaking balance input:
  // - ELO sessions: persistent Elo
  // - POINTS sessions: current session points
  // - LADDER/RACE sessions: session-native grouping only (no external Elo)
  elo: number;
  pointDiff: number;
  lastPartnerId: string | null;
  gender: string;
  partnerPreference: string;
  mixedSideOverride?: string | null;
  pool?: string | null;
}

export interface RotationHistory {
  courtmateCounts: Map<string, number>;
  partnerCounts: Map<string, number>;
  opponentCounts: Map<string, number>;
  podCounts: Map<string, number>;
  exactPartitionCounts: Map<string, number>;
}

export interface PartitionEvaluation {
  partition: DoublesPartition;
  score: number;
  mixedSideBalanceGap: number;
  pointDiffGap: number;
  rotationPenalty: number;
  exactPartitionPenalty: number;
}

export interface PartitionScoreDetails {
  totalScore: number;
  teamBalanceGap: number;
  mixedSideBalanceGap: number;
  pointDiffGap: number;
  balanceScore: number;
  courtmateRepeatPenalty: number;
  partnerRepeatPenalty: number;
  opponentRepeatPenalty: number;
  podRepeatPenalty: number;
  rotationPenalty: number;
  exactPartitionPenalty: number;
}

export interface PartitionRepeatStats {
  repeatedPartnerTeams: number;
  repeatedOpponentPairs: number;
  repeatedPod: boolean;
}

export interface FallbackQuartetSelection {
  ids: [string, string, string, string];
  partition: DoublesPartition;
  fairnessScore: number;
  randomScore: number;
  score: number;
  mixedSideBalanceGap: number;
  pointDiffGap: number;
  rotationPenalty: number;
  exactPartitionPenalty: number;
}

export interface FairnessWindowQuartetOptions {
  baselineIds: [string, string, string, string];
  fairnessSlack: number;
  lowestCohortUserIds?: Set<string>;
  maxLowestCohortPlayers?: number;
  matchesPlayedQuota?: Map<number, number>;
  maxCandidates?: number;
  excludedQuartetKey?: string;
}

function pairKey(playerA: string, playerB: string) {
  return [playerA, playerB].sort().join("|");
}

function podKey(playerIds: string[]) {
  return [...playerIds].sort().join("|");
}

export function getQuartetKey(playerIds: string[]) {
  return [...playerIds].sort().join("|");
}

export function getPartitionKey(partition: DoublesPartition) {
  return [
    pairKey(partition.team1[0], partition.team1[1]),
    pairKey(partition.team2[0], partition.team2[1]),
  ]
    .sort()
    .join("||");
}

function incrementCounter(map: Map<string, number>, key: string, weight = 1) {
  map.set(key, (map.get(key) ?? 0) + weight);
}

function normalizeScore(rawScore: number, normalizer: number) {
  return Math.min(rawScore / normalizer, 3);
}

function getPartnerRepeatPenalty(
  partition: DoublesPartition,
  rotationHistory: RotationHistory
) {
  return (
    ((rotationHistory.partnerCounts.get(
      pairKey(partition.team1[0], partition.team1[1])
    ) ?? 0) +
      (rotationHistory.partnerCounts.get(
        pairKey(partition.team2[0], partition.team2[1])
      ) ?? 0)) *
    PARTNER_REPEAT_PENALTY
  );
}

function getCourtmateRepeatPenalty(
  partition: DoublesPartition,
  rotationHistory: RotationHistory
) {
  const courtPairs: [string, string][] = [
    [partition.team1[0], partition.team1[1]],
    [partition.team2[0], partition.team2[1]],
    [partition.team1[0], partition.team2[0]],
    [partition.team1[0], partition.team2[1]],
    [partition.team1[1], partition.team2[0]],
    [partition.team1[1], partition.team2[1]],
  ];

  return (
    courtPairs.reduce(
      (total, [playerA, playerB]) =>
        total + (rotationHistory.courtmateCounts.get(pairKey(playerA, playerB)) ?? 0),
      0
    ) * COURTMATE_REPEAT_PENALTY
  );
}

function getOpponentRepeatPenalty(
  partition: DoublesPartition,
  rotationHistory: RotationHistory
) {
  const opponentPairs: [string, string][] = [
    [partition.team1[0], partition.team2[0]],
    [partition.team1[0], partition.team2[1]],
    [partition.team1[1], partition.team2[0]],
    [partition.team1[1], partition.team2[1]],
  ];

  return (
    opponentPairs.reduce(
      (total, [playerA, playerB]) =>
        total + (rotationHistory.opponentCounts.get(pairKey(playerA, playerB)) ?? 0),
      0
    ) * OPPONENT_REPEAT_PENALTY
  );
}

function getPodRepeatPenalty(
  partition: DoublesPartition,
  rotationHistory: RotationHistory
) {
  return (
    (rotationHistory.podCounts.get(
      podKey([
        partition.team1[0],
        partition.team1[1],
        partition.team2[0],
        partition.team2[1],
      ])
    ) ?? 0) * POD_REPEAT_PENALTY
  );
}

function getQuartetRandomScore<T extends { userId: string }>(
  candidates: T[],
  ids: [string, string, string, string]
) {
  const randomByUserId = new Map(
    candidates.map((candidate) => [
      candidate.userId,
      typeof (candidate as T & { _random?: number })._random === "number"
        ? (candidate as T & { _random: number })._random
        : 0,
    ])
  );

  return ids.reduce((sum, id) => sum + (randomByUserId.get(id) ?? 0), 0);
}

function getBalanceGapNormalizer(sessionType: SessionType) {
  return sessionType === SessionType.POINTS
    ? POINTS_BALANCE_GAP_NORMALIZER
    : ELO_BALANCE_GAP_NORMALIZER;
}

function getExactPartitionBalanceTolerance(sessionType: SessionType) {
  return sessionType === SessionType.POINTS
    ? POINTS_EXACT_PARTITION_BALANCE_TOLERANCE
    : ELO_EXACT_PARTITION_BALANCE_TOLERANCE;
}

function comparePartitionScoreDetails(
  left: Pick<
    PartitionScoreDetails,
    | "teamBalanceGap"
    | "mixedSideBalanceGap"
    | "pointDiffGap"
    | "rotationPenalty"
    | "exactPartitionPenalty"
  >,
  right: Pick<
    PartitionScoreDetails,
    | "teamBalanceGap"
    | "mixedSideBalanceGap"
    | "pointDiffGap"
    | "rotationPenalty"
    | "exactPartitionPenalty"
  >,
  sessionType: SessionType
) {
  const gapDifference = left.teamBalanceGap - right.teamBalanceGap;

  if (Math.abs(gapDifference) > getExactPartitionBalanceTolerance(sessionType)) {
    return gapDifference;
  }

  if (
    sessionType === SessionType.POINTS &&
    left.pointDiffGap !== right.pointDiffGap
  ) {
    return left.pointDiffGap - right.pointDiffGap;
  }

  if (left.mixedSideBalanceGap !== right.mixedSideBalanceGap) {
    return left.mixedSideBalanceGap - right.mixedSideBalanceGap;
  }

  if (left.rotationPenalty !== right.rotationPenalty) {
    return left.rotationPenalty - right.rotationPenalty;
  }

  if (left.exactPartitionPenalty !== right.exactPartitionPenalty) {
    return left.exactPartitionPenalty - right.exactPartitionPenalty;
  }

  if (gapDifference !== 0) {
    return gapDifference;
  }

  return 0;
}

function getChronologicalMatches(matches: MatchHistoryEntry[]) {
  return [...matches].sort((matchA, matchB) => {
    const timeA =
      matchA.completedAt?.getTime() ?? matchA.createdAt?.getTime() ?? 0;
    const timeB =
      matchB.completedAt?.getTime() ?? matchB.createdAt?.getTime() ?? 0;

    return timeA - timeB;
  });
}

type MixicanoMatchType = "MENS" | "MIXED" | "WOMENS" | "HYBRID";

function inferMixicanoMatchType(
  team1: [{ effectiveMixedSide: string }, { effectiveMixedSide: string }],
  team2: [{ effectiveMixedSide: string }, { effectiveMixedSide: string }]
): MixicanoMatchType {
  const lowerCountFor = (
    team: [{ effectiveMixedSide: string }, { effectiveMixedSide: string }]
  ) => team.filter((player) => player.effectiveMixedSide === "LOWER").length;

  const team1LowerCount = lowerCountFor(team1);
  const team2LowerCount = lowerCountFor(team2);

  if (team1LowerCount === 2 && team2LowerCount === 2) return "WOMENS";
  if (team1LowerCount === 1 && team2LowerCount === 1) return "MIXED";
  if (team1LowerCount === 0 && team2LowerCount === 0) return "MENS";
  return "HYBRID";
}

function isValidMixicanoPartition(
  team1: [
    {
      gender: string;
      partnerPreference: string;
      mixedSideOverride?: string | null;
    },
    {
      gender: string;
      partnerPreference: string;
      mixedSideOverride?: string | null;
    },
  ],
  team2: [
    {
      gender: string;
      partnerPreference: string;
      mixedSideOverride?: string | null;
    },
    {
      gender: string;
      partnerPreference: string;
      mixedSideOverride?: string | null;
    },
  ]
) {
  const effectiveTeam1 = team1.map((player) => ({
    effectiveMixedSide: getEffectiveMixedSide({
      gender: player.gender as PlayerGender,
      mixedSideOverride: player.mixedSideOverride,
      partnerPreference: player.partnerPreference,
    }),
  }));
  const effectiveTeam2 = team2.map((player) => ({
    effectiveMixedSide: getEffectiveMixedSide({
      gender: player.gender as PlayerGender,
      mixedSideOverride: player.mixedSideOverride,
      partnerPreference: player.partnerPreference,
    }),
  }));

  if (
    [...effectiveTeam1, ...effectiveTeam2].some(
      (player) => player.effectiveMixedSide === null
    )
  ) {
    return false;
  }

  const matchType = inferMixicanoMatchType(
    effectiveTeam1 as [
      { effectiveMixedSide: string },
      { effectiveMixedSide: string },
    ],
    effectiveTeam2 as [
      { effectiveMixedSide: string },
      { effectiveMixedSide: string },
    ]
  );

  return matchType !== "HYBRID";
}

function getMixedSideBalanceGap(
  partition: DoublesPartition,
  playersById: Map<string, PartitionCandidate>
) {
  const player1 = playersById.get(partition.team1[0]);
  const player2 = playersById.get(partition.team1[1]);
  const player3 = playersById.get(partition.team2[0]);
  const player4 = playersById.get(partition.team2[1]);

  if (!player1 || !player2 || !player3 || !player4) {
    return 0;
  }

  const teams = [
    [player1, player2],
    [player3, player4],
  ] as const;
  const teamSides = teams.map((team) =>
    team.map((player) =>
      getEffectiveMixedSide({
        gender: player.gender as PlayerGender,
        mixedSideOverride: player.mixedSideOverride,
        partnerPreference: player.partnerPreference,
      })
    )
  );

  if (
    teamSides.some((team) => team.some((side) => side === null)) ||
    !teamSides.every(
      (team) =>
        team.includes("UPPER" as typeof team[number]) &&
        team.includes("LOWER" as typeof team[number])
    )
  ) {
    return 0;
  }

  const [team1Upper, team1Lower] =
    teamSides[0][0] === "UPPER"
      ? [teams[0][0], teams[0][1]]
      : [teams[0][1], teams[0][0]];
  const [team2Upper, team2Lower] =
    teamSides[1][0] === "UPPER"
      ? [teams[1][0], teams[1][1]]
      : [teams[1][1], teams[1][0]];

  return (
    Math.abs(team1Upper.elo - team2Upper.elo) +
    Math.abs(team1Lower.elo - team2Lower.elo)
  );
}

export function getDoublesPartitions(playerIds: string[]): DoublesPartition[] {
  if (playerIds.length < 4) return [];

  const [a, b, c, d] = playerIds;
  return [
    { team1: [a, b], team2: [c, d] },
    { team1: [a, c], team2: [b, d] },
    { team1: [a, d], team2: [b, c] },
  ];
}

export function buildRotationHistory(
  matches: MatchHistoryEntry[]
): RotationHistory {
  const courtmateCounts = new Map<string, number>();
  const partnerCounts = new Map<string, number>();
  const opponentCounts = new Map<string, number>();
  const podCounts = new Map<string, number>();
  const exactPartitionCounts = new Map<string, number>();
  const chronologicalMatches = getChronologicalMatches(matches);
  const recentMatches = chronologicalMatches.slice(-RECENT_HISTORY_LIMIT);
  const recentExactPartitionMatches = chronologicalMatches.slice(
    -EXACT_PARTITION_HISTORY_LIMIT
  );

  for (const [index, match] of recentMatches.entries()) {
    const recencyWeight = Math.pow(
      RECENT_HISTORY_DECAY,
      recentMatches.length - index - 1
    );
    const team1 = [match.team1User1Id, match.team1User2Id] as const;
    const team2 = [match.team2User1Id, match.team2User2Id] as const;
    const podPlayers = [...team1, ...team2];

    for (let left = 0; left < podPlayers.length - 1; left++) {
      for (let right = left + 1; right < podPlayers.length; right++) {
        incrementCounter(
          courtmateCounts,
          pairKey(podPlayers[left], podPlayers[right]),
          recencyWeight
        );
      }
    }

    incrementCounter(partnerCounts, pairKey(team1[0], team1[1]), recencyWeight);
    incrementCounter(partnerCounts, pairKey(team2[0], team2[1]), recencyWeight);

    for (const playerA of team1) {
      for (const playerB of team2) {
        incrementCounter(
          opponentCounts,
          pairKey(playerA, playerB),
          recencyWeight
        );
      }
    }

    incrementCounter(podCounts, podKey(podPlayers), recencyWeight);
  }

  for (const [index, match] of recentExactPartitionMatches.entries()) {
    const recencyWeight = Math.pow(
      RECENT_HISTORY_DECAY,
      recentExactPartitionMatches.length - index - 1
    );
    incrementCounter(
      exactPartitionCounts,
      getPartitionKey({
        team1: [match.team1User1Id, match.team1User2Id],
        team2: [match.team2User1Id, match.team2User2Id],
      }),
      recencyWeight
    );
  }

  return {
    courtmateCounts,
    partnerCounts,
    opponentCounts,
    podCounts,
    exactPartitionCounts,
  };
}

export function getPartitionRepeatStats(
  partition: DoublesPartition,
  rotationHistory: RotationHistory
): PartitionRepeatStats {
  const repeatedPartnerTeams =
    Number(
      (rotationHistory.partnerCounts.get(
        pairKey(partition.team1[0], partition.team1[1])
      ) ?? 0) > 0
    ) +
    Number(
      (rotationHistory.partnerCounts.get(
        pairKey(partition.team2[0], partition.team2[1])
      ) ?? 0) > 0
    );
  const opponentPairs: [string, string][] = [
    [partition.team1[0], partition.team2[0]],
    [partition.team1[0], partition.team2[1]],
    [partition.team1[1], partition.team2[0]],
    [partition.team1[1], partition.team2[1]],
  ];
  const repeatedOpponentPairs = opponentPairs.reduce(
    (total, [playerA, playerB]) =>
      total +
      Number((rotationHistory.opponentCounts.get(pairKey(playerA, playerB)) ?? 0) > 0),
    0
  );
  const repeatedPod =
    (rotationHistory.podCounts.get(
      podKey([
        partition.team1[0],
        partition.team1[1],
        partition.team2[0],
        partition.team2[1],
      ])
    ) ?? 0) > 0;

  return {
    repeatedPartnerTeams,
    repeatedOpponentPairs,
    repeatedPod,
  };
}

export function scorePartitionDetailed(
  partition: DoublesPartition,
  playersById: Map<string, PartitionCandidate>,
  sessionMode: SessionMode,
  sessionType: SessionType,
  rotationHistory: RotationHistory
): PartitionScoreDetails | null {
  const player1 = playersById.get(partition.team1[0]);
  const player2 = playersById.get(partition.team1[1]);
  const player3 = playersById.get(partition.team2[0]);
  const player4 = playersById.get(partition.team2[1]);

  if (!player1 || !player2 || !player3 || !player4) return null;

  if (sessionMode === SessionMode.MIXICANO) {
    const isValid = isValidMixicanoPartition(
      [
        {
          gender: player1.gender,
          partnerPreference: player1.partnerPreference,
          mixedSideOverride: player1.mixedSideOverride,
        },
        {
          gender: player2.gender,
          partnerPreference: player2.partnerPreference,
          mixedSideOverride: player2.mixedSideOverride,
        },
      ],
      [
        {
          gender: player3.gender,
          partnerPreference: player3.partnerPreference,
          mixedSideOverride: player3.mixedSideOverride,
        },
        {
          gender: player4.gender,
          partnerPreference: player4.partnerPreference,
          mixedSideOverride: player4.mixedSideOverride,
        },
      ]
    );

    if (!isValid) return null;
  }

  const team1AvgElo = (player1.elo + player2.elo) / 2;
  const team2AvgElo = (player3.elo + player4.elo) / 2;
  const teamBalanceGap = Math.abs(team1AvgElo - team2AvgElo);
  const mixedSideBalanceGap =
    sessionMode === SessionMode.MIXICANO
      ? getMixedSideBalanceGap(partition, playersById)
      : 0;
  const team1AvgPointDiff = (player1.pointDiff + player2.pointDiff) / 2;
  const team2AvgPointDiff = (player3.pointDiff + player4.pointDiff) / 2;
  const pointDiffGap = Math.abs(team1AvgPointDiff - team2AvgPointDiff);
  const balanceScore = normalizeScore(
    teamBalanceGap,
    getBalanceGapNormalizer(sessionType)
  );
  const courtmateRepeatPenalty = getCourtmateRepeatPenalty(
    partition,
    rotationHistory
  );
  const partnerRepeatPenalty = getPartnerRepeatPenalty(partition, rotationHistory);
  const opponentRepeatPenalty = getOpponentRepeatPenalty(
    partition,
    rotationHistory
  );
  const podRepeatPenalty = getPodRepeatPenalty(partition, rotationHistory);
  const rotationPenalty =
    courtmateRepeatPenalty +
    partnerRepeatPenalty +
    opponentRepeatPenalty +
    podRepeatPenalty;
  const exactPartitionPenalty =
    (rotationHistory.exactPartitionCounts.get(getPartitionKey(partition)) ?? 0) *
    EXACT_PARTITION_REPEAT_PENALTY;

  return {
    totalScore: balanceScore,
    teamBalanceGap,
    mixedSideBalanceGap,
    pointDiffGap,
    balanceScore,
    courtmateRepeatPenalty,
    partnerRepeatPenalty,
    opponentRepeatPenalty,
    podRepeatPenalty,
    rotationPenalty,
    exactPartitionPenalty,
  };
}

export function scorePartition(
  partition: DoublesPartition,
  playersById: Map<string, PartitionCandidate>,
  sessionMode: SessionMode,
  sessionType: SessionType,
  rotationHistory: RotationHistory
): number | null {
  return (
    scorePartitionDetailed(
      partition,
      playersById,
      sessionMode,
      sessionType,
      rotationHistory
    )
      ?.totalScore ?? null
  );
}

export function evaluateBestPartition(
  candidateIds: string[],
  playersById: Map<string, PartitionCandidate>,
  sessionMode: SessionMode,
  sessionType: SessionType,
  rotationHistory: RotationHistory,
  options?: {
    excludedPartitionKey?: string;
  }
): PartitionEvaluation | null {
  const partitions = getDoublesPartitions(candidateIds);
  let bestPartition: DoublesPartition | null = null;
  let bestScore: PartitionScoreDetails | null = null;

  for (const partition of partitions) {
    if (
      options?.excludedPartitionKey &&
      getPartitionKey(partition) === options.excludedPartitionKey
    ) {
      continue;
    }

    const score = scorePartitionDetailed(
      partition,
      playersById,
      sessionMode,
      sessionType,
      rotationHistory
    );
    if (score === null) continue;

    if (
      !bestScore ||
      comparePartitionScoreDetails(score, bestScore, sessionType) < 0
    ) {
      bestScore = score;
      bestPartition = partition;
    }
  }

  return bestPartition && bestScore
    ? {
        partition: bestPartition,
        score: bestScore.teamBalanceGap,
        mixedSideBalanceGap: bestScore.mixedSideBalanceGap,
        pointDiffGap: bestScore.pointDiffGap,
        rotationPenalty: bestScore.rotationPenalty,
        exactPartitionPenalty: bestScore.exactPartitionPenalty,
      }
    : null;
}

export function findBestQuartetInFairnessWindow<T extends { userId: string }>(
  rankedCandidates: T[],
  playersById: Map<string, PartitionCandidate>,
  sessionMode: SessionMode,
  sessionType: SessionType,
  rotationHistory: RotationHistory,
  {
    baselineIds,
    fairnessSlack,
    lowestCohortUserIds,
    maxLowestCohortPlayers,
    matchesPlayedQuota,
    maxCandidates = 8,
    excludedQuartetKey,
  }: FairnessWindowQuartetOptions
): FallbackQuartetSelection | null {
  const fallbackPool = rankedCandidates.slice(
    0,
    Math.min(maxCandidates, rankedCandidates.length)
  );
  const poolUserIds = new Set(fallbackPool.map((candidate) => candidate.userId));

  for (const baselineId of baselineIds) {
    if (poolUserIds.has(baselineId)) continue;

    const baselineCandidate = rankedCandidates.find(
      (candidate) => candidate.userId === baselineId
    );
    if (!baselineCandidate) continue;

    fallbackPool.push(baselineCandidate);
    poolUserIds.add(baselineId);
  }

  const rankByUserId = new Map(
    fallbackPool.map((candidate, index) => [candidate.userId, index])
  );
  const baselineFairnessScore = baselineIds.reduce(
    (sum, id) => sum + (rankByUserId.get(id) ?? fallbackPool.length),
    0
  );
  const maxFairnessScore = baselineFairnessScore + fairnessSlack;

  let bestSelection: FallbackQuartetSelection | null = null;
  const matchesPlayedByUserId = new Map(
    fallbackPool
      .map((candidate) => [
        candidate.userId,
        (candidate as T & { matchesPlayed?: number }).matchesPlayed,
      ])
      .filter(
        (
          entry
        ): entry is [string, number] => typeof entry[1] === "number"
      )
  );

  for (let i = 0; i < fallbackPool.length - 3; i++) {
    for (let j = i + 1; j < fallbackPool.length - 2; j++) {
      for (let k = j + 1; k < fallbackPool.length - 1; k++) {
        for (let l = k + 1; l < fallbackPool.length; l++) {
          const ids: [string, string, string, string] = [
            fallbackPool[i].userId,
            fallbackPool[j].userId,
            fallbackPool[k].userId,
            fallbackPool[l].userId,
          ];

          if (excludedQuartetKey && getQuartetKey(ids) === excludedQuartetKey) {
            continue;
          }

          const fairnessScore = ids.reduce(
            (sum, id) => sum + (rankByUserId.get(id) ?? fallbackPool.length),
            0
          );
          const randomScore = getQuartetRandomScore(fallbackPool, ids);

          if (fairnessScore > maxFairnessScore) continue;

          if (matchesPlayedQuota) {
            const quartetQuota = new Map<number, number>();

            for (const id of ids) {
              const matchesPlayed = matchesPlayedByUserId.get(id);

              if (typeof matchesPlayed !== "number") {
                quartetQuota.clear();
                break;
              }

              quartetQuota.set(
                matchesPlayed,
                (quartetQuota.get(matchesPlayed) ?? 0) + 1
              );
            }

            if (
              quartetQuota.size !== matchesPlayedQuota.size ||
              [...matchesPlayedQuota.entries()].some(
                ([matchesPlayed, count]) => quartetQuota.get(matchesPlayed) !== count
              )
            ) {
              continue;
            }
          }

          if (
            lowestCohortUserIds &&
            typeof maxLowestCohortPlayers === "number" &&
            ids.filter((id) => lowestCohortUserIds.has(id)).length >
              maxLowestCohortPlayers
          ) {
            continue;
          }

          const evaluation = evaluateBestPartition(
            ids,
            playersById,
            sessionMode,
            sessionType,
            rotationHistory
          );
          if (!evaluation) continue;

          const evaluationComparison = bestSelection
            ? comparePartitionScoreDetails(
                {
                  teamBalanceGap: evaluation.score,
                  mixedSideBalanceGap: evaluation.mixedSideBalanceGap,
                  pointDiffGap: evaluation.pointDiffGap,
                  rotationPenalty: evaluation.rotationPenalty,
                  exactPartitionPenalty: evaluation.exactPartitionPenalty,
                },
                {
                  teamBalanceGap: bestSelection.score,
                  mixedSideBalanceGap: bestSelection.mixedSideBalanceGap,
                  pointDiffGap: bestSelection.pointDiffGap,
                  rotationPenalty: bestSelection.rotationPenalty,
                  exactPartitionPenalty: bestSelection.exactPartitionPenalty,
                },
                sessionType
              )
            : -1;

          if (
            !bestSelection ||
            evaluationComparison < 0 ||
            (evaluationComparison === 0 &&
              (fairnessScore < bestSelection.fairnessScore ||
                (fairnessScore === bestSelection.fairnessScore &&
                  randomScore < bestSelection.randomScore)))
          ) {
            bestSelection = {
              ids,
              partition: evaluation.partition,
              fairnessScore,
              randomScore,
              score: evaluation.score,
              mixedSideBalanceGap: evaluation.mixedSideBalanceGap,
              pointDiffGap: evaluation.pointDiffGap,
              rotationPenalty: evaluation.rotationPenalty,
              exactPartitionPenalty: evaluation.exactPartitionPenalty,
            };
          }
        }
      }
    }
  }

  return bestSelection;
}

export function findBestFallbackQuartet<T extends { userId: string }>(
  rankedCandidates: T[],
  playersById: Map<string, PartitionCandidate>,
  sessionMode: SessionMode,
  sessionType: SessionType,
  rotationHistory: RotationHistory,
  maxCandidates = 12,
  options?: {
    excludedQuartetKey?: string;
    lowestCohortUserIds?: Set<string>;
    maxLowestCohortPlayers?: number;
  }
): FallbackQuartetSelection | null {
  const fallbackPool = rankedCandidates.slice(
    0,
    Math.min(maxCandidates, rankedCandidates.length)
  );
  const rankByUserId = new Map(
    fallbackPool.map((candidate, index) => [candidate.userId, index])
  );

  let bestSelection: FallbackQuartetSelection | null = null;

  for (let i = 0; i < fallbackPool.length - 3; i++) {
    for (let j = i + 1; j < fallbackPool.length - 2; j++) {
      for (let k = j + 1; k < fallbackPool.length - 1; k++) {
        for (let l = k + 1; l < fallbackPool.length; l++) {
          const ids: [string, string, string, string] = [
            fallbackPool[i].userId,
            fallbackPool[j].userId,
            fallbackPool[k].userId,
            fallbackPool[l].userId,
          ];

          if (
            options?.excludedQuartetKey &&
            getQuartetKey(ids) === options.excludedQuartetKey
          ) {
            continue;
          }

          if (
            options?.lowestCohortUserIds &&
            typeof options.maxLowestCohortPlayers === "number" &&
            ids.filter((id) => options.lowestCohortUserIds?.has(id)).length >
              options.maxLowestCohortPlayers
          ) {
            continue;
          }

          const evaluation = evaluateBestPartition(
            ids,
            playersById,
            sessionMode,
            sessionType,
            rotationHistory
          );

          if (!evaluation) continue;

          const fairnessScore = ids.reduce(
            (sum, id) => sum + (rankByUserId.get(id) ?? fallbackPool.length),
            0
          );
          const randomScore = getQuartetRandomScore(fallbackPool, ids);

          const evaluationComparison = bestSelection
            ? comparePartitionScoreDetails(
                {
                  teamBalanceGap: evaluation.score,
                  mixedSideBalanceGap: evaluation.mixedSideBalanceGap,
                  pointDiffGap: evaluation.pointDiffGap,
                  rotationPenalty: evaluation.rotationPenalty,
                  exactPartitionPenalty: evaluation.exactPartitionPenalty,
                },
                {
                  teamBalanceGap: bestSelection.score,
                  mixedSideBalanceGap: bestSelection.mixedSideBalanceGap,
                  pointDiffGap: bestSelection.pointDiffGap,
                  rotationPenalty: bestSelection.rotationPenalty,
                  exactPartitionPenalty: bestSelection.exactPartitionPenalty,
                },
                sessionType
              )
            : -1;

          if (
            !bestSelection ||
            evaluationComparison < 0 ||
            (evaluationComparison === 0 &&
              (fairnessScore < bestSelection.fairnessScore ||
                (fairnessScore === bestSelection.fairnessScore &&
                  randomScore < bestSelection.randomScore)))
          ) {
            bestSelection = {
              ids,
              partition: evaluation.partition,
              fairnessScore,
              randomScore,
              score: evaluation.score,
              mixedSideBalanceGap: evaluation.mixedSideBalanceGap,
              pointDiffGap: evaluation.pointDiffGap,
              rotationPenalty: evaluation.rotationPenalty,
              exactPartitionPenalty: evaluation.exactPartitionPenalty,
            };
          }
        }
      }
    }
  }

  return bestSelection;
}

export function findAlternativeQuartetForReshuffle<
  T extends { userId: string },
>(
  rankedCandidates: T[],
  playersById: Map<string, PartitionCandidate>,
  sessionMode: SessionMode,
  sessionType: SessionType,
  rotationHistory: RotationHistory,
  options: FairnessWindowQuartetOptions
): FallbackQuartetSelection | null {
  const fairnessWindowSelection = findBestQuartetInFairnessWindow(
    rankedCandidates,
    playersById,
    sessionMode,
    sessionType,
    rotationHistory,
    options
  );

  if (fairnessWindowSelection) {
    return fairnessWindowSelection;
  }

  return findBestFallbackQuartet(
    rankedCandidates,
    playersById,
    sessionMode,
    sessionType,
    rotationHistory,
    options.maxCandidates,
    {
      excludedQuartetKey: options.excludedQuartetKey,
      lowestCohortUserIds: options.lowestCohortUserIds,
      maxLowestCohortPlayers: options.maxLowestCohortPlayers,
    }
  );
}
