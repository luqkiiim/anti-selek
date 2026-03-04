"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface User {
  id: string;
  name: string;
  email: string;
  elo: number;
  isAdmin: boolean;
}

interface Community {
  id: string;
  name: string;
  role: "ADMIN" | "MEMBER";
  isPasswordProtected: boolean;
  membersCount: number;
  sessionsCount: number;
}

export default function Home() {
  const { status } = useSession();
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
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

  const fetchUser = useCallback(async () => {
    const res = await fetch("/api/user/me");
    const data = await safeJson(res);
    if (data.user) {
      setUser(data.user as User);
    }
  }, [safeJson]);

  const fetchCommunities = useCallback(async () => {
    const res = await fetch("/api/communities");
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.error || "Failed to load communities");
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
          await fetchUser();
          await fetchCommunities();
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "Failed to load dashboard");
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [status, router, fetchUser, fetchCommunities]);

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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Loading Arena...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 text-white p-2 rounded-xl shadow-blue-200 shadow-lg">
            <span className="text-xl">A</span>
          </div>
          <div>
            <h1 className="text-lg font-black text-gray-900 tracking-tight leading-none">ANTI-SELEK</h1>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Community Tournaments</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {user?.isAdmin && (
            <Link
              href="/admin/players"
              className="text-xs font-black text-gray-400 uppercase tracking-wider hover:text-blue-600 transition-colors hidden sm:block"
            >
              Players
            </Link>
          )}
          <button
            onClick={() => signOut()}
            className="text-xs font-black text-red-500 uppercase tracking-wider active:scale-95 transition-all"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="max-w-md mx-auto px-6 pt-8 space-y-8">
        <div className="bg-white p-6 rounded-3xl shadow-md border border-gray-100 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Communities</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setError("");
                  setIsJoinCommunityOpen(true);
                }}
                className="bg-gray-900 text-white px-3 py-2 rounded-xl font-black uppercase text-[10px] active:scale-95 transition-all shadow-lg"
              >
                Join
              </button>
              <button
                onClick={() => {
                  setError("");
                  setIsCreateCommunityOpen(true);
                }}
                className="bg-blue-600 text-white px-3 py-2 rounded-xl font-black uppercase text-[10px] active:scale-95 transition-all shadow-lg"
              >
                Create
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {!communities.length ? (
              <div className="bg-gray-50 border-2 border-dashed border-gray-100 rounded-2xl p-4 text-center">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">No communities yet</p>
              </div>
            ) : (
              communities.map((c) => (
                <Link
                  key={c.id}
                  href={`/community/${c.id}`}
                  className="block rounded-2xl p-4 border-2 border-gray-100 bg-gray-50 transition-all hover:border-blue-500 hover:bg-blue-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-gray-900">{c.name}</p>
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                        {c.membersCount} Members - {c.sessionsCount} Tournaments
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black uppercase tracking-wider text-blue-600">{c.role}</p>
                      {c.isPasswordProtected && (
                        <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Protected</p>
                      )}
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      {isCreateCommunityOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => setIsCreateCommunityOpen(false)}></div>
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-gray-100 p-6 space-y-3">
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Create Community</h3>
            <input
              type="text"
              value={newCommunityName}
              onChange={(e) => setNewCommunityName(e.target.value)}
              placeholder="Unique Community Name"
              className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 font-bold focus:outline-none focus:border-blue-500 transition-all"
            />
            <input
              type="password"
              value={newCommunityPassword}
              onChange={(e) => setNewCommunityPassword(e.target.value)}
              placeholder="Optional Password"
              className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 font-bold focus:outline-none focus:border-blue-500 transition-all"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setIsCreateCommunityOpen(false)}
                className="flex-1 bg-gray-100 text-gray-700 px-4 py-3 rounded-2xl font-black uppercase text-xs active:scale-95 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={createCommunity}
                disabled={creatingCommunity || !newCommunityName.trim()}
                className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-2xl font-black uppercase text-xs active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingCommunity ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isJoinCommunityOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => setIsJoinCommunityOpen(false)}></div>
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-gray-100 p-6 space-y-3">
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Join Community</h3>
            <input
              type="text"
              value={joinCommunityName}
              onChange={(e) => setJoinCommunityName(e.target.value)}
              placeholder="Community Name"
              className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 font-bold focus:outline-none focus:border-blue-500 transition-all"
            />
            <input
              type="password"
              value={joinCommunityPassword}
              onChange={(e) => setJoinCommunityPassword(e.target.value)}
              placeholder="Password (if required)"
              className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 font-bold focus:outline-none focus:border-blue-500 transition-all"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setIsJoinCommunityOpen(false)}
                className="flex-1 bg-gray-100 text-gray-700 px-4 py-3 rounded-2xl font-black uppercase text-xs active:scale-95 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={joinCommunity}
                disabled={joiningCommunity || !joinCommunityName.trim()}
                className="flex-1 bg-gray-900 text-white px-4 py-3 rounded-2xl font-black uppercase text-xs active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {joiningCommunity ? "Joining..." : "Join"}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="fixed bottom-6 left-6 right-6 z-50">
          <div className="bg-red-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex justify-between items-center">
            <p className="text-xs font-black uppercase tracking-wide">{error}</p>
            <button onClick={() => setError("")} className="font-black">
              x
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
