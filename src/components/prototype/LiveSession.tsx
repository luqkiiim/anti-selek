"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  DotsThree,
  House,
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
} from "@/types/enums";
import { api, useResource, useAction } from "./api";
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
import { shareSessionStandingsImage } from "@/lib/sessionShareImageClient";
import { getInterclubScore } from "@/lib/interclubScoreboard";
import { CourtMatchCreateMenu, SessionMatchCreationToolbar } from "./SessionMatchCreationControls";
type LiveSettingsDraft = {
  autoQueueEnabled: boolean;
  respectPlayerRest: boolean;
  courtLabels: Record<number, string>;
  matchmakingStyle: SessionMatchmakingStyle;
  balanceMetric: SessionBalanceMetric;
  pairingMode: SessionPairingMode;
  poolsEnabled: boolean;
  crossoverFrequency: SessionCrossoverFrequency;
  courtCount: number;
};
type ManualTarget =
  | { kind: "court"; courtId: string }
  | { kind: "queue"; replaceQueuedMatch: boolean };
type ControlConfirmation =
  | { kind: "court-reshuffle"; courtId: string }
  | { kind: "court-undo"; courtId: string }
  | { kind: "queue-clear" };
type CourtPlayerAction = {
  courtId: string;
  matchId: string;
  player: Match["team1User1"];
};
export default function LiveSession({
  code,
  onBack,
  onEnded,
  onDeleted,
  onOpenMember,
  profileMemberIds,
}: {
  code: string;
  onBack: () => void;
  onEnded: () => Promise<void>;
  onDeleted?: () => Promise<void>;
  onOpenMember?: (userId: string) => void;
  profileMemberIds?: readonly string[];
}) {
  const endpoint = "/api/sessions/" + code;
  const resource = useResource<SessionData>(endpoint);
  const s = resource.data;
  const standings = useResource<{
    currentLeaderboard: {
      userId: string;
      name: string;
      sessionPoints: number;
      score?: number;
    }[];
  }>(endpoint + "/leaderboard");
  const [tab, setTab] = useState("Courts"),
    [sheet, setSheet] = useState(""),
    [confirmingMatchIds, setConfirmingMatchIds] = useState<Set<string>>(() => new Set()),
    [savingScoreMatchIds, setSavingScoreMatchIds] = useState<Set<string>>(() => new Set()),
    [scoreErrors, setScoreErrors] = useState<Record<string, string>>({}),
    [scores, setScores] = useState<Record<string, [string, string]>>({}),
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
  const [showHistory, setShowHistory] = useState(false);
  const [managePlayersOpen, setManagePlayersOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [celebrateFinish, setCelebrateFinish] = useState(false);
  const [shareError, setShareError] = useState("");
  const [liveSettingsDraft, setLiveSettingsDraft] = useState<LiveSettingsDraft | null>(null);
  const [confirmAutoQueueOff, setConfirmAutoQueueOff] = useState(false);
  const [confirmedQueueId, setConfirmedQueueId] = useState<string | null>(null);
  const sessionTabs = ["Players", "Courts", "Standings"] as const;
  function navigateTab(nextTab: string) { setTab(nextTab); }
  async function refresh() {
    await Promise.all([resource.refresh(), standings.refresh()]);
  }
  const action = useAction(refresh);
  const refreshSession=resource.refresh,refreshStandings=standings.refresh;
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden && !action.busy && savingScoreMatchIds.size === 0) {
        void refreshSession().catch(() => {});
        void refreshStandings().catch(() => {});
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [refreshSession, refreshStandings, action.busy, savingScoreMatchIds]);
  const canManage = !!s?.viewerCanManage && !s?.viewerIsQuickAccess;
  const ended = s?.status === "COMPLETED";
  const sessionPlayerById = new Map(s?.players.map((player) => [player.userId, player]) ?? []);
  const profileMemberIdSet = new Set(profileMemberIds ?? []);
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
    setSharing(true);
    setShareError("");
    try {
      await shareSessionStandingsImage({
        code,
        fileName: `${s.name}-standings`,
        shareTitle: `${s.name} standings`,
      });
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
      liveSettingsDraft.autoQueueEnabled !== s.autoQueueEnabled ||
      liveSettingsDraft.respectPlayerRest !== s.respectPlayerRest ||
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
        liveSettingsDraft.crossoverFrequency !== s.crossoverFrequency ||
        liveSettingsDraft.courtCount !== s.courts.length
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
      scores[m.id] ?? [
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
    const value = v.replace(/\D/g, "").slice(0, 2);
    setScores((prev) => {
      const next: [string, string] = [...score(m)];
      next[i] = value;
      return { ...prev, [m.id]: next };
    });
    if (autoAdvance && i === 0 && value.length === 2) {
      requestAnimationFrame(() => {
        scoreRefs.current[`${autoAdvance === "sheet" ? "sheet" : m.id}-1`]?.focus();
      });
    }
  }
  const queued = s?.queuedMatch;
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
  function playerStatus(player: SessionData["players"][number]) {
    const court = playingCourtFor(player.userId);
    if (court) {
      return player.isPaused
        ? "Pausing after game"
        : `Playing on ${court.label || "Court " + court.courtNumber}`;
    }
    return player.isPaused ? "Paused" : "Waiting";
  }
  const activePlayers = s?.players.filter((player) =>
    !player.isPaused || !!playingCourtFor(player.userId),
  ) ?? [];
  const pausedPlayers = s?.players.filter((player) =>
    player.isPaused && !playingCourtFor(player.userId),
  ) ?? [];
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
      values.some((v) => !Number.isInteger(v) || v < 0 || v > 99) ||
      values[0] === values[1]
    )
      throw new Error("Enter unequal whole scores from 0 to 99.");
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
      await api(
        "/api/matches/" + match.id + "/score",
        "POST",
        { team1Score: values[0], team2Score: values[1] },
      );
      await refresh();
      setMatchConfirmation(match.id, false);
    } catch (error) {
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
    setLiveSettingsDraft({
      autoQueueEnabled: s.autoQueueEnabled,
      respectPlayerRest: s.respectPlayerRest,
      courtLabels: Object.fromEntries(
        s.courts.map((court) => [court.courtNumber, court.label ?? ""]),
      ),
      matchmakingStyle: s.matchmakingStyle ?? SessionMatchmakingStyle.BALANCED,
      balanceMetric: s.balanceMetric ?? SessionBalanceMetric.RATING,
      pairingMode: s.pairingMode ?? SessionPairingMode.OPEN,
      poolsEnabled: s.poolsEnabled,
      crossoverFrequency: s.crossoverFrequency,
      courtCount: s.courts.length,
    });
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
    const queuedMatchWillBeCleared =
      !liveSettingsDraft.autoQueueEnabled && !!s.queuedMatch;
    if (queuedMatchWillBeCleared && confirmedQueueId !== s.queuedMatch?.id) {
      setConfirmAutoQueueOff(true);
      return;
    }
    const payload = {
      autoQueueEnabled: liveSettingsDraft.autoQueueEnabled,
      respectPlayerRest: liveSettingsDraft.respectPlayerRest,
      courtLabels: Array.from({ length: liveSettingsDraft.courtCount }, (_, index) => ({
        courtNumber: index + 1,
        label: liveSettingsDraft.courtLabels[index + 1]?.trim() || null,
      })),
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
      () => api(endpoint, "PATCH", payload),
      () => {
        setSheet("");
        setConfirmAutoQueueOff(false);
        setConfirmedQueueId(null);
      },
    );
  }
  function resetSession() {
    void action.run(
      () => api(endpoint + "/reset", "POST"),
      () => {
        setScores({});
        confirmingMatchIdsRef.current = new Set();
        setConfirmingMatchIds(new Set());
        setScoreErrors({});
        setSheet("");
        setTab("Courts");
      },
    );
  }
  async function deleteSession() {
    if (deleting) return;
    setDeleting(true);
    action.setError("");
    try {
      await api(endpoint + "/delete", "DELETE");
      await onDeleted?.();
    } catch (error) {
      action.setError(error instanceof Error ? error.message : "Unable to delete session");
    } finally {
      setDeleting(false);
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
      await api(endpoint + "/generate-match", "POST", {
        courtId: manualTarget.courtId,
        manualTeams,
      });
      return;
    }
    let replacedQueuedMatch = false;
    if (manualTarget.replaceQueuedMatch) {
      await api(endpoint + "/queue-match", "DELETE");
      replacedQueuedMatch = true;
    }
    try {
      await api(endpoint + "/queue-match", "POST", { manualTeams });
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
    if (confirmation.kind === "court-reshuffle") {
      await api(endpoint + "/generate-match", "POST", {
        courtId: confirmation.courtId,
        forceReshuffle: true,
      });
      return;
    }
    if (confirmation.kind === "court-undo") {
      await api(endpoint + "/generate-match", "POST", {
        courtId: confirmation.courtId,
        undoCurrentMatch: true,
      });
      return;
    }
    await api(endpoint + "/queue-match", "DELETE");
  }
  function runCourtPlayerAction(kind: "exclude" | "pause") {
    if (!courtPlayerAction) return;
    const target = courtPlayerAction;
    if (kind === "exclude") {
      void action.run(
        () => api(endpoint + "/generate-match", "POST", {
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
        userId: target.player.id,
        isPaused: true,
        courtId: target.courtId,
        currentMatchId: target.matchId,
      });

      if (playersAvailableForCourt < 4) {
        noReplacementMessage = "Player paused. The court is clear until four eligible players are available.";
        return;
      }

      try {
        await api(endpoint + "/generate-match", "POST", { courtId: target.courtId });
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
      () => api(endpoint + "/queue-match", "POST", {
        ...(kind === "exclude"
          ? { reshuffle: true, excludeUserId: userId }
          : { replaceUserId: userId }),
      }),
      finishControlAction,
    );
  }
  return (
    <div className={`pc-app${s?.status === "WAITING" ? " session-standby" : ""}`}>
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
            error={resource.error || standings.error || (!sheet ? action.error : "")}
          />
          {!s && <p role="status">Loading session…</p>}
          {s && ended ? (
            <>
              {standings.data ? (
                <SessionFinishView
                  sessionName={s.name}
                  sessionType={s.type}
                  players={finalPlayers}
                  pointDiffByUserId={finalPointDiff}
                  playerStatsByUserId={finalPlayerStats}
                  onShareResults={finalPlayers.length > 0 ? () => void shareResults() : undefined}
                  sharingResults={sharing}
                  celebrate={celebrateFinish}
                  highlights={sessionFinishHighlights(finalPlayers, sessionStats)}
                  onOpenMember={onOpenMember}
                  profileMemberIds={profileMemberIds}
                >
                  {getInterclubScore(s) ? <InterclubScoreboard session={s} /> : null}
                </SessionFinishView>
              ) : <p role="status">Loading final results…</p>}
              <ErrorText error={shareError} />
              <button className="primary" onClick={onBack}>
                Back to club
              </button>
              <button className="text-button full" onClick={() => { setCelebrateFinish(false); setShowHistory(true); }}>
                Match history
              </button>
            </>
          ) : s?.status === "WAITING" ? (
            <SessionStandbyView
              session={s}
              canManage={canManage}
              busy={action.busy}
              onSettings={openLiveSettings}
              onManagePlayers={() => setManagePlayersOpen(true)}
              onStart={() => void action.run(
                () => api(endpoint + "/start", "POST"),
                () => setTab("Courts"),
              )}
              onOpenMember={onOpenMember}
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
                  {s.players.length} players · {s.courts.length} courts
                </small>
              </div>
              <InterclubScoreboard session={s} />
              {canManage && (creatableOpenCourtIds.length > 0 || canQueueNextMatch) && (
                <SessionMatchCreationToolbar
                  isHost={canManage}
                  isActive={s.status === "ACTIVE"}
                  hasQueuedMatch={!!s.queuedMatch}
                  creatableOpenCourtIds={creatableOpenCourtIds}
                  canQueueNextMatch={canQueueNextMatch}
                  creatingMatches={action.busy}
                  creatingQueuedMatch={action.busy}
                  onGenerateMatch={(body) => void action.run(() => api(endpoint + "/generate-match", "POST", body))}
                  onQueueNextMatch={() => void action.run(() => api(endpoint + "/queue-match", "POST"))}
                />
              )}
              {s.courts.map((court) => {
                const match = court.currentMatch;
                return (
                  <section className="court-card" key={court.id}>
                    <div className="section-heading">
                      <h3>{court.label || "Court " + court.courtNumber}</h3>
                      <div className="court-heading-actions">
                        {canManage && (
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
                              {team.map((player) => canManage ? (
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
                            {canManage ? (
                              <>
                                <input
                                  ref={(node) => {
                                    scoreRefs.current[`${match.id}-${i}`] = node;
                                  }}
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  maxLength={2}
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
                        <ErrorText error={scoreErrors[match.id] ?? ""} />
                        {canManage && (
                          <button
                            className="primary"
                            disabled={action.busy || savingScoreMatchIds.has(match.id)}
                            aria-busy={savingScoreMatchIds.has(match.id)}
                            onClick={() => confirmScore(match)}
                          >
                            {confirmingMatchIds.has(match.id) ? "Confirm" : "Save score"}
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <CourtMatchCreateMenu
                          isHost={canManage}
                          isActive={s.status === "ACTIVE"}
                          court={court}
                          players={s.players}
                          courts={s.courts}
                          queuedMatch={s.queuedMatch ?? null}
                          isCreating={action.busy}
                          onGenerateMatch={(courtId, matchType) => void action.run(() => api(endpoint + "/generate-match", "POST", { courtId, ...(matchType ? { matchType } : {}) }))}
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
                    <strong>Next up</strong>
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
              {canManage && !queued && s.courts.length > 0 && s.courts.every((court) => !!court.currentMatch) && s.players.filter((player) => !player.isPaused && !playingCourtFor(player.userId)).length >= 4 && (
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
                  {s.players.filter((p) => p.isPaused).length} taking a break
                </small>
              </div>
              {canManage && (
                <div className="button-pair">
                  <button
                    className="primary"
                    onClick={() => {
                      setName("");
                      setRating("1000");
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
              )}
              <div className="roster">
                {activePlayers.map((p) => (
                  <div className="person" key={p.userId}>
                    <Avatar name={p.user.name} url={p.user.avatarUrl} />
                    <span className="person-info">
                      <strong>{p.user.name}</strong>
                      <small>{playerStatus(p)} · {p.user.elo}</small>
                    </span>
                    {canManage && (
                      <button
                        className="icon-button"
                        aria-label={
                          (p.isPaused ? "Resume " : "Pause ") + p.user.name
                        }
                        disabled={action.busy}
                        onClick={() =>
                          void action.run(() =>
                            api(endpoint + "/pause-player", "POST", {
                              userId: p.userId,
                              isPaused: !p.isPaused,
                            }),
                          )
                        }
                      >
                        {p.isPaused ? <Play size={18} /> : <Pause size={18} />}
                      </button>
                    )}
                  </div>
                ))}
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
                        {canManage && (
                          <button
                            className="icon-button"
                            aria-label={`Resume ${p.user.name}`}
                            disabled={action.busy}
                            onClick={() =>
                              void action.run(() =>
                                api(endpoint + "/pause-player", "POST", {
                                  userId: p.userId,
                                  isPaused: false,
                                }),
                              )
                            }
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
                  onOpenMember={onOpenMember}
                />
                <details>
                  <summary>How rankings work</summary>
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
            const Icon = [UsersThree, House, ChartBar][i];
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
            sheet === "menu"
                ? "Options"
                : sheet === "end"
                  ? "End this session?"
                  : sheet === "delete"
                    ? s?.status === "WAITING" ? "Delete this session?" : "Cancel this session?"
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
                        : sheet === "confirm-control"
                          ? confirmation?.kind === "court-undo"
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
          busy={action.busy || deleting}
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
              <button
                className="primary"
                disabled={
                  name.trim().length < 2 ||
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
                      }),
                    () => setSheet(""),
                  )
                }
              >
                Add player
              </button>
            </>
          ) : sheet === "menu" ? (
            <>
              <Row title="Match history" icon={ClockCounterClockwise} onClick={() => { setSheet(""); setShowHistory(true); }} />
              {canManage && !ended && <>
                <Row title="Session settings" icon={GearSix} onClick={openLiveSettings} />
                <Row title="End session" icon={SignOut} onClick={() => setSheet("end")} />
              </>}
              {s?.viewerCanDelete && (
                <Row title={s.status === "WAITING" ? "Delete session" : "Cancel session"} icon={Trash} onClick={() => { action.setError(""); setSheet("delete"); }} />
              )}
            </>
          ) : sheet === "settings" ? (
            <>
              {s && liveSettingsDraft ? (
                <div className="live-settings">
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
                      <div className="live-settings-row">
                        <span>
                          <strong>Respect extra rest</strong>
                          <small>Use players’ saved rest preferences.</small>
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-label="Respect extra rest"
                          aria-checked={liveSettingsDraft.respectPlayerRest}
                          className={`live-settings-switch${liveSettingsDraft.respectPlayerRest ? " is-on" : ""}`}
                          onClick={() => setLiveSettingsDraft((current) => current ? {
                            ...current,
                            respectPlayerRest: !current.respectPlayerRest,
                          } : current)}
                        >
                          {liveSettingsDraft.respectPlayerRest ? "On" : "Off"}
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
                      <h3 id="live-courts-heading">Court labels</h3>
                      <p>Leave blank to use the default court name.</p>
                    </div>
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
                        <label className="live-settings-field">
                          Courts
                          <select
                            aria-label="Court count"
                            className="live-settings-select"
                            value={liveSettingsDraft.courtCount}
                            onChange={(event) => setLiveSettingsDraft((current) => current ? {
                              ...current,
                              courtCount: Number(event.target.value),
                            } : current)}
                          >
                            {Array.from({ length: 10 }, (_, index) => index + 1).map((count) => (
                              <option value={count} key={count}>{count}</option>
                            ))}
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
                    disabled={!hasLiveSettingsChanges || action.busy}
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
                  {s.status === "ACTIVE" && canManage ? (
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
                disabled={action.busy}
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
              <button
                className="primary"
                onClick={() =>
                  void action.run(
                    async () => {
                      await api(endpoint + "/end", "POST");
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
          ) : sheet === "delete" ? (
            <>
              <p>This permanently removes {s?.name || "this session"}, including its matches, scores, and standings.</p>
              {s?.status !== "WAITING" && <p className="muted">Any rating changes from this session will be reversed.</p>}
              <p className="muted">This cannot be undone.</p>
              <button type="button" className="secondary full danger-outline" disabled={deleting} onClick={() => void deleteSession()}>
                {deleting ? "Deleting session…" : s?.status === "WAITING" ? "Delete session" : "Cancel and delete session"}
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
                  onClick={() => runCourtPlayerAction("pause")}
                >
                  Pause player
                </button>
              </div>
            </>
          ) : sheet === "court-controls" && courtControl ? (
            controlMatch ? (
              <>
                <div className="court-action-list">
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
                </div>
              </>
            ) : (
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
            )
          ) : sheet === "confirm-control" && confirmation ? (
            <>
              {confirmation.kind === "court-reshuffle" ? (
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
                })}
              >
                {confirmation.kind === "court-reshuffle" ? "Reshuffle match" : confirmation.kind === "court-undo" ? "Clear court" : "Clear next match"}
              </button>
              <button className="text-button" disabled={action.busy} onClick={() => {
                const returnSheet = confirmation.kind === "queue-clear" ? "next" : "court-controls";
                setConfirmation(null);
                setSheet(returnSheet);
              }}>
                Keep current lineup
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
                      () => api(endpoint + "/queue-match", "POST", { reshuffle: true }),
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
        open={managePlayersOpen && canManage && !ended}
        onClose={() => setManagePlayersOpen(false)}
        onChanged={refresh}
      />}
    </div>
  );
}
