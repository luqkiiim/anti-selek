"use client";

import { useCallback, useEffect, useState } from "react";
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

interface Player {
  id: string;
  name: string;
  email: string | null;
  elo: number;
  isActive: boolean;
  isClaimed: boolean;
  role: "ADMIN" | "MEMBER";
  createdAt: string;
}

export default function CommunityAdminPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const communityId = typeof params.id === "string" ? params.id : "";

  const [community, setCommunity] = useState<Community | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [editingName, setEditingName] = useState<Record<string, string>>({});
  const [savingName, setSavingName] = useState<Record<string, boolean>>({});
  const [editingElo, setEditingElo] = useState<Record<string, string>>({});
  const [savingElo, setSavingElo] = useState<Record<string, boolean>>({});
  const [resettingCommunity, setResettingCommunity] = useState(false);
  const [deletingCommunity, setDeletingCommunity] = useState(false);

  const safeJson = async (res: Response) => {
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return { error: "Invalid server response" };
    }
  };

  const fetchCommunityAndPlayers = useCallback(async () => {
    if (!communityId) return;

    const communitiesRes = await fetch("/api/communities");
    const communitiesData = await safeJson(communitiesRes);
    if (!communitiesRes.ok) {
      throw new Error(communitiesData.error || "Failed to load communities");
    }

    const list = Array.isArray(communitiesData) ? (communitiesData as Community[]) : [];
    const currentCommunity = list.find((c) => c.id === communityId) || null;
    if (!currentCommunity) {
      throw new Error("Community not found or access denied");
    }
    if (currentCommunity.role !== "ADMIN") {
      router.replace(`/community/${communityId}`);
      throw new Error("Only community admins can access this page");
    }
    setCommunity(currentCommunity);

    const playersRes = await fetch(`/api/communities/${communityId}/members`);
    const playersData = await safeJson(playersRes);
    if (!playersRes.ok) {
      throw new Error(playersData.error || "Failed to load players");
    }
    setPlayers(Array.isArray(playersData) ? playersData : []);
  }, [communityId, router]);

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
        await fetchCommunityAndPlayers();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load admin page");
      } finally {
        setLoading(false);
      }
    })();
  }, [status, router, communityId, fetchCommunityAndPlayers]);

  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/communities/${communityId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email: email || undefined,
          password: password || undefined,
        }),
      });

      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to add player");
      }

      setSuccess(`Player profile for "${name}" added to community.`);
      setName("");
      setEmail("");
      setPassword("");
      await fetchCommunityAndPlayers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add player");
    }
  };

  const handleEloChange = (id: string, value: string) => {
    setEditingElo((prev) => ({ ...prev, [id]: value }));
  };

  const handleNameChange = (id: string, value: string) => {
    setEditingName((prev) => ({ ...prev, [id]: value }));
  };

  const handleUpdateName = async (id: string, currentName: string) => {
    const nextNameRaw = editingName[id];
    if (nextNameRaw === undefined) return;

    const nextName = nextNameRaw.trim();
    if (!nextName || nextName === currentName) {
      setEditingName((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }

    setSavingName((prev) => ({ ...prev, [id]: true }));
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/communities/${communityId}/members/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to update player name");
      }

      setSuccess(`Player name updated to "${nextName}".`);
      setEditingName((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await fetchCommunityAndPlayers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update player name");
    } finally {
      setSavingName((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleUpdateElo = async (id: string, playerName: string) => {
    const newElo = editingElo[id];
    if (!newElo || isNaN(parseInt(newElo, 10))) return;

    setSavingElo((prev) => ({ ...prev, [id]: true }));
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/communities/${communityId}/members/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ elo: parseInt(newElo, 10) }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to update ELO");
      }

      setSuccess(`${playerName}'s ELO updated to ${newElo}.`);
      setEditingElo((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await fetchCommunityAndPlayers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update ELO");
    } finally {
      setSavingElo((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleRemovePlayer = async (id: string, playerName: string) => {
    if (!confirm(`Remove ${playerName} from this community?`)) {
      return;
    }

    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/communities/${communityId}/members/${id}`, {
        method: "DELETE",
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to remove player");
      }

      setSuccess(`${playerName} removed from community.`);
      await fetchCommunityAndPlayers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to remove player");
    }
  };

  const handleResetCommunity = async () => {
    const confirmation = prompt(
      "This will DELETE ALL TOURNAMENTS in this community and reset member ELO to 1000. Type 'RESET' to confirm:"
    );
    if (confirmation !== "RESET") {
      if (confirmation !== null) {
        alert("Reset cancelled. You must type RESET exactly.");
      }
      return;
    }

    setError("");
    setSuccess("");
    setResettingCommunity(true);

    try {
      const res = await fetch(`/api/communities/${communityId}/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "RESET" }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to reset community");
      }

      setSuccess("Community reset successful.");
      await fetchCommunityAndPlayers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to reset community");
    } finally {
      setResettingCommunity(false);
    }
  };

  const handleDeleteCommunity = async () => {
    const confirmation = prompt(
      "This will permanently DELETE this community and all related data. Type 'DELETE' to confirm:"
    );
    if (confirmation !== "DELETE") {
      if (confirmation !== null) {
        alert("Delete cancelled. You must type DELETE exactly.");
      }
      return;
    }

    setError("");
    setSuccess("");
    setDeletingCommunity(true);

    try {
      const res = await fetch(`/api/communities/${communityId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE" }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete community");
      }

      router.push("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete community");
    } finally {
      setDeletingCommunity(false);
    }
  };

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
              onClick={handleResetCommunity}
              disabled={resettingCommunity || deletingCommunity}
              className="text-xs bg-red-50 text-red-600 border border-red-200 px-3 py-1 rounded hover:bg-red-600 hover:text-white transition-all font-bold disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {resettingCommunity ? "Resetting..." : "Reset Community"}
            </button>
            <button
              onClick={handleDeleteCommunity}
              disabled={deletingCommunity || resettingCommunity}
              className="text-xs bg-red-600 text-white border border-red-700 px-3 py-1 rounded hover:bg-red-700 transition-all font-bold disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {deletingCommunity ? "Deleting..." : "Delete Community"}
            </button>
            <Link href={`/community/${communityId}`} className="text-sm text-blue-600 hover:underline">
              Back to Community
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-1">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Create Player Profile</h2>
              <p className="text-sm text-gray-500 mb-4">
                Add a player to this community. They can sign up later and join with the same email.
              </p>
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
              <form onSubmit={handleAddPlayer} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g. Juan Perez"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email (optional)</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Leave empty if unclaimed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Password (optional)</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
                >
                  Create Profile
                </button>
              </form>
            </div>
          </div>

          <div className="md:col-span-2">
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 border-b flex justify-between items-center">
                <h2 className="text-lg font-semibold">Community Players</h2>
                <span className="text-xs text-gray-500">{players.length} total</span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Player</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">ELO</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Claimed</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Role</th>
                      <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {players
                      .slice()
                      .sort((a, b) => b.elo - a.elo || a.name.localeCompare(b.name))
                      .map((player) => (
                        <tr key={player.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  className="w-44 px-2 py-1 text-sm font-bold border rounded bg-gray-50 focus:bg-white focus:outline-none focus:border-blue-500"
                                  value={editingName[player.id] !== undefined ? editingName[player.id] : player.name}
                                  onChange={(e) => handleNameChange(player.id, e.target.value)}
                                />
                                {editingName[player.id] !== undefined &&
                                  editingName[player.id].trim() !== player.name && (
                                    <button
                                      onClick={() => handleUpdateName(player.id, player.name)}
                                      disabled={savingName[player.id]}
                                      className="text-[10px] bg-blue-600 text-white px-2 py-1 rounded font-black uppercase tracking-tighter hover:bg-blue-700 disabled:opacity-50"
                                    >
                                      {savingName[player.id] ? "..." : "Save"}
                                    </button>
                                  )}
                              </div>
                              <div className="text-xs text-gray-500">{player.email || "No email"}</div>
                              <Link href={`/profile/${player.id}?communityId=${communityId}`} className="text-[11px] text-blue-600 hover:underline">
                                View profile
                              </Link>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                className="w-20 px-2 py-1 text-xs font-bold border rounded bg-gray-50 focus:bg-white focus:outline-none focus:border-blue-500"
                                value={editingElo[player.id] !== undefined ? editingElo[player.id] : player.elo}
                                onChange={(e) => handleEloChange(player.id, e.target.value)}
                              />
                              {editingElo[player.id] !== undefined && (
                                <button
                                  onClick={() => handleUpdateElo(player.id, player.name)}
                                  disabled={savingElo[player.id]}
                                  className="text-[10px] bg-blue-600 text-white px-2 py-1 rounded font-black uppercase tracking-tighter hover:bg-blue-700 disabled:opacity-50"
                                >
                                  {savingElo[player.id] ? "..." : "Save"}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {player.isClaimed ? (
                              <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                                Claimed
                              </span>
                            ) : (
                              <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                                Unclaimed
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                player.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                              }`}
                            >
                              {player.isActive ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs font-bold text-gray-700">
                            {player.role}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex justify-end gap-3">
                              <button
                                onClick={() => handleRemovePlayer(player.id, player.name)}
                                className="text-red-600 hover:text-red-900 text-xs font-bold uppercase"
                              >
                                Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    {players.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-gray-500 italic">
                          No players in the community yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
