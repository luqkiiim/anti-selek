"use client";

import { useEffect, useState } from "react";
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

interface Session {
  id: string;
  code: string;
  name: string;
  status: string;
  createdAt: string;
  players: { user: { id: string; name: string } }[];
}

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [allPlayers, setAllPlayers] = useState<User[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [joinCode, setJoinCode] = useState("");
  const [newSessionName, setNewSessionName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user?.id) {
      fetchData();
    }
  }, [session]);

  const fetchData = async () => {
    try {
      const [userRes, sessionsRes] = await Promise.all([
        fetch("/api/user/me"),
        fetch("/api/sessions"),
      ]);
      
      const userData = await safeJson(userRes);
      const sessionsData = await safeJson(sessionsRes);
      
      setUser(userData);
      setSessions(Array.isArray(sessionsData) ? sessionsData : []);

      if (userData.isAdmin) {
        const playersRes = await fetch("/api/admin/players");
        if (playersRes.ok) {
          const playersData = await safeJson(playersRes);
          if (Array.isArray(playersData)) {
            setAllPlayers(playersData.filter((p: User) => p.id !== userData.id));
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const createSession = async () => {
    if (!newSessionName.trim()) return;
    setError("");
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          name: newSessionName,
          playerIds: selectedPlayerIds
        }),
      });
      
      const data = await safeJson(res);
      
      if (!res.ok) {
        setError(data.error || "Failed to create session");
        return;
      }
      
      setNewSessionName("");
      setSelectedPlayerIds([]);
      router.push(`/session/${data.code}`);
    } catch {
      setError("Failed to create session");
    }
  };

  const togglePlayerSelection = (id: string) => {
    setSelectedPlayerIds(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const joinSession = async () => {
    if (!joinCode.trim()) return;
    setError("");
    try {
      const res = await fetch(`/api/sessions/${joinCode.toUpperCase()}/join`, {
        method: "POST",
      });
      
      const data = await safeJson(res);
      
      if (!res.ok) {
        setError(data.error || "Failed to join session");
        return;
      }
      
      setJoinCode("");
      router.push(`/session/${joinCode.toUpperCase()}`);
    } catch {
      setError("Failed to join session");
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
          <h1 className="text-xl font-bold text-gray-900">Anti-Selek</h1>
          <div className="flex items-center gap-4">
            {user?.isAdmin && (
              <Link href="/admin/players" className="text-sm text-blue-600 hover:underline">
                Manage Players
              </Link>
            )}
            <span className="text-sm text-gray-600">
              {user?.name} (ELO: {user?.elo})
            </span>
            <button
              onClick={() => signOut({ callbackUrl: "/signin" })}
              className="text-sm text-red-600 hover:underline"
            >
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* Create Session */}
        {user?.isAdmin && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Create New Session</h2>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="Session name"
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                onClick={createSession}
                className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 font-medium"
              >
                Create
              </button>
            </div>
            
            {allPlayers.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Pre-add players from community:</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-3 border rounded-md bg-gray-50">
                  {allPlayers.map(player => (
                    <label key={player.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white p-1 rounded transition-colors border border-transparent hover:border-gray-200">
                      <input 
                        type="checkbox"
                        checked={selectedPlayerIds.includes(player.id)}
                        onChange={() => togglePlayerSelection(player.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                      />
                      <span className="truncate font-medium text-gray-700">{player.name}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {selectedPlayerIds.length} players selected (plus you)
                </p>
              </div>
            )}
          </div>
        )}

        {/* Join Session */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Join Session</h2>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Session code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
            />
            <button
              onClick={joinSession}
              className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
            >
              Join
            </button>
          </div>
        </div>

        {/* Sessions List */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Sessions</h2>
          {sessions.length === 0 ? (
            <p className="text-gray-500">No sessions yet</p>
          ) : (
            <div className="space-y-2">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className="flex justify-between items-center p-3 border rounded hover:bg-gray-50"
                >
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-sm text-gray-500">
                      Code: {s.code} • {s.status} • {s.players.length} players
                    </p>
                  </div>
                  <button
                    onClick={() => router.push(`/session/${s.code}`)}
                    className="text-blue-600 hover:underline"
                  >
                    Enter
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
