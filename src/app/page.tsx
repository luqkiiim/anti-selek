"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { EmptyState, FlashMessage, SectionCard } from "@/components/ui/chrome";
import { CreateCommunityModal } from "@/components/dashboard/CreateCommunityModal";
import { JoinCommunityModal } from "@/components/dashboard/JoinCommunityModal";
import { useDashboardPage } from "./useDashboardPage";

export default function Home() {
  const {
    status,
    accountName,
    communities,
    newCommunityName,
    setNewCommunityName,
    newCommunityPassword,
    setNewCommunityPassword,
    joinCommunityName,
    setJoinCommunityName,
    joinCommunityPassword,
    setJoinCommunityPassword,
    isCreateCommunityOpen,
    isJoinCommunityOpen,
    creatingCommunity,
    joiningCommunity,
    loading,
    error,
    openCreateCommunityModal,
    closeCreateCommunityModal,
    openJoinCommunityModal,
    closeJoinCommunityModal,
    createCommunity,
    joinCommunity,
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
            <button
              type="button"
              onClick={() => signOut()}
              className="app-button-secondary px-4 py-2"
            >
              Logout
            </button>
          </div>
        </div>

        <section className="app-panel relative overflow-hidden px-5 py-6 sm:px-6">
          <div className="pointer-events-none absolute inset-y-0 right-[-5rem] top-[-2rem] w-64 rounded-full bg-[radial-gradient(circle,_rgba(22,119,242,0.16),_transparent_65%)] blur-2xl" />
          <div className="pointer-events-none absolute bottom-[-4rem] left-[-2rem] h-40 w-40 rounded-full bg-[radial-gradient(circle,_rgba(25,154,97,0.12),_transparent_68%)] blur-2xl" />
          <div className="relative space-y-6 text-center">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <p className="app-eyebrow">Dashboard</p>
              <span className="app-chip app-chip-neutral">
                Community tournaments
              </span>
            </div>
            <div className="space-y-3">
              <h1 className="app-title text-gray-900">Anti-Selek</h1>
              <p className="mx-auto max-w-3xl text-sm text-gray-600 sm:text-base">
                Manage badminton communities, launch tournaments quickly, and
                jump straight back into the sessions you already belong to.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={openJoinCommunityModal}
                className="app-button-secondary"
              >
                Join Community
              </button>
              <button
                type="button"
                onClick={openCreateCommunityModal}
                className="app-button-primary"
              >
                Create Community
              </button>
            </div>
          </div>
        </section>

        {error ? <FlashMessage tone="error">{error}</FlashMessage> : null}

        <SectionCard
          eyebrow="Your spaces"
          title="Communities"
          action={
            <span className="app-chip app-chip-neutral">
              {communities.length} listed
            </span>
          }
        >
          {communities.length === 0 ? (
            <EmptyState
              title="No communities yet"
              detail="Create your first group or join an existing one with its community name and password."
            />
          ) : (
            <div className="grid gap-4">
              {communities.map((community) => (
                <Link
                  key={community.id}
                  href={`/community/${community.id}`}
                  className="app-subcard block p-4 transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {community.name}
                        </h3>
                        <span
                          className={`app-chip ${
                            community.role === "ADMIN"
                              ? "app-chip-accent"
                              : "app-chip-neutral"
                          }`}
                        >
                          {community.role}
                        </span>
                        {community.isPasswordProtected ? (
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
                          {community.membersCount}
                        </p>
                      </div>
                      <div className="app-panel-muted px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                          Tournaments
                        </p>
                        <p className="mt-2 text-lg font-semibold text-gray-900">
                          {community.sessionsCount}
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

      <CreateCommunityModal
        open={isCreateCommunityOpen}
        communityName={newCommunityName}
        communityPassword={newCommunityPassword}
        creatingCommunity={creatingCommunity}
        onCommunityNameChange={setNewCommunityName}
        onCommunityPasswordChange={setNewCommunityPassword}
        onClose={closeCreateCommunityModal}
        onCreateCommunity={createCommunity}
      />

      <JoinCommunityModal
        open={isJoinCommunityOpen}
        communityName={joinCommunityName}
        communityPassword={joinCommunityPassword}
        joiningCommunity={joiningCommunity}
        onCommunityNameChange={setJoinCommunityName}
        onCommunityPasswordChange={setJoinCommunityPassword}
        onClose={closeJoinCommunityModal}
        onJoinCommunity={joinCommunity}
      />
    </main>
  );
}
