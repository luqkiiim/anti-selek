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
  type: string;
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
  const [sessionType, setSessionType] = useState("POINTS");
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
          type: sessionType,
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

  const selectAllPlayers = () => {
    if (selectedPlayerIds.length === allPlayers.length) {
      setSelectedPlayerIds([]);
    } else {
      setSelectedPlayerIds(allPlayers.map(p => p.id));
    }
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
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 mb-6">
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-widest mb-4">Create New Session</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Session Name</label>
                <input
                  type="text"
                  placeholder="e.g., Friday Social"
                  value={newSessionName}
                  onChange={(e) => setNewSessionName(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-100 rounded-xl focus:outline-none focus:border-blue-500 font-bold transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Ranking System</label>
                <div className="flex gap-2 p-1.5 bg-gray-50 rounded-xl border-2 border-gray-100">
                  <button
                    onClick={() => setSessionType("POINTS")}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                      sessionType === "POINTS" 
                        ? "bg-white text-blue-600 shadow-sm border border-gray-100" 
                        : "text-gray-400 hover:text-gray-600"
                    }`}
                  >
                    Points Based
                  </button>
                  <button
                    onClick={() => setSessionType("ELO")}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                      sessionType === "ELO" 
                        ? "bg-white text-purple-600 shadow-sm border border-gray-100" 
                        : "text-gray-400 hover:text-gray-600"
                    }`}
                  >
                    ELO Based
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={createSession}
              disabled={!newSessionName.trim()}
              className="w-full bg-gray-900 text-white py-4 rounded-xl font-black uppercase tracking-widest text-sm shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100 mb-6"
            >
              Start Session
            </button>
            
            {allPlayers.length > 0 && (
              <div>
                <div className="flex justify-between items-center mb-2">
                  <p className="text-sm font-medium text-gray-700">Pre-add players from community:</p>
                  <button
                    onClick={selectAllPlayers}
                    className="text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    {selectedPlayerIds.length === allPlayers.length && allPlayers.length > 0 ? "Deselect All" : "Select All"}
                  </button>
                </div>
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
                  className="flex justify-between items-center p-4 border border-gray-100 rounded-2xl hover:bg-gray-50 transition-colors group"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-black text-gray-900">{s.name}</p>
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${
                        s.type === 'ELO' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {s.type || 'POINTS'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">
                      Code: <span className="text-gray-900">{s.code}</span> • {s.status} • {s.players.length} Players
                    </p>
                  </div>
                  <button
                    onClick={() => router.push(`/session/${s.code}`)}
                    className="bg-white text-gray-900 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider border-2 border-gray-100 shadow-sm group-hover:bg-gray-900 group-hover:text-white group-hover:border-gray-900 transition-all active:scale-95"
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
