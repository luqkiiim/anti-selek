"use client";
import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Plus,
  UsersThree,
  CaretRight,
  UserCircle,
  SignOut,
} from "@phosphor-icons/react";
import { signOut } from "next-auth/react";
import { PlayShell } from "@/components/play/PlayShell";
import { CreateClubModal } from "@/components/dashboard/CreateClubModal";
import { JoinClubModal } from "@/components/dashboard/JoinClubModal";
import { getClubRoleLabel } from "@/lib/clubRoles";
import { useDashboardPage } from "./useDashboardPage";
function Home() {
  const router = useRouter();
  const query = useSearchParams();
  const { data: viewer } = useSession();
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

  useEffect(() => {
    if (
      loading ||
      status !== "authenticated" ||
      query.get("choose") === "1" ||
      !viewer?.user?.id ||
      !clubs.length
    )
      return;
    let remembered: string | null = null;
    try {
      remembered = localStorage.getItem(`pc:last-club:v1:${viewer.user.id}`);
    } catch {}
    const target =
      clubs.find((c) => c.id === remembered) ??
      (clubs.length === 1 ? clubs[0] : null);
    if (target) router.replace(`/club/${target.id}`);
  }, [clubs, loading, query, router, status, viewer?.user?.id]);
  if (status === "loading" || loading)
    return (
      <PlayShell title="Anti-Selek">
        <div className="loading">Loading your clubs...</div>
      </PlayShell>
    );
  return (
    <>
      <PlayShell
        header={
          <>
            <span className="brand">
              Anti-Selek<span>.</span>
            </span>
            <Link
              href="/settings"
              className="icon-button"
              aria-label="Account settings"
            >
              <UserCircle size={29} />
            </Link>
          </>
        }
      >
        <div className="chooser-intro">
          <span className="eyebrow">YOUR CLUBS</span>
          <h1>
            Where are we
            <br />
            playing?
          </h1>
          <p className="quiet">Choose your club to get started.</p>
        </div>
        {isQuickAccess && (
          <p className="quiet">
            Quick access is view-only. You cannot join clubs, submit scores, or
            manage players.
          </p>
        )}
        {dashboardError && (
          <p role="alert" className="error">
            {dashboardError}
          </p>
        )}
        <div className="link-group">
          {clubs.map((club) => (
            <Link className="link-row" key={club.id} href={`/club/${club.id}`}>
              <span className="club-icon">
                <UsersThree size={25} />
              </span>
              <span>
                <strong>{club.name}</strong>
                <small>
                  {club.viewerIsOwner ? "Owner" : getClubRoleLabel(club.role)} ·{" "}
                  {club.membersCount} players
                </small>
              </span>
              <CaretRight size={19} />
            </Link>
          ))}
        </div>
        {clubs.length === 0 && (
          <p className="quiet">
            Your next group starts here. Join a club or create your own.
          </p>
        )}
        {!isQuickAccess && (
          <div className="button-pair">
            <button className="secondary" onClick={openCreateClubModal}>
              <Plus size={19} />
              Create club
            </button>
            <button className="text-button" onClick={openJoinClubModal}>
              Join a club
            </button>
          </div>
        )}
        <details className="practice-options">
          <summary>Practice & account</summary>
          <p className="quiet">{accountName}</p>
          {!isQuickAccess && (
            <button
              className="secondary full"
              onClick={openTutorialPlayground}
              disabled={openingTutorialPlayground}
            >
              {openingTutorialPlayground
                ? "Opening..."
                : tutorialPlayground
                  ? "Resume practice"
                  : "Try a practice club"}
            </button>
          )}
          <button className="text-button" onClick={() => signOut()}>
            <SignOut size={17} />
            Sign out
          </button>
        </details>
      </PlayShell>{" "}
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
    </>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <PlayShell title="Anti-Selek">
          <p>Loading your clubs…</p>
        </PlayShell>
      }
    >
      <Home />
    </Suspense>
  );
}
