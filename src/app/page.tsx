"use client";

import Link from "next/link";
import Image from "next/image";
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
    dashboardError,
    createClubError,
    joinClubError,
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

        <section className="pc-welcome">
          <div><p className="app-eyebrow">Anti-Selek</p><h1 className="app-title mt-2">Your clubs</h1><p className="mt-3 text-sm text-gray-600">Choose where you play.</p></div>
          <Image src="/play-collective/spark.png" width={100} height={100} alt="" priority />
        </section>
        {!isQuickAccess && <div className="pc-section-actions">
          <button type="button" onClick={openJoinClubModal} className="app-button-primary"><LogIn size={17} aria-hidden="true" />Join Club</button>
          <button type="button" onClick={openCreateClubModal} className="app-button-secondary"><Plus size={17} aria-hidden="true" />Create Club</button>
        </div>}

        {isQuickAccess ? (
          <FlashMessage tone="warning">
            Quick access is view-only and limited to this club profile. You can
            follow tournaments and standings, but you cannot join clubs, submit
            scores, or manage a club. Sign in with an account for full access.
          </FlashMessage>
        ) : null}

        {dashboardError ? (
          <FlashMessage tone="error">{dashboardError}</FlashMessage>
        ) : null}

        <SectionCard title="Clubs">
          {clubs.length === 0 ? <EmptyState title="No clubs yet" detail="Join your group or create a club to start playing." /> : (
            <div className="pc-club-list">{clubs.map((club) => (
              <Link key={club.id} href={`/club/${club.id}`} className="app-subcard pc-club-link">
                <div className="min-w-0"><h3 className="text-lg font-extrabold">{club.name}</h3><p className="mt-1 text-sm text-gray-500">{club.membersCount} members · {club.sessionsCount} sessions</p></div>
                <span className="app-chip app-chip-accent">{club.viewerIsOwner ? "Owner" : getClubRoleLabel(club.role)}</span>
              </Link>
            ))}</div>
          )}
        </SectionCard>
        {!isQuickAccess && (
          <details className="app-panel p-5">
            <summary className="min-h-11 cursor-pointer font-bold">Practice & learn</summary>
            <p className="mb-4 text-sm text-gray-600">A practice space separate from your real clubs.</p>
            <button type="button" onClick={openTutorialPlayground} disabled={openingTutorialPlayground} className="app-button-secondary">
              <Sparkles aria-hidden="true" size={17} />
              {openingTutorialPlayground ? "Opening..." : tutorialPlayground ? "Resume practice" : "Start practice"}
            </button>
          </details>
        )}
      </div>

      <CreateClubModal
        open={isCreateClubOpen}
        clubName={newClubName}
        clubPassword={newClubPassword}
        creatingClub={creatingClub}
        error={createClubError}
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
        error={joinClubError}
        onClubNameChange={setJoinClubName}
        onClubPasswordChange={setJoinClubPassword}
        onClose={closeJoinClubModal}
        onJoinClub={joinClub}
      />
    </main>
  );
}
