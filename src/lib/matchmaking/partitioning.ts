import {
  PartnerPreference,
  PlayerGender,
  SessionMode,
} from "../../types/enums";

const BALANCE_WEIGHT = 0.6;
const VARIETY_WEIGHT = 0.4;
const IMMEDIATE_REPEAT_PARTNER_PENALTY = 1.25;
const PARTNER_HISTORY_WEIGHT = 1.35;
const OPPONENT_HISTORY_WEIGHT = 0.25;
const POD_HISTORY_WEIGHT = 0.9;
const BALANCE_GAP_NORMALIZER = 150;
const VARIETY_SCORE_NORMALIZER = 4;
const RECENT_HISTORY_LIMIT = 24;
const RECENT_HISTORY_DECAY = 0.85;

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
  elo: number;
  lastPartnerId: string | null;
  gender: string;
  partnerPreference: string;
}

export interface RotationHistory {
  partnerCounts: Map<string, number>;
  opponentCounts: Map<string, number>;
  podCounts: Map<string, number>;
}

export interface PartitionEvaluation {
  partition: DoublesPartition;
  score: number;
}

export interface PartitionScoreDetails {
  totalScore: number;
  teamEloGap: number;
  balanceScore: number;
  recentPartnerScore: number;
  recentOpponentScore: number;
  recentPodScore: number;
  varietyScore: number;
  immediateRepeatPartnerPenalty: number;
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
  score: number;
}

export interface FairnessWindowQuartetOptions {
  baselineIds: [string, string, string, string];
  fairnessSlack: number;
  lowestCohortUserIds?: Set<string>;
  maxLowestCohortPlayers?: number;
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
  team1: [{ gender: string }, { gender: string }],
  team2: [{ gender: string }, { gender: string }]
): MixicanoMatchType {
  const femaleCountFor = (team: [{ gender: string }, { gender: string }]) =>
    team.filter((player) => player.gender === PlayerGender.FEMALE).length;

  const team1FemaleCount = femaleCountFor(team1);
  const team2FemaleCount = femaleCountFor(team2);

  if (team1FemaleCount === 2 && team2FemaleCount === 2) return "WOMENS";
  if (team1FemaleCount === 1 && team2FemaleCount === 1) return "MIXED";
  if (team1FemaleCount === 0 && team2FemaleCount === 0) return "MENS";
  return "HYBRID";
}

function isValidMixicanoPartition(
  team1: [
    { gender: string; partnerPreference: string },
    { gender: string; partnerPreference: string },
  ],
  team2: [
    { gender: string; partnerPreference: string },
    { gender: string; partnerPreference: string },
  ]
) {
  const players = [...team1, ...team2];

  const hasInvalidGender = players.some(
    (player) =>
      ![PlayerGender.MALE, PlayerGender.FEMALE].includes(
        player.gender as PlayerGender
      )
  );
  if (hasInvalidGender) return false;

  const matchType = inferMixicanoMatchType(team1, team2);

  const violatesFemaleRestriction = players.some((player) => {
    const gender = player.gender as PlayerGender;
    const preference = player.partnerPreference as PartnerPreference;

    return (
      gender === PlayerGender.FEMALE &&
      preference === PartnerPreference.FEMALE_FLEX &&
      !["MIXED", "WOMENS"].includes(matchType)
    );
  });

  return !violatesFemaleRestriction;
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
  const partnerCounts = new Map<string, number>();
  const opponentCounts = new Map<string, number>();
  const podCounts = new Map<string, number>();
  const recentMatches = getChronologicalMatches(matches).slice(-RECENT_HISTORY_LIMIT);

  for (const [index, match] of recentMatches.entries()) {
    const recencyWeight = Math.pow(
      RECENT_HISTORY_DECAY,
      recentMatches.length - index - 1
    );
    const team1 = [match.team1User1Id, match.team1User2Id] as const;
    const team2 = [match.team2User1Id, match.team2User2Id] as const;

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

    incrementCounter(podCounts, podKey([...team1, ...team2]), recencyWeight);
  }

  return { partnerCounts, opponentCounts, podCounts };
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
        },
        {
          gender: player2.gender,
          partnerPreference: player2.partnerPreference,
        },
      ],
      [
        {
          gender: player3.gender,
          partnerPreference: player3.partnerPreference,
        },
        {
          gender: player4.gender,
          partnerPreference: player4.partnerPreference,
        },
      ]
    );

    if (!isValid) return null;
  }

  const team1AvgElo = (player1.elo + player2.elo) / 2;
  const team2AvgElo = (player3.elo + player4.elo) / 2;
  const teamEloGap = Math.abs(team1AvgElo - team2AvgElo);
  const balanceScore = normalizeScore(teamEloGap, BALANCE_GAP_NORMALIZER);
  const recentPartnerScore =
    (rotationHistory.partnerCounts.get(pairKey(player1.userId, player2.userId)) ??
      0) +
    (rotationHistory.partnerCounts.get(pairKey(player3.userId, player4.userId)) ??
      0);

  const opponentPairs: [string, string][] = [
    [player1.userId, player3.userId],
    [player1.userId, player4.userId],
    [player2.userId, player3.userId],
    [player2.userId, player4.userId],
  ];
  const recentOpponentScore = opponentPairs.reduce(
    (total, [opponentA, opponentB]) =>
      total + (rotationHistory.opponentCounts.get(pairKey(opponentA, opponentB)) ?? 0),
    0
  );
  const recentPodScore =
    rotationHistory.podCounts.get(
      podKey([
        player1.userId,
        player2.userId,
        player3.userId,
        player4.userId,
      ])
    ) ?? 0;
  const weightedVarietyScore =
    recentPartnerScore * PARTNER_HISTORY_WEIGHT +
    recentOpponentScore * OPPONENT_HISTORY_WEIGHT +
    recentPodScore * POD_HISTORY_WEIGHT;
  const varietyScore = normalizeScore(
    weightedVarietyScore,
    VARIETY_SCORE_NORMALIZER
  );
  const immediateRepeatPartnerPenalty =
    (Number(
      player1.lastPartnerId === player2.userId ||
        player2.lastPartnerId === player1.userId
    ) +
      Number(
        player3.lastPartnerId === player4.userId ||
          player4.lastPartnerId === player3.userId
      )) *
    IMMEDIATE_REPEAT_PARTNER_PENALTY;

  return {
    totalScore:
      BALANCE_WEIGHT * balanceScore +
      VARIETY_WEIGHT * varietyScore +
      immediateRepeatPartnerPenalty,
    teamEloGap,
    balanceScore,
    recentPartnerScore,
    recentOpponentScore,
    recentPodScore,
    varietyScore,
    immediateRepeatPartnerPenalty,
  };
}

export function scorePartition(
  partition: DoublesPartition,
  playersById: Map<string, PartitionCandidate>,
  sessionMode: SessionMode,
  rotationHistory: RotationHistory
): number | null {
  return (
    scorePartitionDetailed(partition, playersById, sessionMode, rotationHistory)
      ?.totalScore ?? null
  );
}

export function evaluateBestPartition(
  candidateIds: string[],
  playersById: Map<string, PartitionCandidate>,
  sessionMode: SessionMode,
  rotationHistory: RotationHistory,
  options?: {
    excludedPartitionKey?: string;
  }
): PartitionEvaluation | null {
  const partitions = getDoublesPartitions(candidateIds);
  let bestPartition: DoublesPartition | null = null;
  let bestScore = Infinity;

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
      rotationHistory
    );
    if (score === null) continue;

    if (score.totalScore < bestScore) {
      bestScore = score.totalScore;
      bestPartition = partition;
    }
  }

  return bestPartition && bestScore < Infinity
    ? { partition: bestPartition, score: bestScore }
    : null;
}

export function findBestQuartetInFairnessWindow<T extends { userId: string }>(
  rankedCandidates: T[],
  playersById: Map<string, PartitionCandidate>,
  sessionMode: SessionMode,
  rotationHistory: RotationHistory,
  {
    baselineIds,
    fairnessSlack,
    lowestCohortUserIds,
    maxLowestCohortPlayers,
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

          if (fairnessScore > maxFairnessScore) continue;

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
            rotationHistory
          );
          if (!evaluation) continue;

          if (
            !bestSelection ||
            evaluation.score < bestSelection.score ||
            (evaluation.score === bestSelection.score &&
              fairnessScore < bestSelection.fairnessScore)
          ) {
            bestSelection = {
              ids,
              partition: evaluation.partition,
              fairnessScore,
              score: evaluation.score,
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
  rotationHistory: RotationHistory,
  maxCandidates = 12,
  excludedQuartetKey?: string
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

          if (excludedQuartetKey && getQuartetKey(ids) === excludedQuartetKey) {
            continue;
          }

          const evaluation = evaluateBestPartition(
            ids,
            playersById,
            sessionMode,
            rotationHistory
          );

          if (!evaluation) continue;

          const fairnessScore = ids.reduce(
            (sum, id) => sum + (rankByUserId.get(id) ?? fallbackPool.length),
            0
          );

          if (
            !bestSelection ||
            fairnessScore < bestSelection.fairnessScore ||
            (fairnessScore === bestSelection.fairnessScore &&
              evaluation.score < bestSelection.score)
          ) {
            bestSelection = {
              ids,
              partition: evaluation.partition,
              fairnessScore,
              score: evaluation.score,
            };
          }
        }
      }
    }
  }

  return bestSelection;
}
