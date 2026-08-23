"use client";

import { useCallback, useEffect, type KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, LoaderCircle } from "lucide-react";
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
import styles from "./ClubAdminPage.module.css";

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
          ? "They will keep live tournament controls, but lose club admin access."
          : "They will lose club admin access and live tournament operator controls.",
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
          "This restores the practice players, ongoing tournament, and tutorial progress.",
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
    clubId,
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
    newPlayerNeedsMoreRest,
    setNewPlayerNeedsMoreRest,
    newPlayerPreferredPool,
    setNewPlayerPreferredPool,
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
    targetClubSearch,
    setTargetClubSearch,
    selectedTargetClub,
    targetClubCandidates,
    loadingTargetClubs,
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
    handleUploadClubAvatar,
    handleRemoveClubAvatar,
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
      if (clubId) {
        router.replace(`/club/${clubId}/admin?tab=${section}`, {
          scroll: false,
        });
      }
    },
    [clubId, router, setActiveSection]
  );
  const handleTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
      let nextIndex: number | null = null;

      if (event.key === "ArrowRight") {
        nextIndex = (currentIndex + 1) % visibleTabs.length;
      } else if (event.key === "ArrowLeft") {
        nextIndex =
          (currentIndex - 1 + visibleTabs.length) % visibleTabs.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = visibleTabs.length - 1;
      }

      if (nextIndex === null) return;

      event.preventDefault();
      const nextTab = visibleTabs[nextIndex];
      const nextButton = event.currentTarget.parentElement?.children[
        nextIndex
      ] as HTMLButtonElement | undefined;
      nextButton?.focus();
      switchAdminSection(nextTab.key);
    },
    [switchAdminSection, visibleTabs]
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

    router.push(clubId ? `/club/${clubId}` : "/");
  }, [clubId, router]);

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
      <div className={`${styles.page} ${styles.loadingPage}`}>
        <div className={styles.loadingCard} role="status">
          <LoaderCircle className={styles.loadingIcon} aria-hidden="true" />
          <p>Loading club administration</p>
        </div>
      </div>
    );
  }

  return (
    <main className={`${styles.page} app-page`}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <button
            type="button"
            onClick={handleBack}
            className={styles.backButton}
            aria-label="Back to club"
          >
            <ArrowLeft aria-hidden="true" size={19} strokeWidth={1.8} />
            <span className={styles.backLabel}>Back</span>
          </button>
          <div className={styles.clubIdentity}>
            <h1>{club?.name || "Club"}</h1>
            <p>Club admin</p>
          </div>
          <span className={styles.headerBalance} aria-hidden="true" />
        </div>
      </header>

      <div className={styles.shell}>
        <section className={styles.pageHeading} aria-labelledby="admin-page-title">
          <div className={styles.pageHeadingCopy}>
            <p>Club controls</p>
            <h2 id="admin-page-title">Administration</h2>
          </div>
          <div className={styles.statusStack} aria-label="Club access status">
            {isTutorialPlayground ? (
              <span className={styles.tutorialStatus}>Tutorial</span>
            ) : null}
            <span className={styles.adminStatus}>Admin only</span>
            <span className={styles.accessStatus}>
              {club?.isPasswordProtected ? "Protected club" : "Open club"}
            </span>
          </div>
        </section>

        {error ? (
          <FlashMessage tone="error" className={styles.flashMessage}>
            {error}
          </FlashMessage>
        ) : null}
        {success ? (
          <FlashMessage tone="success" className={styles.flashMessage}>
            {success}
          </FlashMessage>
        ) : null}

        {isTutorialPlayground ? (
          <div className={styles.tutorialChecklist}>
            <AdminOnboardingChecklist
              progress={adminOnboarding.progress}
              loading={adminOnboarding.loading}
              onDismiss={adminOnboarding.dismiss}
              onReopen={adminOnboarding.reopen}
              onCompleteStep={adminOnboarding.completeStep}
            />
          </div>
        ) : null}

        <nav className={styles.tabSurface} aria-label="Administration sections">
          <div className={styles.tabList} role="tablist">
            {visibleTabs.map((tab, index) => {
              const isActive = activeSection === tab.key;
              const detail = tab.detail({
                players: players.length,
                claims: claimRequests.length,
                links: offlineIdentityLinks.filter(
                  (link) => link.status === "ACCEPTED"
                ).length,
              });

              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => switchAdminSection(tab.key)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                  className={`${styles.tab} ${
                    isActive ? styles.tabActive : ""
                  }`}
                  id={`admin-tab-${tab.key}`}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`admin-panel-${tab.key}`}
                  aria-label={`${tab.label}, ${detail}`}
                  tabIndex={isActive ? 0 : -1}
                  data-tutorial-target={
                    isTutorialPlayground && tab.key === "players"
                      ? "admin-onboarding-players-tab"
                      : isTutorialPlayground && tab.key === "settings"
                        ? "admin-onboarding-settings-tab"
                        : undefined
                  }
                >
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        <section
          className={styles.activePanel}
          id={`admin-panel-${activeSection}`}
          role="tabpanel"
          aria-labelledby={`admin-tab-${activeSection}`}
          tabIndex={0}
        >
          {activeSection === "players" ? (
            <ClubPlayersPanel
              players={players}
              filteredPlayers={filteredPlayers}
              claimedPlayersCount={claimedPlayersCount}
              occasionalPlayersCount={occasionalPlayersCount}
              clubId={clubId}
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
              currentClubId={clubId}
              currentUserId={currentUserId}
              sourcePlaceholderOptions={sourcePlaceholderOptions}
              sourceUserId={linkSourceUserId}
              onSourceUserIdChange={setLinkSourceUserId}
              targetClubSearch={targetClubSearch}
              onTargetClubSearchChange={setTargetClubSearch}
              selectedTargetClub={selectedTargetClub}
              targetClubCandidates={targetClubCandidates}
              loadingTargetClubs={loadingTargetClubs}
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
            <div className={styles.settingsGrid}>
              <ClubSettingsPanel
                isTutorial={isTutorialPlayground}
                clubName={clubNameInput}
                clubAvatarUrl={club?.avatarUrl ?? null}
                onClubNameChange={setClubNameInput}
                clubPassword={clubPasswordInput}
                onClubPasswordChange={setClubPasswordInput}
                passwordProtectionEnabled={clubPasswordProtectionEnabled}
                onPasswordProtectionEnabledChange={
                  setClubPasswordProtectionEnabled
                }
                isPasswordProtected={club?.isPasswordProtected ?? false}
                onUploadAvatar={handleUploadClubAvatar}
                onRemoveAvatar={handleRemoveClubAvatar}
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
        </section>
      </div>

      <CreateClubPlayerModal
        open={isCreatePlayerOpen}
        name={name}
        newPlayerGender={newPlayerGender}
        newPlayerMixedSideOverride={newPlayerMixedSideOverride}
        newPlayerStatus={newPlayerStatus}
        newPlayerNeedsMoreRest={newPlayerNeedsMoreRest}
        newPlayerPreferredPool={newPlayerPreferredPool}
        onNameChange={setName}
        onNewPlayerGenderChange={(value) => {
          setNewPlayerGender(value);
          setNewPlayerMixedSideOverride(null);
        }}
        onNewPlayerMixedSideOverrideChange={setNewPlayerMixedSideOverride}
        onNewPlayerStatusChange={setNewPlayerStatus}
        onNewPlayerNeedsMoreRestChange={setNewPlayerNeedsMoreRest}
        onNewPlayerPreferredPoolChange={setNewPlayerPreferredPool}
        onClose={closeCreatePlayerModal}
        onSubmit={handleAddPlayerWithOnboardingRefresh}
      />

      <ClubPlayerEditorModal
        player={editingPlayer}
        clubId={clubId}
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
