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
import { FlashMessage } from "@/components/ui/chrome";
import { LiveCourtsPanel } from "@/components/session/LiveCourtsPanel";
import { SessionMobileSectionNav } from "@/components/session/SessionMobileSectionNav";
import { LiveStandingsTable } from "@/components/session/LiveStandingsTable";
import { ManualMatchModal } from "@/components/session/ManualMatchModal";
import { SessionActionConfirmModal } from "@/components/session/SessionActionConfirmModal";
import { SessionOverviewPanel } from "@/components/session/SessionOverviewPanel";
import { SessionPodium } from "@/components/session/SessionPodium";
import { SessionPlayersModal } from "@/components/session/SessionPlayersModal";
import { SessionPreferenceEditorPortal } from "@/components/session/SessionPreferenceEditorPortal";
import { SessionRosterModal } from "@/components/session/SessionRosterModal";
import { SessionSettingsModal } from "@/components/session/SessionSettingsModal";
import type { CurrentUser } from "@/components/session/sessionTypes";
import { SessionStatus } from "@/types/enums";
import {
  applyCourtLabelUpdates,
  mergeSessionSnapshot,
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
}> = [
  { id: "session", label: "Session" },
  { id: "courts", label: "Courts" },
  { id: "standings", label: "Standings" },
];

const COMPLETED_MOBILE_SECTIONS: Array<{
  id: SessionMobileSection;
  label: string;
}> = [
  { id: "session", label: "Session" },
  { id: "results", label: "Results" },
];

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
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState("");
  const [endingSession, setEndingSession] = useState(false);
  const [showEndSessionConfirm, setShowEndSessionConfirm] = useState(false);
  const [showPlayersModal, setShowPlayersModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [courtLabelDrafts, setCourtLabelDrafts] = useState<
    Record<string, string>
  >({});
  const [savingCourtLabels, setSavingCourtLabels] = useState(false);
  const [mobileSection, setMobileSection] =
    useState<SessionMobileSection>("session");

  const safeJson = useCallback(async (res: Response) => {
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      console.error("Failed to parse JSON:", text);
      return { error: "Invalid server response" };
    }
  }, []);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch("/api/user/me");
      if (!res.ok) return;

      const data = await safeJson(res);
      if (data.user) {
        setUser(data.user as CurrentUser);
      }
    } catch (err) {
      console.error(err);
    }
  }, [safeJson]);

  const { sessionData, patchSessionData, scheduleSessionRefresh } =
    useSessionData({
      code,
      enabled: !!session?.user?.id,
      safeJson,
      setError,
    });

  const {
    matchScores,
    submittingMatchId,
    confirmingScoreMatchId,
    reopeningMatchId,
    reshufflingCourtId,
    undoingCourtId,
    courtActionDraft,
    creatingOpenMatches,
    creatingOpenCourtCount,
    creatingQueuedMatch,
    clearingQueuedMatch,
    assigningQueuedMatch,
    manualCourtId,
    creatingManualMatch,
    manualMatchForm,
    createMatchesForCourts,
    queueNextMatch,
    clearQueuedMatch,
    assignQueuedMatch,
    openManualMatchModal,
    closeManualMatchModal,
    updateManualMatchSlot,
    createManualMatch,
    reshuffleMatch,
    undoMatchSelection,
    closeCourtActionDraft,
    confirmCourtAction,
    handleScoreChange,
    requestScoreSubmitConfirmation,
    cancelScoreSubmitConfirmation,
    submitScore,
    approveScore,
    reopenScoreForEdit,
  } = useSessionMatchActions({
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
    guestPreference,
    guestInitialElo,
    addingGuest,
    savingPreferencesFor,
    removingPlayerId,
    removePlayerDraft,
    openPreferenceEditor,
    setRosterSearch,
    setGuestName,
    setGuestPreference,
    setGuestInitialElo,
    setOpenPreferenceEditor,
    togglePreferenceEditor,
    openRosterModal,
    closeRosterModal,
    handleGuestGenderChange,
    addPlayerToSession,
    addGuestToSession,
    togglePausePlayer,
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

  const startSession = async () => {
    try {
      const res = await fetch(`/api/sessions/${code}/start`, { method: "POST" });
      if (res.ok) {
        const data = await safeJson(res);
        patchSessionData((current) => mergeSessionSnapshot(current, data));
        scheduleSessionRefresh();
      } else {
        const data = await safeJson(res);
        setError(data.error || "Failed to start session");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const openEndSessionConfirm = () => {
    setError("");
    setShowSettingsModal(false);
    setShowEndSessionConfirm(true);
  };

  const closeEndSessionConfirm = () => {
    if (endingSession) return;
    setShowEndSessionConfirm(false);
  };

  const endSession = async () => {
    setEndingSession(true);
    setError("");

    try {
      const res = await fetch(`/api/sessions/${code}/end`, { method: "POST" });
      if (res.ok) {
        const data = await safeJson(res);
        setShowEndSessionConfirm(false);
        patchSessionData((current) => mergeSessionSnapshot(current, data));
        scheduleSessionRefresh();
      } else {
        const data = await safeJson(res);
        setError(data.error || "Failed to end session");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to end session");
    } finally {
      setEndingSession(false);
    }
  };

  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push(sessionData?.communityId ? `/community/${sessionData.communityId}` : "/");
  }, [router, sessionData?.communityId]);

  const isAdmin =
    !!sessionData?.viewerCanManage || !!user?.isAdmin || !!session?.user?.isAdmin;
  const isClaimedUser = user?.isClaimed === true;
  const currentUserId = session?.user?.id || "";
  const canOpenPlayerManager = isAdmin && sessionData?.status !== SessionStatus.COMPLETED;
  const canOpenSettings = isAdmin && sessionData?.status !== SessionStatus.COMPLETED;

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
      manualMatchForm,
      manualCourtId,
      openPreferenceEditor,
    });
  }, [
    communityPlayers,
    manualCourtId,
    manualMatchForm,
    openPreferenceEditor,
    rosterSearch,
    sessionData,
  ]);
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

  const openSettingsModal = useCallback(() => {
    if (!sessionData || !canOpenSettings) {
      return;
    }

    setError("");
    setCourtLabelDrafts(
      Object.fromEntries(
        sessionData.courts.map((court) => [court.id, court.label ?? ""])
      )
    );
    setShowSettingsModal(true);
  }, [canOpenSettings, sessionData]);

  const closeSettingsModal = useCallback(() => {
    if (savingCourtLabels) {
      return;
    }

    setShowSettingsModal(false);
  }, [savingCourtLabels]);

  const openRosterFromSettings = useCallback(() => {
    setShowSettingsModal(false);
    openRosterModal();
  }, [openRosterModal]);

  const handleCourtLabelChange = useCallback(
    (courtId: string, value: string) => {
      setCourtLabelDrafts((current) => ({
        ...current,
        [courtId]: value,
      }));
    },
    []
  );

  const saveCourtLabels = useCallback(async () => {
    if (!sessionData || !hasCourtLabelChanges) {
      return;
    }

    setSavingCourtLabels(true);
    setError("");

    try {
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
      const data = await safeJson(res);

      if (!res.ok) {
        setError(data.error || "Failed to update court labels");
        return;
      }

      patchSessionData((current) =>
        applyCourtLabelUpdates(current, data.courts ?? [])
      );
      setShowSettingsModal(false);
      scheduleSessionRefresh();
    } catch (err) {
      console.error(err);
      setError("Failed to update court labels");
    } finally {
      setSavingCourtLabels(false);
    }
  }, [
    code,
    courtLabelDrafts,
    hasCourtLabelChanges,
    patchSessionData,
    safeJson,
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

  const updateMobileSection = useCallback(
    (sectionId: SessionMobileSection, behavior: ScrollBehavior = "smooth") => {
      setMobileSection(sectionId);
      scrollMobilePagerToSection(sectionId, behavior);
    },
    [scrollMobilePagerToSection]
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
      let targetIndex = startIndex;

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

      updateMobileSection(targetSection, "smooth");
    },
    [mobileSections, updateMobileSection]
  );

  useLayoutEffect(() => {
    if (!sessionData || !sessionView) {
      previousSessionStatusRef.current = null;
      return;
    }

    const previousStatus = previousSessionStatusRef.current;
    const isInitialEntry = previousStatus === null;
    const becameCompleted =
      previousStatus !== SessionStatus.COMPLETED && sessionView.isCompletedSession;
    const becameActive =
      previousStatus === SessionStatus.WAITING &&
      sessionData.status === SessionStatus.ACTIVE;

    if (isInitialEntry || becameCompleted || becameActive) {
      setMobileSection(preferredMobileSection);
      scrollMobilePagerToSection(preferredMobileSection, "auto");
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
      const settledIndex = Math.round(
        container.scrollLeft / Math.max(container.clientWidth, 1)
      );
      const settledSection = mobileSections[settledIndex]?.id;

      if (settledSection && settledSection !== activeMobileSection) {
        setMobileSection(settledSection);
      }
    }, 120);
  }, [
    activeMobileSection,
    clearProgrammaticPagerSync,
    mobileSections,
  ]);

  const handleMobilePagerTouchStart = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
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
    [clearProgrammaticPagerSync]
  );

  const handleMobilePagerTouchMove = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
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
    [mobileSections.length]
  );

  const handleMobilePagerTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      const touch = event.changedTouches[0];
      settleMobilePagerFromSwipe(touch ? touch.clientX : null);
    },
    [settleMobilePagerFromSwipe]
  );

  const handleMobilePagerTouchCancel = useCallback(() => {
    settleMobilePagerFromSwipe(null);
  }, [settleMobilePagerFromSwipe]);

  if (status === "loading" || !sessionData || !sessionView) {
    return (
      <div className="app-page flex items-center justify-center px-6">
        <div className="app-panel flex flex-col items-center gap-4 px-8 py-8">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          <p className="app-eyebrow">Loading session</p>
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
              Back
            </button>
            <div className="min-w-0 flex flex-col">
              <h1 className="truncate text-lg font-semibold leading-tight text-gray-900 sm:text-xl">
                {sessionData.name}
              </h1>
            </div>
          </div>
        </div>
      </nav>

      <main className="app-shell max-w-7xl space-y-4 sm:space-y-6">
        <div className="sticky top-[4.75rem] z-20 xl:hidden">
          <SessionMobileSectionNav
            sections={mobileSections}
            activeSection={activeMobileSection}
            onSelect={(sectionId) =>
              updateMobileSection(sectionId as SessionMobileSection)
            }
          />
        </div>

        {error ? <FlashMessage tone="error">{error}</FlashMessage> : null}

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
            <section className="w-full shrink-0 snap-center xl:w-auto xl:shrink xl:snap-none">
              <SessionOverviewPanel
                sessionTypeLabel={sessionView.sessionTypeLabel}
                sessionModeLabel={sessionView.sessionModeLabel}
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
                onStartSession={startSession}
                onOpenPlayerManager={() => setShowPlayersModal(true)}
                onOpenSettings={openSettingsModal}
                onOpenMatchHistory={() => router.push(`/session/${code}/history`)}
              />
            </section>

            {!sessionView.isCompletedSession ? (
              <section className="w-full shrink-0 snap-center xl:w-auto xl:shrink xl:snap-none">
                <LiveCourtsPanel
                  sessionStatus={sessionData.status}
                  courts={sessionData.courts}
                  queuedMatch={sessionView.queuedMatch}
                  currentUserId={currentUserId}
                  isAdmin={isAdmin}
                  isClaimedUser={isClaimedUser}
                  confirmingScoreMatchId={confirmingScoreMatchId}
                  activeMatchesCount={sessionView.activeMatchesCount}
                  readyCourtsCount={sessionView.readyCourtsCount}
                  creatableOpenCourtCount={sessionView.creatableOpenCourtCount}
                  creatableOpenCourtIds={sessionView.creatableOpenCourtIds}
                  creatingOpenMatches={creatingOpenMatches}
                  creatingOpenCourtCount={creatingOpenCourtCount}
                  canQueueNextMatch={sessionView.canQueueNextMatch}
                  creatingQueuedMatch={creatingQueuedMatch}
                  clearingQueuedMatch={clearingQueuedMatch}
                  assigningQueuedMatch={assigningQueuedMatch}
                  nextReadyCourtLabel={sessionView.nextReadyCourtLabel}
                  reshufflingCourtId={reshufflingCourtId}
                  undoingCourtId={undoingCourtId}
                  reopeningMatchId={reopeningMatchId}
                  submittingMatchId={submittingMatchId}
                  matchScores={matchScores}
                  onCreateMatchesForCourts={createMatchesForCourts}
                  onQueueNextMatch={queueNextMatch}
                  onClearQueuedMatch={clearQueuedMatch}
                  onAssignQueuedMatch={assignQueuedMatch}
                  onOpenManualMatchModal={openManualMatchModal}
                  onReshuffleMatch={reshuffleMatch}
                  onUndoMatchSelection={undoMatchSelection}
                  onHandleScoreChange={handleScoreChange}
                  onRequestScoreSubmitConfirmation={
                    requestScoreSubmitConfirmation
                  }
                  onCancelScoreSubmitConfirmation={
                    cancelScoreSubmitConfirmation
                  }
                  onSubmitScore={submitScore}
                  onApproveScore={approveScore}
                  onReopenScoreForEdit={reopenScoreForEdit}
                />
              </section>
            ) : null}

            <section className="w-full shrink-0 snap-center xl:w-auto xl:shrink xl:snap-none">
              <div className="space-y-6">
                {sessionView.isCompletedSession ? (
                  <SessionPodium
                    sessionType={sessionData.type}
                    players={sessionView.sortedPlayers}
                    pointDiffByUserId={sessionView.pointDiffByUserId}
                    playerStatsByUserId={sessionView.playerStatsByUserId}
                  />
                ) : null}

                <LiveStandingsTable
                  sessionType={sessionData.type}
                  sessionStatus={sessionData.status}
                  players={sessionView.sortedPlayers}
                  currentUserId={currentUserId}
                  isAdmin={isAdmin}
                  pointDiffByUserId={sessionView.pointDiffByUserId}
                  savingPreferencesFor={savingPreferencesFor}
                  getPlayerProfileHref={sessionView.getPlayerProfileHref}
                  calculatePlayerSessionStats={(userId) =>
                    sessionView.playerStatsByUserId.get(userId) ??
                    EMPTY_PLAYER_SESSION_STATS
                  }
                  onTogglePause={togglePausePlayer}
                  onTogglePreferenceEditor={togglePreferenceEditor}
                />
              </div>
            </section>
          </div>
        </div>
      </main>

      <SessionSettingsModal
        open={showSettingsModal}
        courts={sessionData.courts}
        canOpenRoster={isAdmin && !sessionView.isCompletedSession}
        canEndSession={isAdmin && sessionData.status === SessionStatus.ACTIVE}
        courtLabelDrafts={courtLabelDrafts}
        hasCourtLabelChanges={hasCourtLabelChanges}
        savingCourtLabels={savingCourtLabels}
        onClose={closeSettingsModal}
        onOpenRoster={openRosterFromSettings}
        onEndSession={openEndSessionConfirm}
        onCourtLabelChange={handleCourtLabelChange}
        onSaveCourtLabels={() => void saveCourtLabels()}
      />

      <SessionPlayersModal
        open={showPlayersModal}
        players={sessionData.players}
        currentUserId={currentUserId}
        onClose={() => setShowPlayersModal(false)}
        onTogglePause={togglePausePlayer}
      />

      {courtActionDraft ? (
        <SessionActionConfirmModal
          title={
            courtActionDraft.action === "reshuffle"
              ? "Reshuffle match?"
              : "Undo match selection?"
          }
          subtitle={
            courtActionDraft.action === "reshuffle"
              ? `This will replace the current lineup on ${courtActionDraft.courtLabel} with a new one.`
              : `This will clear ${courtActionDraft.courtLabel} and return these players to the pool.`
          }
          details={
            <div className="space-y-4">
              <div className="app-panel-muted space-y-2 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                  {courtActionDraft.courtLabel}
                </p>
                <p className="text-sm font-semibold text-gray-900">
                  {courtActionDraft.team1Names[0]} &amp;{" "}
                  {courtActionDraft.team1Names[1]}
                </p>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-400">
                  vs
                </p>
                <p className="text-sm font-semibold text-gray-900">
                  {courtActionDraft.team2Names[0]} &amp;{" "}
                  {courtActionDraft.team2Names[1]}
                </p>
              </div>
            </div>
          }
          confirmLabel={
            courtActionDraft.action === "reshuffle"
              ? "Confirm Reshuffle"
              : "Confirm Undo"
          }
          cancelLabel="Keep Match"
          isSubmitting={
            courtActionDraft.action === "reshuffle"
              ? reshufflingCourtId === courtActionDraft.courtId
              : undoingCourtId === courtActionDraft.courtId
          }
          onClose={closeCourtActionDraft}
          onConfirm={() => void confirmCourtAction()}
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
          cancelLabel="Keep Session Live"
          isSubmitting={endingSession}
          onClose={closeEndSessionConfirm}
          onConfirm={() => void endSession()}
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
        removingPlayerId={removingPlayerId}
        onClose={() => setOpenPreferenceEditor(null)}
        onUpdatePreference={updatePlayerPreference}
        onRemovePlayer={requestRemovePlayerFromSession}
      />

      <SessionRosterModal
        open={showRosterModal}
        isAdmin={isAdmin}
        isMixicano={sessionView.isMixicano}
        rosterSearch={rosterSearch}
        guestName={guestName}
        guestGender={guestGender}
        guestPreference={guestPreference}
        guestInitialElo={guestInitialElo}
        addingGuest={addingGuest}
        addingPlayerId={addingPlayerId}
        playersNotInSession={sessionView.playersNotInSession}
        onClose={closeRosterModal}
        onRosterSearchChange={setRosterSearch}
        onGuestNameChange={setGuestName}
        onGuestGenderChange={handleGuestGenderChange}
        onGuestPreferenceChange={setGuestPreference}
        onGuestInitialEloChange={setGuestInitialElo}
        onAddGuest={addGuestToSession}
        onAddPlayer={addPlayerToSession}
      />

      <ManualMatchModal
        open={manualCourtId !== null}
        court={sessionView.activeManualCourt}
        manualMatchForm={manualMatchForm}
        manualMatchPlayerOptions={sessionView.manualMatchPlayerOptions}
        selectedManualPlayerIds={sessionView.selectedManualPlayerIds}
        creatingManualMatch={creatingManualMatch}
        onClose={closeManualMatchModal}
        onUpdateSlot={updateManualMatchSlot}
        onCreateMatch={createManualMatch}
      />
    </div>
  );
}
