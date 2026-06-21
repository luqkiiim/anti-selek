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
import { useClubPage } from "./useClubPage";

const baseSectionTabs: Array<{
  key: Exclude<ClubPageSection, "host" | "profile">;
  label: string;
  detail: (counts: { sessions: number; leaderboard: number }) => string;
}> = [
  {
    key: "overview",
    label: "Overview",
    detail: () => "Live snapshot",
  },
  {
    key: "tournaments",
    label: "Tournaments",
    detail: ({ sessions }) => `${sessions} total`,
  },
  {
    key: "leaderboard",
    label: "Leaderboard",
    detail: ({ leaderboard }) => `${leaderboard} players`,
  },
];

function getClubSectionHref(
  clubId: string,
  section: ClubPageSection
) {
  return `/club/${clubId}?tab=${section}`;
}

function getRequestedClubSection(
  tab: string | null,
  canManageClub: boolean
): ClubPageSection | null {
  switch (tab) {
    case "overview":
    case "tournaments":
    case "leaderboard":
    case "profile":
      return tab;
    case "host":
      return canManageClub ? "host" : null;
    default:
      return null;
  }
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
    poolAName,
    setPoolAName,
    poolBName,
    setPoolBName,
    selectedPlayerIds,
    selectedPlayerPools,
    selectedPoolCounts,
    guestNameInput,
    setGuestNameInput,
    guestGenderInput,
    guestMixedSideOverrideInput,
    setGuestMixedSideOverrideInput,
    guestPoolInput,
    setGuestPoolInput,
    guestConfigs,
    guestPoolCounts,
    loading,
    creatingSession,
    activeSection,
    lastNonHostSection,
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
    leaderboard,
    activeTournaments,
    pastTournaments,
    testSessions,
    latestPastTournamentId,
    leaderboardPreview,
    clubPulse,
    canManageClub,
    canAdminClub,
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
    addGuestName,
    removeGuestName,
    handleGuestGenderChange,
    openPlayersModal,
    closePlayersModal,
    openGuestsModal,
    closeGuestsModal,
    switchSection,
    exitHostMode,
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

  const mobileSections = useMemo(() => {
    const sections: ClubPageSection[] = [
      "overview",
      "tournaments",
      "leaderboard",
    ];

    if (canManageClub) {
      sections.splice(2, 0, "host");
    }

    if (user?.id) {
      sections.push("profile");
    }

    return sections;
  }, [canManageClub, user?.id]);
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

  const exitClubHostMode = useCallback(() => {
    exitHostMode();
    pendingClubSectionRef.current = lastNonHostSection;
    scrollClubPagerToSection(lastNonHostSection, "smooth");
    router.replace(getClubSectionHref(clubId, lastNonHostSection), {
      scroll: false,
    });
  }, [
    clubId,
    exitHostMode,
    lastNonHostSection,
    router,
    scrollClubPagerToSection,
  ]);

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

    const requestedSection = getRequestedClubSection(
      requestedTab,
      canManageClub
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
    canManageClub,
    club,
    clubId,
    loading,
    requestedTab,
    router,
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

  const clubName = club?.name || "Club";
  const clubRoleLabel = club?.viewerIsOwner
    ? "Owner"
    : getClubRoleLabel(club?.role);
  const sectionTabs = canManageClub
    ? [
        baseSectionTabs[0],
        {
          key: "host" as const,
          label: "Host",
          detail: () => "Setup desk",
        },
        ...baseSectionTabs.slice(1),
      ]
    : baseSectionTabs;
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
      poolAName={poolAName}
      onPoolANameChange={setPoolAName}
      poolBName={poolBName}
      onPoolBNameChange={setPoolBName}
      selectedPoolCounts={selectedPoolCounts}
      guestPoolCounts={guestPoolCounts}
      selectedPlayerCount={selectedPlayerIds.length}
      guestCount={guestConfigs.length}
      onOpenPlayers={openPlayersModal}
      onOpenGuests={openGuestsModal}
      onCreateSession={createSessionWithOnboardingRefresh}
      onExitHostMode={exitClubHostMode}
      exitHostModeLabel="Back"
      creatingSession={creatingSession}
    />
  ) : null;
  const overviewPanel = (
    <ClubOverviewPulsePanel
      clubPulse={clubPulse}
      activeTournaments={activeTournaments}
      leaderboardPreview={leaderboardPreview}
      currentUserId={user?.id}
      onJoinTournament={joinTournament}
      onOpenTournament={openTournament}
      onOpenLeaderboard={() => switchClubSection("leaderboard")}
      onOpenTournaments={() => switchClubSection("tournaments")}
      onOpenPlayerProfile={openClubPlayerProfile}
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
        onJoinTournament={joinTournament}
        onReviewCollabTournament={reviewCollabTournament}
      />
      <TestSessionsPanel
        sessions={testSessions}
        currentUserId={user?.id}
        onOpenSession={openTournament}
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
      subtitle="Full club rankings"
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
      onOpenPlayerProfile={openClubPlayerProfile}
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
          description="Club hub"
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
                {isTutorialPlayground ? (
                  <span className="app-chip app-chip-accent">
                    Tutorial playground
                  </span>
                ) : null}
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
                    <span>{clubRoleLabel}</span>
                  </Link>
                ) : (
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
                    <Shield aria-hidden="true" size={15} className="text-gray-500" />
                    <span>{clubRoleLabel}</span>
                  </div>
                )}
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

        <section className="app-panel-soft hidden p-2 sm:block">
          <div
            className={`grid gap-2 ${
              canManageClub ? "sm:grid-cols-4" : "sm:grid-cols-3"
            }`}
          >
            {sectionTabs.map((tab) => {
              const isActive = activeSection === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => switchClubSection(tab.key)}
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
                      sessions:
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
          className="app-swipe-track -mx-1 overflow-x-auto overflow-y-hidden overscroll-x-none sm:hidden"
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
                className="min-w-0 max-w-full basis-full shrink-0 snap-center px-1"
              >
                <div className="min-w-0 space-y-8 pb-28">
                  {renderClubSection(section)}
                </div>
              </section>
            ))}
          </div>
        </div>

        <div className="hidden space-y-8 sm:block">
          {renderClubSection(activeSection)}
        </div>
      </div>

      <ClubPlayersModal
        open={showPlayersModal}
        selectedPlayerIds={selectedPlayerIds}
        selectedPlayerPools={selectedPlayerPools}
        playerSearch={playerSearch}
        poolsEnabled={poolsEnabled}
        poolAName={poolAName}
        poolBName={poolBName}
        selectablePlayers={selectablePlayers}
        filteredSelectablePlayers={filteredSelectablePlayers}
        onPlayerSearchChange={setPlayerSearch}
        onToggleAllPlayers={toggleAllPlayers}
        onTogglePlayerSelection={togglePlayerSelection}
        onChangePlayerPool={updateSelectedPlayerPool}
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
        poolsEnabled={poolsEnabled}
        poolAName={poolAName}
        poolBName={poolBName}
        onGuestNameChange={setGuestNameInput}
        onGuestGenderChange={handleGuestGenderChange}
        onGuestMixedSideOverrideChange={setGuestMixedSideOverrideInput}
        onGuestPoolChange={setGuestPoolInput}
        onAddGuest={addGuestName}
        onRemoveGuest={removeGuestName}
        onClose={closeGuestsModal}
      />

      {pendingRollbackTournament ? (
        <ClubActionConfirmModal
          title="Rollback tournament?"
          subtitle="This will delete the completed tournament and reverse its rating changes."
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
        <div className="fixed bottom-24 left-6 right-6 z-50 sm:bottom-6">
          <div className="bg-red-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex justify-between items-center">
            <p className="text-xs font-black uppercase tracking-wide">
              {error}
            </p>
            <button onClick={() => setError("")} className="font-black">
              x
            </button>
          </div>
        </div>
      ) : null}

      <ClubBottomTabs
        activeTab={activeSection}
        canManageClub={canManageClub}
        clubId={clubId}
        currentUserId={user?.id}
        onSelect={switchClubSection}
      />
    </main>
  );
}
