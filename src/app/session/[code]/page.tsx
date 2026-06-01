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
  ArrowLeft,
  ClipboardList,
  Grid3X3,
  Medal,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { getErrorMessage, safeJson } from "@/lib/http";
import { FlashMessage } from "@/components/ui/chrome";
import { MobileBottomTabs } from "@/components/ui/MobileBottomTabs";
import { LiveCourtsPanel } from "@/components/session/LiveCourtsPanel";
import { LiveStandingsTable } from "@/components/session/LiveStandingsTable";
import { ManualMatchModal } from "@/components/session/ManualMatchModal";
import { SessionActionConfirmModal } from "@/components/session/SessionActionConfirmModal";
import { SessionOverviewPanel } from "@/components/session/SessionOverviewPanel";
import { SessionPodium } from "@/components/session/SessionPodium";
import { SessionShareCard } from "@/components/session/SessionShareCard";
import { SessionPlayersModal } from "@/components/session/SessionPlayersModal";
import { SessionPreferenceEditorPortal } from "@/components/session/SessionPreferenceEditorPortal";
import { SessionGuestRenameModal } from "@/components/session/SessionGuestRenameModal";
import { SessionRosterModal } from "@/components/session/SessionRosterModal";
import { SessionSettingsModal } from "@/components/session/SessionSettingsModal";
import { AdminOnboardingChecklist } from "@/components/onboarding/AdminOnboardingChecklist";
import { useAdminOnboardingProgress } from "@/components/onboarding/useAdminOnboardingProgress";
import type { CurrentUser } from "@/components/session/sessionTypes";
import { MatchStatus, SessionStatus } from "@/types/enums";
import { shareSessionStandingsCard } from "@/lib/sessionShare";
import {
  prepareShareAvatarDataUrls,
  waitForShareCardRender,
} from "@/lib/shareAvatar";
import {
  applyCourtLabelUpdates,
  mergeSessionSnapshot,
  type SessionSnapshotLike,
} from "./sessionDataMutations";
import { buildSessionViewModel } from "./sessionViewModel";
import { useSessionData } from "./useSessionData";
import { useSessionMatchActions } from "./useSessionMatchActions";
import { useSessionPlayerManagement } from "./useSessionPlayerManagement";

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
  { id: "session", label: "Session", icon: ClipboardList },
  { id: "courts", label: "Courts", icon: Grid3X3 },
  { id: "standings", label: "Standings", icon: Trophy },
];

const COMPLETED_MOBILE_SECTIONS: Array<{
  id: SessionMobileSection;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "session", label: "Session", icon: ClipboardList },
  { id: "results", label: "Results", icon: Medal },
];

interface SessionUserResponse {
  user?: CurrentUser;
  error?: string;
}

type SessionSnapshotResponse = SessionSnapshotLike & {
  error?: string;
};

interface SessionCodeResponse {
  code?: string;
  error?: string;
}

interface CourtLabelUpdatesResponse {
  error?: string;
  courts?: Array<{
    id: string;
    label?: string | null;
  }>;
}

export default function SessionPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const code = params?.code as string;

  const mobilePagerRef = useRef<HTMLDivElement | null>(null);
  const previousSessionStatusRef = useRef<string | null>(null);
  const pagerSnapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programmaticPagerTargetRef = useRef<SessionMobileSection | null>(null);
  const programmaticPagerReleaseTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);
  const pagerTouchStartXRef = useRef<number | null>(null);
  const pagerTouchStartIndexRef = useRef<number | null>(null);
  const pagerIsDraggingRef = useRef(false);
  const shareCardRef = useRef<HTMLDivElement | null>(null);
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
  const [courtLabelDrafts, setCourtLabelDrafts] = useState<
    Record<string, string>
  >({});
  const [savingSettings, setSavingSettings] = useState(false);
  const [mobileSection, setMobileSection] =
    useState<SessionMobileSection>("session");
  const [celebrationRunId, setCelebrationRunId] = useState(0);
  const [sharingResults, setSharingResults] = useState(false);
  const [preparedShareAvatarUrlsByUserId, setPreparedShareAvatarUrlsByUserId] =
    useState<Map<string, string> | null>(null);

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
    communityPlayers,
    addingPlayerId,
    guestName,
    guestGender,
    guestMixedSideOverride,
    rosterPool,
    guestInitialElo,
    addingGuest,
    togglingPausePlayerId,
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
    setGuestInitialElo,
    setGuestRenameInput,
    setOpenPreferenceEditor,
    togglePreferenceEditor,
    openRosterModal,
    closeRosterModal,
    requestRenameGuest,
    closeGuestRenameModal,
    handleGuestGenderChange,
    addPlayerToSession,
    addGuestToSession,
    togglePausePlayer,
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

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/signin");
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user?.id && code) {
      void fetchUser();
    }
  }, [session, code, fetchUser]);

  const startSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${code}/start`, { method: "POST" });
      if (res.ok) {
        const data = await safeJson<SessionSnapshotResponse>(res);
        patchSessionData((current) => mergeSessionSnapshot(current, data));
        scheduleSessionRefresh();
      } else {
        const data = await safeJson<SessionSnapshotResponse>(res);
        setError(getErrorMessage(data, "Failed to start session"));
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
        patchSessionData((current) => mergeSessionSnapshot(current, data));
        scheduleSessionRefresh();
      } else {
        const data = await safeJson<SessionSnapshotResponse>(res);
        setError(getErrorMessage(data, "Failed to end session"));
      }
    } catch (err) {
      console.error(err);
      setError("Failed to end session");
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
      const res = await fetch(`/api/sessions/${code}/reset`, { method: "POST" });
      const data = await safeJson<SessionSnapshotResponse>(res);
      if (!res.ok) {
        setError(getErrorMessage(data, "Failed to reset test session"));
        return;
      }

      setShowResetTestConfirm(false);
      patchSessionData((current) => mergeSessionSnapshot(current, data));
      scheduleSessionRefresh();
    } catch (err) {
      console.error(err);
      setError("Failed to reset test session");
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
          typeof match.team2Score === "number"
      )
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
        setError(getErrorMessage(data, "Failed to create real session"));
        return;
      }

      if (typeof data.code !== "string") {
        setError("Failed to create real session");
        return;
      }

      setShowCreateRealSessionConfirm(false);
      router.push(`/session/${data.code}`);
    } catch (err) {
      console.error(err);
      setError("Failed to create real session");
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
        setError(getErrorMessage(data, "Failed to delete test session"));
        return;
      }

      setShowDeleteTestConfirm(false);
      router.push(
        sessionData?.communityId ? `/community/${sessionData.communityId}` : "/"
      );
    } catch (err) {
      console.error(err);
      setError("Failed to delete test session");
    } finally {
      setDeletingTestSession(false);
    }
  }, [code, router, sessionData?.communityId]);

  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push(sessionData?.communityId ? `/community/${sessionData.communityId}` : "/");
  }, [router, sessionData?.communityId]);

  const isAdmin =
    !!sessionData?.viewerCanManage || !!user?.isAdmin || !!session?.user?.isAdmin;
  const canUseAdminSessionControls =
    !!sessionData?.viewerCanUseAdminSessionControls ||
    !!user?.isAdmin ||
    !!session?.user?.isAdmin;
  const isClaimedUser = user?.isClaimed === true;
  const currentUserId = session?.user?.id || "";
  const isTutorialPlayground =
    sessionData?.isTutorialCommunity === true &&
    sessionData.tutorialOwnerId === currentUserId;
  const canOpenPlayerManager =
    isAdmin && sessionData?.status !== SessionStatus.COMPLETED;
  const canOpenSettings =
    isAdmin &&
    (sessionData?.status !== SessionStatus.COMPLETED || sessionData?.isTest);
  const isPlayerPickerOpen = showPlayersModal || showRosterModal;
  const adminOnboarding = useAdminOnboardingProgress(
    status === "authenticated" &&
      isAdmin &&
      isTutorialPlayground &&
      !!sessionData &&
      sessionData.status !== SessionStatus.COMPLETED
  );
  const startSessionWithOnboardingRefresh = useCallback(async () => {
    await startSession();
    void adminOnboarding.refresh();
  }, [adminOnboarding, startSession]);
  const createMatchesForCourtsWithOnboardingRefresh = useCallback(
    async (...args: Parameters<typeof courtActions.createMatchesForCourts>) => {
      await courtActions.createMatchesForCourts(...args);
      void adminOnboarding.refresh();
    },
    [adminOnboarding, courtActions]
  );
  const createMatchForCourtWithOnboardingRefresh = useCallback(
    async (...args: Parameters<typeof courtActions.createMatchForCourt>) => {
      await courtActions.createMatchForCourt(...args);
      void adminOnboarding.refresh();
    },
    [adminOnboarding, courtActions]
  );
  const submitScoreWithOnboardingRefresh = useCallback(
    async (...args: Parameters<typeof scoreActions.submitScore>) => {
      await scoreActions.submitScore(...args);
      void adminOnboarding.refresh();
    },
    [adminOnboarding, scoreActions]
  );
  const endSessionWithOnboardingRefresh = useCallback(async () => {
    await endSession();
    void adminOnboarding.refresh();
  }, [adminOnboarding, endSession]);
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
      communityPlayers,
      rosterSearch,
      manualMatchForm: courtActions.manualMatchForm,
      manualCourtId: courtActions.manualCourtId,
      openPreferenceEditor,
    });
  }, [
    communityPlayers,
    courtActions.manualCourtId,
    courtActions.manualMatchForm,
    openPreferenceEditor,
    rosterSearch,
    sessionData,
  ]);
  const handleShareResults = useCallback(async () => {
    if (!sessionData || !sessionView) {
      setError("Results are not ready to share yet");
      return;
    }

    setSharingResults(true);
    setError("");

    try {
      const preparedAvatarUrlsByUserId = await prepareShareAvatarDataUrls(
        sessionView.sortedPlayers
      );
      setPreparedShareAvatarUrlsByUserId(preparedAvatarUrlsByUserId);
      await waitForShareCardRender();

      if (!shareCardRef.current) {
        throw new Error("Results are not ready to share yet");
      }

      await shareSessionStandingsCard({
        node: shareCardRef.current,
        fileName: `${sessionData.name}-standings`,
        shareTitle: `${sessionData.name} final standings`,
      });
    } catch (err) {
      console.error(err);
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(
          err instanceof Error && err.message.trim().length > 0
            ? err.message
            : "Failed to share standings"
        );
      }
    } finally {
      setPreparedShareAvatarUrlsByUserId(null);
      setSharingResults(false);
    }
  }, [sessionData, sessionView]);
  const mobileSections = useMemo(
    () =>
      sessionView?.isCompletedSession
        ? COMPLETED_MOBILE_SECTIONS
        : LIVE_MOBILE_SECTIONS,
    [sessionView?.isCompletedSession]
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
    (section) => section.id === mobileSection
  )
    ? mobileSection
    : mobileSections[0]?.id ?? "session";
  const hasCourtLabelChanges = useMemo(() => {
    if (!sessionData) {
      return false;
    }

    return sessionData.courts.some(
      (court) =>
        (courtLabelDrafts[court.id] ?? "").trim() !== (court.label ?? "").trim()
    );
  }, [courtLabelDrafts, sessionData]);
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
    hasCourtLabelChanges || hasAutoQueueChange || hasRespectPlayerRestChange;
  const completedScoredTestMatchesCount = useMemo(
    () =>
      (sessionData?.matches ?? []).filter(
        (match) =>
          match.status === MatchStatus.COMPLETED &&
          typeof match.team1Score === "number" &&
          typeof match.team2Score === "number"
      ).length,
    [sessionData?.matches]
  );

  const openSettingsModal = useCallback(() => {
    if (!sessionData || !canOpenSettings) {
      return;
    }

    setError("");
    setAutoQueueDraft(sessionData.autoQueueEnabled);
    setRespectPlayerRestDraft(sessionData.respectPlayerRest);
    setCourtLabelDrafts(
      Object.fromEntries(
        sessionData.courts.map((court) => [court.id, court.label ?? ""])
      )
    );
    setShowSettingsModal(true);
  }, [canOpenSettings, sessionData]);

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
    [requestRenameGuest]
  );

  const handleCourtLabelChange = useCallback(
    (courtId: string, value: string) => {
      setCourtLabelDrafts((current) => ({
        ...current,
        [courtId]: value,
      }));
    },
    []
  );

  const saveSessionSettings = useCallback(async () => {
    if (!sessionData || !hasSettingsChanges) {
      return;
    }

    setSavingSettings(true);
    setError("");

    try {
      if (hasCourtLabelChanges) {
        const res = await fetch(`/api/sessions/${code}/courts/labels`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            courts: sessionData.courts.map((court) => ({
              courtId: court.id,
              label: courtLabelDrafts[court.id] ?? "",
            })),
          }),
        });
        const data = await safeJson<CourtLabelUpdatesResponse>(res);

        if (!res.ok) {
          setError(getErrorMessage(data, "Failed to update court labels"));
          return;
        }

        patchSessionData((current) =>
          applyCourtLabelUpdates(current, data.courts ?? [])
        );
      }

      if (hasAutoQueueChange || hasRespectPlayerRestChange) {
        const res = await fetch(`/api/sessions/${code}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            autoQueueEnabled: autoQueueDraft,
            respectPlayerRest: respectPlayerRestDraft,
          }),
        });
        const data = await safeJson<SessionSnapshotResponse>(res);

        if (!res.ok) {
          setError(
            getErrorMessage(data, "Failed to update matchmaking settings")
          );
          return;
        }

        patchSessionData((current) => mergeSessionSnapshot(current, data));
      }

      setShowSettingsModal(false);
      scheduleSessionRefresh();
    } catch (err) {
      console.error(err);
      setError("Failed to update session settings");
    } finally {
      setSavingSettings(false);
    }
  }, [
    autoQueueDraft,
    code,
    courtLabelDrafts,
    hasAutoQueueChange,
    hasCourtLabelChanges,
    hasRespectPlayerRestChange,
    hasSettingsChanges,
    patchSessionData,
    respectPlayerRestDraft,
    scheduleSessionRefresh,
    sessionData,
  ]);

  const clearProgrammaticPagerSync = useCallback(() => {
    if (programmaticPagerReleaseTimeoutRef.current) {
      clearTimeout(programmaticPagerReleaseTimeoutRef.current);
      programmaticPagerReleaseTimeoutRef.current = null;
    }

    programmaticPagerTargetRef.current = null;
  }, []);

  const markProgrammaticPagerSync = useCallback(
    (sectionId: SessionMobileSection, behavior: ScrollBehavior) => {
      if (programmaticPagerReleaseTimeoutRef.current) {
        clearTimeout(programmaticPagerReleaseTimeoutRef.current);
      }

      programmaticPagerTargetRef.current = sectionId;
      programmaticPagerReleaseTimeoutRef.current = setTimeout(() => {
        if (programmaticPagerTargetRef.current === sectionId) {
          programmaticPagerTargetRef.current = null;
        }

        programmaticPagerReleaseTimeoutRef.current = null;
      }, behavior === "smooth" ? 280 : 80);
    },
    []
  );

  const scrollMobilePagerToSection = useCallback(
    (sectionId: SessionMobileSection, behavior: ScrollBehavior = "auto") => {
      const container = mobilePagerRef.current;
      if (!container) return;

      if (pagerSnapTimeoutRef.current) {
        clearTimeout(pagerSnapTimeoutRef.current);
        pagerSnapTimeoutRef.current = null;
      }

      const sectionIndex = mobileSections.findIndex(
        (section) => section.id === sectionId
      );
      if (sectionIndex < 0) return;

      if (container.clientWidth <= 0) {
        requestAnimationFrame(() => {
          const retryContainer = mobilePagerRef.current;
          if (!retryContainer || retryContainer.clientWidth <= 0) return;

          const retryIndex = mobileSections.findIndex(
            (section) => section.id === sectionId
          );
          if (retryIndex < 0) return;

          const retryLeft = retryIndex * retryContainer.clientWidth;
          if (Math.abs(retryContainer.scrollLeft - retryLeft) < 4) {
            clearProgrammaticPagerSync();
            return;
          }

          markProgrammaticPagerSync(sectionId, behavior);
          if (typeof retryContainer.scrollTo === "function") {
            retryContainer.scrollTo({
              left: retryLeft,
              behavior,
            });
            return;
          }

          retryContainer.scrollLeft = retryLeft;
        });
        return;
      }

      const nextLeft = sectionIndex * container.clientWidth;
      if (Math.abs(container.scrollLeft - nextLeft) < 4) {
        clearProgrammaticPagerSync();
        return;
      }

      markProgrammaticPagerSync(sectionId, behavior);
      if (typeof container.scrollTo === "function") {
        container.scrollTo({
          left: nextLeft,
          behavior,
        });
        return;
      }

      container.scrollLeft = nextLeft;
    },
    [clearProgrammaticPagerSync, markProgrammaticPagerSync, mobileSections]
  );

  const getNearestMobileSection = useCallback(
    (container: HTMLDivElement) => {
      const pageWidth = Math.max(container.clientWidth, 1);
      const sectionIndex = Math.min(
        mobileSections.length - 1,
        Math.max(0, Math.round(container.scrollLeft / pageWidth))
      );

      return {
        sectionIndex,
        sectionId: mobileSections[sectionIndex]?.id ?? null,
        targetLeft: sectionIndex * pageWidth,
      };
    },
    [mobileSections]
  );

  const updateMobileSection = useCallback(
    (sectionId: SessionMobileSection, behavior: ScrollBehavior = "smooth") => {
      setMobileSection(sectionId);
      scrollMobilePagerToSection(sectionId, behavior);
    },
    [scrollMobilePagerToSection]
  );

  useEffect(() => {
    if (
      activeAdminOnboardingStep?.id === "session-workflow" ||
      activeAdminOnboardingStep?.id === "end-session"
    ) {
      updateMobileSection("session", "auto");
      return;
    }

    if (activeAdminOnboardingStep?.id === "score-match") {
      updateMobileSection("courts", "auto");
    }
  }, [activeAdminOnboardingStep?.id, updateMobileSection]);

  const settleMobilePagerToNearestSection = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const container = mobilePagerRef.current;
      if (!container) {
        return;
      }

      const { sectionId, targetLeft } = getNearestMobileSection(container);
      if (!sectionId) {
        return;
      }

      const isAligned = Math.abs(container.scrollLeft - targetLeft) < 4;

      if (sectionId !== activeMobileSection) {
        if (isAligned) {
          setMobileSection(sectionId);
          return;
        }

        updateMobileSection(sectionId, behavior);
        return;
      }

      if (!isAligned) {
        scrollMobilePagerToSection(sectionId, behavior);
      }
    },
    [
      activeMobileSection,
      getNearestMobileSection,
      scrollMobilePagerToSection,
      updateMobileSection,
    ]
  );

  const settleMobilePagerFromSwipe = useCallback(
    (endX: number | null) => {
      const container = mobilePagerRef.current;
      const startX = pagerTouchStartXRef.current;
      const startIndex = pagerTouchStartIndexRef.current;

      pagerIsDraggingRef.current = false;
      pagerTouchStartXRef.current = null;
      pagerTouchStartIndexRef.current = null;

      if (!container || startX === null || startIndex === null) {
        return;
      }

      const swipeDelta = endX === null ? 0 : startX - endX;
      const swipeThreshold = Math.max(container.clientWidth * 0.16, 32);
      let targetIndex = getNearestMobileSection(container).sectionIndex;

      if (Math.abs(swipeDelta) >= swipeThreshold) {
        targetIndex = Math.min(
          mobileSections.length - 1,
          Math.max(0, startIndex + (swipeDelta > 0 ? 1 : -1))
        );
      }

      const targetSection = mobileSections[targetIndex]?.id;
      if (!targetSection) {
        return;
      }

      const targetLeft = targetIndex * Math.max(container.clientWidth, 1);
      if (Math.abs(container.scrollLeft - targetLeft) < 4) {
        setMobileSection(targetSection);
        return;
      }

      updateMobileSection(targetSection, "smooth");
    },
    [getNearestMobileSection, mobileSections, updateMobileSection]
  );

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
    const becameActive =
      previousStatus === SessionStatus.WAITING &&
      sessionData.status === SessionStatus.ACTIVE;

    if (isInitialEntry || becameCompleted || becameActive) {
      setMobileSection(preferredMobileSection);
      scrollMobilePagerToSection(preferredMobileSection, "auto");
    }

    if (becameCompleted) {
      setCelebrationRunId((currentRunId) => currentRunId + 1);
    }

    previousSessionStatusRef.current = sessionData.status;
  }, [
    preferredMobileSection,
    scrollMobilePagerToSection,
    sessionData,
    sessionView,
  ]);

  useEffect(() => {
    const handleResize = () => {
      scrollMobilePagerToSection(activeMobileSection, "auto");
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [activeMobileSection, scrollMobilePagerToSection]);

  useEffect(() => {
    return () => {
      if (pagerSnapTimeoutRef.current) {
        clearTimeout(pagerSnapTimeoutRef.current);
      }

      clearProgrammaticPagerSync();
    };
  }, [clearProgrammaticPagerSync]);

  const handleMobilePagerScroll = useCallback(() => {
    if (isPlayerPickerOpen) {
      return;
    }

    const container = mobilePagerRef.current;
    if (!container) return;

    const programmaticTarget = programmaticPagerTargetRef.current;
    if (programmaticTarget) {
      const targetIndex = mobileSections.findIndex(
        (section) => section.id === programmaticTarget
      );
      if (targetIndex >= 0) {
        const targetLeft = targetIndex * Math.max(container.clientWidth, 1);
        if (Math.abs(container.scrollLeft - targetLeft) > 4) {
          return;
        }
      }

      clearProgrammaticPagerSync();
    }

    if (pagerIsDraggingRef.current) {
      return;
    }

    if (pagerSnapTimeoutRef.current) {
      clearTimeout(pagerSnapTimeoutRef.current);
    }

    pagerSnapTimeoutRef.current = setTimeout(() => {
      settleMobilePagerToNearestSection("smooth");
    }, 140);
  }, [
    clearProgrammaticPagerSync,
    isPlayerPickerOpen,
    mobileSections,
    settleMobilePagerToNearestSection,
  ]);

  const handleMobilePagerTouchStart = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (isPlayerPickerOpen) {
        pagerIsDraggingRef.current = false;
        pagerTouchStartXRef.current = null;
        pagerTouchStartIndexRef.current = null;
        return;
      }

      const container = mobilePagerRef.current;
      const touch = event.touches[0];
      if (!container || !touch) {
        return;
      }

      clearProgrammaticPagerSync();
      if (pagerSnapTimeoutRef.current) {
        clearTimeout(pagerSnapTimeoutRef.current);
        pagerSnapTimeoutRef.current = null;
      }

      pagerIsDraggingRef.current = true;
      pagerTouchStartXRef.current = touch.clientX;
      pagerTouchStartIndexRef.current = Math.round(
        container.scrollLeft / Math.max(container.clientWidth, 1)
      );
    },
    [clearProgrammaticPagerSync, isPlayerPickerOpen]
  );

  const handleMobilePagerTouchMove = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (isPlayerPickerOpen) {
        event.preventDefault();
        return;
      }

      const container = mobilePagerRef.current;
      const touch = event.touches[0];
      const startX = pagerTouchStartXRef.current;
      const startIndex = pagerTouchStartIndexRef.current;

      if (!container || !touch || startX === null || startIndex === null) {
        return;
      }

      const deltaX = touch.clientX - startX;
      const isAtFirstSection = startIndex === 0;
      const isAtLastSection = startIndex === mobileSections.length - 1;
      const isPushingPastFirst = isAtFirstSection && deltaX > 0;
      const isPushingPastLast = isAtLastSection && deltaX < 0;

      if (!isPushingPastFirst && !isPushingPastLast) {
        return;
      }

      event.preventDefault();

      const lockedLeft = startIndex * container.clientWidth;
      if (Math.abs(container.scrollLeft - lockedLeft) > 1) {
        container.scrollLeft = lockedLeft;
      }
    },
    [isPlayerPickerOpen, mobileSections.length]
  );

  const handleMobilePagerTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (isPlayerPickerOpen) {
        pagerIsDraggingRef.current = false;
        pagerTouchStartXRef.current = null;
        pagerTouchStartIndexRef.current = null;
        return;
      }

      const touch = event.changedTouches[0];
      settleMobilePagerFromSwipe(touch ? touch.clientX : null);
    },
    [isPlayerPickerOpen, settleMobilePagerFromSwipe]
  );

  const handleMobilePagerTouchCancel = useCallback(() => {
    if (isPlayerPickerOpen) {
      pagerIsDraggingRef.current = false;
      pagerTouchStartXRef.current = null;
      pagerTouchStartIndexRef.current = null;
      return;
    }

    settleMobilePagerFromSwipe(null);
  }, [isPlayerPickerOpen, settleMobilePagerFromSwipe]);

  if (
    status === "loading" ||
    status === "unauthenticated" ||
    (isInitialLoadPending && !sessionData)
  ) {
    return (
      <div className="app-page flex items-center justify-center px-6">
        <div className="app-panel flex flex-col items-center gap-4 px-8 py-8">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          <p className="app-eyebrow">Loading session</p>
        </div>
      </div>
    );
  }

  if (!sessionData || !sessionView) {
    return (
      <div className="app-page flex items-center justify-center px-6">
        <div className="app-panel w-full max-w-lg px-6 py-8 text-center">
          <p className="app-eyebrow">Unable to load session</p>
          <p className="mt-3 text-sm text-gray-600">
            {initialLoadError ??
              "The session could not be loaded right now. Try again."}
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
    <div className="app-page">
      <nav className="app-topbar">
        <div className="app-topbar-inner max-w-7xl">
          <div className="min-w-0 flex items-center gap-3">
            <button
              onClick={handleBack}
              className="app-button-secondary px-4 py-2"
            >
              <ArrowLeft aria-hidden="true" size={17} />
              Back
            </button>
            <div className="min-w-0 flex flex-col">
              <h1 className="whitespace-normal break-words text-base font-semibold leading-tight text-gray-900 sm:text-xl">
                {sessionData.name}
              </h1>
              {isTutorialPlayground ? (
                <span className="mt-1 w-fit app-chip app-chip-accent">
                  Tutorial playground
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </nav>

      <main className="app-shell max-w-7xl space-y-4 sm:space-y-6">
        {error ? <FlashMessage tone="error">{error}</FlashMessage> : null}

        {isTutorialPlayground ? (
          <AdminOnboardingChecklist
            progress={adminOnboarding.progress}
            loading={adminOnboarding.loading}
            onDismiss={adminOnboarding.dismiss}
            onReopen={adminOnboarding.reopen}
            onCompleteStep={adminOnboarding.completeStep}
          />
        ) : null}

        <div
          ref={mobilePagerRef}
          onScroll={handleMobilePagerScroll}
          onTouchStart={handleMobilePagerTouchStart}
          onTouchMove={handleMobilePagerTouchMove}
          onTouchEnd={handleMobilePagerTouchEnd}
          onTouchCancel={handleMobilePagerTouchCancel}
          className="app-swipe-track -mx-1 overflow-x-auto overscroll-x-none xl:mx-0 xl:overflow-visible"
        >
          <div className="flex snap-x snap-mandatory xl:block xl:space-y-6">
            <section className="w-full shrink-0 snap-center pb-24 xl:w-auto xl:shrink xl:snap-none xl:pb-0">
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
                canOpenPlayerManager={Boolean(canOpenPlayerManager)}
                canOpenSettings={Boolean(canOpenSettings)}
                canShareResults={
                  sessionView.isCompletedSession &&
                  sessionView.sortedPlayers.length > 0
                }
                sharingResults={sharingResults}
                tutorialHint={sessionTutorialHint}
                onStartSession={startSessionWithOnboardingRefresh}
                onOpenPlayerManager={() => setShowPlayersModal(true)}
                onOpenSettings={openSettingsModal}
                onOpenMatchHistory={() =>
                  router.push(`/session/${code}/history?from=session`)
                }
                onShareResults={() => void handleShareResults()}
              />
            </section>

            {!sessionView.isCompletedSession ? (
              <section className="w-full shrink-0 snap-center pb-24 xl:w-auto xl:shrink xl:snap-none xl:pb-0">
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

            <section className="w-full shrink-0 snap-center pb-24 xl:w-auto xl:shrink xl:snap-none xl:pb-0">
              <div className="space-y-6">
                {sessionView.isCompletedSession ? (
                  <SessionPodium
                    sessionType={sessionData.type}
                    players={sessionView.sortedPlayers}
                    pointDiffByUserId={sessionView.pointDiffByUserId}
                    playerStatsByUserId={sessionView.playerStatsByUserId}
                    celebrationRunId={celebrationRunId}
                    onReplayCelebration={replayWinnerCelebration}
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
                />
              </div>
            </section>
          </div>
        </div>
      </main>

      <MobileBottomTabs
        items={mobileSections}
        activeId={activeMobileSection}
        onSelect={(sectionId) => updateMobileSection(sectionId)}
        ariaLabel="Session navigation"
        visibilityClassName="xl:hidden"
      />

      <SessionSettingsModal
        open={showSettingsModal}
        courts={sessionData.courts}
        isTestSession={sessionData.isTest}
        autoQueueEnabled={sessionData.autoQueueEnabled}
        autoQueueDraft={autoQueueDraft}
        respectPlayerRest={sessionData.respectPlayerRest}
        respectPlayerRestDraft={respectPlayerRestDraft}
        canOpenRoster={isAdmin && !sessionView.isCompletedSession}
        canEndSession={isAdmin && sessionData.status === SessionStatus.ACTIVE}
        canResetTestSession={canUseAdminSessionControls && sessionData.isTest}
        canCreateRealSession={
          canUseAdminSessionControls && sessionData.isTest && !isTutorialPlayground
        }
        canDeleteTestSession={canUseAdminSessionControls && sessionData.isTest}
        courtLabelDrafts={courtLabelDrafts}
        hasAutoQueueChange={hasAutoQueueChange}
        hasRespectPlayerRestChange={hasRespectPlayerRestChange}
        hasCourtLabelChanges={hasCourtLabelChanges}
        hasSettingsChanges={hasSettingsChanges}
        savingSettings={savingSettings}
        onClose={closeSettingsModal}
        onOpenRoster={openRosterFromSettings}
        onEndSession={openEndSessionConfirm}
        onResetTestSession={openResetTestConfirm}
        onCreateRealSession={openCreateRealSessionConfirm}
        onDeleteTestSession={openDeleteTestConfirm}
        onAutoQueueChange={setAutoQueueDraft}
        onRespectPlayerRestChange={setRespectPlayerRestDraft}
        onCourtLabelChange={handleCourtLabelChange}
        onSaveSettings={() => void saveSessionSettings()}
      />

      <SessionPlayersModal
        key={showPlayersModal ? "session-players-open" : "session-players-closed"}
        open={showPlayersModal}
        players={sessionData.players}
        currentUserId={currentUserId}
        canEditPreferences={!sessionView.isCompletedSession}
        poolsEnabled={sessionData.poolsEnabled}
        poolAName={sessionData.poolAName}
        poolBName={sessionData.poolBName}
        togglingPausePlayerId={togglingPausePlayerId}
        onClose={() => setShowPlayersModal(false)}
        onTogglePause={togglePausePlayer}
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
              ? `This will replace the current lineup on ${courtActions.courtActionDraft.courtLabel} with a new one.`
              : `This will clear ${courtActions.courtActionDraft.courtLabel} and return these players to the pool.`
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
          title="End session?"
          subtitle="This will close the live session and lock in the final standings."
          details={
            <div className="app-panel-muted space-y-2 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                Session summary
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
          confirmLabel="Confirm End Session"
          confirmTutorialTarget="admin-onboarding-end-session"
          cancelLabel="Keep Session Live"
          isSubmitting={endingSession}
          onClose={closeEndSessionConfirm}
          onConfirm={() => void endSessionWithOnboardingRefresh()}
        />
      ) : null}

      {showResetTestConfirm ? (
        <SessionActionConfirmModal
          title="Reset test session?"
          subtitle="This clears all simulated results but keeps the setup, roster, guests, courts, and pools."
          details={
            <div className="app-panel-muted space-y-2 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                Test session
              </p>
              <p className="text-sm font-semibold text-gray-900">
                {sessionData.name}
              </p>
              <p className="text-sm text-gray-600">
                Match history, standings, queue, and live courts will be reset.
              </p>
            </div>
          }
          confirmLabel="Confirm Reset"
          cancelLabel="Keep Test Session"
          isSubmitting={resettingTestSession}
          onClose={closeResetTestConfirm}
          onConfirm={() => void resetTestSession()}
        />
      ) : null}

      {showCreateRealSessionConfirm ? (
        <SessionActionConfirmModal
          title="Create real session?"
          subtitle="Choose whether the real session should start clean or include the completed results from this test."
          details={
            <div className="space-y-3">
              <div className="app-panel-muted space-y-2 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                  What gets copied
                </p>
                <p className="text-sm text-gray-600">
                  Players, guests, courts, format, mode, and pools will carry over.
                </p>
                <p className="text-sm text-gray-600">
                  {completedScoredTestMatchesCount} completed scored{" "}
                  {completedScoredTestMatchesCount === 1 ? "match" : "matches"}{" "}
                  found in this test session.
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
                      Start a clean real session with the same roster, courts,
                      format, mode, and pools.
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
                      creatingRealSession || completedScoredTestMatchesCount === 0
                    }
                    onChange={() => setCreateRealSessionIncludesResults(true)}
                    className="mt-1"
                  />
                  <span className="space-y-1">
                    <span className="block text-sm font-semibold text-gray-900">
                      Include completed results
                    </span>
                    <span className="block text-sm text-gray-600">
                      Copy completed scored matches into the real session and
                      apply standings, partner history, point difference, and
                      ratings.
                    </span>
                  </span>
                </label>
              </div>

              <p className="text-xs text-gray-500">
                Active, pending, and unscored matches stay in the test session.
              </p>
            </div>
          }
          confirmLabel={
            createRealSessionIncludesResults
              ? "Create With Results"
              : "Create Setup Copy"
          }
          cancelLabel="Stay In Test Session"
          isSubmitting={creatingRealSession}
          onClose={closeCreateRealSessionConfirm}
          onConfirm={() => void createRealSessionFromTest()}
        />
      ) : null}

      {showDeleteTestConfirm ? (
        <SessionActionConfirmModal
          title="Delete test session?"
          subtitle="This permanently removes the rehearsal session and its guest placeholders."
          details={
            <div className="app-panel-muted space-y-2 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                Test session
              </p>
              <p className="text-sm font-semibold text-gray-900">
                {sessionData.name}
              </p>
              <p className="text-sm text-gray-600">
                This cannot be undone.
              </p>
            </div>
          }
          confirmLabel="Delete Test Session"
          cancelLabel="Keep Test Session"
          isSubmitting={deletingTestSession}
          onClose={closeDeleteTestConfirm}
          onConfirm={() => void deleteTestSession()}
        />
      ) : null}

      {removePlayerDraft ? (
        <SessionActionConfirmModal
          title="Remove player?"
          subtitle="This will remove the player from the current session roster."
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
        poolsEnabled={sessionData.poolsEnabled}
        poolAName={sessionData.poolAName}
        poolBName={sessionData.poolBName}
        renamingGuestId={renamingGuestId}
        removingPlayerId={removingPlayerId}
        onClose={() => setOpenPreferenceEditor(null)}
        onUpdatePreference={updatePlayerPreference}
        onRequestRenameGuest={openGuestRename}
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
        poolsEnabled={sessionData.poolsEnabled}
        poolAName={sessionData.poolAName}
        poolBName={sessionData.poolBName}
        rosterSearch={rosterSearch}
        rosterPool={rosterPool}
        guestName={guestName}
        guestGender={guestGender}
        guestMixedSideOverride={guestMixedSideOverride}
        guestInitialElo={guestInitialElo}
        addingGuest={addingGuest}
        addingPlayerId={addingPlayerId}
        playersNotInSession={sessionView.playersNotInSession}
        onClose={closeRosterModal}
        onRosterSearchChange={setRosterSearch}
        onRosterPoolChange={setRosterPool}
        onGuestNameChange={setGuestName}
        onGuestGenderChange={handleGuestGenderChange}
        onGuestMixedSideOverrideChange={setGuestMixedSideOverride}
        onGuestInitialEloChange={setGuestInitialElo}
        onAddGuest={addGuestToSession}
        onAddPlayer={addPlayerToSession}
      />

      <ManualMatchModal
        open={courtActions.manualCourtId !== null || courtActions.manualQueueOpen}
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

      {sessionView.isCompletedSession &&
      sessionView.sortedPlayers.length > 0 &&
      preparedShareAvatarUrlsByUserId ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed -left-[200vw] top-0"
        >
          <div ref={shareCardRef}>
            <SessionShareCard
              sessionName={sessionData.name}
              communityName={
                isTutorialPlayground
                  ? "Tutorial playground"
                  : sessionData.communities?.[0]?.name ?? "Community"
              }
              sessionType={sessionData.type}
              sessionTypeLabel={sessionView.sessionTypeLabel}
              players={sessionView.sortedPlayers}
              preparedAvatarUrlsByUserId={preparedShareAvatarUrlsByUserId}
              pointDiffByUserId={sessionView.pointDiffByUserId}
              playerStatsByUserId={sessionView.playerStatsByUserId}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
