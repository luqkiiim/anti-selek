import { SessionMode } from "../../../types/enums";
import { applyNeutralLadderEntry } from "./entry";
import { findBestBatchSelectionLadder } from "./batch";
import { DEFAULT_MATCH_DURATION_MS } from "./fairness";
import { findBestSingleCourtSelectionLadder } from "./singleCourt";

import type {
  ActiveMatchmakerLadderPlayer,
  LadderHistoryMatch,
  LadderSingleCourtSelection,
  MatchmakerLadderPlayer,
} from "./types";

export interface LadderSimulationPlayer extends MatchmakerLadderPlayer {
  joinedAt: Date;
}

export interface LadderSimulationState<
  T extends LadderSimulationPlayer = LadderSimulationPlayer,
> {
  players: T[];
  completedMatches: LadderHistoryMatch[];
  now: number;
  matchDurationMs: number;
}

export interface LadderSimulationRound<
  T extends LadderSimulationPlayer = LadderSimulationPlayer,
> {
  selections: LadderSingleCourtSelection<ActiveMatchmakerLadderPlayer<T>>[];
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
): LadderSimulationPlayer[] {
  return Array.from({ length: count }, (_value, index) => ({
    userId: `P${index + 1}`,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    availableSince: joinedAt,
    strength: baseStrength + (count - index) * strengthStep,
    wins: 0,
    losses: 0,
    pointDiff: 0,
    ladderScore: 0,
    isBusy: false,
    isPaused: false,
    gender: "MALE",
    partnerPreference: "OPEN",
    lastPartnerId: null,
    joinedAt,
  }));
}

export function createSimulationState<T extends LadderSimulationPlayer>(
  players: T[],
  {
    now = players[0]?.availableSince.getTime() ?? Date.now(),
    matchDurationMs = DEFAULT_MATCH_DURATION_MS,
  }: {
    now?: number;
    matchDurationMs?: number;
  } = {}
): LadderSimulationState<T> {
  return {
    players,
    completedMatches: [],
    now,
    matchDurationMs,
  };
}

export function pausePlayers<T extends LadderSimulationPlayer>(
  state: LadderSimulationState<T>,
  userIds: string[]
) {
  const pausedUserIds = new Set(userIds);

  state.players = state.players.map((player) =>
    pausedUserIds.has(player.userId) ? { ...player, isPaused: true } : player
  );
}

export function resumePlayers<T extends LadderSimulationPlayer>(
  state: LadderSimulationState<T>,
  userIds: string[],
  {
    randomFn = () => 0,
  }: {
    randomFn?: () => number;
  } = {}
) {
  const resumedUserIds = new Set(userIds);
  const activePlayers = state.players.filter(
    (player) =>
      !player.isPaused && !player.isBusy && !resumedUserIds.has(player.userId)
  );

  state.players = state.players.map((player) =>
    resumedUserIds.has(player.userId)
      ? applyNeutralLadderEntry(player, activePlayers, {
          now: state.now,
          randomFn,
        })
      : player
  );
}

export function addLateJoiner<T extends LadderSimulationPlayer>(
  state: LadderSimulationState<T>,
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

  state.players = [
    ...state.players,
    {
      ...applyNeutralLadderEntry(player, activePlayers, {
        now: state.now,
        randomFn,
      }),
      joinedAt: new Date(state.now),
    },
  ];
}

function scoreSelection<T extends ActiveMatchmakerLadderPlayer>(
  selection: LadderSingleCourtSelection<T>
) {
  const team1Players = selection.players.filter((player) =>
    selection.partition.team1.includes(player.userId)
  );
  const team2Players = selection.players.filter((player) =>
    selection.partition.team2.includes(player.userId)
  );
  const team1Strength = team1Players.reduce(
    (sum, player) => sum + player.strength,
    0
  );
  const team2Strength = team2Players.reduce(
    (sum, player) => sum + player.strength,
    0
  );

  if (team1Strength >= team2Strength) {
    return { team1Score: 21, team2Score: 17 };
  }

  return { team1Score: 17, team2Score: 21 };
}

export function chooseRoundSelections<T extends LadderSimulationPlayer>(
  state: LadderSimulationState<T>,
  {
    courtCount,
    sessionMode,
    randomFn = () => 0,
  }: {
    courtCount: number;
    sessionMode: SessionMode;
    randomFn?: () => number;
  }
): LadderSingleCourtSelection<ActiveMatchmakerLadderPlayer<T>>[] {
  if (courtCount <= 1) {
    const result = findBestSingleCourtSelectionLadder(state.players, {
      sessionMode,
      now: state.now,
      matchDurationMs: state.matchDurationMs,
      randomFn,
    });

    return result.selection ? [result.selection] : [];
  }

  const result = findBestBatchSelectionLadder(state.players, {
    courtCount,
    sessionMode,
    now: state.now,
    matchDurationMs: state.matchDurationMs,
    randomFn,
  });

  return result.selection?.selections ?? [];
}

export function applyRoundSelections<T extends LadderSimulationPlayer>(
  state: LadderSimulationState<T>,
  selections: LadderSingleCourtSelection<ActiveMatchmakerLadderPlayer<T>>[]
): LadderSimulationRound<T> {
  const roundEnd = new Date(state.now + state.matchDurationMs);
  const partnerByUserId = new Map<string, string>();
  const updatesByUserId = new Map<
    string,
    { wins: number; losses: number; pointDiff: number }
  >();

  for (const selection of selections) {
    partnerByUserId.set(selection.partition.team1[0], selection.partition.team1[1]);
    partnerByUserId.set(selection.partition.team1[1], selection.partition.team1[0]);
    partnerByUserId.set(selection.partition.team2[0], selection.partition.team2[1]);
    partnerByUserId.set(selection.partition.team2[1], selection.partition.team2[0]);

    const { team1Score, team2Score } = scoreSelection(selection);
    const team1Diff = team1Score - team2Score;
    const team2Diff = team2Score - team1Score;
    const team1Won = team1Score > team2Score;
    const team2Won = team2Score > team1Score;

    for (const userId of selection.partition.team1) {
      updatesByUserId.set(userId, {
        wins: team1Won ? 1 : 0,
        losses: team2Won ? 1 : 0,
        pointDiff: team1Diff,
      });
    }

    for (const userId of selection.partition.team2) {
      updatesByUserId.set(userId, {
        wins: team2Won ? 1 : 0,
        losses: team1Won ? 1 : 0,
        pointDiff: team2Diff,
      });
    }

    state.completedMatches.push({
      team1: selection.partition.team1,
      team2: selection.partition.team2,
      team1Score,
      team2Score,
      status: "COMPLETED",
      completedAt: roundEnd,
    });
  }

  const selectedIds = new Set(selections.flatMap((selection) => selection.ids));

  state.players = state.players.map((player) => {
    if (!selectedIds.has(player.userId)) {
      return player;
    }

    const updates = updatesByUserId.get(player.userId) ?? {
      wins: 0,
      losses: 0,
      pointDiff: 0,
    };
    const wins = player.wins + updates.wins;
    const losses = player.losses + updates.losses;

    return {
      ...player,
      matchesPlayed: player.matchesPlayed + 1,
      wins,
      losses,
      pointDiff: player.pointDiff + updates.pointDiff,
      ladderScore: wins - losses,
      availableSince: roundEnd,
      lastPartnerId: partnerByUserId.get(player.userId) ?? null,
    };
  });

  state.now += state.matchDurationMs;

  return {
    selections,
    roundEnd,
  };
}

export function playRound<T extends LadderSimulationPlayer>(
  state: LadderSimulationState<T>,
  {
    courtCount,
    sessionMode,
    randomFn = () => 0,
  }: {
    courtCount: number;
    sessionMode: SessionMode;
    randomFn?: () => number;
  }
) {
  const selections = chooseRoundSelections(state, {
    courtCount,
    sessionMode,
    randomFn,
  });

  return applyRoundSelections(state, selections);
}

export function getCourtGroupCounts(
  selections: Array<Pick<LadderSingleCourtSelection, "ids">>,
  userIds: string[]
) {
  const targetUserIds = new Set(userIds);

  return selections.map(
    (selection) => selection.ids.filter((id) => targetUserIds.has(id)).length
  );
}

export function getMatchCounts<
  T extends Pick<LadderSimulationPlayer, "userId" | "matchesPlayed">,
>(players: T[]) {
  return Object.fromEntries(
    players.map((player) => [player.userId, player.matchesPlayed])
  ) as Record<string, number>;
}
