"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Player {
  id: string;
  name: string;
  email: string | null;
  elo: number;
  isActive: boolean;
  isClaimed: boolean;
  createdAt: string;
}

export default function AdminPlayersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Helper to safely parse JSON
  const safeJson = async (res: Response) => {
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch (e) {
      return { error: "Invalid server response" };
    }
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/signin");
    } else if (status === "authenticated" && !session?.user?.isAdmin) {
      router.push("/");
    }
  }, [status, session, router]);

  useEffect(() => {
    if (session?.user?.isAdmin) {
      fetchPlayers();
    }
  }, [session]);

  const fetchPlayers = async () => {
    try {
      const res = await fetch("/api/admin/players");
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed to fetch players");
      setPlayers(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load players");
    } finally {
      setLoading(false);
    }
  };

  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/admin/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          name, 
          email: email || undefined, 
          password: password || undefined 
        }),
      });

      const data = await safeJson(res);

      if (!res.ok) {
        throw new Error(data.error || "Failed to add player");
      }

      setSuccess(`Player profile for "${name}" created successfully!`);
      setName("");
      setEmail("");
      setPassword("");
      fetchPlayers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleResetElo = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to reset ${name}'s ELO to 1000?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/players/${id}/reset-elo`, {
        method: "POST",
      });

      const data = await safeJson(res);

      if (!res.ok) {
        throw new Error(data.error || "Failed to reset ELO");
      }

      setSuccess(`${name}'s ELO has been reset to 1000.`);
      fetchPlayers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeletePlayer = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}? This will remove all their match history and session data.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/players/${id}`, {
        method: "DELETE",
      });

      const data = await safeJson(res);

      if (!res.ok) {
        throw new Error(data.error || "Failed to delete player");
      }

      setSuccess(`Player ${name} deleted.`);
      fetchPlayers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleResetCommunity = async () => {
    const confirmation = prompt("This will DELETE ALL SESSIONS and ALL MATCH HISTORY, and reset all ELOs to 1000. This cannot be undone. Type 'RESET' to confirm:");
    
    if (confirmation !== "RESET") {
      if (confirmation !== null) alert("Reset cancelled. You must type RESET exactly.");
      return;
    }

    try {
      const res = await fetch("/api/admin/community/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "RESET" }),
      });

      const data = await safeJson(res);

      if (!res.ok) {
        throw new Error(data.error || "Failed to reset community");
      }

      alert("Community has been fully reset.");
      setSuccess("Community reset successful.");
      fetchPlayers();
    } catch (err: any) {
      setError(err.message);
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
            <span className="text-lg font-semibold text-blue-600">Admin: Players</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={handleResetCommunity}
              className="text-xs bg-red-50 text-red-600 border border-red-200 px-3 py-1 rounded hover:bg-red-600 hover:text-white transition-all font-bold"
            >
              Reset Community
            </button>
            <Link href="/" className="text-sm text-blue-600 hover:underline">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Add Player Form */}
          <div className="md:col-span-1">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Create Player Profile</h2>
              <p className="text-sm text-gray-500 mb-4">
                Create a profile for a player in the community. They can claim it later by signing up with the same name.
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

          {/* Players List */}
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
                      <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {players.map((player) => (
                      <tr key={player.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Link href={`/profile/${player.id}`} className="group block">
                            <div className="text-sm font-bold text-gray-900 group-hover:text-blue-600 group-hover:underline">{player.name}</div>
                            <div className="text-xs text-gray-500 group-hover:text-blue-400">{player.email || "No email"}</div>
                          </Link>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <span className="font-bold">{player.elo}</span>
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
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${player.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {player.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex justify-end gap-3">
                            <button
                              onClick={() => handleResetElo(player.id, player.name)}
                              className="text-orange-600 hover:text-orange-900 text-xs font-bold uppercase"
                              title="Reset ELO to 1000"
                            >
                              Reset ELO
                            </button>
                            {player.id !== session?.user?.id && (
                              <button
                                onClick={() => handleDeletePlayer(player.id, player.name)}
                                className="text-red-600 hover:text-red-900 text-xs font-bold uppercase"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {players.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-gray-500 italic">
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
