"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import {
  ClipboardList,
  Grid3X3,
  Medal,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { getErrorMessage, safeJson } from "@/lib/http";
import { getCurrentAppPath, withCallbackUrl } from "@/lib/authCallback";
import { FlashMessage } from "@/components/ui/chrome";
import { PlayShell } from "@/components/play/PlayShell";
import {
  GearSix,
  UsersThree,
  SquaresFour,
  Trophy as PlayTrophy,
  ArrowLeft as PlayBack,
} from "@phosphor-icons/react";
import { InterclubScoreboard } from "@/components/session/InterclubScoreboard";
import { LiveCourtsPanel } from "@/components/session/LiveCourtsPanel";
import { LiveStandingsTable } from "@/components/session/LiveStandingsTable";
import { ManualMatchModal } from "@/components/session/ManualMatchModal";
import { SessionActionConfirmModal } from "@/components/session/SessionActionConfirmModal";
import { SessionOverviewPanel } from "@/components/session/SessionOverviewPanel";
import { SessionPodium } from "@/components/session/SessionPodium";
import { SessionPlayersModal } from "@/components/session/SessionPlayersModal";
import { SessionPreferenceEditorPortal } from "@/components/session/SessionPreferenceEditorPortal";
import { SessionGuestRenameModal } from "@/components/session/SessionGuestRenameModal";
import { SessionRosterModal } from "@/components/session/SessionRosterModal";
import { SessionSettingsModal } from "@/components/session/SessionSettingsModal";
import { AdminOnboardingChecklist } from "@/components/onboarding/AdminOnboardingChecklist";
import { useAdminOnboardingProgress } from "@/components/onboarding/useAdminOnboardingProgress";
import type { CurrentUser } from "@/components/session/sessionTypes";
import {
  MatchStatus,
  SessionBalanceMetric,
  SessionCollabFormat,
  SessionCrossoverFrequency,
  SessionMatchmakingStyle,
  SessionPairingMode,
  SessionPool,
  SessionStatus,
} from "@/types/enums";
import { shareSessionStandingsImage } from "@/lib/sessionShareImageClient";
import {
  applyCourtLabelUpdates,
  mergeSessionSnapshot,
  type SessionSnapshotLike,
} from "./sessionDataMutations";
import { buildSessionViewModel } from "./sessionViewModel";
import { useSessionData } from "./useSessionData";
import { useSessionMatchActions } from "./useSessionMatchActions";
import { useSessionPlayerManagement } from "./useSessionPlayerManagement";
import { getSessionSettings } from "@/lib/sessionSettings";

const EMPTY_PLAYER_SESSION_STATS = {
  played: 0,
  wins: 0,
  losses: 0,
};

type SessionMobileSection = "session" | "courts" | "standings" | "results";

const LIVE_MOBILE_SECTIONS: Array<{
  id: SessionMobileSection;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "session", label: "Overview", icon: ClipboardList },
  { id: "courts", label: "Courts", icon: Grid3X3 },
  { id: "standings", label: "Standings", icon: Trophy },
];

const COMPLETED_MOBILE_SECTIONS: Array<{
  id: SessionMobileSection;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "session", label: "Overview", icon: ClipboardList },
  { id: "results", label: "Results", icon: Medal },
];

interface SessionUserResponse {
  user?: CurrentUser;
  error?: string;
}

type SessionSnapshotResponse = SessionSnapshotLike & {
  error?: string;
  courtLabels?: Array<{
    id: string;
    label?: string | null;
  }>;
};

interface SessionCodeResponse {
  code?: string;
  error?: string;
}

export default function SessionPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const code = params?.code as string;

  const previousSessionStatusRef = useRef<string | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState("");
  const [endingSession, setEndingSession] = useState(false);
  const [showEndSessionConfirm, setShowEndSessionConfirm] = useState(false);
  const [resettingTestSession, setResettingTestSession] = useState(false);
  const [showResetTestConfirm, setShowResetTestConfirm] = useState(false);
  const [creatingRealSession, setCreatingRealSession] = useState(false);
  const [showCreateRealSessionConfirm, setShowCreateRealSessionConfirm] =
    useState(false);
  const [
    createRealSessionIncludesResults,
    setCreateRealSessionIncludesResults,
  ] = useState(false);
  const [deletingTestSession, setDeletingTestSession] = useState(false);
  const [showDeleteTestConfirm, setShowDeleteTestConfirm] = useState(false);
  const [showPlayersModal, setShowPlayersModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [autoQueueDraft, setAutoQueueDraft] = useState(true);
  const [respectPlayerRestDraft, setRespectPlayerRestDraft] = useState(true);
  const [matchmakingStyleDraft, setMatchmakingStyleDraft] =
    useState<SessionMatchmakingStyle>(SessionMatchmakingStyle.BALANCED);
  const [balanceMetricDraft, setBalanceMetricDraft] =
    useState<SessionBalanceMetric>(SessionBalanceMetric.SESSION_POINTS);
  const [pairingModeDraft, setPairingModeDraft] = useState<SessionPairingMode>(
    SessionPairingMode.OPEN,
  );
  const [poolsEnabledDraft, setPoolsEnabledDraft] = useState(false);
  const [crossoverFrequencyDraft, setCrossoverFrequencyDraft] =
    useState<SessionCrossoverFrequency>(SessionCrossoverFrequency.BALANCED);
  const [courtCountDraft, setCourtCountDraft] = useState(2);
  const [courtLabelDrafts, setCourtLabelDrafts] = useState<
    Record<number, string>
  >({});
  const [savingSettings, setSavingSettings] = useState(false);
  const [mobileSection, setMobileSection] =
    useState<SessionMobileSection>("courts");
  const [celebrationRunId, setCelebrationRunId] = useState(0);
  const [sharingResults, setSharingResults] = useState(false);

  const replayWinnerCelebration = useCallback(() => {
    setCelebrationRunId((currentRunId) => currentRunId + 1);
  }, []);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch("/api/user/me");
      if (!res.ok) return;

      const data = await safeJson<SessionUserResponse>(res);
      if (data.user) {
        setUser(data.user);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  const {
    sessionData,
    isInitialLoadPending,
    initialLoadError,
    patchSessionData,
    retryInitialLoad,
    scheduleSessionRefresh,
  } = useSessionData({
    code,
    enabled: !!session?.user?.id,
    safeJson,
    setError,
  });

  const { court: courtActions, score: scoreActions } = useSessionMatchActions({
    code,
    sessionData,
    safeJson,
    patchSessionData,
    scheduleSessionRefresh,
    setError,
  });

  const {
    showRosterModal,
    rosterSearch,
    clubPlayers,
    addingPlayerId,
    guestName,
    guestGender,
    guestMixedSideOverride,
    rosterPool,
    rosterPlayerPools,
    guestInitialElo,
    guestRepresentingClubId,
    addingGuest,
    guestFormError,
    togglingPausePlayerId,
    skippingNextPlayerId,
    skipNextDraft,
    guestRenameDraft,
    guestRenameInput,
    renamingGuestId,
    removingPlayerId,
    removePlayerDraft,
    openPreferenceEditor,
    setRosterSearch,
    setGuestName,
    setGuestMixedSideOverride,
    setRosterPool,
    setRosterPlayerPool,
    setGuestInitialElo,
    setGuestRepresentingClubId,
    resetGuestInputs,
    setGuestRenameInput,
    setOpenPreferenceEditor,
    togglePreferenceEditor,
    openRosterModal,
    closeRosterModal,
    requestRenameGuest,
    closeGuestRenameModal,
    requestSkipNextPlayer,
    closeSkipNextConfirm,
    handleGuestGenderChange,
    addPlayerToSession,
    addGuestToSession,
    togglePausePlayer,
    toggleSkipNextPlayer,
    confirmSkipNextPlayer,
    renameGuestInSession,
    requestRemovePlayerFromSession,
    closeRemovePlayerConfirm,
    removePlayerFromSession,
    updatePlayerPreference,
  } = useSessionPlayerManagement({
    code,
    sessionData,
    safeJson,
    patchSessionData,
    scheduleSessionRefresh,
    setError,
  });
  const isInterclubSession =
    sessionData?.collabFormat === SessionCollabFormat.INTERCLUB;
  const interclubClubOptions = useMemo(
    () =>
      (sessionData?.clubs ?? [])
        .filter((club) => club.status === "ACCEPTED")
        .slice(0, 2)
        .map((club) => ({ id: club.id, name: club.name })),
    [sessionData?.clubs],
  );

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(
        withCallbackUrl("/signin", getCurrentAppPath(window.location)),
      );
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user?.id && code) {
      void fetchUser();
    }
  }, [session, code, fetchUser]);

  const startSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${code}/start`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await safeJson<SessionSnapshotResponse>(res);
        patchSessionData((current) => mergeSessionSnapshot(current, data));
        scheduleSessionRefresh();
      } else {
        const data = await safeJson<SessionSnapshotResponse>(res);
        setError(getErrorMessage(data, "Failed to start tournament"));
      }
    } catch (err) {
      console.error(err);
    }
  }, [code, patchSessionData, scheduleSessionRefresh]);

  const openEndSessionConfirm = () => {
    setError("");
    setShowSettingsModal(false);
    setShowEndSessionConfirm(true);
  };

  const closeEndSessionConfirm = () => {
    if (endingSession) return;
    setShowEndSessionConfirm(false);
  };

  const endSession = useCallback(async () => {
    setEndingSession(true);
    setError("");

    try {
      const res = await fetch(`/api/sessions/${code}/end`, { method: "POST" });
      if (res.ok) {
        const data = await safeJson<SessionSnapshotResponse>(res);
        setShowEndSessionConfirm(false);
        setMobileSection("results");
        patchSessionData((current) => mergeSessionSnapshot(current, data), {
          urgent: true,
        });
        scheduleSessionRefresh();
      } else {
        const data = await safeJson<SessionSnapshotResponse>(res);
        setError(getErrorMessage(data, "Failed to end tournament"));
      }
    } catch (err) {
      console.error(err);
      setError("Failed to end tournament");
    } finally {
      setEndingSession(false);
    }
  }, [code, patchSessionData, scheduleSessionRefresh]);

  const openResetTestConfirm = useCallback(() => {
    setError("");
    setShowSettingsModal(false);
    setShowResetTestConfirm(true);
  }, []);

  const closeResetTestConfirm = useCallback(() => {
    if (resettingTestSession) return;
    setShowResetTestConfirm(false);
  }, [resettingTestSession]);

  const resetTestSession = useCallback(async () => {
    setResettingTestSession(true);
    setError("");

    try {
      const res = await fetch(`/api/sessions/${code}/reset`, {
        method: "POST",
      });
      const data = await safeJson<SessionSnapshotResponse>(res);
      if (!res.ok) {
        setError(getErrorMessage(data, "Failed to reset tournament"));
        return;
      }

      setShowResetTestConfirm(false);
      patchSessionData((current) => mergeSessionSnapshot(current, data));
      scheduleSessionRefresh();
    } catch (err) {
      console.error(err);
      setError("Failed to reset tournament");
    } finally {
      setResettingTestSession(false);
    }
  }, [code, patchSessionData, scheduleSessionRefresh]);

  const openCreateRealSessionConfirm = useCallback(() => {
    setError("");
    setShowSettingsModal(false);
    setCreateRealSessionIncludesResults(
      (sessionData?.matches ?? []).some(
        (match) =>
          match.status === MatchStatus.COMPLETED &&
          typeof match.team1Score === "number" &&
          typeof match.team2Score === "number",
      ),
    );
    setShowCreateRealSessionConfirm(true);
  }, [sessionData?.matches]);

  const closeCreateRealSessionConfirm = useCallback(() => {
    if (creatingRealSession) return;
    setShowCreateRealSessionConfirm(false);
  }, [creatingRealSession]);

  const createRealSessionFromTest = useCallback(async () => {
    setCreatingRealSession(true);
    setError("");

    try {
      const res = await fetch(`/api/sessions/${code}/create-real`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          includeResults: createRealSessionIncludesResults,
        }),
      });
      const data = await safeJson<SessionCodeResponse>(res);
      if (!res.ok) {
        setError(getErrorMessage(data, "Failed to create real tournament"));
        return;
      }

      if (typeof data.code !== "string") {
        setError("Failed to create real tournament");
        return;
      }

      setShowCreateRealSessionConfirm(false);
      router.push(`/session/${data.code}`);
    } catch (err) {
      console.error(err);
      setError("Failed to create real tournament");
    } finally {
      setCreatingRealSession(false);
    }
  }, [code, createRealSessionIncludesResults, router]);

  const openDeleteTestConfirm = useCallback(() => {
    setError("");
    setShowSettingsModal(false);
    setShowDeleteTestConfirm(true);
  }, []);

  const closeDeleteTestConfirm = useCallback(() => {
    if (deletingTestSession) return;
    setShowDeleteTestConfirm(false);
  }, [deletingTestSession]);

  const deleteTestSession = useCallback(async () => {
    setDeletingTestSession(true);
    setError("");

    try {
      const res = await fetch(`/api/sessions/${code}/delete`, {
        method: "DELETE",
      });
      const data = await safeJson<SessionCodeResponse>(res);
      if (!res.ok) {
        setError(getErrorMessage(data, "Failed to delete tournament"));
        return;
      }

      setShowDeleteTestConfirm(false);
      router.push(sessionData?.clubId ? `/club/${sessionData.clubId}` : "/");
    } catch (err) {
      console.error(err);
      setError("Failed to delete tournament");
    } finally {
      setDeletingTestSession(false);
    }
  }, [code, router, sessionData?.clubId]);

  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push(sessionData?.clubId ? `/club/${sessionData.clubId}` : "/");
  }, [router, sessionData?.clubId]);

  const isAdmin =
    !!sessionData?.viewerCanManage ||
    !!user?.isAdmin ||
    !!session?.user?.isAdmin;
  const canUseAdminSessionControls =
    !!sessionData?.viewerCanUseAdminSessionControls ||
    !!user?.isAdmin ||
    !!session?.user?.isAdmin;
  const isClaimedUser = user?.isClaimed === true;
  const currentUserId = session?.user?.id || "";
  const viewerIsQuickAccess =
    sessionData?.viewerIsQuickAccess === true ||
    user?.isQuickAccess === true ||
    session?.user?.isQuickAccess === true;
  const canSubmitScores = !viewerIsQuickAccess;
  const isTutorialPlayground =
    sessionData?.isTutorialClub === true &&
    sessionData.tutorialOwnerId === currentUserId;
  const canOpenPlayerManager =
    isAdmin && sessionData?.status !== SessionStatus.COMPLETED;
  const canOpenSettings =
    isAdmin &&
    (sessionData?.status !== SessionStatus.COMPLETED || sessionData?.isTest);
  const adminOnboarding = useAdminOnboardingProgress(
    status === "authenticated" &&
      isAdmin &&
      isTutorialPlayground &&
      !!sessionData &&
      sessionData.status !== SessionStatus.COMPLETED,
  );
  const startSessionWithOnboardingRefresh = useCallback(async () => {
    await startSession();
    void adminOnboarding.refresh();
  }, [adminOnboarding, startSession]);
  const activeCompetitiveCount = (sessionData?.players ?? []).filter(
    (player) => !player.isPaused && player.pool === SessionPool.A,
  ).length;
  const activeSocialCount = (sessionData?.players ?? []).filter(
    (player) => !player.isPaused && player.pool === SessionPool.B,
  ).length;
  const startBlockedReason =
    sessionData?.poolsEnabled &&
    (activeCompetitiveCount < 2 || activeSocialCount < 2)
      ? `Player groups need at least 2 active Competitive and 2 active Social players. Current roster: ${activeCompetitiveCount} Competitive, ${activeSocialCount} Social.`
      : null;
  const createMatchesForCourtsWithOnboardingRefresh = useCallback(
    async (...args: Parameters<typeof courtActions.createMatchesForCourts>) => {
      await courtActions.createMatchesForCourts(...args);
      void adminOnboarding.refresh();
    },
    [adminOnboarding, courtActions],
  );
  const createMatchForCourtWithOnboardingRefresh = useCallback(
    async (...args: Parameters<typeof courtActions.createMatchForCourt>) => {
      await courtActions.createMatchForCourt(...args);
      void adminOnboarding.refresh();
    },
    [adminOnboarding, courtActions],
  );
  const submitScoreWithOnboardingRefresh = useCallback(
    async (...args: Parameters<typeof scoreActions.submitScore>) => {
      await scoreActions.submitScore(...args);
      void adminOnboarding.refresh();
    },
    [adminOnboarding, scoreActions],
  );
  const endSessionWithOnboardingRefresh = useCallback(async () => {
    await endSession();
    void adminOnboarding.refresh();
  }, [adminOnboarding, endSession]);
  useEffect(() => {
    if (
      isTutorialPlayground &&
      sessionData?.status !== SessionStatus.COMPLETED
    ) {
      adminOnboarding.completeStep("session-workflow");
    }
  }, [adminOnboarding, isTutorialPlayground, sessionData?.status]);
  const activeAdminOnboardingStep =
    adminOnboarding.progress?.steps.find((step) => !step.completed) ?? null;
  const shouldShowSessionTutorialHint =
    isTutorialPlayground &&
    (activeAdminOnboardingStep?.id === "session-workflow" ||
      activeAdminOnboardingStep?.id === "end-session");
  const sessionTutorialHint =
    shouldShowSessionTutorialHint && activeAdminOnboardingStep
      ? {
          title: activeAdminOnboardingStep.title,
          detail: activeAdminOnboardingStep.coachmark,
        }
      : null;
  const courtsTutorialHint =
    isTutorialPlayground && activeAdminOnboardingStep?.id === "score-match"
      ? {
          title: activeAdminOnboardingStep.title,
          detail: activeAdminOnboardingStep.coachmark,
        }
      : null;

  useEffect(() => {
    if (!canOpenSettings) {
      setShowSettingsModal(false);
    }
  }, [canOpenSettings]);

  useEffect(() => {
    if (!canOpenPlayerManager) {
      setShowPlayersModal(false);
    }
  }, [canOpenPlayerManager]);

  const sessionView = useMemo(() => {
    if (!sessionData) {
      return null;
    }

    return buildSessionViewModel({
      sessionData,
      clubPlayers,
      rosterSearch,
      manualMatchForm: courtActions.manualMatchForm,
      manualCourtId: courtActions.manualCourtId,
      openPreferenceEditor,
    });
  }, [
    clubPlayers,
    courtActions.manualCourtId,
    courtActions.manualMatchForm,
    openPreferenceEditor,
    rosterSearch,
    sessionData,
  ]);
  const interclubClubToneById = useMemo(() => {
    if (!sessionView?.interclubScoreboard) {
      return undefined;
    }

    const [firstClub, secondClub] = sessionView.interclubScoreboard.rows;

    return {
      [firstClub.clubId]: "blue",
      [secondClub.clubId]: "red",
    } satisfies Record<string, "blue" | "red">;
  }, [sessionView?.interclubScoreboard]);
  const handleShareResults = useCallback(async () => {
    if (!sessionData || !sessionView) {
      setError("Results are not ready to share yet");
      return;
    }

    setSharingResults(true);
    setError("");

    try {
      await shareSessionStandingsImage({
        code,
        fileName: `${sessionData.name}-standings`,
        shareTitle: `${sessionData.name} final standings`,
      });
    } catch (err) {
      console.error(err);
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(
          err instanceof Error && err.message.trim().length > 0
            ? err.message
            : "Failed to share standings",
        );
      }
    } finally {
      setSharingResults(false);
    }
  }, [code, sessionData, sessionView]);
  const mobileSections = useMemo(
    () =>
      sessionView?.isCompletedSession
        ? COMPLETED_MOBILE_SECTIONS
        : LIVE_MOBILE_SECTIONS,
    [sessionView?.isCompletedSession],
  );
  const preferredMobileSection = useMemo<SessionMobileSection>(() => {
    if (!sessionData || !sessionView) {
      return "session";
    }

    if (sessionView.isCompletedSession) {
      return "results";
    }

    return sessionData.status === SessionStatus.ACTIVE ? "courts" : "session";
  }, [sessionData, sessionView]);
  const activeMobileSection = mobileSections.some(
    (section) => section.id === mobileSection,
  )
    ? mobileSection
    : (mobileSections[0]?.id ?? "session");

  const currentGameplaySettings = useMemo(
    () =>
      sessionData
        ? getSessionSettings(sessionData)
        : {
            scoringType: "POINTS" as const,
            matchmakingStyle: SessionMatchmakingStyle.BALANCED,
            balanceMetric: SessionBalanceMetric.SESSION_POINTS,
            pairingMode: SessionPairingMode.OPEN,
          },
    [sessionData],
  );
  const hasCourtLabelChanges = useMemo(() => {
    if (!sessionData) {
      return false;
    }

    return sessionData.courts.some(
      (court) =>
        (courtLabelDrafts[court.courtNumber] ?? "").trim() !==
        (court.label ?? "").trim(),
    );
  }, [courtLabelDrafts, sessionData]);
  const hasGameplayChanges = useMemo(() => {
    if (!sessionData || sessionData.status !== SessionStatus.WAITING) {
      return false;
    }

    return (
      matchmakingStyleDraft !== currentGameplaySettings.matchmakingStyle ||
      balanceMetricDraft !== currentGameplaySettings.balanceMetric ||
      pairingModeDraft !== currentGameplaySettings.pairingMode ||
      poolsEnabledDraft !== sessionData.poolsEnabled ||
      crossoverFrequencyDraft !== sessionData.crossoverFrequency ||
      courtCountDraft !== sessionData.courts.length
    );
  }, [
    balanceMetricDraft,
    courtCountDraft,
    crossoverFrequencyDraft,
    currentGameplaySettings,
    matchmakingStyleDraft,
    pairingModeDraft,
    poolsEnabledDraft,
    sessionData,
  ]);
  const hasAutoQueueChange = useMemo(() => {
    if (!sessionData) {
      return false;
    }

    return autoQueueDraft !== sessionData.autoQueueEnabled;
  }, [autoQueueDraft, sessionData]);
  const hasRespectPlayerRestChange = useMemo(() => {
    if (!sessionData) {
      return false;
    }

    return respectPlayerRestDraft !== sessionData.respectPlayerRest;
  }, [respectPlayerRestDraft, sessionData]);
  const hasSettingsChanges =
    hasCourtLabelChanges ||
    hasGameplayChanges ||
    hasAutoQueueChange ||
    hasRespectPlayerRestChange;
  const completedScoredTestMatchesCount = useMemo(
    () =>
      (sessionData?.matches ?? []).filter(
        (match) =>
          match.status === MatchStatus.COMPLETED &&
          typeof match.team1Score === "number" &&
          typeof match.team2Score === "number",
      ).length,
    [sessionData?.matches],
  );

  const openSettingsModal = useCallback(() => {
    if (!sessionData || !canOpenSettings) {
      return;
    }

    setError("");
    setAutoQueueDraft(sessionData.autoQueueEnabled);
    setRespectPlayerRestDraft(sessionData.respectPlayerRest);
    setMatchmakingStyleDraft(currentGameplaySettings.matchmakingStyle);
    setBalanceMetricDraft(currentGameplaySettings.balanceMetric);
    setPairingModeDraft(currentGameplaySettings.pairingMode);
    setPoolsEnabledDraft(sessionData.poolsEnabled);
    setCrossoverFrequencyDraft(sessionData.crossoverFrequency);
    setCourtCountDraft(sessionData.courts.length);
    setCourtLabelDrafts(
      Object.fromEntries(
        sessionData.courts.map((court) => [
          court.courtNumber,
          court.label ?? "",
        ]),
      ),
    );
    setShowSettingsModal(true);
  }, [canOpenSettings, currentGameplaySettings, sessionData]);

  useEffect(() => {
    const openLinkedSettings = () => {
      if (
        window.location.hash !== "#settings" ||
        !sessionData ||
        !canOpenSettings
      )
        return;
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + window.location.search,
      );
      setMobileSection("session");
      openSettingsModal();
    };
    openLinkedSettings();
    window.addEventListener("hashchange", openLinkedSettings);
    return () => window.removeEventListener("hashchange", openLinkedSettings);
  }, [canOpenSettings, openSettingsModal, sessionData]);

  const closeSettingsModal = useCallback(() => {
    if (savingSettings) {
      return;
    }

    setShowSettingsModal(false);
  }, [savingSettings]);

  const openRosterFromSettings = useCallback(() => {
    setShowSettingsModal(false);
    openRosterModal();
  }, [openRosterModal]);

  const openGuestRename = useCallback(
    (userId: string, currentName: string) => {
      requestRenameGuest(userId, currentName);
    },
    [requestRenameGuest],
  );

  const handleCourtLabelChange = useCallback(
    (courtNumber: number, value: string) => {
      setCourtLabelDrafts((current) => ({
        ...current,
        [courtNumber]: value,
      }));
    },
    [],
  );

  const saveSessionSettings = useCallback(async () => {
    if (!sessionData || !hasSettingsChanges) {
      return;
    }

    setSavingSettings(true);
    setError("");

    try {
      const labelCourtCount =
        sessionData.status === SessionStatus.WAITING
          ? courtCountDraft
          : sessionData.courts.length;
      const res = await fetch(`/api/sessions/${code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          autoQueueEnabled: autoQueueDraft,
          respectPlayerRest: respectPlayerRestDraft,
          courtLabels: Array.from({ length: labelCourtCount }, (_, index) => ({
            courtNumber: index + 1,
            label: courtLabelDrafts[index + 1] ?? "",
          })),
          ...(hasGameplayChanges
            ? {
                gameplaySettings: {
                  matchmakingStyle: matchmakingStyleDraft,
                  balanceMetric: balanceMetricDraft,
                  pairingMode: pairingModeDraft,
                  poolsEnabled: poolsEnabledDraft,
                  crossoverFrequency: crossoverFrequencyDraft,
                  courtCount: courtCountDraft,
                },
              }
            : {}),
        }),
      });
      const data = await safeJson<SessionSnapshotResponse>(res);

      if (!res.ok) {
        setError(getErrorMessage(data, "Failed to update tournament settings"));
        return;
      }

      const { courtLabels, ...snapshot } = data;
      patchSessionData((current) =>
        mergeSessionSnapshot(
          applyCourtLabelUpdates(current, courtLabels ?? []),
          snapshot,
        ),
      );

      setShowSettingsModal(false);
      scheduleSessionRefresh();
    } catch (err) {
      console.error(err);
      setError("Failed to update tournament settings");
    } finally {
      setSavingSettings(false);
    }
  }, [
    autoQueueDraft,
    balanceMetricDraft,
    code,
    courtCountDraft,
    courtLabelDrafts,
    crossoverFrequencyDraft,
    hasGameplayChanges,
    hasSettingsChanges,
    matchmakingStyleDraft,
    pairingModeDraft,
    patchSessionData,
    poolsEnabledDraft,
    respectPlayerRestDraft,
    scheduleSessionRefresh,
    sessionData,
  ]);

  const updateMobileSection = useCallback((sectionId: SessionMobileSection) => {
    setMobileSection(sectionId);
  }, []);
  useEffect(() => {
    if (activeAdminOnboardingStep?.id === "score-match")
      setMobileSection("courts");
    else if (
      activeAdminOnboardingStep?.id === "session-workflow" ||
      activeAdminOnboardingStep?.id === "end-session"
    )
      setMobileSection("session");
  }, [activeAdminOnboardingStep?.id]);
  useLayoutEffect(() => {
    if (!sessionData || !sessionView) {
      previousSessionStatusRef.current = null;
      return;
    }

    const previousStatus = previousSessionStatusRef.current;
    const isInitialEntry = previousStatus === null;
    const becameCompleted =
      previousStatus !== null &&
      previousStatus !== SessionStatus.COMPLETED &&
      sessionView.isCompletedSession;
    const enteredCompletedSession =
      isInitialEntry && sessionView.isCompletedSession;
    const becameActive =
      previousStatus === SessionStatus.WAITING &&
      sessionData.status === SessionStatus.ACTIVE;

    if (isInitialEntry || becameCompleted || becameActive) {
      setMobileSection(preferredMobileSection);
    }

    if (enteredCompletedSession || becameCompleted) {
      setCelebrationRunId((currentRunId) => currentRunId + 1);
    }

    previousSessionStatusRef.current = sessionData.status;
  }, [preferredMobileSection, sessionData, sessionView]);

  if (
    status === "loading" ||
    status === "unauthenticated" ||
    (isInitialLoadPending && !sessionData)
  ) {
    return (
      <div className="app-page flex items-center justify-center px-6">
        <div className="app-panel flex flex-col items-center gap-4 px-8 py-8">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          <p className="app-eyebrow">Loading tournament</p>
        </div>
      </div>
    );
  }

  if (!sessionData || !sessionView) {
    return (
      <div className="app-page flex items-center justify-center px-6">
        <div className="app-panel w-full max-w-lg px-6 py-8 text-center">
          <p className="app-eyebrow">Unable to load tournament</p>
          <p className="mt-3 text-sm text-gray-600">
            {initialLoadError ??
              "The tournament could not be loaded right now. Try again."}
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={retryInitialLoad}
              className="app-button-primary"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={handleBack}
              className="app-button-secondary"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PlayShell
      header={
        <>
          <button
            className="icon-button"
            onClick={handleBack}
            aria-label="Back to club"
          >
            <PlayBack size={23} />
          </button>
          <div className="session-identity">
            <small>
              {sessionView.isCompletedSession
                ? "SESSION COMPLETE"
                : sessionData.status === SessionStatus.ACTIVE
                  ? "LIVE SESSION"
                  : "READY TO PLAY"}
            </small>
            <strong>{sessionData.name}</strong>
          </div>
          {canOpenSettings ? (
            <button
              className="icon-button"
              aria-label="Session settings"
              onClick={openSettingsModal}
            >
              <GearSix size={24} />
            </button>
          ) : (
            <span />
          )}
        </>
      }
    >
      <div className="host-workspace">
        {sessionData.status === SessionStatus.WAITING && isAdmin && (
          <div className="surface">
            <h2>Everyone ready?</h2>
            <p className="quiet">
              {sessionData.players.length} players · {sessionData.courts.length}{" "}
              courts
            </p>
            <button
              className="primary"
              disabled={Boolean(startBlockedReason)}
              onClick={() => void startSessionWithOnboardingRefresh()}
            >
              Start session
            </button>
            {startBlockedReason && (
              <p className="quiet">{startBlockedReason}</p>
            )}
          </div>
        )}
        {error ? <FlashMessage tone="error">{error}</FlashMessage> : null}

        {isTutorialPlayground ? (
          <AdminOnboardingChecklist
            progress={adminOnboarding.progress}
            loading={adminOnboarding.loading}
            onDismiss={adminOnboarding.dismiss}
            onReopen={adminOnboarding.reopen}
            onCompleteStep={adminOnboarding.completeStep}
            spotlightEnabled={
              !showSettingsModal &&
              !showEndSessionConfirm &&
              (activeAdminOnboardingStep?.id === "score-match"
                ? activeMobileSection === "courts"
                : activeMobileSection === "session")
            }
            onStepAction={(step) => {
              if (
                step.id !== "end-session" ||
                step.href !== `/session/${code}#settings`
              )
                return false;
              updateMobileSection("session");
              openSettingsModal();
              return true;
            }}
          />
        ) : null}

        <div className="host-sections">
          <div>
            <section hidden={activeMobileSection !== "session"}>
              <div className="section-head">
                <h1>Players</h1>
                {canOpenSettings && (
                  <button
                    className="text-button"
                    onClick={openRosterFromSettings}
                  >
                    Add / remove
                  </button>
                )}
              </div>
              <SessionPlayersModal
                embedded
                open
                players={sessionData.players}
                currentUserId={currentUserId}
                canEditPreferences={
                  !viewerIsQuickAccess && !sessionView.isCompletedSession
                }
                canManagePlayers={
                  isAdmin &&
                  !viewerIsQuickAccess &&
                  !sessionView.isCompletedSession
                }
                poolsEnabled={sessionData.poolsEnabled}
                poolAName={sessionData.poolAName}
                poolBName={sessionData.poolBName}
                togglingPausePlayerId={togglingPausePlayerId}
                skippingNextPlayerId={skippingNextPlayerId}
                onClose={() => {}}
                onTogglePause={togglePausePlayer}
                onToggleSkipNext={toggleSkipNextPlayer}
                onOpenPreferenceEditor={togglePreferenceEditor}
              />
              <details className="surface">
                <summary>Session details & actions</summary>
                <SessionOverviewPanel
                  sessionTypeLabel={sessionView.sessionTypeLabel}
                  sessionModeLabel={sessionView.sessionModeLabel}
                  isTestSession={sessionData.isTest}
                  playersCount={sessionData.players.length}
                  guestPlayersCount={sessionView.guestPlayersCount}
                  activeMatchesCount={sessionView.activeMatchesCount}
                  completedMatchesCount={sessionView.completedMatchesCount}
                  pausedPlayersCount={sessionView.pausedPlayersCount}
                  sessionStatus={sessionData.status}
                  canStartSession={
                    isAdmin && sessionData.status === SessionStatus.WAITING
                  }
                  startBlockedReason={startBlockedReason}
                  canOpenPlayerManager={Boolean(canOpenPlayerManager)}
                  canOpenSettings={Boolean(canOpenSettings)}
                  tutorialHint={sessionTutorialHint}
                  onStartSession={startSessionWithOnboardingRefresh}
                  onOpenPlayerManager={() => setShowPlayersModal(true)}
                  onOpenSettings={openSettingsModal}
                  onEndSession={
                    isAdmin && sessionData.status === SessionStatus.ACTIVE
                      ? () => setShowEndSessionConfirm(true)
                      : undefined
                  }
                  onOpenMatchHistory={() =>
                    router.push(`/session/${code}/history?from=session`)
                  }
                />
              </details>
            </section>

            {!sessionView.isCompletedSession ? (
              <section hidden={activeMobileSection !== "courts"}>
                <LiveCourtsPanel
                  sessionStatus={sessionData.status}
                  courts={sessionData.courts}
                  players={sessionData.players}
                  queuedMatch={sessionView.queuedMatch}
                  poolsEnabled={sessionData.poolsEnabled}
                  poolAName={sessionData.poolAName}
                  poolBName={sessionData.poolBName}
                  currentUserId={currentUserId}
                  isAdmin={isAdmin}
                  isClaimedUser={isClaimedUser}
                  canSubmitScores={canSubmitScores}
                  confirmingScoreMatchId={scoreActions.confirmingScoreMatchId}
                  activeMatchesCount={sessionView.activeMatchesCount}
                  readyCourtsCount={sessionView.readyCourtsCount}
                  creatableOpenCourtCount={sessionView.creatableOpenCourtCount}
                  creatableOpenCourtIds={sessionView.creatableOpenCourtIds}
                  creatingOpenMatches={courtActions.creatingOpenMatches}
                  creatingOpenCourtCount={courtActions.creatingOpenCourtCount}
                  canQueueNextMatch={sessionView.canQueueNextMatch}
                  creatingQueuedMatch={courtActions.creatingQueuedMatch}
                  manualQueueOpen={courtActions.manualQueueOpen}
                  clearingQueuedMatch={courtActions.clearingQueuedMatch}
                  reshufflingQueuedPlayerId={
                    courtActions.reshufflingQueuedPlayerId
                  }
                  replacingQueuedPlayerId={courtActions.replacingQueuedPlayerId}
                  reshufflingQueuedMatch={courtActions.reshufflingQueuedMatch}
                  reshufflingCourtId={courtActions.reshufflingCourtId}
                  reshufflingCourtPlayerId={
                    courtActions.reshufflingCourtPlayerId
                  }
                  replacingCourtPlayerId={courtActions.replacingCourtPlayerId}
                  undoingCourtId={courtActions.undoingCourtId}
                  reopeningMatchId={scoreActions.reopeningMatchId}
                  submittingMatchId={scoreActions.submittingMatchId}
                  matchScores={scoreActions.matchScores}
                  queuePromotionAnimation={scoreActions.queuePromotionAnimation}
                  tutorialHint={courtsTutorialHint}
                  onCreateMatchesForCourts={
                    createMatchesForCourtsWithOnboardingRefresh
                  }
                  onCreateCourtMatch={createMatchForCourtWithOnboardingRefresh}
                  onQueueNextMatch={courtActions.queueNextMatch}
                  onClearQueuedMatch={courtActions.clearQueuedMatch}
                  onOpenManualQueuedMatchModal={
                    courtActions.openManualQueuedMatchModal
                  }
                  onReshuffleQueuedMatch={courtActions.reshuffleQueuedMatch}
                  onReshuffleQueuedMatchWithoutPlayer={
                    courtActions.reshuffleQueuedMatchWithoutPlayer
                  }
                  onReplaceQueuedMatchPlayer={
                    courtActions.replaceQueuedMatchPlayer
                  }
                  onOpenManualMatchModal={courtActions.openManualMatchModal}
                  onReshuffleMatch={courtActions.reshuffleMatch}
                  onReshuffleMatchWithoutPlayer={
                    courtActions.reshuffleMatchWithoutPlayer
                  }
                  onReplaceMatchPlayer={courtActions.replaceMatchPlayer}
                  onUndoMatchSelection={courtActions.undoMatchSelection}
                  onHandleScoreChange={scoreActions.handleScoreChange}
                  onRequestScoreSubmitConfirmation={
                    scoreActions.requestScoreSubmitConfirmation
                  }
                  onCancelScoreSubmitConfirmation={
                    scoreActions.cancelScoreSubmitConfirmation
                  }
                  onSubmitScore={submitScoreWithOnboardingRefresh}
                  onApproveScore={scoreActions.approveScore}
                  onReopenScoreForEdit={scoreActions.reopenScoreForEdit}
                  onQueuePromotionAnimationComplete={
                    scoreActions.clearQueuePromotionAnimation
                  }
                />
              </section>
            ) : null}

            <section
              hidden={
                activeMobileSection !==
                (sessionView.isCompletedSession ? "results" : "standings")
              }
            >
              <div className="space-y-6">
                {sessionView.interclubScoreboard ? (
                  <InterclubScoreboard
                    scoreboard={sessionView.interclubScoreboard}
                  />
                ) : null}

                {sessionView.isCompletedSession ? (
                  <SessionPodium
                    sessionType={sessionData.type}
                    players={sessionView.sortedPlayers}
                    pointDiffByUserId={sessionView.pointDiffByUserId}
                    playerStatsByUserId={sessionView.playerStatsByUserId}
                    celebrationRunId={celebrationRunId}
                    onReplayCelebration={replayWinnerCelebration}
                    onShareResults={
                      sessionView.sortedPlayers.length > 0
                        ? () => void handleShareResults()
                        : undefined
                    }
                    sharingResults={sharingResults}
                  />
                ) : null}

                <LiveStandingsTable
                  sessionType={sessionData.type}
                  players={sessionView.sortedPlayers}
                  currentUserId={currentUserId}
                  pointDiffByUserId={sessionView.pointDiffByUserId}
                  getPlayerProfileHref={sessionView.getPlayerProfileHref}
                  calculatePlayerSessionStats={(userId) =>
                    sessionView.playerStatsByUserId.get(userId) ??
                    EMPTY_PLAYER_SESSION_STATS
                  }
                  poolsEnabled={sessionData.poolsEnabled}
                  poolAName={sessionData.poolAName}
                  poolBName={sessionData.poolBName}
                  interclubClubToneById={interclubClubToneById}
                />
              </div>
            </section>
          </div>
        </div>
      </div>

      <nav className="bottom-nav" aria-label="Session navigation">
        {(sessionView.isCompletedSession
          ? [
              { id: "results", label: "Results", icon: PlayTrophy },
              { id: "session", label: "Players", icon: UsersThree },
            ]
          : [
              { id: "courts", label: "Courts", icon: SquaresFour },
              { id: "session", label: "Players", icon: UsersThree },
              { id: "standings", label: "Standings", icon: PlayTrophy },
            ]
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={activeMobileSection === id ? "active" : ""}
            aria-current={activeMobileSection === id ? "page" : undefined}
            onClick={() => {
              updateMobileSection(id as SessionMobileSection);
              window.scrollTo({ top: 0, behavior: "instant" });
            }}
          >
            <Icon
              size={25}
              weight={activeMobileSection === id ? "fill" : "regular"}
            />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <SessionSettingsModal
        open={showSettingsModal}
        courts={sessionData.courts}
        isTestSession={sessionData.isTest}
        autoQueueEnabled={sessionData.autoQueueEnabled}
        autoQueueDraft={autoQueueDraft}
        respectPlayerRest={sessionData.respectPlayerRest}
        respectPlayerRestDraft={respectPlayerRestDraft}
        canEditGameplay={sessionData.status === SessionStatus.WAITING}
        collabFormat={sessionData.collabFormat ?? SessionCollabFormat.FREE_PLAY}
        matchmakingStyleDraft={matchmakingStyleDraft}
        balanceMetricDraft={balanceMetricDraft}
        pairingModeDraft={pairingModeDraft}
        poolsEnabledDraft={poolsEnabledDraft}
        crossoverFrequencyDraft={crossoverFrequencyDraft}
        courtCountDraft={courtCountDraft}
        canOpenRoster={isAdmin && !sessionView.isCompletedSession}
        canEndSession={isAdmin && sessionData.status === SessionStatus.ACTIVE}
        canResetSession={
          canUseAdminSessionControls &&
          sessionData.status === SessionStatus.ACTIVE
        }
        canCreateRealSession={
          canUseAdminSessionControls &&
          sessionData.isTest &&
          !isTutorialPlayground
        }
        canDeleteSession={
          canUseAdminSessionControls && !sessionView.isCompletedSession
        }
        courtLabelDrafts={courtLabelDrafts}
        hasGameplayChanges={hasGameplayChanges}
        hasAutoQueueChange={hasAutoQueueChange}
        hasRespectPlayerRestChange={hasRespectPlayerRestChange}
        hasCourtLabelChanges={hasCourtLabelChanges}
        hasSettingsChanges={hasSettingsChanges}
        savingSettings={savingSettings}
        onClose={closeSettingsModal}
        onOpenRoster={openRosterFromSettings}
        onEndSession={openEndSessionConfirm}
        onResetSession={openResetTestConfirm}
        onCreateRealSession={openCreateRealSessionConfirm}
        onDeleteSession={openDeleteTestConfirm}
        onAutoQueueChange={setAutoQueueDraft}
        onRespectPlayerRestChange={setRespectPlayerRestDraft}
        onMatchmakingStyleChange={setMatchmakingStyleDraft}
        onBalanceMetricChange={setBalanceMetricDraft}
        onPairingModeChange={setPairingModeDraft}
        onPoolsEnabledChange={setPoolsEnabledDraft}
        onCrossoverFrequencyChange={setCrossoverFrequencyDraft}
        onCourtCountChange={setCourtCountDraft}
        onCourtLabelChange={handleCourtLabelChange}
        onSaveSettings={() => void saveSessionSettings()}
      />

      <SessionPlayersModal
        key={
          showPlayersModal ? "session-players-open" : "session-players-closed"
        }
        open={showPlayersModal}
        players={sessionData.players}
        currentUserId={currentUserId}
        canEditPreferences={
          !viewerIsQuickAccess && !sessionView.isCompletedSession
        }
        canManagePlayers={isAdmin}
        poolsEnabled={sessionData.poolsEnabled}
        poolAName={sessionData.poolAName}
        poolBName={sessionData.poolBName}
        togglingPausePlayerId={togglingPausePlayerId}
        skippingNextPlayerId={skippingNextPlayerId}
        onClose={() => setShowPlayersModal(false)}
        onTogglePause={togglePausePlayer}
        onToggleSkipNext={toggleSkipNextPlayer}
        onOpenPreferenceEditor={togglePreferenceEditor}
      />

      {courtActions.courtActionDraft ? (
        <SessionActionConfirmModal
          title={
            courtActions.courtActionDraft.action === "reshuffle"
              ? "Reshuffle match?"
              : "Undo match selection?"
          }
          subtitle={
            courtActions.courtActionDraft.action === "reshuffle"
              ? `Replace the lineup on ${courtActions.courtActionDraft.courtLabel}.`
              : `Clear ${courtActions.courtActionDraft.courtLabel} and return players.`
          }
          details={
            <div className="space-y-4">
              <div className="app-panel-muted space-y-2 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                  {courtActions.courtActionDraft.courtLabel}
                </p>
                <p className="text-sm font-semibold text-gray-900">
                  {courtActions.courtActionDraft.team1Names[0]} &amp;{" "}
                  {courtActions.courtActionDraft.team1Names[1]}
                </p>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-400">
                  vs
                </p>
                <p className="text-sm font-semibold text-gray-900">
                  {courtActions.courtActionDraft.team2Names[0]} &amp;{" "}
                  {courtActions.courtActionDraft.team2Names[1]}
                </p>
              </div>
            </div>
          }
          confirmLabel={
            courtActions.courtActionDraft.action === "reshuffle"
              ? "Confirm Reshuffle"
              : "Confirm Undo"
          }
          cancelLabel="Keep Match"
          isSubmitting={
            courtActions.courtActionDraft.action === "reshuffle"
              ? courtActions.reshufflingCourtId ===
                courtActions.courtActionDraft.courtId
              : courtActions.undoingCourtId ===
                courtActions.courtActionDraft.courtId
          }
          onClose={courtActions.closeCourtActionDraft}
          onConfirm={() => void courtActions.confirmCourtAction()}
        />
      ) : null}

      {showEndSessionConfirm ? (
        <SessionActionConfirmModal
          title="End tournament?"
          subtitle="Closes the tournament and locks standings."
          details={
            <div className="app-panel-muted space-y-2 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                Tournament summary
              </p>
              <p className="text-sm font-semibold text-gray-900">
                {sessionView.activeMatchesCount} active courts
              </p>
              <p className="text-sm text-gray-600">
                {sessionView.completedMatchesCount} recorded matches will remain
                in history.
              </p>
            </div>
          }
          confirmLabel="Confirm End Tournament"
          confirmTutorialTarget="admin-onboarding-end-session"
          cancelLabel="Keep Tournament Live"
          isSubmitting={endingSession}
          onClose={closeEndSessionConfirm}
          onConfirm={() => void endSessionWithOnboardingRefresh()}
        />
      ) : null}

      {showResetTestConfirm ? (
        <SessionActionConfirmModal
          title={
            sessionData.isTest ? "Reset test tournament?" : "Reset tournament?"
          }
          subtitle="Clears results and keeps setup."
          details={
            <div className="app-panel-muted space-y-2 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                {sessionData.isTest ? "Test tournament" : "Tournament"}
              </p>
              <p className="text-sm font-semibold text-gray-900">
                {sessionData.name}
              </p>
              <p className="text-sm text-gray-600">
                Players and settings will be kept. Matches, scores, standings,
                and queue will be cleared.
              </p>
            </div>
          }
          confirmLabel="Confirm Reset"
          cancelLabel={
            sessionData.isTest ? "Keep Test Tournament" : "Keep Tournament"
          }
          isSubmitting={resettingTestSession}
          onClose={closeResetTestConfirm}
          onConfirm={() => void resetTestSession()}
        />
      ) : null}

      {showCreateRealSessionConfirm ? (
        <SessionActionConfirmModal
          title="Create real tournament?"
          subtitle="Start clean or include test results."
          details={
            <div className="space-y-3">
              <div className="app-panel-muted space-y-2 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                  What gets copied
                </p>
                <p className="text-sm text-gray-600">
                  Players, guests, courts, format, mode, and player groups will
                  carry over.
                </p>
                <p className="text-sm text-gray-600">
                  {completedScoredTestMatchesCount} completed scored{" "}
                  {completedScoredTestMatchesCount === 1 ? "match" : "matches"}{" "}
                  found in this test tournament.
                </p>
              </div>

              <div className="grid gap-2">
                <label
                  className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${
                    !createRealSessionIncludesResults
                      ? "border-gray-900 bg-white"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="create-real-session-mode"
                    checked={!createRealSessionIncludesResults}
                    disabled={creatingRealSession}
                    onChange={() => setCreateRealSessionIncludesResults(false)}
                    className="mt-1"
                  />
                  <span className="space-y-1">
                    <span className="block text-sm font-semibold text-gray-900">
                      Setup only
                    </span>
                    <span className="block text-sm text-gray-600">
                      Same setup, no results.
                    </span>
                  </span>
                </label>

                <label
                  className={`flex gap-3 rounded-lg border p-3 ${
                    completedScoredTestMatchesCount === 0
                      ? "cursor-not-allowed border-gray-200 bg-gray-50 opacity-60"
                      : createRealSessionIncludesResults
                        ? "cursor-pointer border-gray-900 bg-white"
                        : "cursor-pointer border-gray-200 bg-gray-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="create-real-session-mode"
                    checked={createRealSessionIncludesResults}
                    disabled={
                      creatingRealSession ||
                      completedScoredTestMatchesCount === 0
                    }
                    onChange={() => setCreateRealSessionIncludesResults(true)}
                    className="mt-1"
                  />
                  <span className="space-y-1">
                    <span className="block text-sm font-semibold text-gray-900">
                      Include completed results
                    </span>
                    <span className="block text-sm text-gray-600">
                      Copy scored matches and ratings.
                    </span>
                  </span>
                </label>
              </div>

              <p className="text-xs text-gray-500">
                Active, pending, and unscored matches stay in the test
                tournament.
              </p>
            </div>
          }
          confirmLabel={
            createRealSessionIncludesResults
              ? "Create With Results"
              : "Create Setup Copy"
          }
          cancelLabel="Stay In Test Tournament"
          isSubmitting={creatingRealSession}
          onClose={closeCreateRealSessionConfirm}
          onConfirm={() => void createRealSessionFromTest()}
        />
      ) : null}

      {showDeleteTestConfirm ? (
        <SessionActionConfirmModal
          title={
            sessionData.isTest
              ? "Delete test tournament?"
              : "Cancel tournament?"
          }
          subtitle={
            sessionData.isTest
              ? "Permanently removes this test tournament."
              : "Cancels and permanently removes this tournament."
          }
          details={
            <div className="app-panel-muted space-y-2 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                {sessionData.isTest ? "Test tournament" : "Tournament"}
              </p>
              <p className="text-sm font-semibold text-gray-900">
                {sessionData.name}
              </p>
              <p className="text-sm text-gray-600">This cannot be undone.</p>
            </div>
          }
          confirmLabel={
            sessionData.isTest
              ? "Delete Test Tournament"
              : "Cancel & Delete Tournament"
          }
          cancelLabel={
            sessionData.isTest ? "Keep Test Tournament" : "Keep Tournament"
          }
          isSubmitting={deletingTestSession}
          onClose={closeDeleteTestConfirm}
          onConfirm={() => void deleteTestSession()}
        />
      ) : null}

      {skipNextDraft ? (
        <SessionActionConfirmModal
          title="Skip next match?"
          subtitle="This player will be left out the next time automatic matchmaking would select them."
          details={
            <div className="app-panel-muted space-y-2 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                Player
              </p>
              <p className="text-sm font-semibold text-gray-900">
                {skipNextDraft.playerName}
              </p>
              <p className="text-sm text-gray-600">
                They will not receive catch-up priority after the skip is used.
              </p>
              {skipNextDraft.affectsQueuedMatch ? (
                <p className="text-sm font-semibold text-amber-800">
                  This will remove them from the queued match and rebuild the
                  queue.
                </p>
              ) : null}
            </div>
          }
          confirmLabel="Skip Next Match"
          cancelLabel="Keep Player Available"
          isSubmitting={skippingNextPlayerId === skipNextDraft.userId}
          onClose={closeSkipNextConfirm}
          onConfirm={() => void confirmSkipNextPlayer()}
        />
      ) : null}

      {removePlayerDraft ? (
        <SessionActionConfirmModal
          title="Remove player?"
          subtitle="Removes the player from this tournament."
          details={
            <div className="app-panel-muted space-y-2 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                Player
              </p>
              <p className="text-sm font-semibold text-gray-900">
                {removePlayerDraft.playerName}
              </p>
              <p className="text-sm text-gray-600">
                If this player already has protected match history, the server
                may block removal.
              </p>
            </div>
          }
          confirmLabel="Confirm Remove Player"
          cancelLabel="Keep Player"
          isSubmitting={removingPlayerId === removePlayerDraft.userId}
          onClose={closeRemovePlayerConfirm}
          onConfirm={() => void removePlayerFromSession()}
        />
      ) : null}

      <SessionPreferenceEditorPortal
        openPreferenceEditor={openPreferenceEditor}
        activePreferencePlayer={sessionView.activePreferencePlayer}
        isAdmin={isAdmin}
        isCompletedSession={sessionView.isCompletedSession}
        isMixicano={sessionView.isMixicano}
        isInterclub={isInterclubSession}
        interclubClubOptions={interclubClubOptions}
        poolsEnabled={sessionData.poolsEnabled}
        poolAName={sessionData.poolAName}
        poolBName={sessionData.poolBName}
        renamingGuestId={renamingGuestId}
        removingPlayerId={removingPlayerId}
        skippingNextPlayerId={skippingNextPlayerId}
        onClose={() => setOpenPreferenceEditor(null)}
        onUpdatePreference={updatePlayerPreference}
        onRequestRenameGuest={openGuestRename}
        onRequestSkipNext={requestSkipNextPlayer}
        onToggleSkipNext={toggleSkipNextPlayer}
        onRemovePlayer={requestRemovePlayerFromSession}
      />

      <SessionGuestRenameModal
        open={guestRenameDraft !== null}
        guestName={guestRenameInput}
        saving={renamingGuestId !== null}
        onGuestNameChange={setGuestRenameInput}
        onClose={closeGuestRenameModal}
        onSubmit={() => void renameGuestInSession()}
      />

      <SessionRosterModal
        open={showRosterModal}
        isAdmin={isAdmin}
        isMixicano={sessionView.isMixicano}
        isInterclub={isInterclubSession}
        interclubClubOptions={interclubClubOptions}
        poolsEnabled={sessionData.poolsEnabled}
        rosterSearch={rosterSearch}
        rosterPool={rosterPool}
        rosterPlayerPools={rosterPlayerPools}
        guestName={guestName}
        guestGender={guestGender}
        guestMixedSideOverride={guestMixedSideOverride}
        guestRepresentingClubId={guestRepresentingClubId}
        guestInitialElo={guestInitialElo}
        guestFormError={guestFormError}
        addingGuest={addingGuest}
        addingPlayerId={addingPlayerId}
        playersNotInSession={sessionView.playersNotInSession}
        existingParticipantNames={sessionData.players.map(
          (player) => player.user.name,
        )}
        onClose={closeRosterModal}
        onRosterSearchChange={setRosterSearch}
        onRosterPoolChange={setRosterPool}
        onRosterPlayerPoolChange={setRosterPlayerPool}
        onGuestNameChange={setGuestName}
        onGuestGenderChange={handleGuestGenderChange}
        onGuestMixedSideOverrideChange={setGuestMixedSideOverride}
        onGuestRepresentingClubChange={setGuestRepresentingClubId}
        onGuestInitialEloChange={setGuestInitialElo}
        onResetGuestDraft={resetGuestInputs}
        onAddGuest={addGuestToSession}
        onAddPlayer={addPlayerToSession}
      />

      <ManualMatchModal
        open={
          courtActions.manualCourtId !== null || courtActions.manualQueueOpen
        }
        court={
          courtActions.manualQueueOpen ? null : sessionView.activeManualCourt
        }
        title={courtActions.manualQueueOpen ? "Manual Queue" : undefined}
        locationLabel={courtActions.manualQueueOpen ? "Next Up" : undefined}
        submitLabel={courtActions.manualQueueOpen ? "Queue Match" : undefined}
        manualMatchForm={courtActions.manualMatchForm}
        manualMatchPlayerOptions={sessionView.manualMatchPlayerOptions}
        selectedManualPlayerIds={sessionView.selectedManualPlayerIds}
        creatingManualMatch={courtActions.creatingManualMatch}
        error={courtActions.manualMatchError}
        poolsEnabled={sessionData.poolsEnabled}
        poolAName={sessionData.poolAName}
        poolBName={sessionData.poolBName}
        onClose={courtActions.closeManualMatchModal}
        onTogglePlayer={courtActions.toggleManualMatchPlayerSelection}
        onCreateMatch={
          courtActions.manualQueueOpen
            ? courtActions.createManualQueuedMatch
            : courtActions.createManualMatch
        }
      />
    </PlayShell>
  );
}
