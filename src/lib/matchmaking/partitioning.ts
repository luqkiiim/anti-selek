import {
  PartnerPreference,
  PlayerGender,
  SessionMode,
  SessionType,
} from "../../types/enums";

const ELO_BALANCE_GAP_NORMALIZER = 150;
const POINTS_BALANCE_GAP_NORMALIZER = 3;
const RECENT_HISTORY_LIMIT = 24;
const RECENT_HISTORY_DECAY = 0.85;
const EXACT_PARTITION_HISTORY_LIMIT = 8;
const EXACT_PARTITION_REPEAT_PENALTY = 4;
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
  elo: number;
  pointDiff: number;
  lastPartnerId: string | null;
  gender: string;
  partnerPreference: string;
}

export interface RotationHistory {
  partnerCounts: Map<string, number>;
  opponentCounts: Map<string, number>;
  podCounts: Map<string, number>;
  exactPartitionCounts: Map<string, number>;
}

export interface PartitionEvaluation {
  partition: DoublesPartition;
  score: number;
  pointDiffGap: number;
  exactPartitionPenalty: number;
}

export interface PartitionScoreDetails {
  totalScore: number;
  teamBalanceGap: number;
  pointDiffGap: number;
  balanceScore: number;
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
  score: number;
  pointDiffGap: number;
  exactPartitionPenalty: number;
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
    "teamBalanceGap" | "pointDiffGap" | "exactPartitionPenalty"
  >,
  right: Pick<
    PartitionScoreDetails,
    "teamBalanceGap" | "pointDiffGap" | "exactPartitionPenalty"
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

  return { partnerCounts, opponentCounts, podCounts, exactPartitionCounts };
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
  const teamBalanceGap = Math.abs(team1AvgElo - team2AvgElo);
  const team1AvgPointDiff = (player1.pointDiff + player2.pointDiff) / 2;
  const team2AvgPointDiff = (player3.pointDiff + player4.pointDiff) / 2;
  const pointDiffGap = Math.abs(team1AvgPointDiff - team2AvgPointDiff);
  const balanceScore = normalizeScore(
    teamBalanceGap,
    getBalanceGapNormalizer(sessionType)
  );
  const exactPartitionPenalty =
    (rotationHistory.exactPartitionCounts.get(getPartitionKey(partition)) ?? 0) *
    EXACT_PARTITION_REPEAT_PENALTY;

  return {
    totalScore: balanceScore,
    teamBalanceGap,
    pointDiffGap,
    balanceScore,
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
        pointDiffGap: bestScore.pointDiffGap,
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
            sessionType,
            rotationHistory
          );
          if (!evaluation) continue;

          const evaluationComparison = bestSelection
            ? comparePartitionScoreDetails(
                {
                  teamBalanceGap: evaluation.score,
                  pointDiffGap: evaluation.pointDiffGap,
                  exactPartitionPenalty: evaluation.exactPartitionPenalty,
                },
                {
                  teamBalanceGap: bestSelection.score,
                  pointDiffGap: bestSelection.pointDiffGap,
                  exactPartitionPenalty: bestSelection.exactPartitionPenalty,
                },
                sessionType
              )
            : -1;

          if (
            !bestSelection ||
            evaluationComparison < 0 ||
            (evaluationComparison === 0 &&
              fairnessScore < bestSelection.fairnessScore)
          ) {
            bestSelection = {
              ids,
              partition: evaluation.partition,
              fairnessScore,
              score: evaluation.score,
              pointDiffGap: evaluation.pointDiffGap,
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

          const evaluationComparison = bestSelection
            ? comparePartitionScoreDetails(
                {
                  teamBalanceGap: evaluation.score,
                  pointDiffGap: evaluation.pointDiffGap,
                  exactPartitionPenalty: evaluation.exactPartitionPenalty,
                },
                {
                  teamBalanceGap: bestSelection.score,
                  pointDiffGap: bestSelection.pointDiffGap,
                  exactPartitionPenalty: bestSelection.exactPartitionPenalty,
                },
                sessionType
              )
            : -1;

          if (
            !bestSelection ||
            evaluationComparison < 0 ||
            (evaluationComparison === 0 &&
              fairnessScore < bestSelection.fairnessScore)
          ) {
            bestSelection = {
              ids,
              partition: evaluation.partition,
              fairnessScore,
              score: evaluation.score,
              pointDiffGap: evaluation.pointDiffGap,
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
