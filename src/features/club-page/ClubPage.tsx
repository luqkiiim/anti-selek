"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Shield } from "lucide-react";
import { getHostSessionOnboardingOverride } from "@/lib/adminOnboarding";
import { getClubRoleLabel } from "@/lib/clubRoles";
import { getSessionTypeLabel } from "@/lib/sessionModeLabels";
import { FlashMessage, HeroCard } from "@/components/ui/chrome";
import { ClubActionConfirmModal } from "@/components/club/ClubActionConfirmModal";
import { ClubBottomTabs } from "@/components/club/ClubBottomTabs";
import { ClubGuestsModal } from "@/components/club/ClubGuestsModal";
import { ClubLeaderboardPanel } from "@/components/club/ClubLeaderboardPanel";
import { ClubNotificationsButton } from "@/components/club/ClubNotificationsButton";
import { ClubOverviewPulsePanel } from "@/components/club/ClubOverviewPulsePanel";
import { ClubPlayersModal } from "@/components/club/ClubPlayersModal";
import { ClubProfilePanel } from "@/components/club/ClubProfilePanel";
import { CurrentTournamentsPanel } from "@/components/club/CurrentTournamentsPanel";
import { HostTournamentPanel } from "@/components/club/HostTournamentPanel";
import { PastTournamentsPanel } from "@/components/club/PastTournamentsPanel";
import { TestSessionsPanel } from "@/components/club/TestSessionsPanel";
import { AdminOnboardingChecklist } from "@/components/onboarding/AdminOnboardingChecklist";
import { useAdminOnboardingProgress } from "@/components/onboarding/useAdminOnboardingProgress";
import type { ClubPageSection } from "@/components/club/clubTypes";
import {
  getAuthorizedClubSection,
  getAuthorizedClubSections,
} from "@/components/club/clubNavigation";
import { useClubPage } from "./useClubPage";

function getClubSectionHref(
  clubId: string,
  section: ClubPageSection
) {
  return `/club/${clubId}?tab=${section}`;
}

export default function ClubPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const clubPagerRef = useRef<HTMLDivElement | null>(null);
  const clubPanelRefs = useRef<
    Partial<Record<ClubPageSection, HTMLElement | null>>
  >({});
  const clubPanelMeasureFrameRef = useRef<number | null>(null);
  const clubPagerSnapTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const programmaticClubPagerTargetRef =
    useRef<ClubPageSection | null>(null);
  const programmaticClubPagerReleaseTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);
  const clubPagerStartXRef = useRef<number | null>(null);
  const clubPagerStartIndexRef = useRef<number | null>(null);
  const clubPagerIsDraggingRef = useRef(false);
  const pendingClubSectionRef = useRef<ClubPageSection | null>(null);
  const [clubPagerHeight, setClubPagerHeight] = useState<
    number | null
  >(null);
  const [retryingClubLoad, setRetryingClubLoad] = useState(false);
  const {
    status,
    clubId,
    openModeLabel,
    mixedModeLabel,
    user,
    club,
    newSessionName,
    setNewSessionName,
    matchmakingStyle,
    setMatchmakingStyle,
    balanceMetric,
    setBalanceMetric,
    pairingMode,
    setPairingMode,
    sessionMode,
    isTestSession,
    setIsTestSession,
    autoQueueEnabled,
    setAutoQueueEnabled,
    respectPlayerRest,
    setRespectPlayerRest,
    collabFormat,
    setCollabFormat,
    partnerClubId,
    partnerClubSearch,
    setPartnerClubSearch,
    collabCandidates,
    selectedPartnerClub,
    loadingCollabCandidates,
    selectPartnerClub,
    clearPartnerClub,
    loadingCollabRoster,
    courtCount,
    setCourtCount,
    poolsEnabled,
    setPoolsEnabled,
    selectedPlayerIds,
    selectedPlayerPools,
    savingPreferredPoolPlayerId,
    selectedPlayerRepresentingClubs,
    selectedPoolCounts,
    guestNameInput,
    setGuestNameInput,
    guestGenderInput,
    guestMixedSideOverrideInput,
    setGuestMixedSideOverrideInput,
    guestPoolInput,
    setGuestPoolInput,
    guestRepresentingClubInput,
    setGuestRepresentingClubInput,
    guestConfigs,
    guestPoolCounts,
    loading,
    creatingSession,
    creationIssues,
    activeSection,
    showPlayersModal,
    showGuestsModal,
    playerSearch,
    setPlayerSearch,
    rollingBackTournamentCode,
    pendingRollbackTournament,
    requestingClaimFor,
    error,
    setError,
    success,
    refreshClubData,
    notifications,
    leaderboard,
    activeTournaments,
    pastTournaments,
    testSessions,
    latestPastTournamentId,
    clubPulse,
    canManageClub,
    canAdminClub,
    viewerIsQuickAccess,
    selectablePlayers,
    filteredSelectablePlayers,
    currentUserClaimEligibility,
    pendingClaimByTargetId,
    myPendingClaimRequest,
    createSession,
    joinTournament,
    requestRollbackTournament,
    closeRollbackModal,
    confirmRollbackTournament,
    requestClaim,
    reviewCollabTournament,
    togglePlayerSelection,
    toggleAllPlayers,
    updateSelectedPlayerPool,
    updateSavedPlayerPreferredPool,
    updateSelectedPlayerRepresentingClub,
    addGuestName,
    removeGuestName,
    handleGuestGenderChange,
    openPlayersModal,
    closePlayersModal,
    openGuestsModal,
    closeGuestsModal,
    switchSection,
    openClubPlayerProfile,
    openTournament,
  } = useClubPage();
  const isTutorialPlayground =
    club?.isTutorial === true && club.tutorialOwnerId === user?.id;
  const adminOnboarding = useAdminOnboardingProgress(
    status === "authenticated" &&
      canManageClub &&
      isTutorialPlayground &&
      !loading
  );
  const hostOnboardingOverride = useMemo(
    () =>
      getHostSessionOnboardingOverride({
        newSessionName,
        selectedPlayerCount: selectedPlayerIds.length,
        guestCount: guestConfigs.length,
      }),
    [guestConfigs.length, newSessionName, selectedPlayerIds.length]
  );
  const createSessionWithOnboardingRefresh = useCallback(async () => {
    const created = await createSession();
    if (created) {
      adminOnboarding.completeStep("host-session");
    }
    void adminOnboarding.refresh();
  }, [adminOnboarding, createSession]);

  const sectionTabs = useMemo(() => {
    return getAuthorizedClubSections({
      canManageClub,
      hasUser: Boolean(user?.id),
    });
  }, [canManageClub, user?.id]);
  const mobileSections = useMemo(
    () => sectionTabs.map((section) => section.key),
    [sectionTabs]
  );
  const activeMobileSection = mobileSections.includes(activeSection)
    ? activeSection
    : mobileSections[0] ?? "overview";

  const measureActiveClubPanel = useCallback(() => {
    const activePanel = clubPanelRefs.current[activeMobileSection];
    if (!activePanel) {
      setClubPagerHeight(null);
      return;
    }

    const nextHeight = Math.ceil(activePanel.getBoundingClientRect().height);
    setClubPagerHeight((currentHeight) =>
      currentHeight !== null && Math.abs(currentHeight - nextHeight) < 1
        ? currentHeight
        : nextHeight
    );
  }, [activeMobileSection]);

  const scheduleMeasureActiveClubPanel = useCallback(() => {
    if (clubPanelMeasureFrameRef.current !== null) {
      cancelAnimationFrame(clubPanelMeasureFrameRef.current);
    }

    clubPanelMeasureFrameRef.current = requestAnimationFrame(() => {
      clubPanelMeasureFrameRef.current = null;
      measureActiveClubPanel();
    });
  }, [measureActiveClubPanel]);

  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/");
  }, [router]);

  const retryClubLoad = useCallback(async () => {
    setRetryingClubLoad(true);
    setError("");
    try {
      await refreshClubData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load club");
    } finally {
      setRetryingClubLoad(false);
    }
  }, [refreshClubData, setError]);

  const clearProgrammaticClubPagerSync = useCallback(() => {
    if (programmaticClubPagerReleaseTimeoutRef.current) {
      clearTimeout(programmaticClubPagerReleaseTimeoutRef.current);
      programmaticClubPagerReleaseTimeoutRef.current = null;
    }

    programmaticClubPagerTargetRef.current = null;
  }, []);

  const markProgrammaticClubPagerSync = useCallback(
    (section: ClubPageSection, behavior: ScrollBehavior) => {
      if (programmaticClubPagerReleaseTimeoutRef.current) {
        clearTimeout(programmaticClubPagerReleaseTimeoutRef.current);
      }

      programmaticClubPagerTargetRef.current = section;
      programmaticClubPagerReleaseTimeoutRef.current = setTimeout(() => {
        if (programmaticClubPagerTargetRef.current === section) {
          programmaticClubPagerTargetRef.current = null;
        }

        programmaticClubPagerReleaseTimeoutRef.current = null;
      }, behavior === "smooth" ? 280 : 80);
    },
    []
  );

  const scrollClubPagerToSection = useCallback(
    (section: ClubPageSection, behavior: ScrollBehavior = "auto") => {
      const container = clubPagerRef.current;
      if (!container) return;

      if (clubPagerSnapTimeoutRef.current) {
        clearTimeout(clubPagerSnapTimeoutRef.current);
        clubPagerSnapTimeoutRef.current = null;
      }

      const sectionIndex = mobileSections.findIndex(
        (sectionItem) => sectionItem === section
      );
      if (sectionIndex < 0) return;

      if (container.clientWidth <= 0) {
        requestAnimationFrame(() => {
          const retryContainer = clubPagerRef.current;
          if (!retryContainer || retryContainer.clientWidth <= 0) return;

          const retryIndex = mobileSections.findIndex(
            (sectionItem) => sectionItem === section
          );
          if (retryIndex < 0) return;

          const retryLeft = retryIndex * retryContainer.clientWidth;
          if (Math.abs(retryContainer.scrollLeft - retryLeft) < 4) {
            clearProgrammaticClubPagerSync();
            return;
          }

          markProgrammaticClubPagerSync(section, behavior);
          retryContainer.scrollTo({
            left: retryLeft,
            behavior,
          });
        });
        return;
      }

      const nextLeft = sectionIndex * container.clientWidth;
      if (Math.abs(container.scrollLeft - nextLeft) < 4) {
        clearProgrammaticClubPagerSync();
        return;
      }

      markProgrammaticClubPagerSync(section, behavior);
      container.scrollTo({
        left: nextLeft,
        behavior,
      });
    },
    [
      clearProgrammaticClubPagerSync,
      markProgrammaticClubPagerSync,
      mobileSections,
    ]
  );

  const getNearestClubSection = useCallback(
    (container: HTMLDivElement) => {
      const pageWidth = Math.max(container.clientWidth, 1);
      const sectionIndex = Math.min(
        mobileSections.length - 1,
        Math.max(0, Math.round(container.scrollLeft / pageWidth))
      );

      return {
        sectionIndex,
        section: mobileSections[sectionIndex] ?? null,
        targetLeft: sectionIndex * pageWidth,
      };
    },
    [mobileSections]
  );

  const navigateClubSection = useCallback(
    (
      section: ClubPageSection,
      behavior: ScrollBehavior = "smooth"
    ) => {
      pendingClubSectionRef.current = section;
      switchSection(section);
      scrollClubPagerToSection(section, behavior);
      router.replace(getClubSectionHref(clubId, section), {
        scroll: false,
      });
    },
    [clubId, router, scrollClubPagerToSection, switchSection]
  );

  const switchClubSection = useCallback(
    (section: ClubPageSection) => {
      navigateClubSection(section, "smooth");
    },
    [navigateClubSection]
  );

  const settleClubPagerToNearestSection = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const container = clubPagerRef.current;
      if (!container) {
        return;
      }

      const { section, targetLeft } = getNearestClubSection(container);
      if (!section) {
        return;
      }

      const isAligned = Math.abs(container.scrollLeft - targetLeft) < 4;

      if (section !== activeMobileSection) {
        if (isAligned) {
          navigateClubSection(section, "auto");
          return;
        }

        navigateClubSection(section, behavior);
        return;
      }

      if (!isAligned) {
        scrollClubPagerToSection(section, behavior);
      }
    },
    [
      activeMobileSection,
      getNearestClubSection,
      navigateClubSection,
      scrollClubPagerToSection,
    ]
  );

  const settleClubPagerFromSwipe = useCallback(
    (endX: number | null) => {
      const container = clubPagerRef.current;
      const startX = clubPagerStartXRef.current;
      const startIndex = clubPagerStartIndexRef.current;

      clubPagerIsDraggingRef.current = false;
      clubPagerStartXRef.current = null;
      clubPagerStartIndexRef.current = null;

      if (!container || startX === null || startIndex === null) {
        return;
      }

      const swipeDelta = endX === null ? 0 : startX - endX;
      const swipeThreshold = Math.max(container.clientWidth * 0.16, 32);
      let targetIndex = getNearestClubSection(container).sectionIndex;

      if (Math.abs(swipeDelta) >= swipeThreshold) {
        targetIndex = Math.min(
          mobileSections.length - 1,
          Math.max(0, startIndex + (swipeDelta > 0 ? 1 : -1))
        );
      }

      const targetSection = mobileSections[targetIndex];
      if (!targetSection) {
        return;
      }

      navigateClubSection(targetSection, "smooth");
    },
    [
      getNearestClubSection,
      mobileSections,
      navigateClubSection,
    ]
  );

  const handleClubPagerScroll = useCallback(() => {
    const container = clubPagerRef.current;
    if (!container) return;

    const programmaticTarget = programmaticClubPagerTargetRef.current;
    if (programmaticTarget) {
      const targetIndex = mobileSections.findIndex(
        (section) => section === programmaticTarget
      );
      if (targetIndex >= 0) {
        const targetLeft = targetIndex * Math.max(container.clientWidth, 1);
        if (Math.abs(container.scrollLeft - targetLeft) > 4) {
          return;
        }
      }

      clearProgrammaticClubPagerSync();
    }

    if (clubPagerIsDraggingRef.current) {
      return;
    }

    if (clubPagerSnapTimeoutRef.current) {
      clearTimeout(clubPagerSnapTimeoutRef.current);
    }

    clubPagerSnapTimeoutRef.current = setTimeout(() => {
      settleClubPagerToNearestSection("smooth");
    }, 140);
  }, [
    clearProgrammaticClubPagerSync,
    mobileSections,
    settleClubPagerToNearestSection,
  ]);

  const handleClubPagerTouchStart = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      const container = clubPagerRef.current;
      const touch = event.touches[0];
      if (!container || !touch) return;

      clearProgrammaticClubPagerSync();
      if (clubPagerSnapTimeoutRef.current) {
        clearTimeout(clubPagerSnapTimeoutRef.current);
        clubPagerSnapTimeoutRef.current = null;
      }

      clubPagerIsDraggingRef.current = true;
      clubPagerStartXRef.current = touch.clientX;
      clubPagerStartIndexRef.current = Math.round(
        container.scrollLeft / Math.max(container.clientWidth, 1)
      );
    },
    [clearProgrammaticClubPagerSync]
  );

  const handleClubPagerTouchMove = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      const container = clubPagerRef.current;
      const touch = event.touches[0];
      const startX = clubPagerStartXRef.current;
      const startIndex = clubPagerStartIndexRef.current;

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

  const handleClubPagerTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      const touch = event.changedTouches[0];
      settleClubPagerFromSwipe(touch ? touch.clientX : null);
    },
    [settleClubPagerFromSwipe]
  );

  const handleClubPagerTouchCancel = useCallback(() => {
    settleClubPagerFromSwipe(null);
  }, [settleClubPagerFromSwipe]);

  useEffect(() => {
    router.prefetch("/");

    const sessionCodes = new Set([
      ...activeTournaments.map((tournament) => tournament.code),
      ...pastTournaments.slice(0, 6).map((tournament) => tournament.code),
      ...testSessions.slice(0, 6).map((sessionItem) => sessionItem.code),
    ]);

    sessionCodes.forEach((code) => {
      router.prefetch(`/session/${code}`);
    });
  }, [activeTournaments, pastTournaments, router, testSessions]);

  useEffect(() => {
    if (status === "loading" || loading || !club || !clubId) {
      return;
    }

    const requestedSection = getAuthorizedClubSection(
      requestedTab,
      sectionTabs
    );
    const nextSection = requestedSection ?? "overview";
    const pendingSection = pendingClubSectionRef.current;

    if (pendingSection) {
      if (requestedSection === pendingSection) {
        pendingClubSectionRef.current = null;
      } else {
        return;
      }
    }

    if (requestedTab && !requestedSection) {
      router.replace(getClubSectionHref(clubId, "overview"), {
        scroll: false,
      });
    }

    if (activeSection !== nextSection) {
      switchSection(nextSection);
    }
  }, [
    activeSection,
    club,
    clubId,
    loading,
    requestedTab,
    router,
    sectionTabs,
    status,
    switchSection,
  ]);

  useLayoutEffect(() => {
    if (status === "loading" || loading || !club) {
      return;
    }

    scheduleMeasureActiveClubPanel();

    if (
      programmaticClubPagerTargetRef.current ||
      clubPagerIsDraggingRef.current
    ) {
      return;
    }

    scrollClubPagerToSection(activeMobileSection, "auto");
  }, [
    activeMobileSection,
    club,
    loading,
    scheduleMeasureActiveClubPanel,
    scrollClubPagerToSection,
    status,
  ]);

  useEffect(() => {
    const activePanel = clubPanelRefs.current[activeMobileSection];
    if (!activePanel || typeof ResizeObserver === "undefined") {
      scheduleMeasureActiveClubPanel();
      return;
    }

    const observer = new ResizeObserver(() => {
      scheduleMeasureActiveClubPanel();
    });
    observer.observe(activePanel);
    scheduleMeasureActiveClubPanel();

    return () => {
      observer.disconnect();
    };
  }, [activeMobileSection, scheduleMeasureActiveClubPanel, mobileSections]);

  useEffect(() => {
    const handleResize = () => {
      scrollClubPagerToSection(activeMobileSection, "auto");
      scheduleMeasureActiveClubPanel();
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [
    activeMobileSection,
    scheduleMeasureActiveClubPanel,
    scrollClubPagerToSection,
  ]);

  useEffect(() => {
    return () => {
      if (clubPagerSnapTimeoutRef.current) {
        clearTimeout(clubPagerSnapTimeoutRef.current);
      }

      if (clubPanelMeasureFrameRef.current !== null) {
        cancelAnimationFrame(clubPanelMeasureFrameRef.current);
      }

      clearProgrammaticClubPagerSync();
    };
  }, [clearProgrammaticClubPagerSync]);

  if (status === "loading" || loading) {
    return (
      <div className="app-page flex items-center justify-center px-6">
        <div className="app-panel flex flex-col items-center gap-4 px-8 py-8">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          <p className="app-eyebrow">Loading club</p>
        </div>
      </div>
    );
  }

  if (!club) {
    return (
      <main className="app-page flex items-center justify-center px-6">
        <section className="app-panel w-full max-w-lg p-6 text-center sm:p-8">
          <p className="app-eyebrow">Club unavailable</p>
          <h1 className="mt-3 text-2xl font-semibold text-gray-950">
            We couldn&apos;t load this club
          </h1>
          <p role="alert" className="mt-2 text-sm leading-6 text-gray-600">
            {error || "The club may no longer exist or you may not have access."}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => void retryClubLoad()}
              disabled={retryingClubLoad}
              className="app-button-primary min-h-11 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {retryingClubLoad ? "Retrying..." : "Retry"}
            </button>
            <Link
              href="/"
              className="app-button-secondary min-h-11 px-4 py-2 text-sm"
            >
              Back to dashboard
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const clubName = club.name;
  const clubRoleLabel = club.viewerIsOwner
    ? "Owner"
    : getClubRoleLabel(club.role);
  const hostSetupPanel = canManageClub ? (
    <HostTournamentPanel
      newSessionName={newSessionName}
      onNewSessionNameChange={setNewSessionName}
      matchmakingStyle={matchmakingStyle}
      onMatchmakingStyleChange={setMatchmakingStyle}
      balanceMetric={balanceMetric}
      onBalanceMetricChange={setBalanceMetric}
      pairingMode={pairingMode}
      onPairingModeChange={setPairingMode}
      isTestSession={isTestSession}
      onIsTestSessionChange={setIsTestSession}
      autoQueueEnabled={autoQueueEnabled}
      onAutoQueueEnabledChange={setAutoQueueEnabled}
      respectPlayerRest={respectPlayerRest}
      onRespectPlayerRestChange={setRespectPlayerRest}
      collabFormat={collabFormat}
      onCollabFormatChange={setCollabFormat}
      partnerClubId={partnerClubId}
      partnerClubSearch={partnerClubSearch}
      onPartnerClubSearchChange={setPartnerClubSearch}
      collabCandidates={collabCandidates}
      selectedPartnerClub={selectedPartnerClub}
      loadingCollabCandidates={loadingCollabCandidates}
      onSelectPartnerClub={selectPartnerClub}
      onClearPartnerClub={clearPartnerClub}
      loadingCollabRoster={loadingCollabRoster}
      openModeLabel={openModeLabel}
      mixedModeLabel={mixedModeLabel}
      courtCount={courtCount}
      onCourtCountChange={setCourtCount}
      poolsEnabled={poolsEnabled}
      onPoolsEnabledChange={setPoolsEnabled}
      selectedPoolCounts={selectedPoolCounts}
      guestPoolCounts={guestPoolCounts}
      selectedPlayerCount={selectedPlayerIds.length}
      guestCount={guestConfigs.length}
      onOpenPlayers={openPlayersModal}
      onOpenGuests={openGuestsModal}
      onCreateSession={createSessionWithOnboardingRefresh}
      creatingSession={creatingSession}
      creationIssues={creationIssues}
    />
  ) : null;
  const interclubClubOptions = partnerClubId
    ? [
        { id: clubId, name: club?.name ?? "Host club" },
        {
          id: partnerClubId,
          name: selectedPartnerClub?.name ?? "Partner club",
        },
      ]
    : [];
  const overviewPanel = (
    <ClubOverviewPulsePanel
      clubId={clubId}
      clubPulse={clubPulse}
      activeTournaments={activeTournaments}
      memberCount={club.membersCount}
      currentUserId={user?.id}
      viewerIsQuickAccess={viewerIsQuickAccess}
      canManageClub={canManageClub}
      canAdminClub={canAdminClub}
      onJoinTournament={joinTournament}
      onOpenTournament={openTournament}
      onOpenTournaments={() => switchClubSection("tournaments")}
      onOpenPlayerProfile={openClubPlayerProfile}
      onHostTournament={() => switchClubSection("host")}
      onManagePlayers={() =>
        router.push(`/club/${clubId}/admin?tab=players`)
      }
    />
  );
  const profilePanel = (
    <ClubProfilePanel userId={user?.id} clubId={clubId} />
  );
  const tournamentsPanel = (
    <div className="space-y-8">
      <CurrentTournamentsPanel
        tournaments={activeTournaments}
        currentUserId={user?.id}
        currentClubId={clubId}
        canManageClub={canAdminClub}
        viewerIsQuickAccess={viewerIsQuickAccess}
        onOpenTournament={openTournament}
        onJoinTournament={joinTournament}
        onReviewCollabTournament={reviewCollabTournament}
      />
      <TestSessionsPanel
        sessions={testSessions}
        currentUserId={user?.id}
        currentClubId={clubId}
        canReviewCollabs={canAdminClub}
        onOpenSession={openTournament}
        onReviewCollabTournament={reviewCollabTournament}
      />
      <PastTournamentsPanel
        tournaments={pastTournaments}
        canManageClub={canAdminClub && !isTutorialPlayground}
        latestPastTournamentId={latestPastTournamentId}
        rollingBackTournamentCode={rollingBackTournamentCode}
        onOpenTournament={openTournament}
        onRollbackTournament={requestRollbackTournament}
      />
    </div>
  );
  const leaderboardPanel = (
    <ClubLeaderboardPanel
      title="Leaderboard"
      players={leaderboard}
      clubId={clubId}
      action={
        <span className="app-chip app-chip-neutral">
          {leaderboard.length} players
        </span>
      }
      claimState={{
        currentUser: user,
        currentUserClaimEligibility,
        myPendingClaimRequest,
        pendingClaimByTargetId,
        requestingClaimFor,
      }}
      onRequestClaim={requestClaim}
    />
  );
  const renderClubSection = (section: ClubPageSection) => {
    switch (section) {
      case "overview":
        return overviewPanel;
      case "host":
        return hostSetupPanel;
      case "tournaments":
        return tournamentsPanel;
      case "leaderboard":
        return leaderboardPanel;
      case "profile":
        return profilePanel;
      default:
        return null;
    }
  };

  return (
    <main className="app-page">
      <div className="app-shell space-y-8">
        <HeroCard
          title={clubName}
          headingAlign="center"
          actionsPosition="below"
          meta={
            <div className="flex w-full items-center justify-between gap-3">
              <div>
                <button
                  type="button"
                  onClick={handleBack}
                  className="app-button-secondary px-3 py-2 text-sm"
                >
                  <ArrowLeft aria-hidden="true" size={17} />
                  Back
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <ClubNotificationsButton
                  clubId={clubId}
                  initialUnreadCount={notifications.unreadCount}
                />
                {isTutorialPlayground ? (
                  <span className="app-chip app-chip-accent">
                    Tutorial playground
                  </span>
                ) : null}
                <div className="flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700">
                  <Shield aria-hidden="true" size={15} className="text-gray-600" />
                  <span>Your role: {clubRoleLabel}</span>
                </div>
                {canAdminClub ? (
                  <Link
                    href={`/club/${clubId}/admin`}
                    className="app-button-secondary px-3 py-2 text-sm"
                    data-tutorial-target={
                      isTutorialPlayground
                        ? "admin-onboarding-club-admin"
                        : undefined
                    }
                  >
                    <Shield aria-hidden="true" size={15} />
                    <span>Manage club</span>
                  </Link>
                ) : null}
              </div>
            </div>
          }
        />

        {success ? <FlashMessage tone="success">{success}</FlashMessage> : null}

        {isTutorialPlayground ? (
          <AdminOnboardingChecklist
            progress={adminOnboarding.progress}
            loading={adminOnboarding.loading}
            onDismiss={adminOnboarding.dismiss}
            onReopen={adminOnboarding.reopen}
            onCompleteStep={adminOnboarding.completeStep}
            activeStepOverride={
              activeSection === "host" ? hostOnboardingOverride : null
            }
          />
        ) : null}

        <section
          aria-label="Club section tabs"
          className="app-panel-soft hidden p-2 xl:block"
        >
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: `repeat(${sectionTabs.length}, minmax(0, 1fr))`,
            }}
          >
            {sectionTabs.map((tab) => {
              const isActive = activeSection === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => switchClubSection(tab.key)}
                  aria-current={isActive ? "page" : undefined}
                  className={`rounded-lg px-4 py-3 text-left transition ${
                    isActive
                      ? "bg-white shadow-sm ring-1 ring-[rgba(15,118,110,0.16)]"
                      : "bg-transparent text-gray-600 hover:bg-white"
                  }`}
                  data-tutorial-target={
                    isTutorialPlayground && tab.key === "host"
                      ? "admin-onboarding-host-tab"
                      : undefined
                  }
                >
                  <p className="text-sm font-semibold text-gray-900">
                    {tab.label}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-gray-500">
                    {tab.detail({
                      tournaments:
                        pastTournaments.length +
                        activeTournaments.length +
                        testSessions.length,
                      leaderboard: leaderboard.length,
                    })}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        <div
          ref={clubPagerRef}
          onScroll={handleClubPagerScroll}
          onTouchStart={handleClubPagerTouchStart}
          onTouchMove={handleClubPagerTouchMove}
          onTouchEnd={handleClubPagerTouchEnd}
          onTouchCancel={handleClubPagerTouchCancel}
          className="app-swipe-track -mx-1 overflow-x-auto overflow-y-hidden overscroll-x-none xl:hidden"
          style={
            clubPagerHeight !== null
              ? { height: `${clubPagerHeight}px` }
              : undefined
          }
        >
          <div className="flex snap-x snap-mandatory items-start">
            {mobileSections.map((section) => (
              <section
                key={section}
                ref={(node) => {
                  clubPanelRefs.current[section] = node;
                }}
                data-club-section={section}
                aria-label={
                  sectionTabs.find((item) => item.key === section)?.label
                }
                aria-hidden={section !== activeMobileSection}
                inert={section !== activeMobileSection}
                className="min-w-0 max-w-full basis-full shrink-0 snap-center px-1"
              >
                <div className="min-w-0 space-y-8 pb-28">
                  {renderClubSection(section)}
                </div>
              </section>
            ))}
          </div>
        </div>

        <div className="hidden space-y-8 xl:block">
          {renderClubSection(activeSection)}
        </div>
      </div>

      <ClubPlayersModal
        open={showPlayersModal}
        selectedPlayerIds={selectedPlayerIds}
        selectedPlayerPools={selectedPlayerPools}
        playerSearch={playerSearch}
        poolsEnabled={poolsEnabled}
        canSavePreferredPools={canManageClub}
        savingPreferredPoolPlayerId={savingPreferredPoolPlayerId}
        selectablePlayers={selectablePlayers}
        filteredSelectablePlayers={filteredSelectablePlayers}
        onPlayerSearchChange={setPlayerSearch}
        onToggleAllPlayers={toggleAllPlayers}
        onTogglePlayerSelection={togglePlayerSelection}
        onChangePlayerPool={updateSelectedPlayerPool}
        onSavePlayerPreferredPool={updateSavedPlayerPreferredPool}
        collabFormat={collabFormat}
        hostClubId={clubId}
        hostClubName={club?.name ?? "Host club"}
        selectedPartnerClub={selectedPartnerClub}
        selectedPlayerRepresentingClubs={selectedPlayerRepresentingClubs}
        onChangePlayerRepresentingClub={updateSelectedPlayerRepresentingClub}
        onClose={closePlayersModal}
      />

      <ClubGuestsModal
        open={showGuestsModal}
        guestConfigs={guestConfigs}
        sessionMode={sessionMode}
        guestNameInput={guestNameInput}
        guestGenderInput={guestGenderInput}
        guestMixedSideOverrideInput={guestMixedSideOverrideInput}
        guestPoolInput={guestPoolInput}
        guestRepresentingClubInput={guestRepresentingClubInput}
        poolsEnabled={poolsEnabled}
        collabFormat={collabFormat}
        interclubClubOptions={interclubClubOptions}
        onGuestNameChange={setGuestNameInput}
        onGuestGenderChange={handleGuestGenderChange}
        onGuestMixedSideOverrideChange={setGuestMixedSideOverrideInput}
        onGuestPoolChange={setGuestPoolInput}
        onGuestRepresentingClubChange={setGuestRepresentingClubInput}
        onAddGuest={addGuestName}
        onRemoveGuest={removeGuestName}
        onClose={closeGuestsModal}
      />

      {pendingRollbackTournament ? (
        <ClubActionConfirmModal
          title="Rollback tournament?"
          subtitle="Deletes the tournament and reverses ratings."
          details={
            <div className="app-panel-muted space-y-2 p-4">
              <p className="text-sm font-semibold text-gray-900">
                {pendingRollbackTournament.name}
              </p>
              <p className="text-sm text-gray-600">
                {pendingRollbackTournament.players.length} players,{" "}
                {getSessionTypeLabel(pendingRollbackTournament.type)}
              </p>
              <p className="text-sm text-gray-600">
                This action cannot be undone.
              </p>
            </div>
          }
          confirmLabel="Confirm Rollback"
          isSubmitting={rollingBackTournamentCode !== null}
          onClose={closeRollbackModal}
          onConfirm={() => {
            void confirmRollbackTournament();
          }}
        />
      ) : null}

      {error ? (
        <div className="fixed bottom-24 left-6 right-6 z-50 xl:bottom-6">
          <div
            role="alert"
            aria-live="assertive"
            className="flex items-center justify-between rounded-2xl bg-red-700 px-4 py-3 text-white shadow-2xl sm:px-6"
          >
            <p className="text-xs font-black uppercase tracking-wide">
              {error}
            </p>
            <button
              type="button"
              onClick={() => setError("")}
              aria-label="Dismiss error"
              className="ml-3 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl font-black hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        </div>
      ) : null}

      <ClubBottomTabs
        activeTab={activeSection}
        clubId={clubId}
        sections={sectionTabs}
        onSelect={switchClubSection}
      />
    </main>
  );
}
