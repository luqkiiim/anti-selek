"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CaretDown,
  UserCircle,
  CalendarBlank,
  Plus,
} from "@phosphor-icons/react";
import { PlayShell, PlayRow } from "@/components/play/PlayShell";
import { ClubNotificationsButton } from "@/components/club/ClubNotificationsButton";
import { ClubHome } from "@/components/play/ClubHome";
import { ClubProfilePanel } from "@/components/club/ClubProfilePanel";
import { ClubActionConfirmModal } from "@/components/club/ClubActionConfirmModal";
import { ClubLeaderboardPanel } from "@/components/club/ClubLeaderboardPanel";
import { ClubInsights } from "@/components/play/ClubInsights";
import { ClubPlayersModal } from "@/components/club/ClubPlayersModal";
import { HostTournamentPanel } from "@/components/club/HostTournamentPanel";
import { FlashMessage } from "@/components/ui/chrome";
import { getSessionTypeLabel } from "@/lib/sessionModeLabels";
import { SessionMode } from "@/types/enums";
import { useClubPage } from "./useClubPage";
export default function ClubPage() {
  const c = useClubPage();
  const search = useSearchParams();
  const requestedSection = search.get("tab") ?? "overview";
  const section = [
    "overview",
    "host",
    "profile",
    "tournaments",
    "leaderboard",
    "insights",
  ].includes(requestedSection)
    ? requestedSection
    : "overview";
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
    crossoverFrequency,
    setCrossoverFrequency,
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
    guestInitialEloInput,
    setGuestInitialEloInput,
    guestRepresentingClubInput,
    setGuestRepresentingClubInput,
    guestConfigs,
    guestPoolCounts,
    guestFormError,
    loading,
    creatingSession,
    creationIssues,
    showPlayersModal,
    playerSearch,
    setPlayerSearch,
    rollingBackTournamentCode,
    pendingRollbackTournament,
    requestingClaimFor,
    error,
    setError,
    success,
    refreshClubData,
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
    resetGuestDraft,
    handleGuestGenderChange,
    openPlayersModal,
    closePlayersModal,
  } = c;

  const isTutorialPlayground = club?.isTutorial === true;

  useEffect(() => {
    if (club && !club.isTutorial && user?.id) {
      try {
        localStorage.setItem(`pc:last-club:v1:${user.id}`, clubId);
      } catch {}
    }
  }, [club, clubId, user?.id]);
  if (status === "loading" || loading)
    return (
      <PlayShell title="Your club">
        <div className="loading">Loading your club...</div>
      </PlayShell>
    );
  if (!club)
    return (
      <PlayShell title="Club unavailable">
        <p className="error" role="alert">
          {error || "Unable to load this club."}
        </p>
        <button className="primary" onClick={() => refreshClubData()}>
          Try again
        </button>
      </PlayShell>
    );
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
      crossoverFrequency={crossoverFrequency}
      onCrossoverFrequencyChange={setCrossoverFrequency}
      selectedPoolCounts={selectedPoolCounts}
      guestPoolCounts={guestPoolCounts}
      selectedPlayerCount={selectedPlayerIds.length}
      guestCount={guestConfigs.length}
      onOpenPlayers={openPlayersModal}
      onCreateSession={createSession}
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

  return (
    <>
      <PlayShell
        clubId={clubId}
        active={
          section === "profile"
            ? "profile"
            : section === "tournaments" || section === "host"
              ? "sessions"
              : "club"
        }
        header={
          <>
            <Link
              href="/?choose=1"
              className="club-switcher"
              aria-label={`Switch club, current ${club.name}`}
            >
              <small>YOUR CLUB</small>
              <strong>
                {club.name}
                <CaretDown size={15} />
              </strong>
            </Link>
            <div className="header-actions">
              <ClubNotificationsButton
                key={clubId}
                clubId={clubId}
                initialUnreadCount={c.notifications.unreadCount}
              />
              <Link
                href="/settings"
                className="icon-button"
                aria-label="Account settings"
              >
                <UserCircle size={28} />
              </Link>
            </div>
          </>
        }
      >
        {success && <FlashMessage tone="success">{success}</FlashMessage>}
        {section === "overview" && <ClubHome c={c} />}
        {section === "host" &&
          (canManageClub ? (
            <>
              <h1>Let’s play.</h1>
              {hostSetupPanel}
            </>
          ) : (
            <p className="error">Only club hosts can create sessions.</p>
          ))}
        {section === "profile" && (
          <ClubProfilePanel userId={user?.id} clubId={clubId} />
        )}
        {section === "tournaments" && (
          <>
            <div className="section-head">
              <h1>Sessions</h1>
              {canManageClub && (
                <Link href={`/club/${clubId}?tab=host`} className="text-button">
                  <Plus size={20} />
                  Host
                </Link>
              )}
            </div>
            <h3>On now</h3>
            <div className="link-group">
              {activeTournaments.map((t) => (
                <div key={t.id}>
                  <PlayRow
                    title={t.name}
                    sub={`${t.players.length} players · ${getSessionTypeLabel(t.type)}`}
                    icon={<CalendarBlank size={24} />}
                    href={`/session/${t.code}`}
                  />
                  {!viewerIsQuickAccess &&
                    !t.players.some((p) => p.user.id === user?.id) && (
                      <button
                        className="text-button"
                        onClick={() => void joinTournament(t.code)}
                      >
                        Join session
                      </button>
                    )}
                  {canAdminClub &&
                    t.clubs?.some(
                      (link) => link.id === clubId && link.status === "PENDING",
                    ) && (
                      <div className="surface">
                        <p>Invitation to play together</p>
                        <div className="button-pair">
                          <button
                            className="primary"
                            onClick={() =>
                              void reviewCollabTournament(t.code, "ACCEPTED")
                            }
                          >
                            Accept
                          </button>
                          <button
                            className="secondary"
                            onClick={() =>
                              void reviewCollabTournament(t.code, "REJECTED")
                            }
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    )}
                </div>
              ))}
            </div>
            {activeTournaments.length === 0 && (
              <p className="quiet">Nothing live right now.</p>
            )}
            <h3>Past sessions</h3>
            <div className="link-group">
              {pastTournaments.map((t) => (
                <div key={t.id}>
                  <PlayRow
                    title={t.name}
                    sub={new Date(
                      t.endedAt ?? t.createdAt,
                    ).toLocaleDateString()}
                    icon={<CalendarBlank size={24} />}
                    href={`/session/${t.code}`}
                  />
                  {canAdminClub &&
                    !isTutorialPlayground &&
                    t.id === latestPastTournamentId && (
                      <details className="px-4">
                        <summary className="quiet">Session options</summary>
                        <button
                          className="text-button"
                          onClick={() => requestRollbackTournament(t)}
                        >
                          Rollback session
                        </button>
                      </details>
                    )}
                </div>
              ))}
            </div>
            {pastTournaments.length === 0 && (
              <p className="quiet">Completed sessions will appear here.</p>
            )}
            {testSessions.length > 0 && (
              <details>
                <summary>Practice sessions ({testSessions.length})</summary>
                {testSessions.map((t) => (
                  <PlayRow
                    key={t.id}
                    title={t.name}
                    href={`/session/${t.code}`}
                  />
                ))}
              </details>
            )}
          </>
        )}
        {section === "leaderboard" && (
          <>
            <h1>Club standings</h1>
            <ClubLeaderboardPanel
              title=""
              players={leaderboard}
              clubId={clubId}
              claimState={{
                currentUser: user,
                currentUserClaimEligibility,
                myPendingClaimRequest,
                pendingClaimByTargetId,
                requestingClaimFor,
              }}
              onRequestClaim={requestClaim}
            />
          </>
        )}
        {section === "insights" && (
          <>
            <h1>Club overview</h1>
            <ClubInsights
              pulse={clubPulse}
              clubId={clubId}
              readOnly={viewerIsQuickAccess}
            />
          </>
        )}
      </PlayShell>
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
        guestConfigs={guestConfigs}
        guestNameInput={guestNameInput}
        guestInitialEloInput={guestInitialEloInput}
        guestGenderInput={guestGenderInput}
        guestMixedSideOverrideInput={guestMixedSideOverrideInput}
        guestPoolInput={guestPoolInput}
        guestRepresentingClubInput={guestRepresentingClubInput}
        guestFormError={guestFormError}
        isMixed={sessionMode === SessionMode.MIXICANO}
        interclubClubOptions={interclubClubOptions}
        onChangePlayerRepresentingClub={updateSelectedPlayerRepresentingClub}
        onGuestNameChange={setGuestNameInput}
        onGuestInitialEloChange={setGuestInitialEloInput}
        onGuestGenderChange={handleGuestGenderChange}
        onGuestMixedSideOverrideChange={setGuestMixedSideOverrideInput}
        onGuestPoolChange={setGuestPoolInput}
        onGuestRepresentingClubChange={setGuestRepresentingClubInput}
        onAddGuest={addGuestName}
        onRemoveGuest={removeGuestName}
        onResetGuestDraft={resetGuestDraft}
        onClose={closePlayersModal}
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
    </>
  );
}
