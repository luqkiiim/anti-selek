"use client";

import { useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { FlashMessage } from "@/components/ui/chrome";
import { ClaimRequestsPanel } from "@/components/club-admin/ClaimRequestsPanel";
import { ClubAdminActionConfirmModal } from "@/components/club-admin/ClubAdminActionConfirmModal";
import { ClubDangerZonePanel } from "@/components/club-admin/ClubDangerZonePanel";
import { ClubPasswordResetModal } from "@/components/club-admin/ClubPasswordResetModal";
import { ClubPlayerEditorModal } from "@/components/club-admin/ClubPlayerEditorModal";
import { ClubPlayersPanel } from "@/components/club-admin/ClubPlayersPanel";
import { ClubSettingsPanel } from "@/components/club-admin/ClubSettingsPanel";
import { CreateClubPlayerModal } from "@/components/club-admin/CreateClubPlayerModal";
import { OfflineIdentityLinksPanel } from "@/components/club-admin/OfflineIdentityLinksPanel";
import { AdminOnboardingChecklist } from "@/components/onboarding/AdminOnboardingChecklist";
import { useAdminOnboardingProgress } from "@/components/onboarding/useAdminOnboardingProgress";
import type { ClubAdminSection } from "@/components/club-admin/clubAdminTypes";
import { ClubRole } from "@/types/enums";
import { useClubAdminPage } from "./useClubAdminPage";

const tabs: Array<{
  key: ClubAdminSection;
  label: string;
  detail: (counts: { players: number; claims: number; links: number }) => string;
}> = [
  {
    key: "players",
    label: "Players",
    detail: ({ players }) => `${players} total`,
  },
  {
    key: "links",
    label: "Links",
    detail: ({ links }) => `${links} active`,
  },
  {
    key: "claims",
    label: "Claims",
    detail: ({ claims }) => `${claims} pending`,
  },
  {
    key: "settings",
    label: "Settings",
    detail: () => "Club controls",
  },
];

function getPlayerActionDialogCopy(action: {
  kind: "remove" | "promote" | "demote-admin";
  player: { id: string; name: string; email: string | null };
  role?: ClubRole.STAFF | ClubRole.MEMBER;
}, currentUserId?: string | null) {
  if (action.kind === "remove") {
    const isSelfRemoval = action.player.id === currentUserId;

    return {
      title: isSelfRemoval
        ? "Leave club?"
        : `Remove ${action.player.name}?`,
      subtitle: isSelfRemoval
        ? "This removes your membership and admin access for this club."
        : "This takes the player out of the club roster.",
      confirmLabel: isSelfRemoval ? "Leave Club" : "Remove Player",
      confirmTone: "danger" as const,
      details: (
        <div className="app-panel-muted space-y-2 p-4">
          <p className="text-sm font-semibold text-gray-900">
            {action.player.name}
          </p>
          <p className="text-sm text-gray-600">
            {action.player.email || "No email on file"}
          </p>
          <p className="text-sm text-gray-600">
            {isSelfRemoval
              ? "You will no longer see this club in your admin tools unless another admin adds you again."
              : "They will no longer appear in this club unless added again."}
          </p>
        </div>
      ),
    };
  }

  if (action.kind === "demote-admin") {
    const targetRole =
      action.role === ClubRole.STAFF ? "staff" : "member";

    return {
      title: `Change ${action.player.name} to ${targetRole}?`,
      subtitle:
        action.role === ClubRole.STAFF
          ? "They will keep live session controls, but lose club admin access."
          : "They will lose club admin access and live session operator controls.",
      confirmLabel:
        action.role === ClubRole.STAFF
          ? "Change to Staff"
          : "Change to Member",
      confirmTone: "danger" as const,
      details: (
        <div className="app-panel-muted space-y-2 p-4">
          <p className="text-sm font-semibold text-gray-900">
            {action.player.name}
          </p>
          <p className="text-sm text-gray-600">
            {action.player.email || "No email on file"}
          </p>
          <p className="text-sm text-gray-600">
            Owner access stays protected; only this admin role will change.
          </p>
        </div>
      ),
    };
  }

  return {
    title: `Promote ${action.player.name}?`,
    subtitle: "This gives the player admin access for the whole club.",
    confirmLabel: "Promote to Admin",
    confirmTone: "primary" as const,
    details: (
      <div className="app-panel-muted space-y-2 p-4">
        <p className="text-sm font-semibold text-gray-900">
          {action.player.name}
        </p>
        <p className="text-sm text-gray-600">
          {action.player.email || "No email on file"}
        </p>
        <p className="text-sm text-gray-600">
          Admins can manage players, review claims, and change club settings.
        </p>
      </div>
    ),
  };
}

function getClubActionDialogCopy(
  action: { kind: "reset" | "delete" },
  clubName: string,
  isTutorial: boolean
) {
  if (action.kind === "reset") {
    if (isTutorial) {
      return {
        title: "Reset playground?",
        subtitle:
          "This restores the practice players, ongoing session, and tutorial progress.",
        confirmLabel: "Reset Playground",
        confirmationKeyword: "RESET",
        details: (
          <div className="app-panel-muted space-y-2 p-4">
            <p className="text-sm font-semibold text-gray-900">
              {clubName}
            </p>
            <p className="text-sm text-gray-600">
              The playground will return to its original seeded state.
            </p>
          </div>
        ),
      };
    }

    return {
      title: "Reset club history?",
      subtitle:
        "This deletes all tournaments in the club and resets every member rating to 1000.",
      confirmLabel: "Reset Club",
      confirmationKeyword: "RESET",
      details: (
        <div className="app-panel-muted space-y-2 p-4">
          <p className="text-sm font-semibold text-gray-900">{clubName}</p>
          <p className="text-sm text-gray-600">
            Tournament history will be removed for this club. This cannot be undone.
          </p>
        </div>
      ),
    };
  }

  return {
    title: "Delete club permanently?",
    subtitle:
      "This removes the club, its members, and all related tournament data.",
    confirmLabel: "Delete Club",
    confirmationKeyword: "DELETE",
    details: (
      <div className="app-panel-muted space-y-2 p-4">
        <p className="text-sm font-semibold text-gray-900">{clubName}</p>
        <p className="text-sm text-gray-600">
          This club cannot be recovered after deletion.
        </p>
      </div>
    ),
  };
}

export default function ClubAdminPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    status,
    currentUserId,
    isGlobalAdmin,
    communityId,
    club,
    players,
    claimRequests,
    offlineIdentityLinks,
    loading,
    error,
    success,
    clubNameInput,
    setClubNameInput,
    clubPasswordInput,
    setClubPasswordInput,
    clubPasswordProtectionEnabled,
    setClubPasswordProtectionEnabled,
    savingClubSettings,
    activeSection,
    setActiveSection,
    playerSearch,
    setPlayerSearch,
    isCreatePlayerOpen,
    name,
    setName,
    newPlayerGender,
    setNewPlayerGender,
    newPlayerMixedSideOverride,
    setNewPlayerMixedSideOverride,
    newPlayerStatus,
    setNewPlayerStatus,
    editingPlayer,
    editorName,
    setEditorName,
    editorRating,
    setEditorRating,
    savingName,
    savingRating,
    savingRole,
    savingPreferences,
    removingPlayer,
    reviewingClaimRequestId,
    linkSourceUserId,
    setLinkSourceUserId,
    targetCommunitySearch,
    setTargetClubSearch,
    selectedTargetClub,
    targetCommunityCandidates,
    loadingTargetCommunities,
    loadingTargetRoster,
    linkTargetUserId,
    setLinkTargetUserId,
    sourcePlaceholderOptions,
    targetPlaceholderOptions,
    submittingOfflineIdentityLink,
    reviewingOfflineIdentityLinkId,
    selectTargetClub,
    clearTargetClub,
    submitOfflineIdentityLink,
    reviewOfflineIdentityLink,
    unlinkOfflineIdentity,
    resettingClub,
    deletingClub,
    passwordResetTarget,
    passwordResetValue,
    setPasswordResetValue,
    passwordResetConfirm,
    setPasswordResetConfirm,
    passwordResetError,
    savingPasswordReset,
    claimedPlayersCount,
    adminPlayersCount,
    occasionalPlayersCount,
    filteredPlayers,
    pendingPlayerAction,
    closePendingPlayerAction,
    confirmPendingPlayerAction,
    pendingClubAction,
    clubActionConfirmationValue,
    setClubActionConfirmationValue,
    closePendingClubAction,
    confirmPendingClubAction,
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
    handleUploadPlayerAvatar,
    handleRemovePlayerAvatar,
    handleResetPlayerPassword,
    handlePromotePlayer,
    handleDemoteAdmin,
    handleGrantStaff,
    handleRevokeStaff,
    handleUpdatePreferences,
    handleResetClub,
    handleUpdateClubSettings,
    handleDeleteClub,
    handleReviewClaimRequest,
  } = useClubAdminPage();
  const isTutorialPlayground =
    club?.isTutorial === true &&
    club.tutorialOwnerId === currentUserId;
  const adminOnboarding = useAdminOnboardingProgress(
    status === "authenticated" &&
      club?.role === "ADMIN" &&
      isTutorialPlayground &&
      !loading
  );
  const visibleTabs = isTutorialPlayground
    ? tabs.filter((tab) => tab.key === "players" || tab.key === "settings")
    : tabs;

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (
      requestedTab === "players" ||
      requestedTab === "links" ||
      requestedTab === "claims" ||
      requestedTab === "settings"
    ) {
      setActiveSection(requestedTab);
    }
  }, [searchParams, setActiveSection]);

  useEffect(() => {
    if (
      isTutorialPlayground &&
      (activeSection === "claims" || activeSection === "links")
    ) {
      setActiveSection("players");
    }
  }, [activeSection, isTutorialPlayground, setActiveSection]);

  useEffect(() => {
    if (isTutorialPlayground && activeSection === "players") {
      adminOnboarding.completeStep("players");
    }
  }, [activeSection, adminOnboarding, isTutorialPlayground]);

  const switchAdminSection = useCallback(
    (section: ClubAdminSection) => {
      setActiveSection(section);
      if (communityId) {
        router.replace(`/community/${communityId}/admin?tab=${section}`, {
          scroll: false,
        });
      }
    },
    [communityId, router, setActiveSection]
  );
  const handleAddPlayerWithOnboardingRefresh = useCallback(
    async (event: Parameters<typeof handleAddPlayer>[0]) => {
      await handleAddPlayer(event);
      void adminOnboarding.refresh();
    },
    [adminOnboarding, handleAddPlayer]
  );

  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push(communityId ? `/community/${communityId}` : "/");
  }, [communityId, router]);

  const pendingPlayerActionDialog = pendingPlayerAction
    ? getPlayerActionDialogCopy(pendingPlayerAction, currentUserId)
    : null;
  const pendingClubActionDialog = pendingClubAction
    ? getClubActionDialogCopy(
        pendingClubAction,
        club?.name || "Club",
        isTutorialPlayground
      )
    : null;

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
            <button
              type="button"
              onClick={handleBack}
              className="app-button-secondary px-4 py-2"
            >
              <ArrowLeft aria-hidden="true" size={17} />
              Back
            </button>
            <div>
              <h1 className="text-lg font-semibold leading-none tracking-tight text-gray-900">
                {club?.name || "Club"}
              </h1>
              <p className="text-[11px] text-gray-500">Club admin</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isTutorialPlayground ? (
              <span className="app-chip app-chip-accent">
                Tutorial playground
              </span>
            ) : null}
            <span className="app-chip app-chip-danger">Admin only</span>
            <span
              className={`app-chip ${
                club?.isPasswordProtected
                  ? "app-chip-warning"
                  : "app-chip-neutral"
              }`}
            >
              {club?.isPasswordProtected ? "Protected" : "Open"}
            </span>
          </div>
        </div>
      </div>

      <div className="app-shell space-y-8">
        <section className="app-panel px-5 py-6 sm:px-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl space-y-3">
              <p className="app-eyebrow">Admin workspace</p>
              <h2 className="text-2xl font-semibold text-gray-900 sm:text-3xl">
                Club controls
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="app-chip app-chip-accent">
                {players.length} players
              </span>
              <span className="app-chip app-chip-neutral">
                {claimedPlayersCount} claimed
              </span>
              <span className="app-chip app-chip-neutral">
                {occasionalPlayersCount} occasional
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

        {isTutorialPlayground ? (
          <AdminOnboardingChecklist
            progress={adminOnboarding.progress}
            loading={adminOnboarding.loading}
            onDismiss={adminOnboarding.dismiss}
            onReopen={adminOnboarding.reopen}
            onCompleteStep={adminOnboarding.completeStep}
          />
        ) : null}

        <section className="app-panel-soft p-2">
          <div className="grid gap-2 sm:grid-cols-4">
            {visibleTabs.map((tab) => {
              const isActive = activeSection === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => switchAdminSection(tab.key)}
                  className={`rounded-2xl px-4 py-3 text-left transition ${
                    isActive
                      ? "bg-white shadow-sm ring-1 ring-blue-100"
                      : "bg-transparent text-gray-600 hover:bg-white"
                  }`}
                  data-tutorial-target={
                    isTutorialPlayground && tab.key === "players"
                      ? "admin-onboarding-players-tab"
                      : isTutorialPlayground && tab.key === "settings"
                        ? "admin-onboarding-settings-tab"
                        : undefined
                  }
                >
                  <p className="text-sm font-semibold text-gray-900">
                    {tab.label}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                    {tab.detail({
                      players: players.length,
                      claims: claimRequests.length,
                      links: offlineIdentityLinks.filter(
                        (link) => link.status === "ACCEPTED"
                      ).length,
                    })}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {activeSection === "players" ? (
          <ClubPlayersPanel
            players={players}
            filteredPlayers={filteredPlayers}
            claimedPlayersCount={claimedPlayersCount}
            occasionalPlayersCount={occasionalPlayersCount}
            communityId={communityId}
            playerSearch={playerSearch}
            onPlayerSearchChange={setPlayerSearch}
            onOpenCreatePlayer={openCreatePlayerModal}
            onOpenPlayerEditor={openPlayerEditor}
          />
        ) : null}

        {!isTutorialPlayground && activeSection === "claims" ? (
          <ClaimRequestsPanel
            claimRequests={claimRequests}
            reviewingClaimRequestId={reviewingClaimRequestId}
            currentUserId={currentUserId}
            onReviewClaimRequest={handleReviewClaimRequest}
          />
        ) : null}

        {!isTutorialPlayground && activeSection === "links" ? (
          <OfflineIdentityLinksPanel
            links={offlineIdentityLinks}
            currentClubId={communityId}
            currentUserId={currentUserId}
            sourcePlaceholderOptions={sourcePlaceholderOptions}
            sourceUserId={linkSourceUserId}
            onSourceUserIdChange={setLinkSourceUserId}
            targetCommunitySearch={targetCommunitySearch}
            onTargetClubSearchChange={setTargetClubSearch}
            selectedTargetClub={selectedTargetClub}
            targetCommunityCandidates={targetCommunityCandidates}
            loadingTargetCommunities={loadingTargetCommunities}
            loadingTargetRoster={loadingTargetRoster}
            targetPlaceholderOptions={targetPlaceholderOptions}
            targetUserId={linkTargetUserId}
            onTargetUserIdChange={setLinkTargetUserId}
            submitting={submittingOfflineIdentityLink}
            reviewingLinkId={reviewingOfflineIdentityLinkId}
            onSelectTargetClub={selectTargetClub}
            onClearTargetClub={clearTargetClub}
            onSubmitLink={() => {
              void submitOfflineIdentityLink();
            }}
            onReviewLink={reviewOfflineIdentityLink}
            onUnlink={unlinkOfflineIdentity}
          />
        ) : null}

        {activeSection === "settings" ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)]">
              <ClubSettingsPanel
                isTutorial={isTutorialPlayground}
                clubName={clubNameInput}
                onClubNameChange={setClubNameInput}
              clubPassword={clubPasswordInput}
              onClubPasswordChange={setClubPasswordInput}
              passwordProtectionEnabled={clubPasswordProtectionEnabled}
              onPasswordProtectionEnabledChange={
                setClubPasswordProtectionEnabled
              }
              isPasswordProtected={club?.isPasswordProtected ?? false}
              onSubmit={handleUpdateClubSettings}
              saving={savingClubSettings}
            />

            <ClubDangerZonePanel
              isTutorial={isTutorialPlayground}
              resettingClub={resettingClub}
              deletingClub={deletingClub}
              onResetClub={handleResetClub}
              onDeleteClub={handleDeleteClub}
            />
          </div>
        ) : null}
      </div>

      <CreateClubPlayerModal
        open={isCreatePlayerOpen}
        name={name}
        newPlayerGender={newPlayerGender}
        newPlayerMixedSideOverride={newPlayerMixedSideOverride}
        newPlayerStatus={newPlayerStatus}
        onNameChange={setName}
        onNewPlayerGenderChange={(value) => {
          setNewPlayerGender(value);
          setNewPlayerMixedSideOverride(null);
        }}
        onNewPlayerMixedSideOverrideChange={setNewPlayerMixedSideOverride}
        onNewPlayerStatusChange={setNewPlayerStatus}
        onClose={closeCreatePlayerModal}
        onSubmit={handleAddPlayerWithOnboardingRefresh}
      />

      <ClubPlayerEditorModal
        player={editingPlayer}
        communityId={communityId}
        currentUserId={currentUserId}
        editorName={editorName}
        editorRating={editorRating}
        savingName={savingName}
        savingRating={savingRating}
        savingRole={savingRole}
        savingPreferences={savingPreferences}
        removingPlayer={removingPlayer}
        onEditorNameChange={setEditorName}
        onEditorRatingChange={setEditorRating}
        onClose={closePlayerEditor}
        onRemovePlayer={(player) => void handleRemovePlayer(player)}
        onSavePlayerName={handleSavePlayerName}
        onSavePlayerRating={handleSavePlayerRating}
        onUpdatePreferences={handleUpdatePreferences}
        onPromotePlayer={handlePromotePlayer}
        onDemoteAdmin={handleDemoteAdmin}
        onGrantStaff={handleGrantStaff}
        onRevokeStaff={handleRevokeStaff}
        onOpenPasswordReset={openPasswordResetModal}
        canDemoteAdmins={
          (club?.viewerIsOwner === true || isGlobalAdmin) &&
          editingPlayer?.id !== currentUserId
        }
        canOpenEmergencyPasswordReset={isGlobalAdmin}
        onUploadAvatar={handleUploadPlayerAvatar}
        onRemoveAvatar={handleRemovePlayerAvatar}
      />

      <ClubPasswordResetModal
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

      {pendingPlayerAction && pendingPlayerActionDialog ? (
        <ClubAdminActionConfirmModal
          title={pendingPlayerActionDialog.title}
          subtitle={pendingPlayerActionDialog.subtitle}
          details={pendingPlayerActionDialog.details}
          confirmLabel={pendingPlayerActionDialog.confirmLabel}
          confirmTone={pendingPlayerActionDialog.confirmTone}
          isSubmitting={
            pendingPlayerAction.kind === "remove" ? removingPlayer : savingRole
          }
          onClose={closePendingPlayerAction}
          onConfirm={() => {
            void confirmPendingPlayerAction();
          }}
        />
      ) : null}

      {pendingClubAction && pendingClubActionDialog ? (
        <ClubAdminActionConfirmModal
          title={pendingClubActionDialog.title}
          subtitle={pendingClubActionDialog.subtitle}
          details={pendingClubActionDialog.details}
          confirmLabel={pendingClubActionDialog.confirmLabel}
          confirmationKeyword={pendingClubActionDialog.confirmationKeyword}
        confirmationValue={clubActionConfirmationValue}
          onConfirmationValueChange={setClubActionConfirmationValue}
          confirmationInputLabel={`Type ${pendingClubActionDialog.confirmationKeyword} to continue`}
          isSubmitting={
            pendingClubAction.kind === "reset"
              ? resettingClub
              : deletingClub
          }
          onClose={closePendingClubAction}
          onConfirm={() => {
            void confirmPendingClubAction();
          }}
        />
      ) : null}
    </main>
  );
}
