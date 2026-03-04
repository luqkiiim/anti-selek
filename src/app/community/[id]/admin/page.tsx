"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
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

interface CommunityMember {
  id: string;
  name: string;
  email?: string | null;
  elo: number;
  role: "ADMIN" | "MEMBER";
}

export default function CommunityAdminPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const communityId = typeof params.id === "string" ? params.id : "";

  const [user, setUser] = useState<User | null>(null);
  const [community, setCommunity] = useState<Community | null>(null);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [resettingCommunity, setResettingCommunity] = useState(false);
  const [error, setError] = useState("");

  const safeJson = useCallback(async (res: Response) => {
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return { error: "Invalid server response" };
    }
  }, []);

  const refreshData = useCallback(async () => {
    if (!communityId) return;

    const [meRes, communitiesRes] = await Promise.all([fetch("/api/user/me"), fetch("/api/communities")]);
    const [meData, communitiesData] = await Promise.all([safeJson(meRes), safeJson(communitiesRes)]);

    if (!meRes.ok || !meData.user) {
      throw new Error(meData.error || "Failed to load user");
    }
    if (!communitiesRes.ok) {
      throw new Error(communitiesData.error || "Failed to load communities");
    }

    const me = meData.user as User;
    const list = Array.isArray(communitiesData) ? (communitiesData as Community[]) : [];
    const currentCommunity = list.find((c) => c.id === communityId) || null;
    if (!currentCommunity) {
      throw new Error("Community not found or access denied");
    }

    const canManage = me.isAdmin || currentCommunity.role === "ADMIN";
    if (!canManage) {
      router.replace(`/community/${communityId}`);
      throw new Error("Only community admins can access this page");
    }

    const membersRes = await fetch(`/api/communities/${communityId}/members`);
    const membersData = await safeJson(membersRes);
    if (!membersRes.ok) {
      throw new Error(membersData.error || "Failed to load community members");
    }

    setUser(me);
    setCommunity(currentCommunity);
    setMembers(Array.isArray(membersData) ? membersData : []);
  }, [communityId, router, safeJson]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/signin");
      return;
    }

    if (status !== "authenticated" || !communityId) return;

    (async () => {
      try {
        setLoading(true);
        setError("");
        await refreshData();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load admin page");
      } finally {
        setLoading(false);
      }
    })();
  }, [status, router, communityId, refreshData]);

  const resetCommunity = async () => {
    const confirmation = prompt(
      "This will DELETE ALL TOURNAMENTS in this community and reset ELO for its members to 1000. Type 'RESET' to confirm:"
    );
    if (confirmation !== "RESET") {
      if (confirmation !== null) {
        setError("Reset cancelled. You must type RESET exactly.");
      }
      return;
    }

    setResettingCommunity(true);
    setError("");
    try {
      const res = await fetch(`/api/communities/${communityId}/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "RESET" }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setError(data.error || "Failed to reset community");
        return;
      }

      await refreshData();
      alert("Community reset complete.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to reset community");
    } finally {
      setResettingCommunity(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Loading Admin...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <Link
            href={`/community/${communityId}`}
            className="text-[10px] font-black text-gray-500 uppercase tracking-widest border border-gray-200 rounded-xl px-3 py-2 hover:text-blue-600 hover:border-blue-300 transition-colors"
          >
            Back
          </Link>
          <div>
            <h1 className="text-lg font-black text-gray-900 tracking-tight leading-none">Community Admin</h1>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
              {community?.name || "Community"}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-6 pt-8 space-y-8">
        <div className="bg-white p-6 rounded-3xl shadow-md border border-red-200 space-y-3">
          <h3 className="text-sm font-black text-red-600 uppercase tracking-widest">Reset Community</h3>
          <p className="text-[10px] text-red-500 font-bold uppercase tracking-wider">
            Delete all tournaments in this community and reset member ELO to 1000.
          </p>
          <button
            onClick={resetCommunity}
            disabled={resettingCommunity}
            className="w-full bg-red-600 text-white px-6 py-3 rounded-2xl font-black uppercase text-xs active:scale-95 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {resettingCommunity ? "Resetting..." : "Reset Community"}
          </button>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-md border border-gray-100 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Players</h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{members.length} total</p>
          </div>

          <div className="space-y-2">
            {members.length === 0 ? (
              <div className="bg-gray-50 border-2 border-dashed border-gray-100 rounded-2xl p-4 text-center">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">No players yet</p>
              </div>
            ) : (
              members
                .slice()
                .sort((a, b) => b.elo - a.elo || a.name.localeCompare(b.name))
                .map((member, index) => (
                  <div
                    key={member.id}
                    className="bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 flex items-center justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-black text-gray-900 truncate">
                        #{index + 1} {member.name}
                      </p>
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider truncate">
                        {member.email || "No email"} - {member.role}
                      </p>
                    </div>
                    <p className="text-sm font-black text-gray-900">{member.elo}</p>
                  </div>
                ))
            )}
          </div>
        </div>

        {user?.isAdmin && (
          <Link
            href="/admin/players"
            className="block text-center bg-gray-900 text-white px-6 py-3 rounded-2xl font-black uppercase text-xs active:scale-95 transition-all shadow-lg"
          >
            Open Global Player Admin
          </Link>
        )}
      </div>

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
