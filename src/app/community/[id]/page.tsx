"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getSessionTypeLabel } from "@/lib/sessionModeLabels";
import { FlashMessage, HeroCard } from "@/components/ui/chrome";
import { CommunityActionConfirmModal } from "@/components/community/CommunityActionConfirmModal";
import { CommunityBottomTabs } from "@/components/community/CommunityBottomTabs";
import { CommunityGuestsModal } from "@/components/community/CommunityGuestsModal";
import { CommunityLeaderboardPanel } from "@/components/community/CommunityLeaderboardPanel";
import { CommunityPlayersModal } from "@/components/community/CommunityPlayersModal";
import { CommunityProfilePanel } from "@/components/community/CommunityProfilePanel";
import { CommunityRecentTournamentPanel } from "@/components/community/CommunityRecentTournamentPanel";
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
  const communityPagerStartXRef = useRef<number | null>(null);
  const communityPagerStartYRef = useRef<number | null>(null);
  const communityPagerStartIndexRef = useRef<number | null>(null);
  const communityPagerIntentRef = useRef<"horizontal" | "vertical" | null>(
    null
  );
  const pendingCommunitySectionRef = useRef<CommunityPageSection | null>(null);
  const [communityDragOffset, setCommunityDragOffset] = useState(0);
  const [isCommunityDragging, setIsCommunityDragging] = useState(false);
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
    latestPastTournament,
    leaderboardPreview,
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
  const activeMobileSectionIndex = Math.max(
    0,
    mobileSections.findIndex((section) => section === activeSection)
  );
  const communityTrackOffset =
    mobileSections.length > 0
      ? (activeMobileSectionIndex * 100) / mobileSections.length
      : 0;
  const communityTrackWidth = `${Math.max(mobileSections.length, 1) * 100}%`;
  const communityPanelWidth =
    mobileSections.length > 0 ? `${100 / mobileSections.length}%` : "100%";

  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/");
  }, [router]);

  const switchCommunitySection = useCallback(
    (section: CommunityPageSection) => {
      pendingCommunitySectionRef.current = section;
      switchSection(section);
      router.replace(getCommunitySectionHref(communityId, section), {
        scroll: false,
      });
      setCommunityDragOffset(0);
      setIsCommunityDragging(false);
    },
    [communityId, router, switchSection]
  );

  const exitCommunityHostMode = useCallback(() => {
    exitHostMode();
    pendingCommunitySectionRef.current = lastNonHostSection;
    router.replace(getCommunitySectionHref(communityId, lastNonHostSection), {
      scroll: false,
    });
    setCommunityDragOffset(0);
    setIsCommunityDragging(false);
  }, [communityId, exitHostMode, lastNonHostSection, router]);

  const handleCommunityHostButtonClick = useCallback(() => {
    if (!canManageCommunity) return;

    if (activeSection === "host") {
      exitCommunityHostMode();
      return;
    }

    switchCommunitySection("host");
  }, [
    activeSection,
    canManageCommunity,
    exitCommunityHostMode,
    switchCommunitySection,
  ]);

  const resetCommunityPagerGesture = useCallback(() => {
    communityPagerStartXRef.current = null;
    communityPagerStartYRef.current = null;
    communityPagerStartIndexRef.current = null;
    communityPagerIntentRef.current = null;
    setCommunityDragOffset(0);
    setIsCommunityDragging(false);
  }, []);

  const completeCommunitySwipe = useCallback(
    (endX: number | null) => {
      const container = communityPagerRef.current;
      const startX = communityPagerStartXRef.current;
      const startIndex = communityPagerStartIndexRef.current;
      const intent = communityPagerIntentRef.current;

      resetCommunityPagerGesture();

      if (
        !container ||
        startX === null ||
        startIndex === null ||
        intent !== "horizontal"
      ) {
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

      const targetSection = mobileSections[targetIndex];
      if (!targetSection || targetSection === activeSection) {
        return;
      }

      pendingCommunitySectionRef.current = targetSection;
      switchSection(targetSection);
      router.replace(getCommunitySectionHref(communityId, targetSection), {
        scroll: false,
      });
    },
    [
      activeSection,
      communityId,
      mobileSections,
      resetCommunityPagerGesture,
      router,
      switchSection,
    ]
  );

  const handleCommunityPagerTouchStart = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      const touch = event.touches[0];
      if (!touch) return;

      communityPagerStartXRef.current = touch.clientX;
      communityPagerStartYRef.current = touch.clientY;
      communityPagerStartIndexRef.current = activeMobileSectionIndex;
      communityPagerIntentRef.current = null;
      setCommunityDragOffset(0);
      setIsCommunityDragging(false);
    },
    [activeMobileSectionIndex]
  );

  const handleCommunityPagerTouchMove = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      const container = communityPagerRef.current;
      const touch = event.touches[0];
      const startX = communityPagerStartXRef.current;
      const startY = communityPagerStartYRef.current;
      const startIndex = communityPagerStartIndexRef.current;

      if (
        !container ||
        !touch ||
        startX === null ||
        startY === null ||
        startIndex === null
      ) {
        return;
      }

      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (!communityPagerIntentRef.current) {
        if (absX < 8 && absY < 8) {
          return;
        }

        communityPagerIntentRef.current =
          absX > absY + 4 ? "horizontal" : "vertical";
      }

      if (communityPagerIntentRef.current !== "horizontal") {
        return;
      }

      if (event.cancelable) {
        event.preventDefault();
      }

      const isAtFirstSection = startIndex === 0;
      const isAtLastSection = startIndex === mobileSections.length - 1;
      const isPushingPastFirst = isAtFirstSection && deltaX > 0;
      const isPushingPastLast = isAtLastSection && deltaX < 0;
      const resistedDelta =
        isPushingPastFirst || isPushingPastLast ? deltaX * 0.32 : deltaX;

      setIsCommunityDragging(true);
      setCommunityDragOffset(resistedDelta);
    },
    [mobileSections.length]
  );

  const handleCommunityPagerTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      const touch = event.changedTouches[0];
      completeCommunitySwipe(touch ? touch.clientX : null);
    },
    [completeCommunitySwipe]
  );

  const handleCommunityPagerTouchCancel = useCallback(() => {
    completeCommunitySwipe(null);
  }, [completeCommunitySwipe]);

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
  const isHostMode = activeSection === "host";
  const communityRoleLabel = canManageCommunity
    ? "ADMIN"
    : community?.role || "MEMBER";
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
  const overviewSupportPanels = (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      <CommunityLeaderboardPanel
        title="Leaderboard Snapshot"
        subtitle="Top performers right now"
        players={leaderboardPreview}
        communityId={communityId}
        action={
          <button
            type="button"
            onClick={() => switchCommunitySection("leaderboard")}
            className="app-button-secondary px-4 py-2"
          >
            Full Leaderboard
          </button>
        }
        showClaimControls={false}
        onOpenPlayerProfile={openCommunityPlayerProfile}
      />

      <CommunityRecentTournamentPanel
        latestPastTournament={latestPastTournament}
        onOpenTournaments={() => switchCommunitySection("tournaments")}
        onOpenTournament={openTournament}
      />
    </div>
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
        return (
          <>
            <CurrentTournamentsPanel
              tournaments={activeTournaments}
              currentUserId={user?.id}
              onJoinTournament={joinTournament}
            />

            {testSessions.length > 0 ? (
              <TestSessionsPanel
                sessions={testSessions}
                currentUserId={user?.id}
                onOpenSession={openTournament}
              />
            ) : null}

            {overviewSupportPanels}
          </>
        );
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
          actionsPosition="below"
          meta={
            <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
              <div className="justify-self-start">
                <button
                  type="button"
                  onClick={handleBack}
                  className="app-button-secondary px-4 py-2"
                >
                  Back
                </button>
              </div>
              <p className="app-eyebrow justify-self-center text-center">
                Community hub
              </p>
              <div className="justify-self-end">
                {canManageCommunity ? (
                  <Link
                    href={`/community/${communityId}/admin`}
                    className="app-chip app-chip-accent transition hover:opacity-90"
                  >
                    {communityRoleLabel}
                  </Link>
                ) : (
                  <span className="app-chip app-chip-neutral">
                    {communityRoleLabel}
                  </span>
                )}
              </div>
            </div>
          }
          actions={
            canManageCommunity ? (
              <button
                type="button"
                onClick={handleCommunityHostButtonClick}
                className="app-button-primary"
              >
                {isHostMode ? "Exit Host Setup" : "Open Host Setup"}
              </button>
            ) : null
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
                  className={`rounded-2xl px-4 py-3 text-left transition ${
                    isActive
                      ? "bg-white shadow-sm ring-1 ring-blue-100"
                      : "bg-transparent text-gray-600 hover:bg-white/70"
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-900">
                    {tab.label}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
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
          onTouchStart={handleCommunityPagerTouchStart}
          onTouchMove={handleCommunityPagerTouchMove}
          onTouchEnd={handleCommunityPagerTouchEnd}
          onTouchCancel={handleCommunityPagerTouchCancel}
          className="app-touch-pan-y -mx-1 overflow-hidden sm:hidden"
        >
          <div
            className="flex"
            style={{
              width: communityTrackWidth,
              transform: `translate3d(calc(-${communityTrackOffset}% + ${communityDragOffset}px), 0, 0)`,
              transition: isCommunityDragging
                ? "none"
                : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
              willChange: "transform",
            }}
          >
            {mobileSections.map((section) => (
              <section
                key={section}
                className="shrink-0 px-1"
                style={{ width: communityPanelWidth }}
              >
                <div className="space-y-8">
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
