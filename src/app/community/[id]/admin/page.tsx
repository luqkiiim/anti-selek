"use client";

import Link from "next/link";
import { FlashMessage } from "@/components/ui/chrome";
import { ClaimRequestsPanel } from "@/components/community-admin/ClaimRequestsPanel";
import { CommunityDangerZonePanel } from "@/components/community-admin/CommunityDangerZonePanel";
import { CommunityPasswordResetModal } from "@/components/community-admin/CommunityPasswordResetModal";
import { CommunityPlayerEditorModal } from "@/components/community-admin/CommunityPlayerEditorModal";
import { CommunityPlayersPanel } from "@/components/community-admin/CommunityPlayersPanel";
import { CommunitySettingsPanel } from "@/components/community-admin/CommunitySettingsPanel";
import { CreateCommunityPlayerModal } from "@/components/community-admin/CreateCommunityPlayerModal";
import type { CommunityAdminSection } from "@/components/community-admin/communityAdminTypes";
import { useCommunityAdminPage } from "./useCommunityAdminPage";

const tabs: Array<{
  key: CommunityAdminSection;
  label: string;
  detail: (counts: { players: number; claims: number }) => string;
}> = [
  {
    key: "players",
    label: "Players",
    detail: ({ players }) => `${players} total`,
  },
  {
    key: "claims",
    label: "Claims",
    detail: ({ claims }) => `${claims} pending`,
  },
  {
    key: "settings",
    label: "Settings",
    detail: () => "Community controls",
  },
];

export default function CommunityAdminPage() {
  const {
    status,
    currentUserId,
    communityId,
    community,
    players,
    claimRequests,
    loading,
    error,
    success,
    communityNameInput,
    setCommunityNameInput,
    communityPasswordInput,
    setCommunityPasswordInput,
    savingCommunitySettings,
    activeSection,
    setActiveSection,
    playerSearch,
    setPlayerSearch,
    isCreatePlayerOpen,
    name,
    setName,
    newPlayerGender,
    setNewPlayerGender,
    editingPlayer,
    editorName,
    setEditorName,
    editorRating,
    setEditorRating,
    savingName,
    savingRating,
    savingRole,
    savingPreferences,
    reviewingClaimRequestId,
    resettingCommunity,
    deletingCommunity,
    passwordResetTarget,
    passwordResetValue,
    setPasswordResetValue,
    passwordResetConfirm,
    setPasswordResetConfirm,
    passwordResetError,
    savingPasswordReset,
    claimedPlayersCount,
    adminPlayersCount,
    filteredPlayers,
    openCreatePlayerModal,
    closeCreatePlayerModal,
    openPlayerEditor,
    closePlayerEditor,
    openPasswordResetModal,
    closePasswordResetModal,
    handleAddPlayer,
    handleSavePlayerName,
    handleSavePlayerRating,
    handleRemovePlayer,
    handleResetPlayerPassword,
    handlePromotePlayer,
    handleUpdatePreferences,
    handleResetCommunity,
    handleUpdateCommunitySettings,
    handleDeleteCommunity,
    handleReviewClaimRequest,
  } = useCommunityAdminPage();

  if (status === "loading" || loading) {
    return (
      <div className="app-page flex items-center justify-center px-6">
        <div className="app-panel flex flex-col items-center gap-4 px-8 py-8">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          <p className="app-eyebrow">Loading admin</p>
        </div>
      </div>
    );
  }

  return (
    <main className="app-page">
      <div className="app-topbar">
        <div className="app-topbar-inner">
          <div className="flex items-center gap-3">
            <Link
              href={`/community/${communityId}`}
              className="app-button-secondary px-4 py-2"
            >
              Back
            </Link>
            <div>
              <h1 className="text-lg font-semibold leading-none tracking-tight text-gray-900">
                {community?.name || "Community"}
              </h1>
              <p className="text-[11px] text-gray-500">Community admin</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="app-chip app-chip-danger">Admin only</span>
            <span
              className={`app-chip ${
                community?.isPasswordProtected
                  ? "app-chip-warning"
                  : "app-chip-neutral"
              }`}
            >
              {community?.isPasswordProtected ? "Protected" : "Open"}
            </span>
          </div>
        </div>
      </div>

      <div className="app-shell space-y-8">
        <section className="app-panel relative overflow-hidden px-5 py-6 sm:px-6">
          <div className="pointer-events-none absolute inset-y-0 right-[-5rem] top-[-2rem] w-64 rounded-full bg-[radial-gradient(circle,_rgba(22,119,242,0.16),_transparent_65%)] blur-2xl" />
          <div className="pointer-events-none absolute bottom-[-4rem] left-[-2rem] h-40 w-40 rounded-full bg-[radial-gradient(circle,_rgba(25,154,97,0.12),_transparent_68%)] blur-2xl" />
          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl space-y-3">
              <p className="app-eyebrow">Admin workspace</p>
              <h2 className="text-2xl font-semibold text-gray-900 sm:text-3xl">
                Keep the roster clean and the community ready for tournaments.
              </h2>
              <p className="text-sm text-gray-600 sm:text-base">
                Players, claim reviews, and community settings now live in
                focused sections instead of one long admin screen.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="app-chip app-chip-accent">
                {players.length} players
              </span>
              <span className="app-chip app-chip-neutral">
                {claimedPlayersCount} claimed
              </span>
              <span className="app-chip app-chip-neutral">
                {adminPlayersCount} admins
              </span>
              <span
                className={`app-chip ${
                  claimRequests.length > 0
                    ? "app-chip-warning"
                    : "app-chip-success"
                }`}
              >
                {claimRequests.length} claim requests
              </span>
            </div>
          </div>
        </section>

        {error ? <FlashMessage tone="error">{error}</FlashMessage> : null}
        {success ? <FlashMessage tone="success">{success}</FlashMessage> : null}

        <section className="app-panel-soft p-2">
          <div className="grid gap-2 sm:grid-cols-3">
            {tabs.map((tab) => {
              const isActive = activeSection === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveSection(tab.key)}
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
                      players: players.length,
                      claims: claimRequests.length,
                    })}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {activeSection === "players" ? (
          <CommunityPlayersPanel
            players={players}
            filteredPlayers={filteredPlayers}
            claimedPlayersCount={claimedPlayersCount}
            communityId={communityId}
            playerSearch={playerSearch}
            onPlayerSearchChange={setPlayerSearch}
            onOpenCreatePlayer={openCreatePlayerModal}
            onOpenPlayerEditor={openPlayerEditor}
          />
        ) : null}

        {activeSection === "claims" ? (
          <ClaimRequestsPanel
            claimRequests={claimRequests}
            reviewingClaimRequestId={reviewingClaimRequestId}
            currentUserId={currentUserId}
            onReviewClaimRequest={handleReviewClaimRequest}
          />
        ) : null}

        {activeSection === "settings" ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)]">
            <CommunitySettingsPanel
              communityName={communityNameInput}
              onCommunityNameChange={setCommunityNameInput}
              communityPassword={communityPasswordInput}
              onCommunityPasswordChange={setCommunityPasswordInput}
              isPasswordProtected={community?.isPasswordProtected ?? false}
              onSubmit={handleUpdateCommunitySettings}
              saving={savingCommunitySettings}
            />

            <CommunityDangerZonePanel
              resettingCommunity={resettingCommunity}
              deletingCommunity={deletingCommunity}
              onResetCommunity={handleResetCommunity}
              onDeleteCommunity={handleDeleteCommunity}
            />
          </div>
        ) : null}
      </div>

      <CreateCommunityPlayerModal
        open={isCreatePlayerOpen}
        name={name}
        newPlayerGender={newPlayerGender}
        onNameChange={setName}
        onNewPlayerGenderChange={setNewPlayerGender}
        onClose={closeCreatePlayerModal}
        onSubmit={handleAddPlayer}
      />

      <CommunityPlayerEditorModal
        player={editingPlayer}
        communityId={communityId}
        editorName={editorName}
        editorRating={editorRating}
        savingName={savingName}
        savingRating={savingRating}
        savingRole={savingRole}
        savingPreferences={savingPreferences}
        onEditorNameChange={setEditorName}
        onEditorRatingChange={setEditorRating}
        onClose={closePlayerEditor}
        onRemovePlayer={(player) => void handleRemovePlayer(player)}
        onSavePlayerName={handleSavePlayerName}
        onSavePlayerRating={handleSavePlayerRating}
        onUpdatePreferences={handleUpdatePreferences}
        onPromotePlayer={handlePromotePlayer}
        onOpenPasswordReset={openPasswordResetModal}
      />

      <CommunityPasswordResetModal
        target={passwordResetTarget}
        passwordResetValue={passwordResetValue}
        passwordResetConfirm={passwordResetConfirm}
        passwordResetError={passwordResetError}
        savingPasswordReset={savingPasswordReset}
        onPasswordResetValueChange={setPasswordResetValue}
        onPasswordResetConfirmChange={setPasswordResetConfirm}
        onClose={closePasswordResetModal}
        onSubmit={handleResetPlayerPassword}
      />
    </main>
  );
}
