export interface PairingDetailsPlayer {
  id: string;
  name: string;
  elo?: number | null;
}

export interface PairingDetailsMatch {
  id: string;
  status: string;
  createdAt: string | Date;
  completedAt?: string | Date | null;
  team1User1: PairingDetailsPlayer;
  team1User2: PairingDetailsPlayer;
  team2User1: PairingDetailsPlayer;
  team2User2: PairingDetailsPlayer;
}

export interface PairingDetailsPair {
  first: PairingDetailsPlayer;
  second: PairingDetailsPlayer;
  count: number | null;
}

export interface SessionPairingDetails {
  team1AverageRating: number | null;
  team2AverageRating: number | null;
  ratingGap: number | null;
  gamesPlayedByPlayer: Record<string, number | null>;
  sharedCourtPairs: PairingDetailsPair[];
  partnerPairs: PairingDetailsPair[];
  opponentPairs: PairingDetailsPair[];
}

const PLAYED_MATCH_STATUSES = new Set(["COMPLETED", "PENDING_APPROVAL"]);

function toTimestamp(value: string | Date | null | undefined) {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function averageRating(players: PairingDetailsPlayer[]) {
  if (players.some((player) => typeof player.elo !== "number" || !Number.isFinite(player.elo))) {
    return null;
  }

  return ((players[0].elo as number) + (players[1].elo as number)) / 2;
}

export function buildSessionPairingDetails(
  match: PairingDetailsMatch,
  sessionMatches: PairingDetailsMatch[]
): SessionPairingDetails {
  const team1 = [match.team1User1, match.team1User2] as const;
  const team2 = [match.team2User1, match.team2User2] as const;
  const allPlayers = [...team1, ...team2];
  const matchStart = toTimestamp(match.createdAt);
  const earlierStartedMatches = sessionMatches.filter((candidate) => {
    if (candidate.id === match.id || !PLAYED_MATCH_STATUSES.has(candidate.status)) {
      return false;
    }
    const candidateStart = toTimestamp(candidate.createdAt);
    return matchStart !== null && candidateStart !== null && candidateStart <= matchStart;
  });
  const uncertainEarlierMatches = earlierStartedMatches.filter(
    (candidate) => toTimestamp(candidate.completedAt) === null
  );
  const priorMatches = earlierStartedMatches.filter((candidate) => {
    const completedAt = toTimestamp(candidate.completedAt);
    return matchStart !== null && completedAt !== null && completedAt <= matchStart;
  });
  const countForPair = (first: PairingDetailsPlayer, second: PairingDetailsPlayer, mode: "shared" | "partner" | "opponent") => {
    if (matchStart === null) return null;
    const uncertainPairMatch = uncertainEarlierMatches.some((candidate) => {
      const previousTeam1 = [candidate.team1User1.id, candidate.team1User2.id];
      const previousTeam2 = [candidate.team2User1.id, candidate.team2User2.id];
      const sameTeam =
        (previousTeam1.includes(first.id) && previousTeam1.includes(second.id)) ||
        (previousTeam2.includes(first.id) && previousTeam2.includes(second.id));
      const oppositeTeams =
        (previousTeam1.includes(first.id) && previousTeam2.includes(second.id)) ||
        (previousTeam2.includes(first.id) && previousTeam1.includes(second.id));

      if (mode === "shared") return sameTeam || oppositeTeams;
      if (mode === "partner") return sameTeam;
      return oppositeTeams;
    });
    if (uncertainPairMatch) return null;
    return priorMatches.reduce((count, candidate) => {
      const previousTeam1 = [candidate.team1User1.id, candidate.team1User2.id];
      const previousTeam2 = [candidate.team2User1.id, candidate.team2User2.id];
      const sameTeam1 = previousTeam1.includes(first.id) && previousTeam1.includes(second.id);
      const sameTeam2 = previousTeam2.includes(first.id) && previousTeam2.includes(second.id);
      const oppositeTeams =
        (previousTeam1.includes(first.id) && previousTeam2.includes(second.id)) ||
        (previousTeam2.includes(first.id) && previousTeam1.includes(second.id));

      if (mode === "shared") return count + Number(sameTeam1 || sameTeam2 || oppositeTeams);
      if (mode === "partner") return count + Number(sameTeam1 || sameTeam2);
      return count + Number(oppositeTeams);
    }, 0);
  };
  const makePair = (
    first: PairingDetailsPlayer,
    second: PairingDetailsPlayer,
    mode: "shared" | "partner" | "opponent"
  ): PairingDetailsPair => ({
    first,
    second,
    count: countForPair(first, second, mode),
  });
  const team1AverageRating = averageRating([...team1]);
  const team2AverageRating = averageRating([...team2]);

  return {
    team1AverageRating,
    team2AverageRating,
    ratingGap:
      team1AverageRating === null || team2AverageRating === null
        ? null
        : Math.abs(team1AverageRating - team2AverageRating),
    gamesPlayedByPlayer: Object.fromEntries(
      allPlayers.map((player) => [
        player.id,
        matchStart === null ||
        uncertainEarlierMatches.some((candidate) =>
          [
            candidate.team1User1.id,
            candidate.team1User2.id,
            candidate.team2User1.id,
            candidate.team2User2.id,
          ].includes(player.id)
        )
          ? null
          : priorMatches.filter((candidate) =>
              [
                candidate.team1User1.id,
                candidate.team1User2.id,
                candidate.team2User1.id,
                candidate.team2User2.id,
              ].includes(player.id)
            ).length,
      ])
    ),
    sharedCourtPairs: [
      makePair(team1[0], team1[1], "shared"),
      makePair(team1[0], team2[0], "shared"),
      makePair(team1[0], team2[1], "shared"),
      makePair(team1[1], team2[0], "shared"),
      makePair(team1[1], team2[1], "shared"),
      makePair(team2[0], team2[1], "shared"),
    ],
    partnerPairs: [
      makePair(team1[0], team1[1], "partner"),
      makePair(team2[0], team2[1], "partner"),
    ],
    opponentPairs: [
      makePair(team1[0], team2[0], "opponent"),
      makePair(team1[0], team2[1], "opponent"),
      makePair(team1[1], team2[0], "opponent"),
      makePair(team1[1], team2[1], "opponent"),
    ],
  };
}
