"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { LogIn, LogOut, Plus, Settings, Sparkles } from "lucide-react";
import { EmptyState, FlashMessage, SectionCard } from "@/components/ui/chrome";
import { CreateClubModal } from "@/components/dashboard/CreateClubModal";
import { JoinClubModal } from "@/components/dashboard/JoinClubModal";
import { getClubRoleLabel } from "@/lib/clubRoles";
import { useDashboardPage } from "./useDashboardPage";

export default function Home() {
  const {
    status,
    isQuickAccess,
    accountName,
    clubs,
    newClubName,
    setNewClubName,
    newClubPassword,
    setNewClubPassword,
    joinClubName,
    setJoinClubName,
    joinClubPassword,
    setJoinClubPassword,
    isCreateClubOpen,
    isJoinClubOpen,
    creatingClub,
    joiningClub,
    openingTutorialPlayground,
    tutorialPlayground,
    loading,
    error,
    openCreateClubModal,
    closeCreateClubModal,
    openJoinClubModal,
    closeJoinClubModal,
    createClub,
    joinClub,
    openTutorialPlayground,
  } = useDashboardPage();

  if (status === "loading" || loading) {
    return (
      <div className="app-page flex items-center justify-center px-6">
        <div className="app-panel flex flex-col items-center gap-4 px-8 py-8">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="app-eyebrow">Loading dashboard</p>
        </div>
      </div>
    );
  }

  return (
    <main className="app-page">
      <div className="app-shell-narrow space-y-6">
        <div className="flex justify-end">
          <div className="app-panel-soft flex items-center gap-3 px-4 py-3">
            {accountName ? (
              <div className="text-right">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                  Account
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-900">
                  {accountName}
                </p>
              </div>
            ) : null}
            {!isQuickAccess ? (
              <Link
                href="/settings"
                className="app-button-secondary px-4 py-2"
              >
                <Settings aria-hidden="true" size={16} />
                Settings
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => signOut()}
              className="app-button-secondary px-4 py-2"
            >
              <LogOut aria-hidden="true" size={16} />
              Logout
            </button>
          </div>
        </div>

        <section className="app-panel px-5 py-6 sm:px-6">
          <div className="space-y-6 text-center">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <p className="app-eyebrow">Dashboard</p>
              <span className="app-chip app-chip-neutral">
                Club tournaments
              </span>
            </div>
            <div className="space-y-3">
              <h1 className="app-title text-gray-900">Anti-Selek</h1>
            </div>
            {!isQuickAccess ? (
              <div className="flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={openJoinClubModal}
                  className="app-button-secondary"
                >
                  <LogIn aria-hidden="true" size={17} />
                  Join Club
                </button>
                <button
                  type="button"
                  onClick={openCreateClubModal}
                  className="app-button-primary"
                >
                  <Plus aria-hidden="true" size={17} />
                  Create Club
                </button>
              </div>
            ) : null}
          </div>
        </section>

        {!isQuickAccess ? (
          <section className="app-panel p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-teal-200 bg-teal-50 text-teal-700">
                    <Sparkles aria-hidden="true" size={17} />
                  </span>
                  <span className="app-chip app-chip-accent">
                    Tutorial playground
                  </span>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Tutorial playground
                  </h2>
                  <p className="mt-1 text-sm text-gray-600">
                    {tutorialPlayground
                      ? `${tutorialPlayground.playersCount} players, ${tutorialPlayground.courtsCount} courts`
                      : "Practice club"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={openTutorialPlayground}
                disabled={openingTutorialPlayground}
                className="app-button-primary shrink-0 px-4 py-2.5"
              >
                <Sparkles aria-hidden="true" size={17} />
                {openingTutorialPlayground
                  ? "Opening..."
                  : "Open tutorial playground"}
              </button>
            </div>
          </section>
        ) : null}

        {error ? <FlashMessage tone="error">{error}</FlashMessage> : null}

        <SectionCard
          eyebrow="Your spaces"
          title="Clubs"
          action={
            <span className="app-chip app-chip-neutral">
              {clubs.length} listed
            </span>
          }
        >
          {clubs.length === 0 ? (
            <EmptyState
              title="No clubs yet"
            />
          ) : (
            <div className="grid gap-4">
              {clubs.map((club) => (
                <Link
                  key={club.id}
                  href={`/club/${club.id}`}
                  className="app-subcard block p-4 transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {club.name}
                        </h3>
                        <span
                          className={`app-chip ${
                            club.viewerIsOwner
                              ? "app-chip-accent"
                              : club.role === "ADMIN"
                              ? "app-chip-accent"
                              : club.role === "STAFF"
                                ? "app-chip-warning"
                              : "app-chip-neutral"
                          }`}
                        >
                          {club.viewerIsOwner
                            ? "Owner"
                            : getClubRoleLabel(club.role)}
                        </span>
                        {club.isPasswordProtected ? (
                          <span className="app-chip app-chip-warning">
                            Protected
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid shrink-0 grid-cols-2 gap-3 sm:min-w-[12rem]">
                      <div className="app-panel-muted px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                          Members
                        </p>
                        <p className="mt-2 text-lg font-semibold text-gray-900">
                          {club.membersCount}
                        </p>
                      </div>
                      <div className="app-panel-muted px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                          Tournaments
                        </p>
                        <p className="mt-2 text-lg font-semibold text-gray-900">
                          {club.sessionsCount}
                        </p>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <CreateClubModal
        open={isCreateClubOpen}
        clubName={newClubName}
        clubPassword={newClubPassword}
        creatingClub={creatingClub}
        onClubNameChange={setNewClubName}
        onClubPasswordChange={setNewClubPassword}
        onClose={closeCreateClubModal}
        onCreateClub={createClub}
      />

      <JoinClubModal
        open={isJoinClubOpen}
        clubName={joinClubName}
        clubPassword={joinClubPassword}
        joiningClub={joiningClub}
        onClubNameChange={setJoinClubName}
        onClubPasswordChange={setJoinClubPassword}
        onClose={closeJoinClubModal}
        onJoinClub={joinClub}
      />
    </main>
  );
}
