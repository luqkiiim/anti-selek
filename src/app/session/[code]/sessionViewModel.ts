"use client";

import { compareSessionStandings } from "@/lib/sessionStandings";
import { getSessionModeLabel, getSessionTypeLabel } from "@/lib/sessionModeLabels";
import type {
  CommunityUser,
  ManualMatchFormState,
  Player,
  PreferenceEditorState,
  SessionData,
} from "@/components/session/sessionTypes";
import { MatchStatus, SessionMode, SessionStatus } from "@/types/enums";

interface PlayerSessionStats {
  played: number;
  wins: number;
  losses: number;
}

interface BuildSessionViewModelArgs {
  sessionData: SessionData;
  communityPlayers: CommunityUser[];
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
  playersNotInSession: CommunityUser[];
  activeMatchesCount: number;
  readyCourtsCount: number;
  creatableOpenCourtCount: number;
  creatableOpenCourtIds: string[];
  completedMatchesCount: number;
  pausedPlayersCount: number;
  guestPlayersCount: number;
  pointDiffByUserId: Map<string, number>;
  playerStatsByUserId: Map<string, PlayerSessionStats>;
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

  return busySessionPlayerIds;
}

function buildPlayerPerformanceMaps(sessionData: SessionData) {
  const playerStatsByUserId = new Map<string, PlayerSessionStats>();
  const pointDiffByUserId = new Map<string, number>();

  sessionData.players.forEach((player) => {
    playerStatsByUserId.set(player.userId, { ...EMPTY_PLAYER_STATS });
    pointDiffByUserId.set(player.userId, 0);
  });

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

export function buildSessionViewModel({
  sessionData,
  communityPlayers,
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

  const playersNotInSession = communityPlayers
    .filter(
      (communityPlayer) =>
        !sessionData.players.some(
          (sessionPlayer) => sessionPlayer.userId === communityPlayer.id
        )
    )
    .filter((communityPlayer) =>
      normalizedRosterSearch.length > 0
        ? communityPlayer.name.toLowerCase().includes(normalizedRosterSearch)
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

  const { playerStatsByUserId, pointDiffByUserId } =
    buildPlayerPerformanceMaps(sessionData);

  const sortedPlayers = sessionData.players.slice().sort((a, b) =>
    compareSessionStandings(
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
    pointDiffByUserId,
    playerStatsByUserId,
    sortedPlayers,
    activePreferencePlayer,
    sessionModeLabel: getSessionModeLabel(sessionData.mode),
    sessionTypeLabel: getSessionTypeLabel(sessionData.type),
    getPlayerProfileHref: (player) =>
      sessionData.communityId && !player.isGuest
        ? `/profile/${player.user.id}?communityId=${sessionData.communityId}`
        : `/profile/${player.user.id}`,
  };
}
