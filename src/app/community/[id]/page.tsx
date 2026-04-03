"use client";

import { useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSessionTypeLabel } from "@/lib/sessionModeLabels";
import { FlashMessage, HeroCard } from "@/components/ui/chrome";
import { CommunityActionConfirmModal } from "@/components/community/CommunityActionConfirmModal";
import { CommunityGuestsModal } from "@/components/community/CommunityGuestsModal";
import { CommunityLeaderboardPanel } from "@/components/community/CommunityLeaderboardPanel";
import { CommunityPlayersModal } from "@/components/community/CommunityPlayersModal";
import { CommunityRecentTournamentPanel } from "@/components/community/CommunityRecentTournamentPanel";
import { CurrentTournamentsPanel } from "@/components/community/CurrentTournamentsPanel";
import { HostTournamentPanel } from "@/components/community/HostTournamentPanel";
import { PastTournamentsPanel } from "@/components/community/PastTournamentsPanel";
import type { CommunityPageSection } from "@/components/community/communityTypes";
import { useCommunityPage } from "./useCommunityPage";

const baseSectionTabs: Array<{
  key: Exclude<CommunityPageSection, "host">;
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

export default function CommunityPage() {
  const router = useRouter();
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
    handleHostButtonClick,
    openCommunityPlayerProfile,
    openTournament,
  } = useCommunityPage();

  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/");
  }, [router]);

  useEffect(() => {
    router.prefetch("/");

    const sessionCodes = new Set([
      ...activeTournaments.map((tournament) => tournament.code),
      ...pastTournaments.slice(0, 6).map((tournament) => tournament.code),
    ]);

    sessionCodes.forEach((code) => {
      router.prefetch(`/session/${code}`);
    });
  }, [activeTournaments, pastTournaments, router]);

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
      onExitHostMode={exitHostMode}
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
            onClick={() => switchSection("leaderboard")}
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
        onOpenTournaments={() => switchSection("tournaments")}
        onOpenTournament={openTournament}
      />
    </div>
  );

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
                onClick={handleHostButtonClick}
                className="app-button-primary"
              >
                {isHostMode ? "Exit Host Setup" : "Open Host Setup"}
              </button>
            ) : null
          }
        />

        {success ? <FlashMessage tone="success">{success}</FlashMessage> : null}

        <section className="app-panel-soft p-2">
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
                  onClick={() => switchSection(tab.key)}
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
                      sessions: pastTournaments.length + activeTournaments.length,
                      leaderboard: leaderboard.length,
                    })}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {activeSection === "overview" ? (
          <>
            <CurrentTournamentsPanel
              tournaments={activeTournaments}
              currentUserId={user?.id}
              onJoinTournament={joinTournament}
            />

            {overviewSupportPanels}
          </>
        ) : null}

        {activeSection === "host" ? (
          hostSetupPanel
        ) : null}

        {activeSection === "tournaments" ? (
          <div className="space-y-8">
            <CurrentTournamentsPanel
              tournaments={activeTournaments}
              currentUserId={user?.id}
              onJoinTournament={joinTournament}
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
        ) : null}

        {activeSection === "leaderboard" ? (
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
        ) : null}
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
        <div className="fixed bottom-6 left-6 right-6 z-50">
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
    </main>
  );
}
