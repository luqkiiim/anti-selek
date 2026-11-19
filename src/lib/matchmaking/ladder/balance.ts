import {
  MixedSide,
  PlayerGender,
  SessionMode,
} from "../../../types/enums";
import { getEffectiveMixedSide } from "@/lib/mixedSide";

import type {
  LadderBalancedPartition,
  LadderDoublesPartition,
  MatchmakerLadderPlayer,
} from "./types";

type LadderBalancedPartitionEvaluation = LadderBalancedPartition & {
  pointDiffGap: number;
  strengthGap: number;
  mixedSideGap: number;
};

export function hasLegalEffectiveMixedSides(
  partition: LadderDoublesPartition,
  getSide: (id: string) => MixedSide | null | undefined,
) {
  const a = getSide(partition.team1[0]);
  const b = getSide(partition.team1[1]);
  const c = getSide(partition.team2[0]);
  const d = getSide(partition.team2[1]);
  return Boolean(a && b && c && d) &&
    Number(a === MixedSide.LOWER) + Number(b === MixedSide.LOWER) ===
    Number(c === MixedSide.LOWER) + Number(d === MixedSide.LOWER);
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
  T extends Pick<
    MatchmakerLadderPlayer,
    "gender" | "partnerPreference" | "mixedSideOverride"
  >,
>(
  partition: LadderDoublesPartition,
  playersById: Map<string, T>,
  sessionMode: SessionMode
) {
  if (sessionMode !== SessionMode.MIXICANO) {
    return true;
  }

  return hasLegalEffectiveMixedSides(partition, (id) => {
    const player = playersById.get(id);
    return player ? getEffectiveMixedSide(player) : null;
  });
}

function getPartitionMixedSideGap<
  T extends Pick<
    MatchmakerLadderPlayer,
    "strength" | "gender" | "partnerPreference" | "mixedSideOverride"
  >,
>(partition: LadderDoublesPartition, playersById: Map<string, T>) {
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
  const sides = teams.map((team) =>
    team.map((player) =>
      getEffectiveMixedSide({
        gender: player.gender as PlayerGender,
        mixedSideOverride: player.mixedSideOverride,
        partnerPreference: player.partnerPreference,
      })
    )
  );

  if (
    sides.some((team) => team.some((side) => side === null)) ||
    !sides.every(
      (team) =>
        team.includes("UPPER" as typeof team[number]) &&
        team.includes("LOWER" as typeof team[number])
    )
  ) {
    return 0;
  }

  const [team1Upper, team1Lower] =
    sides[0][0] === "UPPER"
      ? [teams[0][0], teams[0][1]]
      : [teams[0][1], teams[0][0]];
  const [team2Upper, team2Lower] =
    sides[1][0] === "UPPER"
      ? [teams[1][0], teams[1][1]]
      : [teams[1][1], teams[1][0]];

  return (
    Math.abs(team1Upper.strength - team2Upper.strength) +
    Math.abs(team1Lower.strength - team2Lower.strength)
  );
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
      mixedSideGap:
        sessionMode === SessionMode.MIXICANO
          ? getPartitionMixedSideGap(partition, playersById)
          : 0,
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
      left.mixedSideGap - right.mixedSideGap ||
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
