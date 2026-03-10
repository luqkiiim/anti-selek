"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

import {
  EmptyState,
  FlashMessage,
  HeroCard,
  ModalFrame,
  SectionCard,
} from "@/components/ui/chrome";

interface Community {
  id: string;
  name: string;
  role: "ADMIN" | "MEMBER";
  isPasswordProtected: boolean;
  membersCount: number;
  sessionsCount: number;
}

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [communities, setCommunities] = useState<Community[]>([]);
  const [newCommunityName, setNewCommunityName] = useState("");
  const [newCommunityPassword, setNewCommunityPassword] = useState("");
  const [joinCommunityName, setJoinCommunityName] = useState("");
  const [joinCommunityPassword, setJoinCommunityPassword] = useState("");
  const [isCreateCommunityOpen, setIsCreateCommunityOpen] = useState(false);
  const [isJoinCommunityOpen, setIsJoinCommunityOpen] = useState(false);
  const [creatingCommunity, setCreatingCommunity] = useState(false);
  const [joiningCommunity, setJoiningCommunity] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const safeJson = useCallback(async (res: Response) => {
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return { error: "Invalid server response" };
    }
  }, []);

  const fetchCommunities = useCallback(async () => {
    const res = await fetch("/api/communities");
    const data = await safeJson(res);
    if (!res.ok) {
      throw new Error(data.error || "Failed to load communities");
    }

    setCommunities(Array.isArray(data) ? (data as Community[]) : []);
  }, [safeJson]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/signin");
      return;
    }

    if (status === "authenticated") {
      (async () => {
        try {
          setError("");
          await fetchCommunities();
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "Failed to load dashboard");
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [status, router, fetchCommunities]);

  const createCommunity = async () => {
    if (!newCommunityName.trim()) return;

    setCreatingCommunity(true);
    setError("");
    try {
      const res = await fetch("/api/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCommunityName,
          password: newCommunityPassword || undefined,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setError(data.error || "Failed to create community");
        return;
      }

      setNewCommunityName("");
      setNewCommunityPassword("");
      setIsCreateCommunityOpen(false);
      await fetchCommunities();

      if (data?.id) {
        router.push(`/community/${data.id}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create community");
    } finally {
      setCreatingCommunity(false);
    }
  };

  const joinCommunity = async () => {
    if (!joinCommunityName.trim()) return;

    setJoiningCommunity(true);
    setError("");
    try {
      const res = await fetch("/api/communities/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: joinCommunityName,
          password: joinCommunityPassword || undefined,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setError(data.error || "Failed to join community");
        return;
      }

      setJoinCommunityName("");
      setJoinCommunityPassword("");
      setIsJoinCommunityOpen(false);
      await fetchCommunities();

      if (data?.id) {
        router.push(`/community/${data.id}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to join community");
    } finally {
      setJoiningCommunity(false);
    }
  };

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
            {session?.user?.name ? (
              <div className="text-right">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                  Account
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-900">
                  {session.user.name}
                </p>
              </div>
            ) : null}
            <button type="button" onClick={() => signOut()} className="app-button-secondary px-4 py-2">
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
              <span className="app-chip app-chip-neutral">Community tournaments</span>
            </div>
            <div className="space-y-3">
              <h1 className="app-title text-gray-900">Anti-Selek</h1>
              <p className="mx-auto max-w-3xl text-sm text-gray-600 sm:text-base">
                Manage badminton communities, launch tournaments quickly, and jump straight back into the sessions you already belong to.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setIsJoinCommunityOpen(true);
                }}
                className="app-button-secondary"
              >
                Join Community
              </button>
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setIsCreateCommunityOpen(true);
                }}
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
          action={<span className="app-chip app-chip-neutral">{communities.length} listed</span>}
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
                        <h3 className="text-lg font-semibold text-gray-900">{community.name}</h3>
                        <span className={`app-chip ${community.role === "ADMIN" ? "app-chip-accent" : "app-chip-neutral"}`}>
                          {community.role}
                        </span>
                        {community.isPasswordProtected ? (
                          <span className="app-chip app-chip-warning">Protected</span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm text-gray-600">
                        {community.membersCount} members, {community.sessionsCount} tournaments.
                      </p>
                    </div>

                    <div className="grid shrink-0 grid-cols-2 gap-3 sm:min-w-[12rem]">
                      <div className="app-panel-muted px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Members</p>
                        <p className="mt-2 text-lg font-semibold text-gray-900">{community.membersCount}</p>
                      </div>
                      <div className="app-panel-muted px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Tournaments</p>
                        <p className="mt-2 text-lg font-semibold text-gray-900">{community.sessionsCount}</p>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {isCreateCommunityOpen ? (
        <ModalFrame
          title="Create community"
          subtitle="Set up a new club space with an optional password."
          onClose={() => setIsCreateCommunityOpen(false)}
          footer={
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setIsCreateCommunityOpen(false)} className="app-button-secondary">
                Cancel
              </button>
              <button
                type="button"
                onClick={createCommunity}
                disabled={creatingCommunity || !newCommunityName.trim()}
                className="app-button-primary"
              >
                {creatingCommunity ? "Creating..." : "Create"}
              </button>
            </div>
          }
        >
          <div className="space-y-4 px-4 py-4 sm:px-5">
            <label className="block space-y-2 text-sm font-medium text-gray-900">
              <span>Community name</span>
              <input
                type="text"
                value={newCommunityName}
                onChange={(e) => setNewCommunityName(e.target.value)}
                placeholder="Unique community name"
                className="field"
              />
            </label>
            <label className="block space-y-2 text-sm font-medium text-gray-900">
              <span>Password</span>
              <input
                type="password"
                value={newCommunityPassword}
                onChange={(e) => setNewCommunityPassword(e.target.value)}
                placeholder="Optional"
                className="field"
              />
            </label>
          </div>
        </ModalFrame>
      ) : null}

      {isJoinCommunityOpen ? (
        <ModalFrame
          title="Join community"
          subtitle="Enter the community name and password if the group is protected."
          onClose={() => setIsJoinCommunityOpen(false)}
          footer={
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setIsJoinCommunityOpen(false)} className="app-button-secondary">
                Cancel
              </button>
              <button
                type="button"
                onClick={joinCommunity}
                disabled={joiningCommunity || !joinCommunityName.trim()}
                className="app-button-dark"
              >
                {joiningCommunity ? "Joining..." : "Join"}
              </button>
            </div>
          }
        >
          <div className="space-y-4 px-4 py-4 sm:px-5">
            <label className="block space-y-2 text-sm font-medium text-gray-900">
              <span>Community name</span>
              <input
                type="text"
                value={joinCommunityName}
                onChange={(e) => setJoinCommunityName(e.target.value)}
                placeholder="Community name"
                className="field"
              />
            </label>
            <label className="block space-y-2 text-sm font-medium text-gray-900">
              <span>Password</span>
              <input
                type="password"
                value={joinCommunityPassword}
                onChange={(e) => setJoinCommunityPassword(e.target.value)}
                placeholder="If required"
                className="field"
              />
            </label>
          </div>
        </ModalFrame>
      ) : null}
    </main>
  );
}
