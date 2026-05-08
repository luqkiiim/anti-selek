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
import { getSessionTypeLabel } from "@/lib/sessionModeLabels";
import { FlashMessage, HeroCard } from "@/components/ui/chrome";
import { CommunityActionConfirmModal } from "@/components/community/CommunityActionConfirmModal";
import { CommunityBottomTabs } from "@/components/community/CommunityBottomTabs";
import { CommunityGuestsModal } from "@/components/community/CommunityGuestsModal";
import { CommunityLeaderboardPanel } from "@/components/community/CommunityLeaderboardPanel";
import { CommunityOverviewPulsePanel } from "@/components/community/CommunityOverviewPulsePanel";
import { CommunityPlayersModal } from "@/components/community/CommunityPlayersModal";
import { CommunityProfilePanel } from "@/components/community/CommunityProfilePanel";
import { CurrentTournamentsPanel } from "@/components/community/CurrentTournamentsPanel";
import { HostTournamentPanel } from "@/components/community/HostTournamentPanel";
import { PastTournamentsPanel } from "@/components/community/PastTournamentsPanel";
import { TestSessionsPanel } from "@/components/community/TestSessionsPanel";
import type { CommunityPageSection } from "@/components/community/communityTypes";
import { useCommunityPage } from "./useCommunityPage";

const baseSectionTabs: Array<{
  key: Exclude<CommunityPageSection, "host" | "profile">;
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

function getCommunitySectionHref(
  communityId: string,
  section: CommunityPageSection
) {
  return `/community/${communityId}?tab=${section}`;
}

function getRequestedCommunitySection(
  tab: string | null,
  canManageCommunity: boolean
): CommunityPageSection | null {
  switch (tab) {
    case "overview":
    case "tournaments":
    case "leaderboard":
    case "profile":
      return tab;
    case "host":
      return canManageCommunity ? "host" : null;
    default:
      return null;
  }
}

export default function CommunityPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const communityPagerRef = useRef<HTMLDivElement | null>(null);
  const communityPanelRefs = useRef<
    Partial<Record<CommunityPageSection, HTMLElement | null>>
  >({});
  const communityPanelMeasureFrameRef = useRef<number | null>(null);
  const communityPagerSnapTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const programmaticCommunityPagerTargetRef =
    useRef<CommunityPageSection | null>(null);
  const programmaticCommunityPagerReleaseTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);
  const communityPagerStartXRef = useRef<number | null>(null);
  const communityPagerStartIndexRef = useRef<number | null>(null);
  const communityPagerIsDraggingRef = useRef(false);
  const pendingCommunitySectionRef = useRef<CommunityPageSection | null>(null);
  const [communityPagerHeight, setCommunityPagerHeight] = useState<
    number | null
  >(null);
  const {
    status,
    communityId,
    openModeLabel,
    mixedModeLabel,
    user,
    community,
    newSessionName,
    setNewSessionName,
    sessionType,
    setSessionType,
    sessionMode,
    setSessionMode,
    isTestSession,
    setIsTestSession,
    autoQueueEnabled,
    setAutoQueueEnabled,
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
    communityPulse,
    canManageCommunity,
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
    openCommunityPlayerProfile,
    openTournament,
  } = useCommunityPage();

  const mobileSections = useMemo(() => {
    const sections: CommunityPageSection[] = [
      "overview",
      "tournaments",
      "leaderboard",
    ];

    if (canManageCommunity) {
      sections.splice(2, 0, "host");
    }

    if (user?.id) {
      sections.push("profile");
    }

    return sections;
  }, [canManageCommunity, user?.id]);
  const activeMobileSection = mobileSections.includes(activeSection)
    ? activeSection
    : mobileSections[0] ?? "overview";

  const measureActiveCommunityPanel = useCallback(() => {
    const activePanel = communityPanelRefs.current[activeMobileSection];
    if (!activePanel) {
      setCommunityPagerHeight(null);
      return;
    }

    const nextHeight = Math.ceil(activePanel.getBoundingClientRect().height);
    setCommunityPagerHeight((currentHeight) =>
      currentHeight !== null && Math.abs(currentHeight - nextHeight) < 1
        ? currentHeight
        : nextHeight
    );
  }, [activeMobileSection]);

  const scheduleMeasureActiveCommunityPanel = useCallback(() => {
    if (communityPanelMeasureFrameRef.current !== null) {
      cancelAnimationFrame(communityPanelMeasureFrameRef.current);
    }

    communityPanelMeasureFrameRef.current = requestAnimationFrame(() => {
      communityPanelMeasureFrameRef.current = null;
      measureActiveCommunityPanel();
    });
  }, [measureActiveCommunityPanel]);

  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/");
  }, [router]);

  const clearProgrammaticCommunityPagerSync = useCallback(() => {
    if (programmaticCommunityPagerReleaseTimeoutRef.current) {
      clearTimeout(programmaticCommunityPagerReleaseTimeoutRef.current);
      programmaticCommunityPagerReleaseTimeoutRef.current = null;
    }

    programmaticCommunityPagerTargetRef.current = null;
  }, []);

  const markProgrammaticCommunityPagerSync = useCallback(
    (section: CommunityPageSection, behavior: ScrollBehavior) => {
      if (programmaticCommunityPagerReleaseTimeoutRef.current) {
        clearTimeout(programmaticCommunityPagerReleaseTimeoutRef.current);
      }

      programmaticCommunityPagerTargetRef.current = section;
      programmaticCommunityPagerReleaseTimeoutRef.current = setTimeout(() => {
        if (programmaticCommunityPagerTargetRef.current === section) {
          programmaticCommunityPagerTargetRef.current = null;
        }

        programmaticCommunityPagerReleaseTimeoutRef.current = null;
      }, behavior === "smooth" ? 280 : 80);
    },
    []
  );

  const scrollCommunityPagerToSection = useCallback(
    (section: CommunityPageSection, behavior: ScrollBehavior = "auto") => {
      const container = communityPagerRef.current;
      if (!container) return;

      if (communityPagerSnapTimeoutRef.current) {
        clearTimeout(communityPagerSnapTimeoutRef.current);
        communityPagerSnapTimeoutRef.current = null;
      }

      const sectionIndex = mobileSections.findIndex(
        (sectionItem) => sectionItem === section
      );
      if (sectionIndex < 0) return;

      if (container.clientWidth <= 0) {
        requestAnimationFrame(() => {
          const retryContainer = communityPagerRef.current;
          if (!retryContainer || retryContainer.clientWidth <= 0) return;

          const retryIndex = mobileSections.findIndex(
            (sectionItem) => sectionItem === section
          );
          if (retryIndex < 0) return;

          const retryLeft = retryIndex * retryContainer.clientWidth;
          if (Math.abs(retryContainer.scrollLeft - retryLeft) < 4) {
            clearProgrammaticCommunityPagerSync();
            return;
          }

          markProgrammaticCommunityPagerSync(section, behavior);
          retryContainer.scrollTo({
            left: retryLeft,
            behavior,
          });
        });
        return;
      }

      const nextLeft = sectionIndex * container.clientWidth;
      if (Math.abs(container.scrollLeft - nextLeft) < 4) {
        clearProgrammaticCommunityPagerSync();
        return;
      }

      markProgrammaticCommunityPagerSync(section, behavior);
      container.scrollTo({
        left: nextLeft,
        behavior,
      });
    },
    [
      clearProgrammaticCommunityPagerSync,
      markProgrammaticCommunityPagerSync,
      mobileSections,
    ]
  );

  const getNearestCommunitySection = useCallback(
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

  const navigateCommunitySection = useCallback(
    (
      section: CommunityPageSection,
      behavior: ScrollBehavior = "smooth"
    ) => {
      pendingCommunitySectionRef.current = section;
      switchSection(section);
      scrollCommunityPagerToSection(section, behavior);
      router.replace(getCommunitySectionHref(communityId, section), {
        scroll: false,
      });
    },
    [communityId, router, scrollCommunityPagerToSection, switchSection]
  );

  const switchCommunitySection = useCallback(
    (section: CommunityPageSection) => {
      navigateCommunitySection(section, "smooth");
    },
    [navigateCommunitySection]
  );

  const exitCommunityHostMode = useCallback(() => {
    exitHostMode();
    pendingCommunitySectionRef.current = lastNonHostSection;
    scrollCommunityPagerToSection(lastNonHostSection, "smooth");
    router.replace(getCommunitySectionHref(communityId, lastNonHostSection), {
      scroll: false,
    });
  }, [
    communityId,
    exitHostMode,
    lastNonHostSection,
    router,
    scrollCommunityPagerToSection,
  ]);

  const settleCommunityPagerToNearestSection = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const container = communityPagerRef.current;
      if (!container) {
        return;
      }

      const { section, targetLeft } = getNearestCommunitySection(container);
      if (!section) {
        return;
      }

      const isAligned = Math.abs(container.scrollLeft - targetLeft) < 4;

      if (section !== activeMobileSection) {
        if (isAligned) {
          navigateCommunitySection(section, "auto");
          return;
        }

        navigateCommunitySection(section, behavior);
        return;
      }

      if (!isAligned) {
        scrollCommunityPagerToSection(section, behavior);
      }
    },
    [
      activeMobileSection,
      getNearestCommunitySection,
      navigateCommunitySection,
      scrollCommunityPagerToSection,
    ]
  );

  const settleCommunityPagerFromSwipe = useCallback(
    (endX: number | null) => {
      const container = communityPagerRef.current;
      const startX = communityPagerStartXRef.current;
      const startIndex = communityPagerStartIndexRef.current;

      communityPagerIsDraggingRef.current = false;
      communityPagerStartXRef.current = null;
      communityPagerStartIndexRef.current = null;

      if (!container || startX === null || startIndex === null) {
        return;
      }

      const swipeDelta = endX === null ? 0 : startX - endX;
      const swipeThreshold = Math.max(container.clientWidth * 0.16, 32);
      let targetIndex = getNearestCommunitySection(container).sectionIndex;

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

      navigateCommunitySection(targetSection, "smooth");
    },
    [
      getNearestCommunitySection,
      mobileSections,
      navigateCommunitySection,
    ]
  );

  const handleCommunityPagerScroll = useCallback(() => {
    const container = communityPagerRef.current;
    if (!container) return;

    const programmaticTarget = programmaticCommunityPagerTargetRef.current;
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

      clearProgrammaticCommunityPagerSync();
    }

    if (communityPagerIsDraggingRef.current) {
      return;
    }

    if (communityPagerSnapTimeoutRef.current) {
      clearTimeout(communityPagerSnapTimeoutRef.current);
    }

    communityPagerSnapTimeoutRef.current = setTimeout(() => {
      settleCommunityPagerToNearestSection("smooth");
    }, 140);
  }, [
    clearProgrammaticCommunityPagerSync,
    mobileSections,
    settleCommunityPagerToNearestSection,
  ]);

  const handleCommunityPagerTouchStart = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      const container = communityPagerRef.current;
      const touch = event.touches[0];
      if (!container || !touch) return;

      clearProgrammaticCommunityPagerSync();
      if (communityPagerSnapTimeoutRef.current) {
        clearTimeout(communityPagerSnapTimeoutRef.current);
        communityPagerSnapTimeoutRef.current = null;
      }

      communityPagerIsDraggingRef.current = true;
      communityPagerStartXRef.current = touch.clientX;
      communityPagerStartIndexRef.current = Math.round(
        container.scrollLeft / Math.max(container.clientWidth, 1)
      );
    },
    [clearProgrammaticCommunityPagerSync]
  );

  const handleCommunityPagerTouchMove = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      const container = communityPagerRef.current;
      const touch = event.touches[0];
      const startX = communityPagerStartXRef.current;
      const startIndex = communityPagerStartIndexRef.current;

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

  const handleCommunityPagerTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      const touch = event.changedTouches[0];
      settleCommunityPagerFromSwipe(touch ? touch.clientX : null);
    },
    [settleCommunityPagerFromSwipe]
  );

  const handleCommunityPagerTouchCancel = useCallback(() => {
    settleCommunityPagerFromSwipe(null);
  }, [settleCommunityPagerFromSwipe]);

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
    if (status === "loading" || loading || !community || !communityId) {
      return;
    }

    const requestedSection = getRequestedCommunitySection(
      requestedTab,
      canManageCommunity
    );
    const nextSection = requestedSection ?? "overview";
    const pendingSection = pendingCommunitySectionRef.current;

    if (pendingSection) {
      if (requestedSection === pendingSection) {
        pendingCommunitySectionRef.current = null;
      } else {
        return;
      }
    }

    if (requestedTab && !requestedSection) {
      router.replace(getCommunitySectionHref(communityId, "overview"), {
        scroll: false,
      });
    }

    if (activeSection !== nextSection) {
      switchSection(nextSection);
    }
  }, [
    activeSection,
    canManageCommunity,
    community,
    communityId,
    loading,
    requestedTab,
    router,
    status,
    switchSection,
  ]);

  useLayoutEffect(() => {
    if (status === "loading" || loading || !community) {
      return;
    }

    scheduleMeasureActiveCommunityPanel();

    if (
      programmaticCommunityPagerTargetRef.current ||
      communityPagerIsDraggingRef.current
    ) {
      return;
    }

    scrollCommunityPagerToSection(activeMobileSection, "auto");
  }, [
    activeMobileSection,
    community,
    loading,
    scheduleMeasureActiveCommunityPanel,
    scrollCommunityPagerToSection,
    status,
  ]);

  useEffect(() => {
    const activePanel = communityPanelRefs.current[activeMobileSection];
    if (!activePanel || typeof ResizeObserver === "undefined") {
      scheduleMeasureActiveCommunityPanel();
      return;
    }

    const observer = new ResizeObserver(() => {
      scheduleMeasureActiveCommunityPanel();
    });
    observer.observe(activePanel);
    scheduleMeasureActiveCommunityPanel();

    return () => {
      observer.disconnect();
    };
  }, [activeMobileSection, scheduleMeasureActiveCommunityPanel, mobileSections]);

  useEffect(() => {
    const handleResize = () => {
      scrollCommunityPagerToSection(activeMobileSection, "auto");
      scheduleMeasureActiveCommunityPanel();
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [
    activeMobileSection,
    scheduleMeasureActiveCommunityPanel,
    scrollCommunityPagerToSection,
  ]);

  useEffect(() => {
    return () => {
      if (communityPagerSnapTimeoutRef.current) {
        clearTimeout(communityPagerSnapTimeoutRef.current);
      }

      if (communityPanelMeasureFrameRef.current !== null) {
        cancelAnimationFrame(communityPanelMeasureFrameRef.current);
      }

      clearProgrammaticCommunityPagerSync();
    };
  }, [clearProgrammaticCommunityPagerSync]);

  if (status === "loading" || loading) {
    return (
      <div className="app-page flex items-center justify-center px-6">
        <div className="app-panel flex flex-col items-center gap-4 px-8 py-8">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          <p className="app-eyebrow">Loading community</p>
        </div>
      </div>
    );
  }

  const communityName = community?.name || "Community";
  const communityRoleLabel = canManageCommunity ? "Admin" : community?.role || "Member";
  const sectionTabs = canManageCommunity
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
  const hostSetupPanel = canManageCommunity ? (
    <HostTournamentPanel
      newSessionName={newSessionName}
      onNewSessionNameChange={setNewSessionName}
      sessionType={sessionType}
      onSessionTypeChange={setSessionType}
      sessionMode={sessionMode}
      onSessionModeChange={setSessionMode}
      isTestSession={isTestSession}
      onIsTestSessionChange={setIsTestSession}
      autoQueueEnabled={autoQueueEnabled}
      onAutoQueueEnabledChange={setAutoQueueEnabled}
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
      onCreateSession={createSession}
      onExitHostMode={exitCommunityHostMode}
      exitHostModeLabel="Back"
      creatingSession={creatingSession}
    />
  ) : null;
  const overviewPanel = (
    <CommunityOverviewPulsePanel
      communityPulse={communityPulse}
      activeTournaments={activeTournaments}
      leaderboardPreview={leaderboardPreview}
      currentUserId={user?.id}
      onJoinTournament={joinTournament}
      onOpenTournament={openTournament}
      onOpenLeaderboard={() => switchCommunitySection("leaderboard")}
      onOpenTournaments={() => switchCommunitySection("tournaments")}
      onOpenPlayerProfile={openCommunityPlayerProfile}
    />
  );
  const profilePanel = (
    <CommunityProfilePanel userId={user?.id} communityId={communityId} />
  );
  const tournamentsPanel = (
    <div className="space-y-8">
      <CurrentTournamentsPanel
        tournaments={activeTournaments}
        currentUserId={user?.id}
        onJoinTournament={joinTournament}
      />
      <TestSessionsPanel
        sessions={testSessions}
        currentUserId={user?.id}
        onOpenSession={openTournament}
      />
      <PastTournamentsPanel
        tournaments={pastTournaments}
        canManageCommunity={canManageCommunity}
        latestPastTournamentId={latestPastTournamentId}
        rollingBackTournamentCode={rollingBackTournamentCode}
        onOpenTournament={openTournament}
        onRollbackTournament={requestRollbackTournament}
      />
    </div>
  );
  const leaderboardPanel = (
    <CommunityLeaderboardPanel
      title="Leaderboard"
      subtitle="Full community rankings"
      players={leaderboard}
      communityId={communityId}
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
      onOpenPlayerProfile={openCommunityPlayerProfile}
    />
  );
  const renderCommunitySection = (section: CommunityPageSection) => {
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
          title={communityName}
          description="Community hub"
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
              {canManageCommunity ? (
                <Link
                  href={`/community/${communityId}/admin`}
                  className="app-button-secondary px-3 py-2 text-sm"
                >
                  <Shield aria-hidden="true" size={15} />
                  <span>{communityRoleLabel}</span>
                </Link>
              ) : (
                <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
                  <Shield aria-hidden="true" size={15} className="text-gray-500" />
                  <span>{communityRoleLabel}</span>
                </div>
              )}
            </div>
          }
        />

        {success ? <FlashMessage tone="success">{success}</FlashMessage> : null}

        <section className="app-panel-soft hidden p-2 sm:block">
          <div
            className={`grid gap-2 ${
              canManageCommunity ? "sm:grid-cols-4" : "sm:grid-cols-3"
            }`}
          >
            {sectionTabs.map((tab) => {
              const isActive = activeSection === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => switchCommunitySection(tab.key)}
                  className={`rounded-lg px-4 py-3 text-left transition ${
                    isActive
                      ? "bg-white shadow-sm ring-1 ring-[rgba(15,118,110,0.16)]"
                      : "bg-transparent text-gray-600 hover:bg-white"
                  }`}
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
          ref={communityPagerRef}
          onScroll={handleCommunityPagerScroll}
          onTouchStart={handleCommunityPagerTouchStart}
          onTouchMove={handleCommunityPagerTouchMove}
          onTouchEnd={handleCommunityPagerTouchEnd}
          onTouchCancel={handleCommunityPagerTouchCancel}
          className="app-swipe-track -mx-1 overflow-x-auto overflow-y-hidden overscroll-x-none sm:hidden"
          style={
            communityPagerHeight !== null
              ? { height: `${communityPagerHeight}px` }
              : undefined
          }
        >
          <div className="flex snap-x snap-mandatory items-start">
            {mobileSections.map((section) => (
              <section
                key={section}
                ref={(node) => {
                  communityPanelRefs.current[section] = node;
                }}
                data-community-section={section}
                className="w-full shrink-0 snap-center px-1"
              >
                <div className="space-y-8 pb-28">
                  {renderCommunitySection(section)}
                </div>
              </section>
            ))}
          </div>
        </div>

        <div className="hidden space-y-8 sm:block">
          {renderCommunitySection(activeSection)}
        </div>
      </div>

      <CommunityPlayersModal
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

      <CommunityGuestsModal
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
        <CommunityActionConfirmModal
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

      <CommunityBottomTabs
        activeTab={activeSection}
        canManageCommunity={canManageCommunity}
        communityId={communityId}
        currentUserId={user?.id}
        onSelect={switchCommunitySection}
      />
    </main>
  );
}
