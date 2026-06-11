export interface RestTurnPlayer {
  userId: string;
  availableSince?: Date | string | null;
}

export interface RestTurnCompletedMatch {
  team1: [string, string];
  team2: [string, string];
  completedAt?: Date | string | null;
}

function toTime(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();

  return Number.isNaN(time) ? null : time;
}

function getCompletedMatchPlayerIds(match: RestTurnCompletedMatch) {
  return new Set([
    match.team1[0],
    match.team1[1],
    match.team2[0],
    match.team2[1],
  ]);
}

export function calculateRestTurnsForPlayer(
  player: RestTurnPlayer,
  completedMatches: RestTurnCompletedMatch[]
) {
  const availableSinceTime = toTime(player.availableSince) ?? 0;

  return completedMatches.reduce((restTurns, match) => {
    const completedAtTime = toTime(match.completedAt);
    if (
      completedAtTime === null ||
      completedAtTime <= availableSinceTime ||
      getCompletedMatchPlayerIds(match).has(player.userId)
    ) {
      return restTurns;
    }

    return restTurns + 1;
  }, 0);
}

export function buildRestTurnsByUserId(
  players: RestTurnPlayer[],
  completedMatches: RestTurnCompletedMatch[]
) {
  return new Map(
    players.map((player) => [
      player.userId,
      calculateRestTurnsForPlayer(player, completedMatches),
    ])
  );
}
