import {
  PartnerPreference,
  PlayerGender,
  SessionMode,
} from "../../../types/enums";

import type {
  LadderBalancedPartition,
  LadderDoublesPartition,
  MatchmakerLadderPlayer,
} from "./types";

type LadderBalancedPartitionEvaluation = LadderBalancedPartition & {
  pointDiffGap: number;
  strengthGap: number;
};

function inferMixedMatchType(
  team1: [{ gender?: string }, { gender?: string }],
  team2: [{ gender?: string }, { gender?: string }]
) {
  const femaleCountFor = (team: [{ gender?: string }, { gender?: string }]) =>
    team.filter((player) => player.gender === PlayerGender.FEMALE).length;

  const team1FemaleCount = femaleCountFor(team1);
  const team2FemaleCount = femaleCountFor(team2);

  if (team1FemaleCount === 2 && team2FemaleCount === 2) {
    return "WOMENS";
  }

  if (team1FemaleCount === 1 && team2FemaleCount === 1) {
    return "MIXED";
  }

  if (team1FemaleCount === 0 && team2FemaleCount === 0) {
    return "MENS";
  }

  return "HYBRID";
}

function isValidMixedPartition<
  T extends Pick<MatchmakerLadderPlayer, "gender" | "partnerPreference">,
>(team1: [T, T], team2: [T, T]) {
  const players = [...team1, ...team2];

  if (
    players.some(
      (player) =>
        ![PlayerGender.MALE, PlayerGender.FEMALE].includes(
          player.gender as PlayerGender
        )
    )
  ) {
    return false;
  }

  const matchType = inferMixedMatchType(team1, team2);

  return !players.some(
    (player) =>
      player.gender === PlayerGender.FEMALE &&
      player.partnerPreference === PartnerPreference.FEMALE_FLEX &&
      !["MIXED", "WOMENS"].includes(matchType)
  );
}

export function getDoublesPartitions(
  playerIds: [string, string, string, string]
): LadderDoublesPartition[] {
  const [a, b, c, d] = playerIds;

  return [
    { team1: [a, b], team2: [c, d] },
    { team1: [a, c], team2: [b, d] },
    { team1: [a, d], team2: [b, c] },
  ];
}

export function isValidPartitionForMode<
  T extends Pick<MatchmakerLadderPlayer, "gender" | "partnerPreference">,
>(
  partition: LadderDoublesPartition,
  playersById: Map<string, T>,
  sessionMode: SessionMode
) {
  if (sessionMode !== SessionMode.MIXICANO) {
    return true;
  }

  const player1 = playersById.get(partition.team1[0]);
  const player2 = playersById.get(partition.team1[1]);
  const player3 = playersById.get(partition.team2[0]);
  const player4 = playersById.get(partition.team2[1]);

  if (!player1 || !player2 || !player3 || !player4) {
    return false;
  }

  return isValidMixedPartition([player1, player2], [player3, player4]);
}

export function getPartitionBalanceGap<
  T extends Pick<MatchmakerLadderPlayer, "ladderScore">,
>(partition: LadderDoublesPartition, playersById: Map<string, T>) {
  const player1 = playersById.get(partition.team1[0]);
  const player2 = playersById.get(partition.team1[1]);
  const player3 = playersById.get(partition.team2[0]);
  const player4 = playersById.get(partition.team2[1]);

  if (!player1 || !player2 || !player3 || !player4) {
    return null;
  }

  const team1LadderTotal = player1.ladderScore + player2.ladderScore;
  const team2LadderTotal = player3.ladderScore + player4.ladderScore;

  return Math.abs(team1LadderTotal - team2LadderTotal);
}

function getPartitionStrengthGap<
  T extends Pick<MatchmakerLadderPlayer, "strength">,
>(partition: LadderDoublesPartition, playersById: Map<string, T>) {
  const player1 = playersById.get(partition.team1[0]);
  const player2 = playersById.get(partition.team1[1]);
  const player3 = playersById.get(partition.team2[0]);
  const player4 = playersById.get(partition.team2[1]);

  if (!player1 || !player2 || !player3 || !player4) {
    return null;
  }

  const team1AverageStrength = (player1.strength + player2.strength) / 2;
  const team2AverageStrength = (player3.strength + player4.strength) / 2;

  return Math.abs(team1AverageStrength - team2AverageStrength);
}

function getPartitionPointDiffGap<
  T extends Pick<MatchmakerLadderPlayer, "pointDiff">,
>(partition: LadderDoublesPartition, playersById: Map<string, T>) {
  const player1 = playersById.get(partition.team1[0]);
  const player2 = playersById.get(partition.team1[1]);
  const player3 = playersById.get(partition.team2[0]);
  const player4 = playersById.get(partition.team2[1]);

  if (!player1 || !player2 || !player3 || !player4) {
    return null;
  }

  const team1AveragePointDiff = (player1.pointDiff + player2.pointDiff) / 2;
  const team2AveragePointDiff = (player3.pointDiff + player4.pointDiff) / 2;

  return Math.abs(team1AveragePointDiff - team2AveragePointDiff);
}

export function evaluateBalancedPartitions<T extends MatchmakerLadderPlayer>(
  playerIds: [string, string, string, string],
  playersById: Map<string, T>,
  sessionMode: SessionMode
): LadderBalancedPartitionEvaluation[] {
  const evaluations: LadderBalancedPartitionEvaluation[] = [];

  for (const partition of getDoublesPartitions(playerIds)) {
    if (!isValidPartitionForMode(partition, playersById, sessionMode)) {
      continue;
    }

    const balanceGap = getPartitionBalanceGap(partition, playersById);
    const pointDiffGap = getPartitionPointDiffGap(partition, playersById);
    const strengthGap = getPartitionStrengthGap(partition, playersById);
    if (
      balanceGap === null ||
      pointDiffGap === null ||
      strengthGap === null
    ) {
      continue;
    }

    evaluations.push({
      partition,
      balanceGap,
      pointDiffGap,
      strengthGap,
    });
  }

  return evaluations;
}

export function findBestBalancedPartition<T extends MatchmakerLadderPlayer>(
  playerIds: [string, string, string, string],
  playersById: Map<string, T>,
  sessionMode: SessionMode
) {
  const bestEvaluation = evaluateBalancedPartitions(
    playerIds,
    playersById,
    sessionMode
  ).sort(
    (left, right) =>
      left.balanceGap - right.balanceGap ||
      left.pointDiffGap - right.pointDiffGap ||
      left.strengthGap - right.strengthGap
  )[0];

  if (!bestEvaluation) {
    return null;
  }

  return {
    partition: bestEvaluation.partition,
    balanceGap: bestEvaluation.balanceGap,
    pointDiffGap: bestEvaluation.pointDiffGap,
    strengthGap: bestEvaluation.strengthGap,
  };
}
