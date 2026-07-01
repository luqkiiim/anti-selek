"use client";

import {
  getCompetitiveEntryAt,
  deriveLadderRecordsByEntryTime,
} from "@/lib/matchmaking/ladder";
import { getCourtDisplayLabel } from "@/lib/courtLabels";
import { getQueuedMatchUserIds } from "@/lib/sessionQueue";
import {
  compareCompetitiveStandings,
  compareSessionStandings,
} from "@/lib/sessionStandings";
import { getSessionModeLabel, getSessionTypeLabel } from "@/lib/sessionModeLabels";
import type {
  ClubUser,
  ManualMatchFormState,
  Player,
  PreferenceEditorState,
  QueuedMatch,
  SessionData,
} from "@/components/session/sessionTypes";
import {
  MatchStatus,
  SessionCollabFormat,
  SessionMode,
  SessionStatus,
  SessionType,
} from "@/types/enums";

interface PlayerSessionStats {
  played: number;
  wins: number;
  losses: number;
}

export interface InterclubScoreboardRow {
  clubId: string;
  clubName: string;
  avatarUrl?: string | null;
  matchWins: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
}

export interface InterclubScoreboard {
  rows: [InterclubScoreboardRow, InterclubScoreboardRow];
  leaderClubId: string | null;
  resultLabel: string;
  statusLabel: string;
}

interface BuildSessionViewModelArgs {
  sessionData: SessionData;
  clubPlayers: ClubUser[];
  rosterSearch: string;
  manualMatchForm: ManualMatchFormState;
  manualCourtId: string | null;
  openPreferenceEditor: PreferenceEditorState | null;
}

export interface SessionViewModel {
  isMixicano: boolean;
  isCompletedSession: boolean;
  manualMatchPlayerOptions: Player[];
  selectedManualPlayerIds: Set<string>;
  activeManualCourt: SessionData["courts"][number] | null;
  playersNotInSession: ClubUser[];
  activeMatchesCount: number;
  readyCourtsCount: number;
  creatableOpenCourtCount: number;
  creatableOpenCourtIds: string[];
  completedMatchesCount: number;
  pausedPlayersCount: number;
  guestPlayersCount: number;
  waitingPlayersCount: number;
  canQueueNextMatch: boolean;
  queuedMatch: QueuedMatch | null;
  nextReadyCourtLabel: string | null;
  pointDiffByUserId: Map<string, number>;
  playerStatsByUserId: Map<string, PlayerSessionStats>;
  interclubScoreboard: InterclubScoreboard | null;
  sortedPlayers: Player[];
  activePreferencePlayer: Player | null;
  sessionModeLabel: string;
  sessionTypeLabel: string;
  getPlayerProfileHref: (player: Player) => string;
}

const EMPTY_PLAYER_STATS: PlayerSessionStats = {
  played: 0,
  wins: 0,
  losses: 0,
};

function buildBusySessionPlayerIds(sessionData: SessionData) {
  const busySessionPlayerIds = new Set<string>();

  sessionData.courts.forEach((court) => {
    if (!court.currentMatch) return;

    busySessionPlayerIds.add(court.currentMatch.team1User1.id);
    busySessionPlayerIds.add(court.currentMatch.team1User2.id);
    busySessionPlayerIds.add(court.currentMatch.team2User1.id);
    busySessionPlayerIds.add(court.currentMatch.team2User2.id);
  });

  getQueuedMatchUserIds(sessionData.queuedMatch).forEach((userId) => {
    busySessionPlayerIds.add(userId);
  });

  return busySessionPlayerIds;
}

function buildPlayerPerformanceMaps(sessionData: SessionData) {
  const playerStatsByUserId = new Map<string, PlayerSessionStats>();
  const pointDiffByUserId = new Map<string, number>();

  sessionData.players.forEach((player) => {
    playerStatsByUserId.set(player.userId, { ...EMPTY_PLAYER_STATS });
    pointDiffByUserId.set(player.userId, 0);
  });

  if (sessionData.type === SessionType.LADDER) {
    const entryMap = new Map(
      sessionData.players.map((player) => [
        player.userId,
        getCompetitiveEntryAt(player),
      ])
    );
    const historyMatches = (sessionData.matches ?? []).map((match) => ({
      team1: [match.team1User1Id, match.team1User2Id] as [string, string],
      team2: [match.team2User1Id, match.team2User2Id] as [string, string],
      team1Score: match.team1Score,
      team2Score: match.team2Score,
      status: match.status,
      completedAt: match.completedAt ? new Date(match.completedAt) : null,
    }));
    const ladderRecordByUserId = deriveLadderRecordsByEntryTime(
      entryMap,
      historyMatches
    );

    sessionData.players.forEach((player) => {
      const record = ladderRecordByUserId.get(player.userId);
      if (!record) return;

      playerStatsByUserId.set(player.userId, {
        played: record.wins + record.losses,
        wins: record.wins,
        losses: record.losses,
      });
      pointDiffByUserId.set(player.userId, record.pointDiff);
    });

    return {
      playerStatsByUserId,
      pointDiffByUserId,
    };
  }

  (sessionData.matches ?? []).forEach((match) => {
    const team1Ids = [match.team1User1Id, match.team1User2Id];
    const team2Ids = [match.team2User1Id, match.team2User2Id];

    team1Ids.forEach((userId) => {
      const currentStats = playerStatsByUserId.get(userId) ?? {
        ...EMPTY_PLAYER_STATS,
      };
      playerStatsByUserId.set(userId, {
        played: currentStats.played + 1,
        wins: currentStats.wins + (match.winnerTeam === 1 ? 1 : 0),
        losses: currentStats.losses + (match.winnerTeam === 1 ? 0 : 1),
      });
    });

    team2Ids.forEach((userId) => {
      const currentStats = playerStatsByUserId.get(userId) ?? {
        ...EMPTY_PLAYER_STATS,
      };
      playerStatsByUserId.set(userId, {
        played: currentStats.played + 1,
        wins: currentStats.wins + (match.winnerTeam === 2 ? 1 : 0),
        losses: currentStats.losses + (match.winnerTeam === 2 ? 0 : 1),
      });
    });

    if (
      match.status !== MatchStatus.COMPLETED ||
      typeof match.team1Score !== "number" ||
      typeof match.team2Score !== "number"
    ) {
      return;
    }

    const team1PointDiff = match.team1Score - match.team2Score;
    const team2PointDiff = match.team2Score - match.team1Score;

    team1Ids.forEach((userId) => {
      const currentPointDiff = pointDiffByUserId.get(userId) ?? 0;
      pointDiffByUserId.set(userId, currentPointDiff + team1PointDiff);
    });

    team2Ids.forEach((userId) => {
      const currentPointDiff = pointDiffByUserId.get(userId) ?? 0;
      pointDiffByUserId.set(userId, currentPointDiff + team2PointDiff);
    });
  });

  return {
    playerStatsByUserId,
    pointDiffByUserId,
  };
}

function buildInterclubScoreboard(
  sessionData: SessionData
): InterclubScoreboard | null {
  if (sessionData.collabFormat !== SessionCollabFormat.INTERCLUB) {
    return null;
  }

  const clubs = (sessionData.clubs ?? [])
    .filter((club) => club.status === "ACCEPTED")
    .slice(0, 2);

  if (clubs.length !== 2) {
    return null;
  }

  const rowByClubId = new Map<string, InterclubScoreboardRow>(
    clubs.map((club) => [
      club.id,
      {
        clubId: club.id,
        clubName: club.name,
        avatarUrl: club.avatarUrl ?? null,
        matchWins: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointDiff: 0,
      },
    ])
  );

  for (const match of sessionData.matches ?? []) {
    if (
      match.status !== MatchStatus.COMPLETED ||
      typeof match.team1Score !== "number" ||
      typeof match.team2Score !== "number" ||
      !match.team1ClubId ||
      !match.team2ClubId
    ) {
      continue;
    }

    const team1Row = rowByClubId.get(match.team1ClubId);
    const team2Row = rowByClubId.get(match.team2ClubId);

    if (!team1Row || !team2Row) {
      continue;
    }

    team1Row.pointsFor += match.team1Score;
    team1Row.pointsAgainst += match.team2Score;
    team2Row.pointsFor += match.team2Score;
    team2Row.pointsAgainst += match.team1Score;

    if (match.winnerTeam === 1) {
      team1Row.matchWins += 1;
    } else if (match.winnerTeam === 2) {
      team2Row.matchWins += 1;
    }
  }

  const rows = clubs.map((club) => {
    const row = rowByClubId.get(club.id)!;
    return {
      ...row,
      pointDiff: row.pointsFor - row.pointsAgainst,
    };
  }) as [InterclubScoreboardRow, InterclubScoreboardRow];
  const [left, right] = rows;
  const leader =
    left.matchWins !== right.matchWins
      ? left.matchWins > right.matchWins
        ? left
        : right
      : left.pointDiff !== right.pointDiff
        ? left.pointDiff > right.pointDiff
          ? left
          : right
        : null;

  return {
    rows,
    leaderClubId: leader?.clubId ?? null,
    resultLabel: leader
      ? `${leader.clubName} ${
          sessionData.status === SessionStatus.COMPLETED ? "wins" : "leads"
        }`
      : "Draw",
    statusLabel:
      sessionData.status === SessionStatus.COMPLETED ? "Final" : "Live",
  };
}

export function buildSessionViewModel({
  sessionData,
  clubPlayers,
  rosterSearch,
  manualMatchForm,
  manualCourtId,
  openPreferenceEditor,
}: BuildSessionViewModelArgs): SessionViewModel {
  const isMixicano = sessionData.mode === SessionMode.MIXICANO;
  const isCompletedSession = sessionData.status === SessionStatus.COMPLETED;
  const busySessionPlayerIds = buildBusySessionPlayerIds(sessionData);
  const selectedManualPlayerIds = new Set(
    Object.values(manualMatchForm).filter((value) => value.length > 0)
  );
  const activeManualCourt = manualCourtId
    ? sessionData.courts.find((court) => court.id === manualCourtId) ?? null
    : null;
  const normalizedRosterSearch = rosterSearch.trim().toLowerCase();

  const manualMatchPlayerOptions = sessionData.players
    .filter(
      (player) =>
        !player.isPaused && !busySessionPlayerIds.has(player.userId)
    )
    .slice()
    .sort((a, b) => a.user.name.localeCompare(b.user.name));

  const playersNotInSession = clubPlayers
    .filter(
      (clubPlayer) =>
        !sessionData.players.some(
          (sessionPlayer) => sessionPlayer.userId === clubPlayer.id
        )
    )
    .filter((clubPlayer) =>
      normalizedRosterSearch.length > 0
        ? clubPlayer.name.toLowerCase().includes(normalizedRosterSearch)
        : true
    );

  const activeMatchesCount = sessionData.courts.filter(
    (court) => court.currentMatch !== null
  ).length;
  const readyCourtsCount = sessionData.courts.length - activeMatchesCount;
  const openCourts = sessionData.courts
    .filter((court) => !court.currentMatch)
    .slice()
    .sort((a, b) => a.courtNumber - b.courtNumber);
  const availableAutoMatchPlayersCount = sessionData.players.filter(
    (player) => !player.isPaused && !busySessionPlayerIds.has(player.userId)
  ).length;
  const waitingPlayersCount = availableAutoMatchPlayersCount;
  const creatableOpenCourtCount = Math.min(
    openCourts.length,
    Math.floor(availableAutoMatchPlayersCount / 4)
  );
  const creatableOpenCourtIds = openCourts
    .slice(0, creatableOpenCourtCount)
    .map((court) => court.id);
  const completedMatchesCount = sessionData.matches?.length ?? 0;
  const pausedPlayersCount = sessionData.players.filter(
    (player) => player.isPaused
  ).length;
  const guestPlayersCount = sessionData.players.filter(
    (player) => player.isGuest
  ).length;
  const nextReadyCourt = openCourts[0] ?? null;

  const { playerStatsByUserId, pointDiffByUserId } =
    buildPlayerPerformanceMaps(sessionData);
  const interclubScoreboard = buildInterclubScoreboard(sessionData);

  const sortedPlayers = sessionData.players.slice().sort((a, b) =>
    sessionData.type === SessionType.LADDER
      ? compareCompetitiveStandings(
          {
            name: a.user.name,
            score:
              (playerStatsByUserId.get(a.userId)?.wins ?? 0) -
              (playerStatsByUserId.get(a.userId)?.losses ?? 0),
            pointDiff: pointDiffByUserId.get(a.userId) ?? 0,
          },
          {
            name: b.user.name,
            score:
              (playerStatsByUserId.get(b.userId)?.wins ?? 0) -
              (playerStatsByUserId.get(b.userId)?.losses ?? 0),
            pointDiff: pointDiffByUserId.get(b.userId) ?? 0,
          }
        )
      : compareSessionStandings(
          {
            name: a.user.name,
            pointDiff: pointDiffByUserId.get(a.userId) ?? 0,
            sessionPoints: a.sessionPoints,
          },
          {
            name: b.user.name,
            pointDiff: pointDiffByUserId.get(b.userId) ?? 0,
            sessionPoints: b.sessionPoints,
          }
        )
  );

  const activePreferencePlayer = openPreferenceEditor
    ? sessionData.players.find(
        (player) => player.userId === openPreferenceEditor.userId
      ) ?? null
    : null;

  return {
    isMixicano,
    isCompletedSession,
    manualMatchPlayerOptions,
    selectedManualPlayerIds,
    activeManualCourt,
    playersNotInSession,
    activeMatchesCount,
    readyCourtsCount,
    creatableOpenCourtCount,
    creatableOpenCourtIds,
    completedMatchesCount,
    pausedPlayersCount,
    guestPlayersCount,
    waitingPlayersCount,
    canQueueNextMatch:
      sessionData.status === SessionStatus.ACTIVE &&
      !isCompletedSession &&
      readyCourtsCount === 0 &&
      !sessionData.queuedMatch &&
      waitingPlayersCount >= 4,
    queuedMatch: sessionData.queuedMatch ?? null,
    nextReadyCourtLabel: nextReadyCourt
      ? getCourtDisplayLabel(nextReadyCourt)
      : null,
    pointDiffByUserId,
    playerStatsByUserId,
    interclubScoreboard,
    sortedPlayers,
    activePreferencePlayer,
    sessionModeLabel: getSessionModeLabel(sessionData.mode),
    sessionTypeLabel: getSessionTypeLabel(sessionData.type),
    getPlayerProfileHref: (player) =>
      sessionData.clubId && !player.isGuest
        ? `/profile/${player.user.id}?clubId=${sessionData.clubId}`
        : `/profile/${player.user.id}`,
  };
}
