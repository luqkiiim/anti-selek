"use client";

import Link from "next/link";
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

const sectionLabels: Record<Exclude<CommunityPageSection, "host">, string> = {
  overview: "Overview",
  tournaments: "Tournaments",
  leaderboard: "Leaderboard",
};

export default function CommunityPage() {
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
    selectedPlayerIds,
    guestNameInput,
    setGuestNameInput,
    guestGenderInput,
    guestPreferenceInput,
    setGuestPreferenceInput,
    guestInitialEloInput,
    setGuestInitialEloInput,
    guestConfigs,
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
  const membersCount = community?.membersCount || 0;
  const sessionsCount = community?.sessionsCount || 0;
  const liveTournamentsCount = activeTournaments.length;
  const isHostMode = activeSection === "host";
  const hostReturnLabel = sectionLabels[lastNonHostSection];
  const communityDescription = isHostMode
    ? "Host mode is active. The page is trimmed to the setup flow so you can build and launch the next tournament without overview distractions."
    : `${membersCount} members, ${liveTournamentsCount} live tournament${
        liveTournamentsCount === 1 ? "" : "s"
      }, and ${sessionsCount} total tournaments.`;
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
      selectedPlayerCount={selectedPlayerIds.length}
      guestCount={guestConfigs.length}
      onOpenPlayers={openPlayersModal}
      onOpenGuests={openGuestsModal}
      onCreateSession={createSession}
      onExitHostMode={exitHostMode}
      exitHostModeLabel={`Back to ${hostReturnLabel}`}
      creatingSession={creatingSession}
    />
  ) : null;
  const hostSetupSummary = canManageCommunity ? (
    <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-md">
      <div className="flex flex-col gap-5">
        <div>
          <p className="app-eyebrow">Host draft</p>
          <h3 className="text-xl font-semibold text-gray-900">
            Current setup
          </h3>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="app-panel-muted px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
              Format
            </p>
            <p className="mt-2 text-base font-semibold text-gray-900">
              {getSessionTypeLabel(sessionType)}
            </p>
          </div>
          <div className="app-panel-muted px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
              Mode
            </p>
            <p className="mt-2 text-base font-semibold text-gray-900">
              {sessionMode === "MIXICANO" ? mixedModeLabel : openModeLabel}
            </p>
          </div>
          <div className="app-panel-muted px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
              Courts
            </p>
            <p className="mt-2 text-base font-semibold text-gray-900">
              {courtCount} Court{courtCount > 1 ? "s" : ""}
            </p>
          </div>
          <div className="app-panel-muted px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
              Roster
            </p>
            <p className="mt-2 text-base font-semibold text-gray-900">
              {selectedPlayerIds.length} players, {guestConfigs.length} guests
            </p>
          </div>
        </div>
      </div>
    </div>
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
  const hostModeContext = (
    <section className="app-panel-soft p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <p className="app-eyebrow">Host focus</p>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Setup is the only primary task on this screen
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Live tournaments and community snapshots are tucked away while
              you build the next tournament. Exit host mode to return to{" "}
              {hostReturnLabel}.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="app-chip app-chip-neutral">
            {liveTournamentsCount} live tournament
            {liveTournamentsCount === 1 ? "" : "s"}
          </span>
          <span className="app-chip app-chip-neutral">
            {leaderboard.length} leaderboard entries
          </span>
          <button
            type="button"
            onClick={exitHostMode}
            className="app-button-dark px-4 py-2"
          >
            Back to {hostReturnLabel}
          </button>
          <button
            type="button"
            onClick={() => switchSection("tournaments")}
            className="app-button-secondary px-4 py-2"
          >
            View Tournaments
          </button>
        </div>
      </div>
    </section>
  );

  return (
    <main className="app-page">
      <div className="app-shell space-y-8">
        <HeroCard
          backHref="/"
          title={communityName}
          description={communityDescription}
          actionsPosition="below"
          eyebrow={isHostMode ? "Host desk" : "Community hub"}
          meta={
            <>
              {isHostMode ? (
                <span className="app-chip app-chip-accent">Host mode</span>
              ) : null}
              <span
                className={`app-chip ${
                  community?.role === "ADMIN"
                    ? "app-chip-accent"
                    : "app-chip-neutral"
                }`}
              >
                {community?.role || "MEMBER"}
              </span>
              <span className="app-chip app-chip-neutral">
                {membersCount} members
              </span>
              <span className="app-chip app-chip-neutral">
                {sessionsCount} tournaments
              </span>
              {community?.isPasswordProtected ? (
                <span className="app-chip app-chip-warning">Protected</span>
              ) : (
                <span className="app-chip app-chip-success">Open access</span>
              )}
            </>
          }
          actions={
            canManageCommunity ? (
              <>
                <button
                  type="button"
                  onClick={handleHostButtonClick}
                  className="app-button-primary"
                >
                  {isHostMode ? "Exit Host Setup" : "Open Host Setup"}
                </button>
                <Link
                  href={`/community/${communityId}/admin`}
                  className="app-button-dark"
                >
                  Admin Workspace
                </Link>
              </>
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

            {hostSetupSummary}
            {overviewSupportPanels}
          </>
        ) : null}

        {activeSection === "host" ? (
          <>
            {hostModeContext}
            {hostSetupPanel}
          </>
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
        playerSearch={playerSearch}
        selectablePlayers={selectablePlayers}
        filteredSelectablePlayers={filteredSelectablePlayers}
        onPlayerSearchChange={setPlayerSearch}
        onToggleAllPlayers={toggleAllPlayers}
        onTogglePlayerSelection={togglePlayerSelection}
        onClose={closePlayersModal}
      />

      <CommunityGuestsModal
        open={showGuestsModal}
        guestConfigs={guestConfigs}
        sessionMode={sessionMode}
        guestNameInput={guestNameInput}
        guestGenderInput={guestGenderInput}
        guestPreferenceInput={guestPreferenceInput}
        guestInitialEloInput={guestInitialEloInput}
        onGuestNameChange={setGuestNameInput}
        onGuestGenderChange={handleGuestGenderChange}
        onGuestPreferenceChange={setGuestPreferenceInput}
        onGuestInitialEloChange={setGuestInitialEloInput}
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
