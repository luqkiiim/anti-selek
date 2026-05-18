import type { V3CompletedMatch, V3DoublesPartition } from "./types";

export const DEFAULT_EXACT_REMATCH_HISTORY_LIMIT = 6;
export const DEFAULT_EXACT_REMATCH_DECAY = 0.85;
export const DEFAULT_PARTNER_REPEAT_HISTORY_LIMIT = 8;
export const DEFAULT_PARTNER_REPEAT_DECAY = 0.85;
export const DEFAULT_OPPONENT_REPEAT_HISTORY_LIMIT = 8;
export const DEFAULT_OPPONENT_REPEAT_DECAY = 0.85;

export function getPairKey(playerA: string, playerB: string) {
  return [playerA, playerB].sort().join("|");
}

export function getExactPartitionKey(partition: V3DoublesPartition) {
  return [
    getPairKey(partition.team1[0], partition.team1[1]),
    getPairKey(partition.team2[0], partition.team2[1]),
  ]
    .sort()
    .join("||");
}

function getChronologicalCompletedMatches(matches: V3CompletedMatch[]) {
  return matches
    .filter((match): match is V3CompletedMatch & { completedAt: Date } =>
      match.completedAt instanceof Date
    )
    .sort(
      (left, right) => left.completedAt.getTime() - right.completedAt.getTime()
    );
}

export interface V3ExactRematchHistory {
  penalties: Map<string, number>;
}

export interface V3PartnerRepeatHistory {
  partnerCounts: Map<string, number>;
}

export interface V3OpponentRepeatHistory {
  opponentCounts: Map<string, number>;
}

export interface V3SocialMixHistory {
  sharedCourtPairs: Set<string>;
  partnerPairs: Set<string>;
  opponentPairs: Set<string>;
}

export function buildExactRematchHistory(
  matches: V3CompletedMatch[],
  {
    limit = DEFAULT_EXACT_REMATCH_HISTORY_LIMIT,
    decay = DEFAULT_EXACT_REMATCH_DECAY,
  }: {
    limit?: number;
    decay?: number;
  } = {}
): V3ExactRematchHistory {
  const matchesByPartition = new Map<string, V3CompletedMatch[]>();

  for (const match of getChronologicalCompletedMatches(matches)) {
    const key = getExactPartitionKey({
      team1: match.team1,
      team2: match.team2,
    });
    const partitionMatches = matchesByPartition.get(key);

    if (partitionMatches) {
      partitionMatches.push(match);
      continue;
    }

    matchesByPartition.set(key, [match]);
  }

  const penalties = new Map<string, number>();

  for (const [key, partitionMatches] of matchesByPartition.entries()) {
    const recentMatches = partitionMatches.slice(-limit);
    const penalty = recentMatches.reduce(
      (sum, _match, index) =>
        sum + Math.pow(decay, recentMatches.length - index - 1),
      0
    );

    penalties.set(key, penalty);
  }

  return { penalties };
}

export function getExactRematchPenalty(
  partition: V3DoublesPartition,
  history: V3ExactRematchHistory
) {
  return history.penalties.get(getExactPartitionKey(partition)) ?? 0;
}

export function buildPartnerRepeatHistory(
  matches: V3CompletedMatch[],
  {
    limit = DEFAULT_PARTNER_REPEAT_HISTORY_LIMIT,
    decay = DEFAULT_PARTNER_REPEAT_DECAY,
  }: {
    limit?: number;
    decay?: number;
  } = {}
): V3PartnerRepeatHistory {
  const recentMatches = getChronologicalCompletedMatches(matches).slice(-limit);
  const partnerCounts = new Map<string, number>();

  for (const [index, match] of recentMatches.entries()) {
    const recencyWeight = Math.pow(decay, recentMatches.length - index - 1);

    partnerCounts.set(
      getPairKey(match.team1[0], match.team1[1]),
      (partnerCounts.get(getPairKey(match.team1[0], match.team1[1])) ?? 0) +
        recencyWeight
    );
    partnerCounts.set(
      getPairKey(match.team2[0], match.team2[1]),
      (partnerCounts.get(getPairKey(match.team2[0], match.team2[1])) ?? 0) +
        recencyWeight
    );
  }

  return { partnerCounts };
}

export function getPartnerRepeatPenalty(
  partition: V3DoublesPartition,
  history: V3PartnerRepeatHistory
) {
  return (
    (history.partnerCounts.get(
      getPairKey(partition.team1[0], partition.team1[1])
    ) ?? 0) +
    (history.partnerCounts.get(
      getPairKey(partition.team2[0], partition.team2[1])
    ) ?? 0)
  );
}

function getOpponentPairKeys(partition: V3DoublesPartition) {
  return partition.team1.flatMap((team1Player) =>
    partition.team2.map((team2Player) => getPairKey(team1Player, team2Player))
  );
}

function getSharedCourtPairKeys(partition: V3DoublesPartition) {
  const allPlayers = [
    partition.team1[0],
    partition.team1[1],
    partition.team2[0],
    partition.team2[1],
  ];
  const pairKeys: string[] = [];

  for (let left = 0; left < allPlayers.length - 1; left += 1) {
    for (let right = left + 1; right < allPlayers.length; right += 1) {
      pairKeys.push(getPairKey(allPlayers[left], allPlayers[right]));
    }
  }

  return pairKeys;
}

function getPartnerPairKeys(partition: V3DoublesPartition) {
  return [
    getPairKey(partition.team1[0], partition.team1[1]),
    getPairKey(partition.team2[0], partition.team2[1]),
  ];
}

export function buildOpponentRepeatHistory(
  matches: V3CompletedMatch[],
  {
    limit = DEFAULT_OPPONENT_REPEAT_HISTORY_LIMIT,
    decay = DEFAULT_OPPONENT_REPEAT_DECAY,
  }: {
    limit?: number;
    decay?: number;
  } = {}
): V3OpponentRepeatHistory {
  const recentMatches = getChronologicalCompletedMatches(matches).slice(-limit);
  const opponentCounts = new Map<string, number>();

  for (const [index, match] of recentMatches.entries()) {
    const recencyWeight = Math.pow(decay, recentMatches.length - index - 1);

    for (const opponentKey of getOpponentPairKeys({
      team1: match.team1,
      team2: match.team2,
    })) {
      opponentCounts.set(
        opponentKey,
        (opponentCounts.get(opponentKey) ?? 0) + recencyWeight
      );
    }
  }

  return { opponentCounts };
}

export function getOpponentRepeatPenalty(
  partition: V3DoublesPartition,
  history: V3OpponentRepeatHistory
) {
  return getOpponentPairKeys(partition).reduce((sum, opponentKey) => {
    const repeatWeight = history.opponentCounts.get(opponentKey) ?? 0;
    return sum + repeatWeight * repeatWeight;
  }, 0);
}

export function buildSocialMixHistory(
  matches: V3CompletedMatch[]
): V3SocialMixHistory {
  const sharedCourtPairs = new Set<string>();
  const partnerPairs = new Set<string>();
  const opponentPairs = new Set<string>();

  for (const match of matches) {
    const partition = {
      team1: match.team1,
      team2: match.team2,
    };

    for (const pairKey of getSharedCourtPairKeys(partition)) {
      sharedCourtPairs.add(pairKey);
    }

    for (const pairKey of getPartnerPairKeys(partition)) {
      partnerPairs.add(pairKey);
    }

    for (const pairKey of getOpponentPairKeys(partition)) {
      opponentPairs.add(pairKey);
    }
  }

  return {
    sharedCourtPairs,
    partnerPairs,
    opponentPairs,
  };
}

export function getSharedCourtRepeatPenalty(
  partition: V3DoublesPartition,
  history: V3SocialMixHistory
) {
  return getSharedCourtPairKeys(partition).reduce(
    (count, pairKey) => count + Number(history.sharedCourtPairs.has(pairKey)),
    0
  );
}

export function getPartnerCoveragePenalty(
  partition: V3DoublesPartition,
  history: V3SocialMixHistory
) {
  return getPartnerPairKeys(partition).reduce(
    (count, pairKey) => count + Number(history.partnerPairs.has(pairKey)),
    0
  );
}

export function getOpponentCoveragePenalty(
  partition: V3DoublesPartition,
  history: V3SocialMixHistory
) {
  return getOpponentPairKeys(partition).reduce(
    (count, pairKey) => count + Number(history.opponentPairs.has(pairKey)),
    0
  );
}
