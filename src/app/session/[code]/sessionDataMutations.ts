"use client";

import { getStandingPointsForTeam } from "@/lib/sessionStandings";
import { hasQueuedMatchUser } from "@/lib/sessionQueue";
import type {
  CompletedMatchInfo,
  Match,
  Player,
  QueuedMatch,
  SessionData,
} from "@/components/session/sessionTypes";
import { SessionType } from "@/types/enums";

type LiveMatch = NonNullable<SessionData["courts"][number]["currentMatch"]>;

interface MatchParticipant {
  id: string;
  name: string;
}

interface MatchPayload {
  id: string;
  courtId?: string | null;
  status: string;
  winnerTeam?: number | null;
  team1Score?: number | null;
  team2Score?: number | null;
  team1EloChange?: number | null;
  team2EloChange?: number | null;
  completedAt?: string | Date | null;
  scoreSubmittedByUserId?: string | null;
  team1User1Id?: string;
  team1User2Id?: string;
  team2User1Id?: string;
  team2User2Id?: string;
  team1User1?: MatchParticipant;
  team1User2?: MatchParticipant;
  team2User1?: MatchParticipant;
  team2User2?: MatchParticipant;
}

interface SessionSnapshotLike {
  status?: string;
  courts?: Array<{
    id: string;
    courtNumber: number;
    label?: string | null;
    currentMatch: MatchPayload | null;
  }>;
  players?: SessionData["players"];
  matches?: SessionData["matches"];
  queuedMatch?: QueuedMatch | null;
}

interface GuestPayload {
  id: string;
  name: string;
  elo: number;
  isGuest: boolean;
  ladderEntryAt?: string;
  gender: Player["gender"];
  partnerPreference: Player["partnerPreference"];
}

interface SessionPlayerPayload {
  userId: string;
  gender: Player["gender"];
  partnerPreference: Player["partnerPreference"];
}

function normalizeOptionalNumber(value: number | null | undefined) {
  return typeof value === "number" ? value : undefined;
}

function normalizeOptionalDate(value: string | Date | null | undefined) {
  if (!value) return undefined;
  return typeof value === "string" ? value : value.toISOString();
}

function buildLiveMatch(
  sessionData: SessionData,
  payload: MatchPayload,
  fallbackMatch: Match | null = null
): LiveMatch | null {
  const playerById = new Map(
    sessionData.players.map((player) => [player.userId, player.user])
  );

  const team1User1Id = payload.team1User1?.id ?? payload.team1User1Id ?? fallbackMatch?.team1User1.id;
  const team1User2Id = payload.team1User2?.id ?? payload.team1User2Id ?? fallbackMatch?.team1User2.id;
  const team2User1Id = payload.team2User1?.id ?? payload.team2User1Id ?? fallbackMatch?.team2User1.id;
  const team2User2Id = payload.team2User2?.id ?? payload.team2User2Id ?? fallbackMatch?.team2User2.id;

  if (!team1User1Id || !team1User2Id || !team2User1Id || !team2User2Id) {
    return null;
  }

  const team1User1 = payload.team1User1 ?? fallbackMatch?.team1User1 ?? playerById.get(team1User1Id);
  const team1User2 = payload.team1User2 ?? fallbackMatch?.team1User2 ?? playerById.get(team1User2Id);
  const team2User1 = payload.team2User1 ?? fallbackMatch?.team2User1 ?? playerById.get(team2User1Id);
  const team2User2 = payload.team2User2 ?? fallbackMatch?.team2User2 ?? playerById.get(team2User2Id);

  if (!team1User1 || !team1User2 || !team2User1 || !team2User2) {
    return null;
  }

  return {
    id: payload.id,
    status: payload.status,
    scoreSubmittedByUserId: payload.scoreSubmittedByUserId ?? null,
    team1User1,
    team1User2,
    team2User1,
    team2User2,
    team1Score: normalizeOptionalNumber(payload.team1Score),
    team2Score: normalizeOptionalNumber(payload.team2Score),
    completedAt: normalizeOptionalDate(payload.completedAt),
  };
}

function buildCompletedMatchInfo(
  payload: MatchPayload,
  fallbackMatch: Match | null = null
): CompletedMatchInfo | null {
  const team1User1Id = payload.team1User1Id ?? payload.team1User1?.id ?? fallbackMatch?.team1User1.id;
  const team1User2Id = payload.team1User2Id ?? payload.team1User2?.id ?? fallbackMatch?.team1User2.id;
  const team2User1Id = payload.team2User1Id ?? payload.team2User1?.id ?? fallbackMatch?.team2User1.id;
  const team2User2Id = payload.team2User2Id ?? payload.team2User2?.id ?? fallbackMatch?.team2User2.id;

  if (!team1User1Id || !team1User2Id || !team2User1Id || !team2User2Id) {
    return null;
  }

  return {
    id: payload.id,
    team1User1Id,
    team1User2Id,
    team2User1Id,
    team2User2Id,
    team1Score: normalizeOptionalNumber(payload.team1Score),
    team2Score: normalizeOptionalNumber(payload.team2Score),
    winnerTeam:
      typeof payload.winnerTeam === "number" ? payload.winnerTeam : 0,
    status: payload.status,
    completedAt: normalizeOptionalDate(payload.completedAt),
  };
}

function buildQueuedMatch(
  sessionData: SessionData,
  queuedMatch: QueuedMatch | null | undefined
) {
  if (!queuedMatch) {
    return null;
  }

  return {
    id: queuedMatch.id,
    createdAt: normalizeOptionalDate(queuedMatch.createdAt),
    team1User1: queuedMatch.team1User1,
    team1User2: queuedMatch.team1User2,
    team2User1: queuedMatch.team2User1,
    team2User2: queuedMatch.team2User2,
  };
}

function upsertHistoryMatch(
  matches: SessionData["matches"] | undefined,
  nextMatch: CompletedMatchInfo
) {
  const filteredMatches = (matches ?? []).filter((match) => match.id !== nextMatch.id);
  const nextMatches = [nextMatch, ...filteredMatches];

  return nextMatches.sort((matchA, matchB) => {
    const timeA = matchA.completedAt ? new Date(matchA.completedAt).getTime() : 0;
    const timeB = matchB.completedAt ? new Date(matchB.completedAt).getTime() : 0;
    return timeB - timeA;
  });
}

function updatePlayersForCompletedMatch(
  sessionType: SessionData["type"],
  players: SessionData["players"],
  payload: MatchPayload
) {
  if (
    (payload.winnerTeam !== 1 && payload.winnerTeam !== 2) ||
    typeof payload.team1EloChange !== "number" ||
    typeof payload.team2EloChange !== "number"
  ) {
    return players;
  }

  const team1Ids = new Set(
    [payload.team1User1Id, payload.team1User2Id].filter(
      (value): value is string => typeof value === "string"
    )
  );
  const team2Ids = new Set(
    [payload.team2User1Id, payload.team2User2Id].filter(
      (value): value is string => typeof value === "string"
    )
  );

  if (team1Ids.size !== 2 || team2Ids.size !== 2) {
    return players;
  }

  const team1StandingPoints = getStandingPointsForTeam(payload.winnerTeam, 1);
  const team2StandingPoints = getStandingPointsForTeam(payload.winnerTeam, 2);
  const awardsStandingPoints =
    sessionType !== SessionType.LADDER && sessionType !== SessionType.RACE;

  return players.map((player) => {
    if (team1Ids.has(player.userId)) {
      return {
        ...player,
        sessionPoints: awardsStandingPoints
          ? player.sessionPoints + team1StandingPoints
          : player.sessionPoints,
        user: {
          ...player.user,
          elo: player.isGuest ? player.user.elo : player.user.elo + payload.team1EloChange!,
        },
      };
    }

    if (team2Ids.has(player.userId)) {
      return {
        ...player,
        sessionPoints: awardsStandingPoints
          ? player.sessionPoints + team2StandingPoints
          : player.sessionPoints,
        user: {
          ...player.user,
          elo: player.isGuest ? player.user.elo : player.user.elo + payload.team2EloChange!,
        },
      };
    }

    return player;
  });
}

export function mergeSessionSnapshot(
  current: SessionData,
  snapshot: SessionSnapshotLike
): SessionData {
  const nextPlayers = snapshot.players ?? current.players;
  const matchContext = {
    ...current,
    players: nextPlayers,
  };

  return {
    ...current,
    ...snapshot,
    players: nextPlayers,
    courts: snapshot.courts
      ? snapshot.courts.map((court) => {
          const existingCourt =
            current.courts.find((currentCourt) => currentCourt.id === court.id) ??
            null;

          return {
            ...court,
            currentMatch: court.currentMatch
              ? buildLiveMatch(
                  matchContext,
                  court.currentMatch,
                  existingCourt?.currentMatch ?? null
                ) ?? existingCourt?.currentMatch ?? null
              : null,
          };
        })
      : current.courts,
    matches: snapshot.matches ?? current.matches,
    queuedMatch:
      snapshot.queuedMatch !== undefined
        ? buildQueuedMatch(matchContext, snapshot.queuedMatch)
        : current.queuedMatch,
    viewerCanManage: current.viewerCanManage,
    viewerCommunityRole: current.viewerCommunityRole,
  };
}

export function applyGeneratedMatches(
  current: SessionData,
  matches: MatchPayload[]
) {
  if (matches.length === 0) return current;

  const matchesByCourtId = new Map(
    matches
      .filter((match) => typeof match.courtId === "string")
      .map((match) => [match.courtId!, match])
  );

  return {
    ...current,
    courts: current.courts.map((court) => {
      const nextMatch = matchesByCourtId.get(court.id);
      if (!nextMatch) return court;

      return {
        ...court,
        currentMatch: buildLiveMatch(current, nextMatch, court.currentMatch) ?? court.currentMatch,
      };
    }),
  };
}

export function applyQueuedMatch(
  current: SessionData,
  queuedMatch: QueuedMatch | null
) {
  return {
    ...current,
    queuedMatch: buildQueuedMatch(current, queuedMatch),
  };
}

export function applyUndoneCourtMatch(
  current: SessionData,
  courtId: string
) {
  return {
    ...current,
    courts: current.courts.map((court) =>
      court.id === courtId ? { ...court, currentMatch: null } : court
    ),
  };
}

export function applyCourtLabelUpdates(
  current: SessionData,
  courtLabels: Array<{ id: string; label?: string | null }>
) {
  const labelByCourtId = new Map(
    courtLabels.map((court) => [court.id, court.label ?? null])
  );

  return {
    ...current,
    courts: current.courts.map((court) =>
      labelByCourtId.has(court.id)
        ? {
            ...court,
            label: labelByCourtId.get(court.id) ?? null,
          }
        : court
    ),
  };
}

export function applyScoreSubmission(
  current: SessionData,
  payload: MatchPayload
) {
  let fallbackMatch: Match | null = null;

  const courts = current.courts.map((court) => {
    if (court.currentMatch?.id !== payload.id) {
      return court;
    }

    fallbackMatch = court.currentMatch;
    return {
      ...court,
      currentMatch: buildLiveMatch(current, payload, court.currentMatch) ?? court.currentMatch,
    };
  });

  const historyMatch = buildCompletedMatchInfo(payload, fallbackMatch);

  return {
    ...current,
    courts,
    matches: historyMatch ? upsertHistoryMatch(current.matches, historyMatch) : current.matches,
  };
}

export function applyScoreApproval(
  current: SessionData,
  payload: MatchPayload
) {
  let fallbackMatch: Match | null = null;

  const courts = current.courts.map((court) => {
    if (court.currentMatch?.id !== payload.id) {
      return court;
    }

    fallbackMatch = court.currentMatch;
    return {
      ...court,
      currentMatch: null,
    };
  });

  const historyMatch = buildCompletedMatchInfo(payload, fallbackMatch);

  return {
    ...current,
    courts,
    players: updatePlayersForCompletedMatch(current.type, current.players, payload),
    matches: historyMatch ? upsertHistoryMatch(current.matches, historyMatch) : current.matches,
  };
}

export function applyScoreReopen(
  current: SessionData,
  payload: MatchPayload
) {
  const courts = current.courts.map((court) => {
    if (court.currentMatch?.id !== payload.id) {
      return court;
    }

    return {
      ...court,
      currentMatch: buildLiveMatch(current, payload, court.currentMatch) ?? court.currentMatch,
    };
  });

  return {
    ...current,
    courts,
    matches: (current.matches ?? []).filter((match) => match.id !== payload.id),
  };
}

export function applyGuestAdded(current: SessionData, guest: GuestPayload) {
  if (current.players.some((player) => player.userId === guest.id)) {
    return current;
  }

  return {
    ...current,
    players: [
      ...current.players,
      {
        userId: guest.id,
        sessionPoints: 0,
        ladderEntryAt: guest.ladderEntryAt,
        isPaused: false,
        isGuest: guest.isGuest,
        gender: guest.gender,
        partnerPreference: guest.partnerPreference,
        user: {
          id: guest.id,
          name: guest.name,
          elo: guest.elo,
        },
      },
    ],
  };
}

export function applyPlayerRemoval(current: SessionData, userId: string) {
  return {
    ...current,
    players: current.players.filter((player) => player.userId !== userId),
    queuedMatch: hasQueuedMatchUser(current.queuedMatch, userId)
      ? null
      : current.queuedMatch,
  };
}

export function applyPlayerPaused(
  current: SessionData,
  userId: string,
  isPaused: boolean,
  ladderEntryAt?: string
) {
  return {
    ...current,
    players: current.players.map((player) =>
      player.userId === userId
        ? {
            ...player,
            isPaused,
            ladderEntryAt: ladderEntryAt ?? player.ladderEntryAt,
          }
        : player
    ),
    queuedMatch:
      isPaused && hasQueuedMatchUser(current.queuedMatch, userId)
        ? null
        : current.queuedMatch,
  };
}

export function applyPlayerNameUpdate(
  current: SessionData,
  userId: string,
  nextName: string
) {
  const updateParticipantName = (participant: MatchParticipant) =>
    participant.id === userId
      ? {
          ...participant,
          name: nextName,
        }
      : participant;

  return {
    ...current,
    players: current.players.map((player) =>
      player.userId === userId
        ? {
            ...player,
            user: {
              ...player.user,
              name: nextName,
            },
          }
        : player
    ),
    courts: current.courts.map((court) =>
      court.currentMatch
        ? {
            ...court,
            currentMatch: {
              ...court.currentMatch,
              team1User1: updateParticipantName(court.currentMatch.team1User1),
              team1User2: updateParticipantName(court.currentMatch.team1User2),
              team2User1: updateParticipantName(court.currentMatch.team2User1),
              team2User2: updateParticipantName(court.currentMatch.team2User2),
            },
          }
        : court
    ),
    queuedMatch: current.queuedMatch
      ? {
          ...current.queuedMatch,
          team1User1: updateParticipantName(current.queuedMatch.team1User1),
          team1User2: updateParticipantName(current.queuedMatch.team1User2),
          team2User1: updateParticipantName(current.queuedMatch.team2User1),
          team2User2: updateParticipantName(current.queuedMatch.team2User2),
        }
      : current.queuedMatch,
  };
}

export function applyPlayerPreferenceUpdate(
  current: SessionData,
  payload: SessionPlayerPayload
) {
  return {
    ...current,
    players: current.players.map((player) =>
      player.userId === payload.userId
        ? {
            ...player,
            gender: payload.gender,
            partnerPreference: payload.partnerPreference,
          }
        : player
    ),
  };
}
