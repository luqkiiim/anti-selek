import { SessionMode, SessionType } from "../../../types/enums";
import { getNeutralMatchmakingBaseline } from "./entry";
import { findBestBatchSelectionV3 } from "./batch";
import { DEFAULT_MATCH_DURATION_MS } from "./fairness";
import { findBestSingleCourtSelectionV3 } from "./singleCourt";

import type {
  ActiveMatchmakerV3Player,
  MatchmakerV3Player,
  V3CompletedMatch,
  V3SingleCourtSelection,
} from "./types";

export interface V3SimulationPlayer extends MatchmakerV3Player {
  joinedAt: Date;
}

export interface V3SimulationState<
  T extends V3SimulationPlayer = V3SimulationPlayer,
> {
  players: T[];
  completedMatches: V3CompletedMatch[];
  now: number;
  matchDurationMs: number;
}

export interface V3SimulationRound<
  T extends V3SimulationPlayer = V3SimulationPlayer,
> {
  selections: V3SingleCourtSelection<ActiveMatchmakerV3Player<T>>[];
  roundEnd: Date;
}

export function createSimulationPlayers(
  count: number,
  {
    joinedAt = new Date("2026-03-18T00:00:00Z"),
    baseStrength = 1000,
    strengthStep = 10,
  }: {
    joinedAt?: Date;
    baseStrength?: number;
    strengthStep?: number;
  } = {}
): V3SimulationPlayer[] {
  return Array.from({ length: count }, (_value, index) => ({
    userId: `P${index + 1}`,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    availableSince: joinedAt,
    strength: baseStrength + (count - index) * strengthStep,
    isBusy: false,
    isPaused: false,
    gender: "MALE",
    partnerPreference: "OPEN",
    lastPartnerId: null,
    joinedAt,
  }));
}

export function createSimulationState<T extends V3SimulationPlayer>(
  players: T[],
  {
    now = players[0]?.availableSince.getTime() ?? Date.now(),
    matchDurationMs = DEFAULT_MATCH_DURATION_MS,
  }: {
    now?: number;
    matchDurationMs?: number;
  } = {}
): V3SimulationState<T> {
  return {
    players,
    completedMatches: [],
    now,
    matchDurationMs,
  };
}

export function pausePlayers<T extends V3SimulationPlayer>(
  state: V3SimulationState<T>,
  userIds: string[]
) {
  const pausedUserIds = new Set(userIds);

  state.players = state.players.map((player) =>
    pausedUserIds.has(player.userId) ? { ...player, isPaused: true } : player
  );
}

export function resumePlayers<T extends V3SimulationPlayer>(
  state: V3SimulationState<T>,
  userIds: string[],
  {
    randomFn = () => 0,
  }: {
    randomFn?: () => number;
  } = {}
) {
  const resumedUserIds = new Set(userIds);
  const activePlayers = state.players.filter(
    (player) => !player.isPaused && !player.isBusy && !resumedUserIds.has(player.userId)
  );
  const neutralBaseline = getNeutralMatchmakingBaseline(activePlayers, {
    now: state.now,
    randomFn,
  });

  state.players = state.players.map((player) =>
    resumedUserIds.has(player.userId)
      ? {
          ...player,
          isPaused: false,
          matchmakingBaseline: Math.max(
            player.matchmakingBaseline,
            neutralBaseline
          ),
          availableSince: new Date(state.now),
        }
      : player
  );
}

export function addLateJoiner<T extends V3SimulationPlayer>(
  state: V3SimulationState<T>,
  player: T,
  {
    randomFn = () => 0,
  }: {
    randomFn?: () => number;
  } = {}
) {
  const activePlayers = state.players.filter(
    (candidate) => !candidate.isPaused && !candidate.isBusy
  );
  const neutralBaseline = getNeutralMatchmakingBaseline(activePlayers, {
    now: state.now,
    randomFn,
  });

  state.players = [
    ...state.players,
    {
      ...player,
      matchmakingBaseline: Math.max(
        player.matchmakingBaseline,
        neutralBaseline
      ),
      availableSince: new Date(state.now),
      joinedAt: new Date(state.now),
    },
  ];
}

export function chooseRoundSelections<T extends V3SimulationPlayer>(
  state: V3SimulationState<T>,
  {
    courtCount,
    sessionMode,
    sessionType,
    randomFn = () => 0,
  }: {
    courtCount: number;
    sessionMode: SessionMode;
    sessionType: SessionType;
    randomFn?: () => number;
  }
): V3SingleCourtSelection<ActiveMatchmakerV3Player<T>>[] {
  if (courtCount <= 1) {
    const result = findBestSingleCourtSelectionV3(state.players, {
      sessionMode,
      sessionType,
      completedMatches: state.completedMatches,
      now: state.now,
      matchDurationMs: state.matchDurationMs,
      randomFn,
    });

    return result.selection ? [result.selection] : [];
  }

  const result = findBestBatchSelectionV3(state.players, {
    courtCount,
    sessionMode,
    sessionType,
    completedMatches: state.completedMatches,
    now: state.now,
    matchDurationMs: state.matchDurationMs,
    randomFn,
  });

  return result.selection?.selections ?? [];
}

export function applyRoundSelections<T extends V3SimulationPlayer>(
  state: V3SimulationState<T>,
  selections: V3SingleCourtSelection<ActiveMatchmakerV3Player<T>>[]
): V3SimulationRound<T> {
  const roundEnd = new Date(state.now + state.matchDurationMs);
  const partnerByUserId = new Map<string, string>();

  for (const selection of selections) {
    partnerByUserId.set(selection.partition.team1[0], selection.partition.team1[1]);
    partnerByUserId.set(selection.partition.team1[1], selection.partition.team1[0]);
    partnerByUserId.set(selection.partition.team2[0], selection.partition.team2[1]);
    partnerByUserId.set(selection.partition.team2[1], selection.partition.team2[0]);
  }

  const selectedIds = new Set(selections.flatMap((selection) => selection.ids));

  state.players = state.players.map((player) =>
    selectedIds.has(player.userId)
      ? {
          ...player,
          matchesPlayed: player.matchesPlayed + 1,
          availableSince: roundEnd,
          lastPartnerId: partnerByUserId.get(player.userId) ?? null,
        }
      : player
  );

  state.completedMatches.push(
    ...selections.map((selection) => ({
      team1: selection.partition.team1,
      team2: selection.partition.team2,
      completedAt: roundEnd,
    }))
  );
  state.now += state.matchDurationMs;

  return {
    selections,
    roundEnd,
  };
}

export function playRound<T extends V3SimulationPlayer>(
  state: V3SimulationState<T>,
  {
    courtCount,
    sessionMode,
    sessionType,
    randomFn = () => 0,
  }: {
    courtCount: number;
    sessionMode: SessionMode;
    sessionType: SessionType;
    randomFn?: () => number;
  }
) {
  const selections = chooseRoundSelections(state, {
    courtCount,
    sessionMode,
    sessionType,
    randomFn,
  });

  return applyRoundSelections(state, selections);
}

export function getCourtGroupCounts(
  selections: Array<Pick<V3SingleCourtSelection, "ids">>,
  userIds: string[]
) {
  const targetUserIds = new Set(userIds);

  return selections.map(
    (selection) => selection.ids.filter((id) => targetUserIds.has(id)).length
  );
}

export function getMatchCounts<T extends Pick<V3SimulationPlayer, "userId" | "matchesPlayed">>(
  players: T[]
) {
  return Object.fromEntries(
    players.map((player) => [player.userId, player.matchesPlayed])
  ) as Record<string, number>;
}
