import { getEffectiveMixedSide } from "@/lib/mixedSide";
import { PlayerGender, SessionMode } from "../../../types/enums";

import type {
  MatchmakerV3Player,
  V3BalancedPartition,
  V3DoublesPartition,
} from "./types";

function inferMixicanoMatchType(
  team1: [{ effectiveMixedSide?: string | null }, { effectiveMixedSide?: string | null }],
  team2: [{ effectiveMixedSide?: string | null }, { effectiveMixedSide?: string | null }]
) {
  const lowerCountFor = (
    team: [
      { effectiveMixedSide?: string | null },
      { effectiveMixedSide?: string | null },
    ]
  ) => team.filter((player) => player.effectiveMixedSide === "LOWER").length;

  const team1LowerCount = lowerCountFor(team1);
  const team2LowerCount = lowerCountFor(team2);

  if (team1LowerCount === 2 && team2LowerCount === 2) {
    return "WOMENS";
  }

  if (team1LowerCount === 1 && team2LowerCount === 1) {
    return "MIXED";
  }

  if (team1LowerCount === 0 && team2LowerCount === 0) {
    return "MENS";
  }

  return "HYBRID";
}

function isValidMixicanoPartition<
  T extends Pick<
    MatchmakerV3Player,
    "gender" | "partnerPreference" | "mixedSideOverride"
  >,
>(
  team1: [T, T],
  team2: [T, T]
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
      { effectiveMixedSide?: string | null },
      { effectiveMixedSide?: string | null },
    ],
    effectiveTeam2 as [
      { effectiveMixedSide?: string | null },
      { effectiveMixedSide?: string | null },
    ]
  );

  return matchType !== "HYBRID";
}

export function getDoublesPartitions(
  playerIds: [string, string, string, string]
): V3DoublesPartition[] {
  const [a, b, c, d] = playerIds;

  return [
    { team1: [a, b], team2: [c, d] },
    { team1: [a, c], team2: [b, d] },
    { team1: [a, d], team2: [b, c] },
  ];
}

export function isValidPartitionForMode<
  T extends Pick<
    MatchmakerV3Player,
    "gender" | "partnerPreference" | "mixedSideOverride"
  >,
>(
  partition: V3DoublesPartition,
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

  return isValidMixicanoPartition(
    [player1, player2],
    [player3, player4]
  );
}

function getPartitionMixedSideGap<
  T extends Pick<
    MatchmakerV3Player,
    "strength" | "gender" | "partnerPreference" | "mixedSideOverride"
  >,
>(partition: V3DoublesPartition, playersById: Map<string, T>) {
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
  T extends Pick<MatchmakerV3Player, "strength">,
>(partition: V3DoublesPartition, playersById: Map<string, T>) {
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

export function evaluateBalancedPartitions<T extends MatchmakerV3Player>(
  playerIds: [string, string, string, string],
  playersById: Map<string, T>,
  sessionMode: SessionMode
): V3BalancedPartition[] {
  const evaluations: V3BalancedPartition[] = [];

  for (const partition of getDoublesPartitions(playerIds)) {
    if (!isValidPartitionForMode(partition, playersById, sessionMode)) {
      continue;
    }

    const balanceGap = getPartitionBalanceGap(partition, playersById);
    if (balanceGap === null) {
      continue;
    }

    evaluations.push({
      partition,
      balanceGap,
      mixedSideGap:
        sessionMode === SessionMode.MIXICANO
          ? getPartitionMixedSideGap(partition, playersById)
          : 0,
    });
  }

  return evaluations;
}

export function findBestBalancedPartition<T extends MatchmakerV3Player>(
  playerIds: [string, string, string, string],
  playersById: Map<string, T>,
  sessionMode: SessionMode
) {
  return evaluateBalancedPartitions(playerIds, playersById, sessionMode).sort(
    (left, right) =>
      left.balanceGap - right.balanceGap ||
      left.mixedSideGap - right.mixedSideGap
  )[0] ?? null;
}
