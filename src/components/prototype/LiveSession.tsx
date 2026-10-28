"use client";
import { useAppReady } from "@/components/app/AppStartup";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  DotsThree,
  SquaresFour,
  UsersThree,
  ChartBar,
  Plus,
  Pause,
  Play,
  Clock,
  ClockCounterClockwise,
  GearSix,
  SignOut,
  Trash,
} from "@phosphor-icons/react";
import type {
  SessionData,
  Match,
  Court,
} from "@/components/session/sessionTypes";
import {
  SessionBalanceMetric,
  SessionMatchmakingStyle,
  SessionPairingMode,
  SessionCrossoverFrequency,
  SessionType,
  SessionPool,
  MixedSide,
  PlayerGender,
} from "@/types/enums";
import { api, ApiError, useResource, useAction } from "./api";
import { useSessionController } from "./useSessionController";
import { canApprovePendingSubmission } from "@/lib/matchApprovalRules";
import { SessionJoinProfilePanel } from "@/components/session/SessionJoinProfilePanel";
import {
  Avatar,
  Sheet,
  Row,
  ErrorText,
} from "./Primitives";
import { Pager } from "./Pager";
import SessionMatchHistory from "./SessionMatchHistory";
import LivePlayerManagement from "./LivePlayerManagement";
import InterclubScoreboard from "./InterclubScoreboard";
import { LiveSessionStandings } from "./LiveSessionStandings";
import { deriveLiveSessionPlayerStats } from "./deriveLiveSessionStandings";
import { SessionFinishView } from "./SessionFinishView";
import { SessionStandbyView } from "./SessionStandbyView";
import { sessionFinishHighlights } from "./sessionFinishHighlights";
import { shareSessionStandingsImages } from "@/lib/sessionShareImageClient";
import { SessionRecapSavePanel } from "@/components/session/SessionRecapSavePanel";
import { useSessionStandingsImage } from "@/lib/useSessionStandingsImage";
import { getInterclubScore } from "@/lib/interclubScoreboard";
import { getMixedSideOverrideOptionForGender } from "@/lib/mixedSide";
import { classifyCourtGroupSnapshot, getCourtGroupTypeLabel } from "@/lib/playerGroups";
import { CourtMatchCreateMenu, SessionMatchCreationToolbar } from "./SessionMatchCreationControls";
import {
  applyGeneratedMatches,
  applyQueuedMatch,
  applyUndoneCourtMatch,
  applyScoreApproval,
  applyScoreSubmission,
  applyScoreReopen,
  mergeSessionSnapshot,
  type MatchPayload,
  type SessionSnapshotLike,
} from "@/app/session/[code]/sessionDataMutations";
import { MatchStatus } from "@/types/enums";
import { saveScoreWithBackgroundRefresh } from "./scoreSave";
import { ClubCollaboration, useClubCollaboration } from "./ClubCollaboration";
import { SeriesScoreEditor } from "./SeriesScoreEditor";
import { CourtPairingDetails } from "./CourtPairingDetails";
type LiveSettingsDraft = {
  name: string;
  autoQueueEnabled: boolean;
  courtLabels: Record<number, string>;
  matchmakingStyle: SessionMatchmakingStyle;
  balanceMetric: SessionBalanceMetric;
  pairingMode: SessionPairingMode;
  poolsEnabled: boolean;
  crossoverFrequency: SessionCrossoverFrequency;
  courtCount: number;
};
function settingsDraft(session: SessionData): LiveSettingsDraft {
  return {
    name: session.name,
    autoQueueEnabled: session.autoQueueEnabled,
    courtLabels: Object.fromEntries(session.courts.map(court => [court.courtNumber, court.label ?? ""])),
    matchmakingStyle: session.matchmakingStyle ?? SessionMatchmakingStyle.BALANCED,
    balanceMetric: session.balanceMetric ?? SessionBalanceMetric.RATING,
    pairingMode: session.pairingMode ?? SessionPairingMode.OPEN,
    poolsEnabled: session.poolsEnabled,
    crossoverFrequency: session.crossoverFrequency,
    courtCount: session.courts.length,
  };
}
type ManualTarget =
  | { kind: "court"; courtId: string }
  | { kind: "queue"; replaceQueuedMatch: boolean };
type ControlConfirmation =
  | { kind: "court-reshuffle"; courtId: string }
  | { kind: "court-undo"; courtId: string }
  | { kind: "queue-clear" }
  | { kind: "court-player-rest"; courtId: string; matchId: string; playerId: string };
type CourtPlayerAction = {
  courtId: string;
  matchId: string;
  player: Match["team1User1"];
};
type PlayerPauseOverlay = {
  isPaused: boolean;
  pending: boolean;
  conflictingRefreshes: number;
};
type PausePlayerResponse = {
  queuedMatchAffected?: boolean;
  queuedMatch?: SessionData["queuedMatch"];
};
type ScoreSaveResponse = MatchPayload & {
  queuedMatch?: SessionData["queuedMatch"];
  autoAssignedMatch?: MatchPayload;
};
type MatchGenerationResponse = Partial<MatchPayload> & {
  matches?: MatchPayload[];
  queuedMatch?: SessionData["queuedMatch"];
  deferredQueueRecovery?: boolean;
  undoneMatchId?: string;
  autoAssignedMatch?: MatchPayload | null;
};
type QueuedMatchOverlay = {
  queuedMatch: SessionData["queuedMatch"] | null;
  expectedId: string | null;
  conflictingRefreshes: number;
};
export default function LiveSession({
  code,
  onBack,
  onEnded,
  onDeleted,
  onOpenMember,
  profileMemberIds,
  globalClubId,
  activeTab, onTabChange, onSessionData, onHistory, onPracticeTools, onOpenProfile,
}: {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  onSessionData?: (session: SessionData) => void;
  onHistory?: () => void;
  onPracticeTools?: () => void;
  onOpenProfile?: (id: string, clubId: string | null) => void;
  globalClubId?: string;
  code: string;
  onBack: () => void;
  onEnded: () => Promise<void>;
  onDeleted?: () => Promise<void>;
  onOpenMember?: (userId: string) => void;
  profileMemberIds?: readonly string[];
}) {
  const endpoint = "/api/sessions/" + code;
  const readQuery = globalClubId ? `?view=global&clubId=${encodeURIComponent(globalClubId)}` : "";
  const resource = useSessionController(code, globalClubId);
  const [pauseOverlays, setPauseOverlays] = useState<Record<string, PlayerPauseOverlay>>({});
  const [pauseError, setPauseError] = useState("");
  const [queuedMatchOverlay, setQueuedMatchOverlay] = useState<QueuedMatchOverlay | null>(null);
  const pauseRequestsRef = useRef(new Set<string>());
  const rawSession = resource.data;
  const isCollaboration = rawSession?.collaborationVersion === 2 && (rawSession.clubs?.length ?? 0) > 1;
  const collaboration = useClubCollaboration(code, !!isCollaboration && !globalClubId);
  const lineupMode = !!isCollaboration && rawSession?.schedulingMode === "LINEUP";
  const manageableClubIds = isCollaboration ? collaboration.data?.capabilities.manageClubIds ?? [] : undefined;
  const mayManagePlayer = (player: SessionData["players"][number]) => !isCollaboration || !!manageableClubIds?.includes(player.representingClubId ?? player.profileClubId ?? rawSession?.clubId ?? "");
  const canManageRoster = !globalClubId && !rawSession?.viewerIsQuickAccess && (isCollaboration ? !!manageableClubIds?.length : !!rawSession?.viewerCanManage);
  const [acknowledgeRemainingLineup, setAcknowledgeRemainingLineup] = useState(false);
  const s = useMemo(
    () => rawSession && queuedMatchOverlay
      ? { ...rawSession, queuedMatch: queuedMatchOverlay.queuedMatch }
      : rawSession,
    [rawSession, queuedMatchOverlay],
  );
  const standings = useResource<{
    currentLeaderboard: {
      userId: string;
      name: string;
      sessionPoints: number;
      score?: number;
    }[];
  }>(endpoint + "/leaderboard" + readQuery);
  useAppReady(!!resource.error || (!!rawSession && (
    !isCollaboration || !!globalClubId || !!collaboration.data || !!collaboration.error
  ) && (rawSession.status !== "COMPLETED" || !!standings.data || !!standings.error)));
  const [localTab, setLocalTab] = useState("Courts"),
    [sheet, setSheet] = useState(""),
    [confirmingMatchIds, setConfirmingMatchIds] = useState<Set<string>>(() => new Set()),
    [savingScoreMatchIds, setSavingScoreMatchIds] = useState<Set<string>>(() => new Set()),
    [scoreErrors, setScoreErrors] = useState<Record<string, string>>({}),
    [scores, setScores] = useState<Record<string, { values: [string, string]; revision: number }>>({}),
    [courtControlId, setCourtControlId] = useState<string | null>(null),
    [courtPlayerAction, setCourtPlayerAction] = useState<CourtPlayerAction | null>(null),
    [confirmation, setConfirmation] = useState<ControlConfirmation | null>(null),
    [manualTarget, setManualTarget] = useState<ManualTarget | null>(null),
    [manualSelection, setManualSelection] = useState<string[]>([]);
  const scoreRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const confirmingMatchIdsRef = useRef(new Set<string>());
  const savingScoreMatchIdsRef = useRef(new Set<string>());
  const [name, setName] = useState(""),
    [rating, setRating] = useState("1000");
  const [guestGender, setGuestGender] = useState<PlayerGender>(PlayerGender.UNSPECIFIED);
  const [guestMixedSideOverride, setGuestMixedSideOverride] = useState<MixedSide | null>(null);
  const [guestRepresentingClubId, setGuestRepresentingClubId] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [managePlayersOpen, setManagePlayersOpen] = useState(false);
  const [restPlayerId, setRestPlayerId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [saveRecapOpen, setSaveRecapOpen] = useState(false);
  const [celebrateFinish, setCelebrateFinish] = useState(false);
  const [shareError, setShareError] = useState("");
  const [liveSettingsDraft, setLiveSettingsDraft] = useState<LiveSettingsDraft | null>(null);
  const [confirmAutoQueueOff, setConfirmAutoQueueOff] = useState(false);
  const [confirmedQueueId, setConfirmedQueueId] = useState<string | null>(null);
  const sessionTabs = ["Players", "Courts", "Standings"] as const;
  const tab = activeTab ?? localTab;
  function setTab(next: string) { if (onTabChange) onTabChange(next); else setLocalTab(next); }
  function navigateTab(nextTab: string) { setTab(nextTab); }
  function openHistory() { if (onHistory) onHistory(); else setShowHistory(true); }
  useEffect(() => { if (s) onSessionData?.(s); }, [s, onSessionData]);
  const initialSettingsOpened = useRef(false);
  useEffect(() => {
    if (!initialSettingsOpened.current && s?.viewerCanManage && !s.viewerIsQuickAccess && !globalClubId && location.hash === "#settings") {
      initialSettingsOpened.current = true;
      setLiveSettingsDraft(settingsDraft(s));
      setSheet("settings");
    }
  }, [s, globalClubId]);
  async function refresh() {
    await Promise.all([resource.refresh(), standings.refresh(), collaboration.refresh()]);
  }
  const action = useAction(refresh);
  async function generateMatch(body: Record<string, unknown>) {
    await resource.cancelDeferredQueueRecovery();
    const result = await api<MatchGenerationResponse>(endpoint + "/generate-match", "POST", body);
    const matches = result.matches ?? (result.id && result.status ? [result as MatchPayload] : []);
    if (result.queuedMatch !== undefined) setQueuedMatchOverlay(null);
    resource.update(current => {
      let next = current;
      if (body.undoCurrentMatch && typeof body.courtId === "string" && result.undoneMatchId) {
        const court = current.courts.find(court => court.id === body.courtId);
        // A late acknowledgement must not erase a newer lineup on this court.
        if (!court || (court.currentMatch && court.currentMatch.id !== result.undoneMatchId)) return current;
        next = applyUndoneCourtMatch(next, body.courtId);
        if (result.autoAssignedMatch) next = applyGeneratedMatches(next, [result.autoAssignedMatch]);
      }
      if (matches.length) next = applyGeneratedMatches(next, matches);
      if (result.queuedMatch !== undefined) next = applyQueuedMatch(next, result.queuedMatch ?? null);
      return next;
    }, { urgent: true });
    if (result.deferredQueueRecovery) resource.scheduleDeferredQueueRecovery();
    return result;
  }
  async function changeQueuedMatch(method: "POST" | "DELETE", body?: Record<string, unknown>) {
    await resource.cancelDeferredQueueRecovery();
    const result = await (body === undefined
      ? api<{ queuedMatch?: SessionData["queuedMatch"] }>(endpoint + "/queue-match", method)
      : api<{ queuedMatch?: SessionData["queuedMatch"] }>(endpoint + "/queue-match", method, body));
    if (method === "DELETE" || result.queuedMatch !== undefined) {
      setQueuedMatchOverlay(null);
      resource.update(current => applyQueuedMatch(current, method === "DELETE" ? null : result.queuedMatch ?? null), { urgent: true });
    }
    return result;
  }
  const refreshSession=resource.refresh,refreshStandings=standings.refresh;
  useEffect(() => {
    if (!rawSession) return;
    setPauseOverlays((current) => {
      const next = { ...current };
      let changed = false;
      for (const [userId, overlay] of Object.entries(current)) {
        const player = rawSession.players.find((candidate) => candidate.userId === userId);
        if (!player || (!overlay.pending && (
          player.isPaused === overlay.isPaused || overlay.conflictingRefreshes > 0
        ))) {
          delete next[userId];
          changed = true;
        } else if (!overlay.pending) {
          next[userId] = { ...overlay, conflictingRefreshes: 1 };
          changed = true;
        }
      }
      return changed ? next : current;
    });
    setQueuedMatchOverlay((current) => {
      if (!current) return null;
      const queueId = rawSession.queuedMatch?.id ?? null;
      if (queueId === current.expectedId || current.conflictingRefreshes > 0) return null;
      return { ...current, conflictingRefreshes: 1 };
    });
  }, [rawSession]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden && !action.busy && savingScoreMatchIds.size === 0) {
        void refreshSession().catch(() => {});
        void refreshStandings().catch(() => {});
      }
    }, isCollaboration ? 2000 : 15000);
    return () => clearInterval(timer);
  }, [refreshSession, refreshStandings, action.busy, savingScoreMatchIds, isCollaboration]);
  const canManage = !globalClubId && !s?.viewerIsQuickAccess && (isCollaboration ? !!collaboration.data?.capabilities.host : !!s?.viewerCanManage);
  const canJoin = !!s && !globalClubId && !s.viewerIsQuickAccess && !s.selectedSelf && !!s.eligibleProfiles?.length && s.status !== "COMPLETED";
  const canRename = canManage && !!s?.viewerCanRename && s.status === "WAITING";
  const ended = s?.status === "COMPLETED";
  const sessionPlayerById = new Map(s?.players.map((player) => [player.userId, player]) ?? []);
  const profileMemberIdSet = new Set(profileMemberIds ?? s?.players.filter(p => !p.isGuest).map(p => p.userId) ?? []);
  const openMember = onOpenProfile ? (id: string) => {
    const player = s?.players.find(p => p.userId === id);
    onOpenProfile(id, player?.profileClubId ?? (s?.ratingPolicyVersion === 2 ? null : s?.clubId ?? null));
  } : onOpenMember;
  const viewerPlayerId = s?.viewerPlayerId ?? s?.selectedSelf?.playerId ?? "";
  function maySubmitScore(match: Match) {
    return !globalClubId && !s?.viewerIsQuickAccess && match.status === MatchStatus.IN_PROGRESS &&
      (canManageRoster || playersInMatch(match).some(p => p.id === viewerPlayerId));
  }
  function mayApproveScore(match: Match) {
    return !globalClubId && !s?.viewerIsQuickAccess && match.status === MatchStatus.PENDING_APPROVAL && canApprovePendingSubmission({
      match: { team1User1Id: match.team1User1.id, team1User2Id: match.team1User2.id, team2User1Id: match.team2User1.id, team2User2Id: match.team2User2.id },
      approverUserId: s?.viewerUserId ?? "", approverPlayerId: viewerPlayerId, approverIsAdmin: canManageRoster,
      approverIsClaimed: true, scoreSubmittedByUserId: match.scoreSubmittedByUserId, scoreSubmittedByPlayerId: match.scoreSubmittedByPlayerId,
    });
  }
  async function pendingScoreAction(match: Match, operation: "approve" | "reopen") {
    if (savingScoreMatchIdsRef.current.has(match.id)) return;
    setMatchSaving(match.id, true);
    try {
      const response = match.scoringFormat === "BEST_OF_THREE"
        ? await api<ScoreSaveResponse>(`/api/matches/${encodeURIComponent(match.id)}/${operation}`, "POST", {scoreRevision:match.scoreRevision??0})
        : await api<ScoreSaveResponse>(`/api/matches/${encodeURIComponent(match.id)}/${operation}`, "POST");
      if (operation === "approve") setQueuedMatchOverlay(null);
      resource.update(current => operation === "reopen" ? applyScoreReopen(current, response) : applyQueuedMatch(
        response.autoAssignedMatch ? applyGeneratedMatches(applyScoreApproval(current, response), [response.autoAssignedMatch]) : applyScoreApproval(current, response), response.queuedMatch ?? null));
      void refresh().catch(() => {});
    } catch (error) { setScoreErrors(previous => ({ ...previous, [match.id]: error instanceof Error ? error.message : "Unable to update score." })); }
    finally { setMatchSaving(match.id, false); }
  }
  const sessionStats = deriveLiveSessionPlayerStats(
    s?.players.map((player) => player.userId) ?? [],
    s?.matches ?? [],
  );
  const standingRows = standings.data?.currentLeaderboard.map((entry) => {
    const player = sessionPlayerById.get(entry.userId);
    const stats = sessionStats.get(entry.userId);
    const ladderScore = entry.score ?? ((stats?.wins ?? 0) - (stats?.losses ?? 0));
    return {
      userId: entry.userId,
      name: entry.name,
      avatarUrl: player?.user.avatarUrl,
      group: player?.pool === SessionPool.B ? ("B" as const) : ("A" as const),
      score: s?.type === SessionType.LADDER && ladderScore > 0 ? `+${ladderScore}` : s?.type === SessionType.LADDER ? ladderScore : entry.sessionPoints,
      matchesPlayed: stats?.matchesPlayed ?? 0,
      wins: stats?.wins ?? 0,
      losses: stats?.losses ?? 0,
      pointDiff: stats?.pointDiff ?? 0,
      canOpenMember: !player?.isGuest && profileMemberIdSet.has(entry.userId),
    };
  }) ?? [];
  const finalPlayers = standings.data?.currentLeaderboard
    .map((entry) => sessionPlayerById.get(entry.userId))
    .filter((player): player is NonNullable<typeof player> => !!player) ?? [];
  const shareImageRevision = JSON.stringify({
    name: s?.name,
    players: s?.players.map((player) => [player.userId, player.user.name, player.sessionPoints]),
    matches: s?.matches?.map((match) => [match.id, match.team1Score, match.team2Score, match.winnerTeam]),
  });
  const shareImage = useSessionStandingsImage({
    code,
    enabled: ended && finalPlayers.length > 0,
    revision: shareImageRevision,
  });
  const finalPlayerStats = new Map(
    Array.from(sessionStats, ([userId, stats]) => [userId, {
      played: stats.matchesPlayed,
      wins: stats.wins,
      losses: stats.losses,
    }] as const),
  );
  const finalPointDiff = new Map(Array.from(sessionStats, ([userId, stats]) => [userId, stats.pointDiff] as const));
  const busyPlayerIds = new Set<string>();
  s?.courts.forEach((court) => {
    if (!court.currentMatch) return;
    playersInMatch(court.currentMatch).forEach((player) => busyPlayerIds.add(player.id));
  });
  if (s?.queuedMatch) playerInQueue(s.queuedMatch).forEach((player) => busyPlayerIds.add(player.id));
  const availablePlayerCount = s?.players.filter((player) => !player.isPaused && !busyPlayerIds.has(player.userId)).length ?? 0;
  const openCourts = s?.courts.filter((court) => !court.currentMatch).sort((left, right) => left.courtNumber - right.courtNumber) ?? [];
  const creatableOpenCourtIds = s?.queuedMatch ? [] : openCourts.slice(0, Math.floor(availablePlayerCount / 4)).map((court) => court.id);
  const canQueueNextMatch = !!s && s.status === "ACTIVE" && openCourts.length === 0 && !s.queuedMatch && availablePlayerCount >= 4;

  async function shareResults() {
    if (!s || sharing) return;
    if (!shareImage.images) {
      if (shareImage.error) shareImage.retry();
      return;
    }
    setSharing(true);
    setShareError("");
    try {
      const result = await shareSessionStandingsImages({
        images: shareImage.images,
        fileName: `${s.name}-standings`,
        shareTitle: `${s.name} standings`,
      });
      if (result.method === "save-panel") setSaveRecapOpen(true);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setShareError(error instanceof Error ? error.message : "Unable to share standings");
      }
    } finally {
      setSharing(false);
    }
  }
  const hasLiveSettingsChanges = !!(
    s && liveSettingsDraft && (
      (canRename && liveSettingsDraft.name.trim() !== s.name) ||
      liveSettingsDraft.autoQueueEnabled !== s.autoQueueEnabled ||
      (s.status !== "COMPLETED" && liveSettingsDraft.courtCount !== s.courts.length) ||
      s.courts.some(
        (court) =>
          (liveSettingsDraft.courtLabels[court.courtNumber] ?? "").trim() !==
          (court.label ?? "").trim(),
      ) ||
      (s.status === "WAITING" && (
        liveSettingsDraft.matchmakingStyle !== (s.matchmakingStyle ?? SessionMatchmakingStyle.BALANCED) ||
        liveSettingsDraft.balanceMetric !== (s.balanceMetric ?? SessionBalanceMetric.RATING) ||
        liveSettingsDraft.pairingMode !== (s.pairingMode ?? SessionPairingMode.OPEN) ||
        liveSettingsDraft.poolsEnabled !== s.poolsEnabled ||
        liveSettingsDraft.crossoverFrequency !== s.crossoverFrequency
      ))
    )
  );

  function score(m: Match): [string, string] {
    const freshMatch =
      m.status === "IN_PROGRESS" &&
      m.team1Score === 0 &&
      m.team2Score === 0 &&
      !m.completedAt;
    return (
      scores[m.id]?.values ?? [
        freshMatch || m.team1Score == null ? "" : String(m.team1Score),
        freshMatch || m.team2Score == null ? "" : String(m.team2Score),
      ]
    );
  }
  function setMatchConfirmation(matchId: string, confirming: boolean) {
    const next = new Set(confirmingMatchIdsRef.current);
    if (confirming) next.add(matchId);
    else next.delete(matchId);
    confirmingMatchIdsRef.current = next;
    setConfirmingMatchIds(next);
  }
  function setMatchSaving(matchId: string, saving: boolean) {
    const next = new Set(savingScoreMatchIdsRef.current);
    if (saving) next.add(matchId);
    else next.delete(matchId);
    savingScoreMatchIdsRef.current = next;
    setSavingScoreMatchIds(next);
  }
  function update(m: Match, i: number, v: string, autoAdvance: false | "court" | "sheet" = false) {
    setMatchConfirmation(m.id, false);
    setScoreErrors((previous) => {
      if (!(m.id in previous)) return previous;
      const next = { ...previous };
      delete next[m.id];
      return next;
    });
    const value = v.replace(/\D/g, "").slice(0, isCollaboration ? 16 : 2);
    setScores((prev) => {
      const next: [string, string] = [...score(m)];
      next[i] = value;
      return { ...prev, [m.id]: { values: next, revision: prev[m.id]?.revision ?? m.scoreRevision ?? 0 } };
    });
    if (!isCollaboration && autoAdvance && i === 0 && value.length === 2) {
      requestAnimationFrame(() => {
        scoreRefs.current[`${autoAdvance === "sheet" ? "sheet" : m.id}-1`]?.focus();
      });
    }
  }
  const queued = s?.queuedMatch;
  const playerPoolById = new Map(s?.players.map((player) => [player.userId, player.pool]));
  function matchGroupLabel(match: Match | NonNullable<SessionData["queuedMatch"]> | null | undefined) {
    if (!s?.poolsEnabled || !match) return null;
    return getCourtGroupTypeLabel(match.courtGroupType ?? null) ??
      getCourtGroupTypeLabel(classifyCourtGroupSnapshot(
        [match.team1User1.id, match.team1User2.id],
        [match.team2User1.id, match.team2User2.id],
        playerPoolById,
      ).courtGroupType);
  }
  const queuedGroupLabel = matchGroupLabel(queued);
  function playersInMatch(match: Pick<Match, "team1User1" | "team1User2" | "team2User1" | "team2User2">) {
    return [
      match.team1User1,
      match.team1User2,
      match.team2User1,
      match.team2User2,
    ];
  }
  function playerInQueue(match: NonNullable<SessionData["queuedMatch"]>) {
    return playersInMatch(match);
  }
  function playingCourtFor(userId: string) {
    return s?.courts.find((court) =>
      court.currentMatch &&
      playersInMatch(court.currentMatch).some((player) => player.id === userId),
    );
  }
  function isRosterPlayerPaused(player: SessionData["players"][number]) {
    return pauseOverlays[player.userId]?.isPaused ?? player.isPaused;
  }
  function playerStatus(player: SessionData["players"][number]) {
    const court = playingCourtFor(player.userId);
    if (court) {
      return isRosterPlayerPaused(player)
        ? "Pausing after game"
        : `Playing on ${court.label || "Court " + court.courtNumber}`;
    }
    return isRosterPlayerPaused(player) ? "Paused" : "Waiting";
  }
  const alphabeticalPlayers = [...(s?.players ?? [])].sort((left, right) =>
    left.user.name.localeCompare(right.user.name, undefined, { sensitivity: "base" }),
  );
  const activePlayers = alphabeticalPlayers.filter((player) =>
    !isRosterPlayerPaused(player) || !!playingCourtFor(player.userId),
  );
  const pausedPlayers = alphabeticalPlayers.filter((player) =>
    isRosterPlayerPaused(player) && !playingCourtFor(player.userId),
  );
  function ownsSessionSeat(player: SessionData["players"][number]) {
    if (!s || globalClubId || s.viewerIsQuickAccess) return false;
    if (s.ratingPolicyVersion === 2) return s.eligibleProfiles?.some(profile => profile.playerId === player.userId && profile.profileClubId === player.profileClubId) ?? false;
    return player.userId === viewerPlayerId;
  }
  const restPlayer = s?.players.find(player => player.userId === restPlayerId);
  async function toggleRosterPlayerPause(userId: string, currentPaused: boolean) {
    if (pauseRequestsRef.current.has(userId)) return;
    pauseRequestsRef.current.add(userId);
    const previousOverlay = pauseOverlays[userId];
    const isPaused = !currentPaused;
    setPauseError("");
    setPauseOverlays((current) => ({
      ...current,
      [userId]: { isPaused, pending: true, conflictingRefreshes: 0 },
    }));
    try {
      const data = await api<PausePlayerResponse>(endpoint + "/pause-player", "POST", {
        playerId: userId,
        isPaused,
      });
      setPauseOverlays((current) => ({
        ...current,
        [userId]: { isPaused, pending: false, conflictingRefreshes: 0 },
      }));
      if (data.queuedMatchAffected === true) {
        const queuedMatch = data.queuedMatch ?? null;
        setQueuedMatchOverlay({
          queuedMatch,
          expectedId: queuedMatch?.id ?? null,
          conflictingRefreshes: 0,
        });
      }
      void refreshSession().catch(() => {});
    } catch (error) {
      setPauseOverlays((current) => {
        const next = { ...current };
        if (previousOverlay) next[userId] = previousOverlay;
        else delete next[userId];
        return next;
      });
      setPauseError(error instanceof Error ? error.message : "Failed to update player status");
    } finally {
      pauseRequestsRef.current.delete(userId);
    }
  }
  const courtControl = s?.courts.find((court) => court.id === courtControlId) ?? null;
  const controlMatch = courtControl?.currentMatch ?? null;
  const controlQueue = s?.queuedMatch ?? null;
  function getManualPlayers(selectionTarget: ManualTarget | null): SessionData["players"] {
    if (!s || !selectionTarget) return [];
    const onCourt = new Set(
      s.courts.flatMap((court) =>
        court.currentMatch ? playersInMatch(court.currentMatch).map((player) => player.id) : [],
      ),
    );
    const queuedIds = new Set(
      s.queuedMatch ? playerInQueue(s.queuedMatch).map((player) => player.id) : [],
    );
    const mayReuseQueue = selectionTarget.kind === "queue" && selectionTarget.replaceQueuedMatch;
    return s.players
      .filter((player) =>
        !player.isPaused &&
        !onCourt.has(player.userId) &&
        (mayReuseQueue || !queuedIds.has(player.userId)),
      )
      .slice()
      .sort((a, b) => a.user.name.localeCompare(b.user.name));
  }
  const manualPlayers = getManualPlayers(manualTarget);
  function validateScore(match: Match) {
    const values = score(match).map(Number);
    if (
      score(match).some((v) => v.trim() === "") ||
      values.some((v) => !Number.isSafeInteger(v) || v < 0 || (!isCollaboration && v > 99)) ||
      values[0] === values[1]
    )
      throw new Error(isCollaboration ? "Enter unequal, nonnegative whole scores." : "Enter unequal whole scores from 0 to 99.");
    return values;
  }
  function confirmScore(match: Match) {
    if (action.busy || savingScoreMatchIdsRef.current.has(match.id)) return;
    try {
      const values = validateScore(match);
      if (!confirmingMatchIdsRef.current.has(match.id)) {
        setMatchConfirmation(match.id, true);
        return;
      }
      setScoreErrors((previous) => {
        if (!(match.id in previous)) return previous;
        const next = { ...previous };
        delete next[match.id];
        return next;
      });
      // Lock synchronously so rapid clicks cannot submit the same match twice.
      setMatchSaving(match.id, true);
      void saveScore(match, values);
    } catch (error) {
      setScoreErrors((previous) => ({
        ...previous,
        [match.id]: error instanceof Error ? error.message : "Check both scores.",
      }));
    }
  }
  async function saveScore(match: Match, values: number[]) {
    try {
      await saveScoreWithBackgroundRefresh(
        () => api<ScoreSaveResponse>(
          "/api/matches/" + match.id + "/score",
          "POST",
          { team1Score: values[0], team2Score: values[1], ...(match.scoreRevision !== undefined ? {scoreRevision:scores[match.id]?.revision ?? match.scoreRevision} : {}) },
        ),
        (response) => {
          if (response.status === MatchStatus.COMPLETED) {
            setQueuedMatchOverlay(null);
          }
          resource.update((current) => {
            const next = response.status === MatchStatus.COMPLETED
              ? applyScoreApproval(current, response)
              : applyScoreSubmission(current, response);
            if (response.status !== MatchStatus.COMPLETED) return next;
            return applyQueuedMatch(
              response.autoAssignedMatch
                ? applyGeneratedMatches(next, [response.autoAssignedMatch])
                : next,
              response.queuedMatch ?? null,
            );
          }, { urgent: true });
          setScores((current) => {
            const next = { ...current };
            delete next[match.id];
            return next;
          });
          setMatchConfirmation(match.id, false);
        },
        () => Promise.all([refreshSession(), refreshStandings()]),
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setScores(current=>{const next={...current};delete next[match.id];return next;});
        setMatchConfirmation(match.id,false);
        await refresh().catch(() => {});
      }
      setScoreErrors((previous) => ({
        ...previous,
        [match.id]: error instanceof Error ? error.message : "Unable to save score.",
      }));
    } finally {
      setMatchSaving(match.id, false);
    }
  }
  if (showHistory) {
    return (
      <div className="pc-app">
        <SessionMatchHistory
          globalClubId={globalClubId}
          code={code}
          onBack={() => setShowHistory(false)}
          onMutated={refresh}
        />
      </div>
    );
  }
  function closeSheet() {
    setSheet("");
    setCourtControlId(null);
    setCourtPlayerAction(null);
    setConfirmation(null);
    setManualTarget(null);
    setManualSelection([]);
    setConfirmAutoQueueOff(false);
  }
  function finishControlAction() {
    setSheet("");
    setCourtControlId(null);
    setCourtPlayerAction(null);
    setConfirmation(null);
    setManualTarget(null);
    setManualSelection([]);
  }
  function openCourtControls(court: Court) {
    setCourtControlId(court.id);
    setConfirmation(null);
    action.setError("");
    setSheet("court-controls");
  }
  function openCourtPlayerActions(court: Court, player: Match["team1User1"]) {
    if (!court.currentMatch || !canManage) return;
    setCourtControlId(court.id);
    setCourtPlayerAction({ courtId: court.id, matchId: court.currentMatch.id, player });
    setConfirmation(null);
    action.setError("");
    setSheet("court-player");
  }
  function openNextControls() {
    setCourtControlId(null);
    setConfirmation(null);
    action.setError("");
    setSheet("next");
  }
  function openLiveSettings() {
    if (!s) return;
    setLiveSettingsDraft(settingsDraft(s));
    setConfirmAutoQueueOff(false);
    setConfirmedQueueId(null);
    action.setError("");
    setSheet("settings");
  }
  function changeAutoQueue(value: boolean) {
    if (!liveSettingsDraft) return;
    if (value) {
      setLiveSettingsDraft((current) => current ? { ...current, autoQueueEnabled: true } : current);
      setConfirmAutoQueueOff(false);
      setConfirmedQueueId(null);
      return;
    }
    if (s?.queuedMatch) {
      setConfirmAutoQueueOff(true);
      return;
    }
    setLiveSettingsDraft((current) => current ? { ...current, autoQueueEnabled: false } : current);
    setConfirmAutoQueueOff(false);
    setConfirmedQueueId(null);
  }
  function confirmDisableAutoQueue() {
    setLiveSettingsDraft((current) => current ? { ...current, autoQueueEnabled: false } : current);
    setConfirmedQueueId(s?.queuedMatch?.id ?? null);
    setConfirmAutoQueueOff(false);
  }
  function saveLiveSettings() {
    if (!s || !liveSettingsDraft) return;
    if (canRename && !liveSettingsDraft.name.trim()) return;
    const queuedMatchWillBeCleared =
      !liveSettingsDraft.autoQueueEnabled && !!s.queuedMatch;
    if (queuedMatchWillBeCleared && confirmedQueueId !== s.queuedMatch?.id) {
      setConfirmAutoQueueOff(true);
      return;
    }
    const payload = {
      ...(canRename && liveSettingsDraft.name.trim() !== s.name ? { name: liveSettingsDraft.name.trim() } : {}),
      autoQueueEnabled: liveSettingsDraft.autoQueueEnabled,
      respectPlayerRest: s.respectPlayerRest,
      ...(s.status !== "COMPLETED" && liveSettingsDraft.courtCount !== s.courts.length ? { courtCount: liveSettingsDraft.courtCount } : {}),
      courtLabels: Array.from({ length: liveSettingsDraft.courtCount }, (_, index) => ({
        courtNumber: index + 1,
        label: liveSettingsDraft.courtLabels[index + 1]?.trim() || null,
      })).filter(court => Object.hasOwn(liveSettingsDraft.courtLabels, court.courtNumber)),
      ...(s.status === "WAITING" ? {
        gameplaySettings: {
          matchmakingStyle: liveSettingsDraft.matchmakingStyle,
          balanceMetric: liveSettingsDraft.balanceMetric,
          pairingMode: liveSettingsDraft.pairingMode,
          poolsEnabled: liveSettingsDraft.poolsEnabled,
          crossoverFrequency: liveSettingsDraft.crossoverFrequency,
          courtCount: liveSettingsDraft.courtCount,
        },
      } : {}),
    };
    void action.run(
      async () => {
        if (!payload.autoQueueEnabled) await resource.cancelDeferredQueueRecovery();
        return api(endpoint, "PATCH", payload);
      },
      () => {
        setSheet("");
        setConfirmAutoQueueOff(false);
        setConfirmedQueueId(null);
      },
    );
  }
  function resetSession() {
    void action.run(
      async () => {
        await resource.cancelDeferredQueueRecovery();
        const snapshot = await api<SessionSnapshotLike>(endpoint + "/reset", "POST");
        resource.update(current => mergeSessionSnapshot(current, snapshot), { urgent: true });
      },
      () => {
        setScores({});
        confirmingMatchIdsRef.current = new Set();
        setConfirmingMatchIds(new Set());
        setScoreErrors({});
        setPauseOverlays({});
        setPauseError("");
        setQueuedMatchOverlay(null);
        setConfirmedQueueId(null);
        setSheet("");
        setTab("Courts");
      },
      { backgroundRefresh: true },
    );
  }
  async function deleteSession() {
    if (deleting) return;
    setDeleting(true);
    action.setError("");
    try {
      await resource.cancelDeferredQueueRecovery();
      await api(endpoint + "/delete", "DELETE");
      await onDeleted?.();
    } catch (error) {
      action.setError(error instanceof Error ? error.message : "Unable to delete session");
    } finally {
      setDeleting(false);
    }
  }
  async function rollbackSession() {
    if (rollingBack) return;
    setRollingBack(true);
    action.setError("");
    try {
      await api(endpoint + "/rollback", "POST");
      await onDeleted?.();
    } catch (error) {
      action.setError(error instanceof Error ? error.message : "Unable to roll back session");
    } finally {
      setRollingBack(false);
    }
  }
  function startManual(target: ManualTarget) {
    setManualTarget(target);
    setManualSelection([]);
    setCourtControlId(target.kind === "court" ? target.courtId : null);
    action.setError("");
    setSheet("manual-match");
  }
  function toggleManualPlayer(userId: string) {
    setManualSelection((current) => {
      if (current.includes(userId)) return current.filter((id) => id !== userId);
      if (current.length >= 4) return current;
      return [...current, userId];
    });
  }
  function startConfirmedControl(confirmation: ControlConfirmation) {
    setConfirmation(confirmation);
    action.setError("");
    setSheet("confirm-control");
  }
  async function runManualMatch() {
    if (!manualTarget || manualSelection.length !== 4) {
      throw new Error("Choose four active players for the match.");
    }
    const eligibleIds = new Set(manualPlayers.map((player) => player.userId));
    if (manualSelection.some((id) => !eligibleIds.has(id)) || new Set(manualSelection).size !== 4) {
      throw new Error("One or more selected players are no longer available. Review the lineup.");
    }
    const manualTeams = {
      team1: [manualSelection[0], manualSelection[1]],
      team2: [manualSelection[2], manualSelection[3]],
    };
    if (manualTarget.kind === "court") {
      await generateMatch({
        courtId: manualTarget.courtId,
        manualTeams,
      });
      return;
    }
    let replacedQueuedMatch = false;
    if (manualTarget.replaceQueuedMatch) {
      await changeQueuedMatch("DELETE");
      replacedQueuedMatch = true;
    }
    try {
      await changeQueuedMatch("POST", { manualTeams });
    } catch (error) {
      if (replacedQueuedMatch) {
        await refresh().catch(() => {});
        const detail = error instanceof Error ? error.message : "Unable to create the manual lineup.";
        throw new Error(`The previous next match was cleared, but the manual lineup could not be queued: ${detail}`);
      }
      throw error;
    }
  }
  async function confirmControlAction() {
    if (!confirmation) return;
    if (confirmation.kind === "court-player-rest") {
      await generateMatch({
        courtId: confirmation.courtId,
        forceReshuffle: true,
        excludedUserId: confirmation.playerId,
        restUserId: confirmation.playerId,
        expectedMatchId: confirmation.matchId,
      });
      return;
    }
    if (confirmation.kind === "court-reshuffle") {
      await generateMatch({
        courtId: confirmation.courtId,
        forceReshuffle: true,
      });
      return;
    }
    if (confirmation.kind === "court-undo") {
      await generateMatch({
        courtId: confirmation.courtId,
        undoCurrentMatch: true,
      });
      return;
    }
    await changeQueuedMatch("DELETE");
  }
  function runCourtPlayerAction(kind: "exclude" | "pause") {
    if (!courtPlayerAction) return;
    const target = courtPlayerAction;
    if (kind === "exclude") {
      void action.run(
        () => generateMatch({
          courtId: target.courtId,
          forceReshuffle: true,
          excludedUserId: target.player.id,
        }),
        finishControlAction,
      );
      return;
    }

    const targetCourt = s?.courts.find((court) => court.id === target.courtId);
    const currentMatchPlayerIds = new Set(
      targetCourt?.currentMatch?.id === target.matchId
        ? playersInMatch(targetCourt.currentMatch).map((player) => player.id)
        : [],
    );
    const queuedPlayerIds = new Set(
      s?.queuedMatch ? playerInQueue(s.queuedMatch).map((player) => player.id) : [],
    );
    const playersAvailableForCourt = s?.players.filter((player) =>
      !player.isPaused &&
      player.userId !== target.player.id &&
      !queuedPlayerIds.has(player.userId) &&
      (!busyPlayerIds.has(player.userId) || currentMatchPlayerIds.has(player.userId)),
    ).length ?? 0;
    let noReplacementMessage = "";
    void action.run(async () => {
      await api(endpoint + "/pause-player", "POST", {
        playerId: target.player.id,
        isPaused: true,
        courtId: target.courtId,
        currentMatchId: target.matchId,
      });

      if (playersAvailableForCourt < 4) {
        noReplacementMessage = "Player paused. The court is clear until four eligible players are available.";
        return;
      }

      try {
        await generateMatch({ courtId: target.courtId });
      } catch (error) {
        await refresh().catch(() => {});
        finishControlAction();
        const detail = error instanceof Error ? error.message : "No replacement match could be created.";
        throw new Error(`Player paused and the court was cleared. ${detail}`);
      }
    }, () => {
      finishControlAction();
      if (noReplacementMessage) action.setError(noReplacementMessage);
    });
  }
  function runQueuePlayerAction(kind: "exclude" | "replace", userId: string) {
    if (!controlQueue) return;
    void action.run(
      () => changeQueuedMatch("POST", {
        ...(kind === "exclude"
          ? { reshuffle: true, excludeUserId: userId }
          : { replaceUserId: userId }),
      }),
      finishControlAction,
    );
  }
  return (
    <div className={`pc-app${s?.status === "WAITING" ? " session-standby" : ""}`}>
      {saveRecapOpen && shareImage.images && s && <SessionRecapSavePanel
        images={shareImage.images} fileName={`${s.name}-standings`} onClose={() => setSaveRecapOpen(false)} />}
      <header className="pc-header">
        <button className="icon-button" aria-label="Back" onClick={onBack}>
          <ArrowLeft size={23} />
        </button>
        <div>
          <strong>{s?.name || "Session"}</strong>
          <small>{s?.clubs?.find((c) => c.role === "HOST")?.name}</small>
        </div>
        {s && (s.status !== "WAITING" || s.viewerCanDelete) ? (
          <button
            className="icon-button"
            aria-label="More options"
            onClick={() => setSheet("menu")}
          >
            <DotsThree size={26} />
          </button>
        ) : (
          <span />
        )}
      </header>
      <Pager pages={s?.status !== "ACTIVE" ? [tab] : sessionTabs} active={tab} onChange={navigateTab}>{tab => <>
          <ErrorText
            error={pauseError || resource.error || standings.error || (!sheet ? action.error : "")}
          />
          {!s && !resource.error && <p role="status">Loading session…</p>}
          {resource.error && !s && <button className="secondary" onClick={resource.retry}>Try again</button>}
          {canJoin && s && (tab === "Players" || s.status === "WAITING") && <SessionJoinProfilePanel code={code} sessionStatus={s.status} eligibleProfiles={s.eligibleProfiles ?? []} selectedSelf={s.selectedSelf ?? null} isInterclub={s.collabFormat === "INTERCLUB"} onJoined={profile => {
            resource.update(current => ({ ...current, viewerPlayerId: profile.playerId, selectedSelf: { playerId: profile.playerId, profileClubId: profile.profileClubId } }));
            void resource.refresh().catch(() => {});
          }} />}
          {canJoin && s?.status === "ACTIVE" && tab === "Courts" && <button className="secondary full" onClick={() => setTab("Players")}>Join session</button>}
          {s && isCollaboration && !globalClubId && (s.status === "WAITING" || tab === "Courts" || ended) && <ClubCollaboration session={s} data={collaboration.data} error={collaboration.error} onChanged={refresh} onManagePlayers={() => setManagePlayersOpen(true)} onReset={() => setSheet("reset")} />}
          {s && ended ? (
            <>
              {standings.data ? (
                <SessionFinishView
                  sessionName={s.name}
                  sessionType={s.type}
                  sessionSettings={s}
                  players={finalPlayers}
                  pointDiffByUserId={finalPointDiff}
                  playerStatsByUserId={finalPlayerStats}
                  onShareResults={finalPlayers.length > 0 ? () => void shareResults() : undefined}
                  sharingResults={sharing || shareImage.preparing}
                  sharePreparationFailed={!!shareImage.error}
                  celebrate={celebrateFinish}
                  highlights={sessionFinishHighlights(finalPlayers, sessionStats)}
                  onOpenMember={openMember}
                  profileMemberIds={profileMemberIds}
                >
                  {getInterclubScore(s) ? <InterclubScoreboard session={s} /> : null}
                </SessionFinishView>
              ) : <p role="status">Loading final results…</p>}
              <ErrorText error={shareError || (shareImage.error ? `${shareImage.error} Tap Try again to prepare the recap.` : "")} />
              <button className="primary" onClick={onBack}>
                Back to club
              </button>
              <button className="text-button full" onClick={() => { setCelebrateFinish(false); openHistory(); }}>
                Match history
              </button>
            </>
          ) : s?.status === "WAITING" ? (
            <SessionStandbyView
              session={s}
              canManage={canManage}
              canManagePlayers={canManageRoster}
              startBlocked={!!isCollaboration && (!collaboration.data || collaboration.data.clubs.filter(club=>club.status === "ACCEPTED").length !== 2 || !collaboration.data.clubs.filter(club=>club.status === "ACCEPTED").every(club=>club.rulesConfirmedRevision === collaboration.data?.rulesRevision))}
              busy={action.busy}
              onSettings={openLiveSettings}
              onManagePlayers={() => setManagePlayersOpen(true)}
              onStart={() => void action.run(
                () => api(endpoint + "/start", "POST"),
                () => setTab("Courts"),
              )}
              onOpenMember={openMember}
              profileMemberIds={profileMemberIds}
            />
          ) : s && tab === "Courts" ? (
            <>
              <div className="session-summary">
                <span>
                  <i className="live-indicator" />
                  Live session
                </span>
                <small>
                  {s.players.length} {s.players.length === 1 ? "player" : "players"} · {s.courts.length} {s.courts.length === 1 ? "court" : "courts"}
                </small>
              </div>
              <InterclubScoreboard session={s} />
              {canManage && !lineupMode && (creatableOpenCourtIds.length > 0 || canQueueNextMatch) && (
                <SessionMatchCreationToolbar
                  isHost={canManage && !lineupMode}
                  isActive={s.status === "ACTIVE"}
                  hasQueuedMatch={!!s.queuedMatch}
                  creatableOpenCourtIds={creatableOpenCourtIds}
                  canQueueNextMatch={canQueueNextMatch}
                  creatingMatches={action.busy}
                  creatingQueuedMatch={action.busy}
                  onGenerateMatch={(body) => void action.run(() => generateMatch(body))}
                  onQueueNextMatch={() => void action.run(() => changeQueuedMatch("POST"))}
                />
              )}
              {s.courts.map((court) => {
                const match = court.currentMatch;
                const groupLabel = matchGroupLabel(match);
                return (
                  <section className="court-card" key={court.id}>
                    <div className="section-heading">
                      <div className="court-heading-title">
                        <h3>{court.label || "Court " + court.courtNumber}</h3>
                        {groupLabel && <span className="court-group-label">{groupLabel}</span>}
                      </div>
                      <div className="court-heading-actions">
                        {(canManage || !!match) && (
                          <button
                            className="icon-button court-more"
                            aria-label={`${court.label || "Court " + court.courtNumber} options`}
                            onClick={() => openCourtControls(court)}
                          >
                            <DotsThree size={23} />
                          </button>
                        )}
                      </div>
                    </div>
                    {match ? (
                      <>
                        {[
                          [match.team1User1, match.team1User2],
                          [match.team2User1, match.team2User2],
                        ].map((team, i) => (
                          <div className="team-row" key={i}>
                            <div className="team-players">
                              {team.map((player) => canManage && !lineupMode ? (
                                <button
                                  type="button"
                                  className="match-player court-player-action"
                                  key={player.id}
                                  aria-label={`Player actions for ${player.name}`}
                                  disabled={action.busy || savingScoreMatchIds.has(match.id)}
                                  onClick={() => openCourtPlayerActions(court, player)}
                                >
                                  <Avatar name={player.name} url={player.avatarUrl} />
                                  <strong>{player.name}</strong>
                                </button>
                              ) : (
                                <span className="match-player" key={player.id}>
                                  <Avatar name={player.name} url={player.avatarUrl} />
                                  <strong>{player.name}</strong>
                                </span>
                              ))}
                            </div>
                            {match.scoringFormat === "BEST_OF_THREE" ? null : maySubmitScore(match) ? (
                              <>
                                <input
                                  ref={(node) => {
                                    scoreRefs.current[`${match.id}-${i}`] = node;
                                  }}
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  maxLength={isCollaboration ? 16 : 2}
                                  aria-label={"Team " + (i + 1) + " score"}
                                  disabled={savingScoreMatchIds.has(match.id)}
                                  value={score(match)[i]}
                                  onChange={(e) =>
                                    update(match, i, e.target.value, "court")
                                  }
                                />
                              </>
                            ) : (
                              <span className="score-placeholder">
                                {score(match)[i]}
                              </span>
                            )}
                          </div>
                        ))}
                        {match.scoringFormat === "BEST_OF_THREE" && <SeriesScoreEditor key={match.id} match={match} canEdit={maySubmitScore(match)} onSaved={refresh} />}
                        <ErrorText error={scoreErrors[match.id] ?? ""} />
                        {maySubmitScore(match) && match.scoringFormat !== "BEST_OF_THREE" && (
                          <button
                            className="primary"
                            disabled={action.busy || savingScoreMatchIds.has(match.id)}
                            aria-busy={savingScoreMatchIds.has(match.id)}
                            onClick={() => confirmScore(match)}
                          >
                            {confirmingMatchIds.has(match.id) ? "Confirm" : "Save score"}
                          </button>
                        )}
                        {match.status === MatchStatus.PENDING_APPROVAL && <div className="pending-score-actions">
                          <p role="status">Waiting for score approval</p>
                          {mayApproveScore(match) && <button className="primary" disabled={savingScoreMatchIds.has(match.id)} onClick={() => void pendingScoreAction(match, "approve")}>Approve score</button>}
                          {canManageRoster && <button className="secondary full" disabled={savingScoreMatchIds.has(match.id)} onClick={() => void pendingScoreAction(match, "reopen")}>Edit score</button>}
                        </div>}
                      </>
                    ) : (
                      <>
                        <CourtMatchCreateMenu
                          isHost={canManage && !lineupMode}
                          isActive={s.status === "ACTIVE"}
                          court={court}
                          players={s.players}
                          courts={s.courts}
                          queuedMatch={s.queuedMatch ?? null}
                          isCreating={action.busy}
                          onGenerateMatch={(courtId, matchType) => void action.run(() => generateMatch({ courtId, ...(matchType ? { matchType } : {}) }))}
                          onOpenManualMatch={(courtId) => startManual({ kind: "court", courtId })}
                        />
                      </>
                    )}
                  </section>
                );
              })}
              {queued && (
                <button className="next-up" aria-label="Next up options" onClick={openNextControls}>
                  <Clock size={21} />
                  <span>
                    <span className="next-up-heading">
                      <strong>Next up</strong>
                      {queuedGroupLabel && <span className="court-group-label">{queuedGroupLabel}</span>}
                    </span>
                    <span className="next-up-teams">
                      <span className="next-up-team">
                        {[queued.team1User1, queued.team1User2].map((player) => (
                          <span className="match-player" key={player.id}>
                            <Avatar name={player.name} url={player.avatarUrl} />
                            <strong>{player.name}</strong>
                          </span>
                        ))}
                      </span>
                      <b>vs</b>
                      <span className="next-up-team">
                        {[queued.team2User1, queued.team2User2].map((player) => (
                          <span className="match-player" key={player.id}>
                            <Avatar name={player.name} url={player.avatarUrl} />
                            <strong>{player.name}</strong>
                          </span>
                        ))}
                      </span>
                    </span>
                  </span>
                  <DotsThree size={23} />
                </button>
              )}
              {canManage && !lineupMode && !queued && s.courts.length > 0 && s.courts.every((court) => !!court.currentMatch) && s.players.filter((player) => !player.isPaused && !playingCourtFor(player.userId)).length >= 4 && (
                <button
                  className="secondary full"
                  onClick={() => startManual({ kind: "queue", replaceQueuedMatch: false })}
                >
                  Choose next match manually
                </button>
              )}
            </>
          ) : s && tab === "Players" ? (
            <>
              <div className="section-heading">
                <h2>Players</h2>
                <small>
                  {s.players.filter((p) => isRosterPlayerPaused(p)).length} taking a break
                </small>
              </div>
              {canManageRoster && (isCollaboration ? <button className="primary full" onClick={() => setManagePlayersOpen(true)}>Manage my club’s players</button> : (
                <div className="button-pair">
                  <button
                    className="primary"
                    onClick={() => {
                      setName("");
                      setRating("1000");
                      setGuestGender(PlayerGender.UNSPECIFIED);
                      setGuestMixedSideOverride(null);
                      setGuestRepresentingClubId("");
                      setSheet("guest");
                    }}
                  >
                    <Plus size={18} />
                    Add guest
                  </button>
                  <button className="secondary" onClick={() => setManagePlayersOpen(true)}>
                    Manage players
                  </button>
                </div>
              ))}
              <div className="roster">
                {activePlayers.map((p) => {
                  const isPaused = isRosterPlayerPaused(p);
                  return (
                    <div className="person" key={p.userId}>
                      <Avatar name={p.user.name} url={p.user.avatarUrl} />
                      <span className="person-info">
                        <strong>{p.user.name}</strong>
                        <small>{playerStatus(p)} · {p.user.elo}</small>
                      </span>
                      {ownsSessionSeat(p) && <button className="icon-button" aria-label={`Rest options for ${p.user.name}`} onClick={() => { setRestPlayerId(p.userId); setSheet("self-rest"); }}><DotsThree size={20} /></button>}
                      {((canManageRoster && mayManagePlayer(p)) || ownsSessionSeat(p)) && (
                        <button
                          className="icon-button"
                          aria-label={
                            (isPaused ? "Resume " : "Pause ") + p.user.name
                          }
                          disabled={pauseOverlays[p.userId]?.pending === true}
                          onClick={() => void toggleRosterPlayerPause(p.userId, isPaused)}
                        >
                          {isPaused ? <Play size={18} /> : <Pause size={18} />}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {pausedPlayers.length > 0 && (
                <section className="paused-players">
                  <div className="section-heading">
                    <h3>Paused</h3>
                    <small>{pausedPlayers.length} player{pausedPlayers.length === 1 ? "" : "s"}</small>
                  </div>
                  <div className="roster">
                    {pausedPlayers.map((p) => (
                      <div className="person" key={p.userId}>
                        <Avatar name={p.user.name} url={p.user.avatarUrl} />
                        <span className="person-info">
                          <strong>{p.user.name}</strong>
                          <small>{playerStatus(p)}</small>
                        </span>
                        {((canManageRoster && mayManagePlayer(p)) || ownsSessionSeat(p)) && (
                          <button
                            className="icon-button"
                            aria-label={`Resume ${p.user.name}`}
                            disabled={pauseOverlays[p.userId]?.pending === true}
                            onClick={() => void toggleRosterPlayerPause(p.userId, true)}
                          >
                            <Play size={18} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : (
            s && (
              <>
                <LiveSessionStandings
                  rows={standingRows}
                  groupsEnabled={s.poolsEnabled}
                  groupAName={s.poolAName ?? "Competitive"}
                  groupBName={s.poolBName ?? "Social"}
                  scoreLabel={s.type === SessionType.LADDER ? "net wins" : "points"}
                  onOpenMember={openMember}
                />
                <details>
                  <summary>How standings work</summary>
                  <p>
                    Standings use this session&apos;s scoring rules. Results update
                    after scores are saved.
                  </p>
                </details>
              </>
            )
          )}
      </>}</Pager>
      {s?.status === "ACTIVE" && (
        <nav className="bottom-nav" aria-label="Session navigation">
          {sessionTabs.map((t, i) => {
            const Icon = [UsersThree, SquaresFour, ChartBar][i];
            return (
              <button
                key={t}
                className={tab === t ? "active" : ""}
                aria-current={tab === t ? "page" : undefined}
                onClick={() => navigateTab(t)}
              >
                <Icon size={25} weight={tab === t ? "fill" : "regular"} />
                <span>{t}</span>
              </button>
            );
          })}
        </nav>
      )}
      <Sheet open={!!sheet}
          title={
            sheet === "self-rest" ? "Rest options" : sheet === "menu"
                ? "Options"
                : sheet === "end"
                  ? "End this session?"
                  : sheet === "rollback"
                    ? "Rollback this session?"
                  : sheet === "delete"
                    ? s?.status === "ACTIVE" ? "Cancel this session?" : "Delete this session?"
                  : sheet === "guest"
                    ? "Add guest"
                    : sheet === "settings"
                      ? "Session settings"
                      : sheet === "reset"
                        ? "Reset this session?"
                      : sheet === "court-player"
                        ? "Player actions"
                      : sheet === "court-controls"
                        ? courtControl?.label || `Court ${courtControl?.courtNumber ?? ""} options`
                      : sheet === "court-details"
                        ? "Details"
                      : sheet === "confirm-control"
                          ? confirmation?.kind === "court-player-rest"
                            ? "Rest this match?"
                            : confirmation?.kind === "court-undo"
                            ? "Clear court?"
                            : confirmation?.kind === "queue-clear"
                              ? "Clear next match?"
                              : "Reshuffle this match?"
                          : sheet === "manual-match"
                            ? manualTarget?.kind === "court"
                              ? "Create manual match"
                              : manualTarget?.replaceQueuedMatch
                                ? "Edit next match manually"
                                : "Choose next match"
                            : "Next match"
          }
          busy={action.busy || deleting || rollingBack}
          onClose={closeSheet}
        >
          <ErrorText error={action.error} />
          {sheet === "guest" ? (
            <>
              <label className="field-label">
                Name
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="field-label">
                Rating
                <input
                  type="number"
                  min="0"
                  max="5000"
                  value={rating}
                  onChange={(e) => setRating(e.target.value)}
                />
              </label>
              <label className="field-label">
                Gender
                <select value={guestGender} onChange={(event) => { setGuestGender(event.target.value as PlayerGender); setGuestMixedSideOverride(null); }}>
                  <option value={PlayerGender.UNSPECIFIED}>Choose gender</option>
                  <option value={PlayerGender.MALE}>Male</option>
                  <option value={PlayerGender.FEMALE}>Female</option>
                </select>
              </label>
              {guestGender !== PlayerGender.UNSPECIFIED ? (
                <label className="field-label">
                  Mixed doubles side
                  <select value={guestMixedSideOverride ?? ""} onChange={(event) => setGuestMixedSideOverride(event.target.value ? event.target.value as MixedSide : null)}>
                    <option value="">Default</option>
                    {(() => { const option = getMixedSideOverrideOptionForGender(guestGender); return option ? <option value={option.value}>{option.label}</option> : null; })()}
                  </select>
                </label>
              ) : null}
              {s?.collabFormat === "INTERCLUB" ? (
                <label className="field-label">
                  Represents
                  <select value={guestRepresentingClubId} onChange={(event) => setGuestRepresentingClubId(event.target.value)}>
                    <option value="">Choose club</option>
                    {(s.clubs ?? []).filter((club) => club.status === "ACCEPTED").map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
                  </select>
                </label>
              ) : null}
              <button
                className="primary"
                disabled={
                  name.trim().length < 2 ||
                  ![PlayerGender.MALE, PlayerGender.FEMALE].includes(guestGender) ||
                  (s?.collabFormat === "INTERCLUB" && !guestRepresentingClubId) ||
                  !rating.trim() ||
                  !Number.isInteger(Number(rating)) ||
                  Number(rating) < 0 ||
                  Number(rating) > 5000
                }
                onClick={() =>
                  void action.run(
                    () =>
                      api(endpoint + "/guests", "POST", {
                        name: name.trim(),
                        initialElo: Number(rating),
                        gender: guestGender,
                        mixedSideOverride: guestMixedSideOverride,
                        ...(s?.collabFormat === "INTERCLUB" ? { representingClubId: guestRepresentingClubId } : {}),
                      }),
                    () => setSheet(""),
                  )
                }
              >
                Add player
              </button>
            </>
          ) : sheet === "self-rest" && restPlayer && ownsSessionSeat(restPlayer) ? (
            <>
              <p>{restPlayer.user.name}</p>
              <button className="primary full" disabled={action.busy || (!restPlayer.skipNextMatchAt && isRosterPlayerPaused(restPlayer))} onClick={() => void action.run(() => api(`${endpoint}/players/${encodeURIComponent(restPlayer.userId)}/skip-next`, "PATCH", { skipNextMatch: !restPlayer.skipNextMatchAt }), () => setSheet(""))}>{restPlayer.skipNextMatchAt ? "Cancel skip" : "Skip next match"}</button>
              <button className="secondary full" disabled={pauseOverlays[restPlayer.userId]?.pending} onClick={() => { void toggleRosterPlayerPause(restPlayer.userId, isRosterPlayerPaused(restPlayer)); setSheet(""); }}>{isRosterPlayerPaused(restPlayer) ? "Resume playing" : playingCourtFor(restPlayer.userId) ? "Pause after this game" : "Pause playing"}</button>
            </>
          ) : sheet === "menu" ? (
            <>
              {canJoin && <Row title="Join session" icon={UsersThree} onClick={() => { setSheet(""); setTab("Players"); }} />}
              {canManage && (s?.isTest || s?.isTutorialClub) && onPracticeTools && <Row title="Practice tools" icon={GearSix} onClick={onPracticeTools} />}
              <Row title="Match history" icon={ClockCounterClockwise} onClick={() => { setSheet(""); openHistory(); }} />
              {canManage && !ended && <>
                <Row title="Session settings" icon={GearSix} onClick={openLiveSettings} />
                <Row title="End session" icon={SignOut} onClick={() => setSheet("end")} />
              </>}
              {s?.viewerCanDelete && (
                <Row title={s.status === "ACTIVE" ? "Cancel session" : "Delete session"} icon={Trash} onClick={() => { action.setError(""); setSheet("delete"); }} />
              )}
              {s?.viewerCanRollback && (
                <Row title="Rollback session" icon={Trash} onClick={() => { action.setError(""); setSheet("rollback"); }} />
              )}
            </>
          ) : sheet === "settings" ? (
            <>
              {s && liveSettingsDraft ? (
                <div className="live-settings">
                  {canRename ? (
                    <section className="live-settings-section">
                      <label className="live-settings-field">
                        Session name
                        <input
                          aria-label="Session name"
                          type="text"
                          value={liveSettingsDraft.name}
                          required
                          disabled={action.busy}
                          onChange={(event) => setLiveSettingsDraft((current) => current ? {
                            ...current,
                            name: event.target.value,
                          } : current)}
                        />
                      </label>
                    </section>
                  ) : null}
                  <section className="live-settings-section" aria-labelledby="live-matchmaking-heading">
                    <h3 id="live-matchmaking-heading">Session controls</h3>
                    <div className="live-settings-options">
                      <div className="live-settings-row">
                        <span>
                          <strong>Prepare the next game</strong>
                          <small>Reserve four players when all courts are busy.</small>
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-label="Prepare the next game"
                          aria-checked={liveSettingsDraft.autoQueueEnabled}
                          className={`live-settings-switch${liveSettingsDraft.autoQueueEnabled ? " is-on" : ""}`}
                          onClick={() => changeAutoQueue(!liveSettingsDraft.autoQueueEnabled)}
                        >
                          {liveSettingsDraft.autoQueueEnabled ? "On" : "Off"}
                        </button>
                      </div>
                    </div>
                    {confirmAutoQueueOff ? (
                      <div className="live-settings-warning" role="group" aria-label="Confirm turning off Prepare the next game">
                        <p>This session has a next match queued. Saving with “Prepare the next game” off will remove it.</p>
                        <div className="live-settings-confirm-actions">
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => liveSettingsDraft.autoQueueEnabled
                              ? setConfirmAutoQueueOff(false)
                              : changeAutoQueue(true)}
                          >
                            {liveSettingsDraft.autoQueueEnabled ? "Keep auto queue" : "Keep the next match"}
                          </button>
                          <button
                            type="button"
                            className="live-settings-confirm-button"
                            onClick={confirmDisableAutoQueue}
                          >
                            Turn off and clear on save
                          </button>
                        </div>
                      </div>
                    ) : !liveSettingsDraft.autoQueueEnabled && s.queuedMatch ? (
                      <p className="live-settings-warning" role="status">
                        Saving will remove the current next match.
                      </p>
                    ) : null}
                  </section>

                  <section className="live-settings-section" aria-labelledby="live-courts-heading">
                    <div className="live-settings-section-heading">
                      <h3 id="live-courts-heading">Courts</h3>
                      <p>Leave blank to use the default court name.</p>
                    </div>
                    {s.status !== "COMPLETED" && s.viewerCanChangeCourtCount !== false && (
                      <label className="live-settings-field">
                        Available courts
                        <select
                          aria-label="Court count"
                          className="live-settings-select"
                          value={liveSettingsDraft.courtCount}
                          disabled={action.busy}
                          onChange={(event) => setLiveSettingsDraft(current => current ? {
                            ...current, courtCount: Number(event.target.value),
                          } : current)}
                        >
                          {Array.from({ length: 10 }, (_, index) => index + 1).map(count => (
                            <option value={count} key={count}>{count}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    {liveSettingsDraft.courtCount < s.courts.length && (
                      <p className="live-settings-hint" role="status">
                        Courts {liveSettingsDraft.courtCount + 1}{liveSettingsDraft.courtCount + 1 < s.courts.length ? `–${s.courts.length}` : ""} will close. Finish or clear their matches first. Scores and history stay.
                      </p>
                    )}
                    <div className="live-settings-courts">
                      {Array.from({ length: liveSettingsDraft.courtCount }, (_, index) => {
                        const courtNumber = index + 1;
                        return (
                          <label className="live-settings-court" key={courtNumber}>
                            <span>Court {courtNumber}</span>
                            <input
                              aria-label={`Court ${courtNumber} label`}
                              type="text"
                              value={liveSettingsDraft.courtLabels[courtNumber] ?? ""}
                              maxLength={24}
                              placeholder={`Court ${courtNumber}`}
                              onChange={(event) => setLiveSettingsDraft((current) => current ? {
                                ...current,
                                courtLabels: {
                                  ...current.courtLabels,
                                  [courtNumber]: event.target.value,
                                },
                              } : current)}
                            />
                          </label>
                        );
                      })}
                    </div>
                  </section>

                  {s.status === "WAITING" ? (
                    <>
                      <section className="live-settings-section" aria-labelledby="live-format-heading">
                        <div className="live-settings-section-heading">
                          <h3 id="live-format-heading">Session format</h3>
                          <p>Choose how the next round of play will work.</p>
                        </div>
                        <label className="live-settings-field">
                          Matchmaking style
                          <select
                            aria-label="Matchmaking style"
                            className="live-settings-select"
                            value={liveSettingsDraft.matchmakingStyle}
                            onChange={(event) => setLiveSettingsDraft((current) => current ? {
                              ...current,
                              matchmakingStyle: event.target.value as SessionMatchmakingStyle,
                            } : current)}
                          >
                            <option value={SessionMatchmakingStyle.BALANCED}>Balanced</option>
                            <option value={SessionMatchmakingStyle.SOCIAL}>Social</option>
                            <option value={SessionMatchmakingStyle.LEVEL_MATCH}>Level match</option>
                          </select>
                        </label>
                        {liveSettingsDraft.matchmakingStyle !== SessionMatchmakingStyle.SOCIAL && (
                          <label className="live-settings-field">
                            Balance teams using
                            <select
                              aria-label="Balance teams using"
                              className="live-settings-select"
                              value={liveSettingsDraft.balanceMetric}
                              onChange={(event) => setLiveSettingsDraft((current) => current ? {
                                ...current,
                                balanceMetric: event.target.value as SessionBalanceMetric,
                              } : current)}
                            >
                              <option value={SessionBalanceMetric.RATING}>Club rating</option>
                              <option value={SessionBalanceMetric.SESSION_POINTS}>Session points</option>
                            </select>
                          </label>
                        )}
                        <label className="live-settings-field">
                          Pairing
                          <select
                            aria-label="Pairing"
                            className="live-settings-select"
                            value={liveSettingsDraft.pairingMode}
                            onChange={(event) => setLiveSettingsDraft((current) => current ? {
                              ...current,
                              pairingMode: event.target.value as SessionPairingMode,
                            } : current)}
                          >
                            <option value={SessionPairingMode.OPEN}>Open pairs</option>
                            <option value={SessionPairingMode.MIXED}>Mixed pairs</option>
                          </select>
                        </label>
                        <div className="live-settings-row live-settings-group-toggle">
                          <span>
                            <strong>Player groups</strong>
                            <small>Separate Competitive and Social players.</small>
                          </span>
                          <button
                            type="button"
                            role="switch"
                            aria-label="Player groups"
                            aria-checked={liveSettingsDraft.poolsEnabled}
                            className={`live-settings-switch${liveSettingsDraft.poolsEnabled ? " is-on" : ""}`}
                            onClick={() => setLiveSettingsDraft((current) => current ? {
                              ...current,
                              poolsEnabled: !current.poolsEnabled,
                            } : current)}
                          >
                            {liveSettingsDraft.poolsEnabled ? "On" : "Off"}
                          </button>
                        </div>
                        {liveSettingsDraft.poolsEnabled && (
                          <>
                            <label className="live-settings-field">
                              Mix groups
                              <select
                                aria-label="Mix groups"
                                className="live-settings-select"
                                value={liveSettingsDraft.crossoverFrequency}
                                onChange={(event) => setLiveSettingsDraft((current) => current ? {
                                  ...current,
                                  crossoverFrequency: event.target.value as SessionCrossoverFrequency,
                                } : current)}
                              >
                                <option value={SessionCrossoverFrequency.OCCASIONAL}>Occasionally</option>
                                <option value={SessionCrossoverFrequency.BALANCED}>Sometimes</option>
                                <option value={SessionCrossoverFrequency.FREQUENT}>Often</option>
                              </select>
                            </label>
                            <p className="live-settings-hint">Save this setting first, then use Manage players to assign groups. Each group needs at least two active players before the session can start.</p>
                          </>
                        )}
                      </section>
                    </>
                  ) : null}

                  <button
                    type="button"
                    className="primary"
                    disabled={!hasLiveSettingsChanges || action.busy || (canRename && !liveSettingsDraft.name.trim())}
                    onClick={saveLiveSettings}
                  >
                    {action.busy ? "Saving settings…" : "Save settings"}
                  </button>
                  {s.status === "ACTIVE" ? (
                    <details className="live-settings-format">
                      <summary>
                        <strong>Session format</strong>
                        <span>Fixed while live</span>
                      </summary>
                      <div className="live-settings-readonly" aria-label="Current game format">
                        <div className="setting-line">
                          <span>Court count</span>
                          <strong>{s.courts.length}</strong>
                        </div>
                        <div className="setting-line">
                          <span>Matchmaking style</span>
                          <strong>{s.matchmakingStyle?.toLowerCase().replaceAll("_", " ") || "—"}</strong>
                        </div>
                      </div>
                    </details>
                  ) : null}
                  {s.status === "ACTIVE" && canManage && !isCollaboration ? (
                    <button
                      type="button"
                      className="secondary full danger-outline"
                      disabled={action.busy}
                      onClick={() => setSheet("reset")}
                    >
                      Reset session to change setup
                    </button>
                  ) : null}
                </div>
              ) : <p role="status">Loading session settings…</p>}
            </>
          ) : sheet === "reset" ? (
            <>
              <p>This permanently removes every match, score, and standing from this session, and reverses its rating changes.</p>
              <p className="muted">The roster and current settings stay. The session returns to Ready to play, where you can change its setup before starting again.</p>
              <button
                type="button"
                className="secondary full danger-outline"
                disabled={action.busy || (!!isCollaboration && (!collaboration.data?.capabilities.host || !collaboration.data.clubs.filter(club=>club.status === "ACCEPTED").every(club=>club.resetConfirmedRevision === collaboration.data?.resultsRevision)))}
                onClick={resetSession}
              >
                {action.busy ? "Resetting session…" : "Reset session"}
              </button>
              <button type="button" className="text-button" disabled={action.busy} onClick={() => setSheet("settings")}>
                Keep playing
              </button>
            </>
          ) : sheet === "end" ? (
            <>
              <p>
                Finish {s?.name} and view the results? Everyone will stop
                playing.
              </p>
              {s?.courts.some((c) => c.currentMatch) && (
                <p className="muted">
                  There are unsaved court results. Save them first if you want
                  to keep them.
                </p>
              )}
              {lineupMode && collaboration.data?.lineup.some(row=>!row.cancelled&&!row.matchId) && <label className="setup-toggle"><span>Acknowledge remaining unplayed matches</span><input type="checkbox" checked={acknowledgeRemainingLineup} onChange={e=>setAcknowledgeRemainingLineup(e.target.checked)} /></label>}
              <button
                className="primary"
                disabled={lineupMode && (!acknowledgeRemainingLineup && !!collaboration.data?.lineup.some(row=>!row.cancelled&&!row.matchId) || !!s?.courts.some(court=>court.currentMatch))}
                onClick={() =>
                  void action.run(
                    async () => {
                      await resource.cancelDeferredQueueRecovery();
                      if (lineupMode) await api(endpoint + "/end", "POST", {acknowledgeRemainingLineup});
                      else await api(endpoint + "/end", "POST");
                      setCelebrateFinish(true);
                    },
                    async () => {
                      setSheet("");
                      await onEnded();
                    },
                  )
                }
              >
                End session
              </button>
              <button className="text-button" onClick={() => setSheet("")}>
                Keep playing
              </button>
            </>
          ) : sheet === "rollback" ? (
            <>
              <p>This permanently removes {s?.name || "this session"}, including its matches, scores, and standings.</p>
              <p className="muted">Rating changes from this session will be reversed. This cannot be undone.</p>
              <button type="button" className="secondary full danger-outline" disabled={rollingBack} onClick={() => void rollbackSession()}>
                {rollingBack ? "Rolling back session…" : "Rollback and delete session"}
              </button>
              <button type="button" className="text-button" disabled={rollingBack} onClick={() => setSheet("")}>Keep session</button>
            </>
          ) : sheet === "delete" ? (
            <>
              <p>This permanently removes {s?.name || "this session"}, including its matches, scores, and standings.</p>
              {s?.status !== "WAITING" && <p className="muted">Any rating changes from this session will be reversed.</p>}
              <p className="muted">This cannot be undone.</p>
              <button type="button" className="secondary full danger-outline" disabled={deleting} onClick={() => void deleteSession()}>
                {deleting ? "Deleting session…" : s?.status === "ACTIVE" ? "Cancel and delete session" : "Delete session"}
              </button>
              <button type="button" className="text-button" onClick={() => setSheet("")}>Keep session</button>
            </>
          ) : sheet === "court-player" && courtPlayerAction ? (
            <>
              <div className="court-player-action-identity">
                <Avatar name={courtPlayerAction.player.name} url={courtPlayerAction.player.avatarUrl} large />
                <strong>{courtPlayerAction.player.name}</strong>
              </div>
              <div className="court-action-list">
                <button
                  type="button"
                  className="court-action-row"
                  aria-label={`Reshuffle without ${courtPlayerAction.player.name}`}
                  disabled={action.busy}
                  onClick={() => runCourtPlayerAction("exclude")}
                >
                  Reshuffle without
                </button>
                <button
                  type="button"
                  className="court-action-row"
                  disabled={action.busy}
                  onClick={() => {
                    setConfirmation({
                      kind: "court-player-rest",
                      courtId: courtPlayerAction.courtId,
                      matchId: courtPlayerAction.matchId,
                      playerId: courtPlayerAction.player.id,
                    });
                    setSheet("confirm-control");
                  }}
                >
                  Rest
                </button>
                <button
                  type="button"
                  className="court-action-row"
                  disabled={action.busy}
                  onClick={() => runCourtPlayerAction("pause")}
                >
                  Pause player
                </button>
              </div>
            </>
          ) : sheet === "court-details" && s && controlMatch ? (
            <CourtPairingDetails match={controlMatch} session={s} />
          ) : sheet === "court-controls" && courtControl ? (
            controlMatch ? (
              <>
                <div className="court-action-list">
                  <button
                    type="button"
                    className="court-action-row"
                    onClick={() => setSheet("court-details")}
                  >
                    Details
                  </button>
                  {canManage && !lineupMode && <>
                  <button
                    type="button"
                    className="court-action-row"
                    disabled={action.busy}
                    onClick={() => startConfirmedControl({ kind: "court-reshuffle", courtId: courtControl.id })}
                  >
                    Reshuffle match
                  </button>
                  <button
                    type="button"
                    className="court-action-row"
                    disabled={action.busy}
                    onClick={() => startConfirmedControl({ kind: "court-undo", courtId: courtControl.id })}
                  >
                    Clear court
                  </button>
                  </>}
                </div>
              </>
            ) : canManage && !lineupMode ? (
              <>
                <p className="control-intro">Set a specific 2v2 lineup for this open court.</p>
                <button
                  className="primary"
                  disabled={action.busy || getManualPlayers({ kind: "court", courtId: courtControl.id }).length < 4}
                  onClick={() => startManual({ kind: "court", courtId: courtControl.id })}
                >
                  Manual 2v2 match
                </button>
                {getManualPlayers({ kind: "court", courtId: courtControl.id }).length < 4 && <p className="muted">Four active players are required.</p>}
              </>
            ) : null
          ) : sheet === "confirm-control" && confirmation ? (
            <>
              {confirmation.kind === "court-player-rest" ? (
                <p>This counts as your turn.</p>
              ) : confirmation.kind === "court-reshuffle" ? (
                <p>Choose a different lineup for {courtControl?.label || `Court ${courtControl?.courtNumber ?? ""}`}? The current four players return to the pool.</p>
              ) : confirmation.kind === "court-undo" ? (
                <p>Return the four players on {courtControl?.label || `Court ${courtControl?.courtNumber ?? ""}`} to the available pool and clear this court?</p>
              ) : (
                <p>Remove the queued next match and return its players to the available pool?</p>
              )}
              <button
                className="primary"
                disabled={action.busy}
                onClick={() => void action.run(confirmControlAction, () => {
                  finishControlAction();
                }, { backgroundRefresh: confirmation.kind === "court-undo" })}
              >
                {confirmation.kind === "court-player-rest" ? "Confirm rest" : confirmation.kind === "court-reshuffle" ? "Reshuffle match" : confirmation.kind === "court-undo" ? "Clear court" : "Clear next match"}
              </button>
              <button className="text-button" disabled={action.busy} onClick={() => {
                const returnSheet = confirmation.kind === "queue-clear" ? "next" : confirmation.kind === "court-player-rest" ? "court-player" : "court-controls";
                setConfirmation(null);
                setSheet(returnSheet);
              }}>
                {confirmation.kind === "court-player-rest" ? "Cancel" : "Keep current lineup"}
              </button>
            </>
          ) : sheet === "manual-match" && manualTarget ? (
            <>
              <p className="control-intro">
                {manualTarget.kind === "queue" && manualTarget.replaceQueuedMatch
                  ? "Choose four active players. Saving replaces the current Next up match."
                  : manualTarget.kind === "queue"
                    ? "Choose four active players for the next match."
                    : `Choose four active players for ${s?.courts.find((court) => court.id === manualTarget.courtId)?.label || "this court"}.`}
              </p>
              {manualSelection.length > 0 && (
                <div className="manual-team-summary">
                  <div><strong>Team 1</strong><span>{manualSelection.slice(0, 2).map((id) => manualPlayers.find((p) => p.userId === id)?.user.name).filter(Boolean).join(" & ") || "Choose two players"}</span></div>
                  <b>vs</b>
                  <div><strong>Team 2</strong><span>{manualSelection.slice(2, 4).map((id) => manualPlayers.find((p) => p.userId === id)?.user.name).filter(Boolean).join(" & ") || "Choose two players"}</span></div>
                </div>
              )}
              <div className="manual-player-list">
                {manualPlayers.map((player) => {
                  const selectionIndex = manualSelection.indexOf(player.userId);
                  return (
                    <button
                      key={player.userId}
                      className="manual-player-option"
                      aria-pressed={selectionIndex >= 0}
                      disabled={action.busy || (selectionIndex < 0 && manualSelection.length >= 4)}
                      onClick={() => toggleManualPlayer(player.userId)}
                    >
                      <Avatar name={player.user.name} url={player.user.avatarUrl} />
                      <strong>{player.user.name}</strong>
                      <span>{selectionIndex < 0 ? "Add" : `Team ${selectionIndex < 2 ? 1 : 2} · ${selectionIndex % 2 + 1}`}</span>
                    </button>
                  );
                })}
              </div>
              {manualPlayers.length < 4 && <p className="muted">Four active players are required.</p>}
              <p className="muted" aria-live="polite">{Math.min(manualSelection.length, 4)} of 4 selected</p>
              <button
                className="primary"
                disabled={action.busy || manualSelection.length !== 4 || manualPlayers.length < 4}
                onClick={() => void action.run(runManualMatch, () => {
                  finishControlAction();
                })}
              >
                {manualTarget.kind === "queue" ? "Save next match" : "Create match"}
              </button>
            </>
          ) : sheet === "next" && queued ? (
            <>
              <div className="next-teams">
                <div className="next-team">
                  {[queued.team1User1, queued.team1User2].map((player) => (
                    <span className="match-player" key={player.id}>
                      <Avatar name={player.name} url={player.avatarUrl} />
                      <strong>{player.name}</strong>
                    </span>
                  ))}
                </div>
                <span>vs</span>
                <div className="next-team">
                  {[queued.team2User1, queued.team2User2].map((player) => (
                    <span className="match-player" key={player.id}>
                      <Avatar name={player.name} url={player.avatarUrl} />
                      <strong>{player.name}</strong>
                    </span>
                  ))}
                </div>
              </div>
              <p className="muted">
                {s?.courts.some((c) => !c.currentMatch)
                  ? "A court is ready."
                  : "Courts are still in use."}
              </p>
              {canManage && (
                <>
                  <button
                    className="secondary full control-action"
                    disabled={action.busy}
                    onClick={() => void action.run(
                      () => changeQueuedMatch("POST", { reshuffle: true }),
                      finishControlAction,
                    )}
                  >
                    Reshuffle next match
                  </button>
                  <div className="control-section">
                    <h3>Reshuffle without one player</h3>
                    <div className="control-player-list">
                      {playerInQueue(queued).map((player) => (
                        <button
                          key={player.id}
                          className="control-player-button"
                          disabled={action.busy}
                          onClick={() => runQueuePlayerAction("exclude", player.id)}
                        >
                          <Avatar name={player.name} url={player.avatarUrl} />
                          <span>Leave out {player.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="control-section">
                    <h3>Replace one player</h3>
                    <div className="control-player-list">
                      {playerInQueue(queued).map((player) => (
                        <button
                          key={player.id}
                          className="control-player-button"
                          disabled={action.busy}
                          onClick={() => runQueuePlayerAction("replace", player.id)}
                        >
                          <Avatar name={player.name} url={player.avatarUrl} />
                          <span>Replace {player.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    className="secondary full"
                    disabled={action.busy}
                    onClick={() => startManual({ kind: "queue", replaceQueuedMatch: true })}
                  >
                    Edit manually
                  </button>
                  <button
                    className="secondary full danger-outline"
                    disabled={action.busy}
                    onClick={() => startConfirmedControl({ kind: "queue-clear" })}
                  >
                    Clear next match
                  </button>
                </>
              )}
              {canManage && (
                <button
                  className="primary"
                  disabled={!s?.courts.some((c) => !c.currentMatch)}
                  onClick={() =>
                    void action.run(
                      () => api(endpoint + "/queue-match/assign", "POST"),
                      finishControlAction,
                    )
                  }
                >
                  Start next match
                </button>
              )}
            </>
          ) : (
            <p>No match queued yet.</p>
          )}
      </Sheet>
      {s && <LivePlayerManagement
        code={code}
        session={s}
        open={managePlayersOpen && canManageRoster && !ended}
        onClose={() => setManagePlayersOpen(false)}
        onChanged={refresh}
        manageableClubIds={manageableClubIds}
      />}
    </div>
  );
}
