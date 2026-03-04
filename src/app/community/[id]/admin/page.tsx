"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

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

  const [community, setCommunity] = useState<Community | null>(null);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [resettingCommunity, setResettingCommunity] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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

    const communitiesRes = await fetch("/api/communities");
    const communitiesData = await safeJson(communitiesRes);
    if (!communitiesRes.ok) {
      throw new Error(communitiesData.error || "Failed to load communities");
    }

    const communityList = Array.isArray(communitiesData) ? (communitiesData as Community[]) : [];
    const currentCommunity = communityList.find((c) => c.id === communityId) || null;
    if (!currentCommunity) {
      throw new Error("Community not found or access denied");
    }
    if (currentCommunity.role !== "ADMIN") {
      router.replace(`/community/${communityId}`);
      throw new Error("Only community admins can access this page");
    }

    const membersRes = await fetch(`/api/communities/${communityId}/members`);
    const membersData = await safeJson(membersRes);
    if (!membersRes.ok) {
      throw new Error(membersData.error || "Failed to load community members");
    }

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
        setSuccess("");
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
      "This will DELETE ALL TOURNAMENTS in this community and reset member ELO to 1000. Type 'RESET' to confirm:"
    );
    if (confirmation !== "RESET") {
      if (confirmation !== null) {
        setError("Reset cancelled. You must type RESET exactly.");
      }
      return;
    }

    setResettingCommunity(true);
    setError("");
    setSuccess("");
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

      setSuccess("Community reset complete.");
      await refreshData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to reset community");
    } finally {
      setResettingCommunity(false);
    }
  };

  const sortedMembers = useMemo(
    () => members.slice().sort((a, b) => b.elo - a.elo || a.name.localeCompare(b.name)),
    [members]
  );

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl font-bold text-gray-900">
              Anti-Selek
            </Link>
            <span className="text-gray-400">|</span>
            <span className="text-lg font-semibold text-blue-600">Admin: {community?.name || "Community"}</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={resetCommunity}
              disabled={resettingCommunity}
              className="text-xs bg-red-50 text-red-600 border border-red-200 px-3 py-1 rounded hover:bg-red-600 hover:text-white transition-all font-bold disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {resettingCommunity ? "Resetting..." : "Reset Community"}
            </button>
            <Link href={`/community/${communityId}`} className="text-sm text-blue-600 hover:underline">
              Back to Community
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded mb-4 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-2 rounded mb-4 text-sm">
            {success}
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b flex justify-between items-center">
            <h2 className="text-lg font-semibold">Community Players</h2>
            <span className="text-xs text-gray-500">{sortedMembers.length} total</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Rank</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Player</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">ELO</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedMembers.map((member, index) => (
                  <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-xs font-bold text-blue-600">#{index + 1}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{member.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{member.email || "No email"}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs font-bold text-gray-700">{member.role}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">{member.elo}</td>
                  </tr>
                ))}
                {sortedMembers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500 italic">
                      No players in this community yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
