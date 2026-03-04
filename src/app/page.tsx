"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SessionStatus, SessionType } from "@/types/enums";

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
  const [sessionType, setSessionType] = useState<SessionType>(SessionType.POINTS);
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
    } else if (status === "authenticated") {
      fetchUser();
      fetchSessions();
      fetchAllPlayers();
    }
  }, [status, router]);

  const fetchUser = async () => {
    const res = await fetch("/api/user/me");
    const data = await safeJson(res);
    if (data.user) setUser(data.user);
  };

  const fetchSessions = async () => {
    const res = await fetch("/api/sessions");
    const data = await safeJson(res);
    if (Array.isArray(data)) setSessions(data);
    setLoading(false);
  };

  const fetchAllPlayers = async () => {
    const res = await fetch("/api/admin/players");
    const data = await safeJson(res);
    if (Array.isArray(data)) setAllPlayers(data);
  };

  const createSession = async () => {
    if (!newSessionName) return;
    setError("");
    const res = await fetch("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ 
        name: newSessionName, 
        type: sessionType,
        playerIds: selectedPlayerIds 
      }),
    });
    const data = await safeJson(res);
    if (data.code) {
      router.push(`/session/${data.code}`);
    } else {
      setError(data.error || "Failed to create session");
    }
  };

  const joinSession = async () => {
    if (!joinCode) return;
    setError("");
    const res = await fetch(`/api/sessions/${joinCode.toUpperCase()}/join`, {
      method: "POST",
    });
    const data = await safeJson(res);
    if (data.code) {
      router.push(`/session/${data.code}`);
    } else {
      setError(data.error || "Failed to join session");
    }
  };

  const togglePlayerSelection = (playerId: string) => {
    setSelectedPlayerIds(prev => 
      prev.includes(playerId) 
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    );
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
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 text-white p-2 rounded-xl shadow-blue-200 shadow-lg">
            <span className="text-xl">🏸</span>
          </div>
          <div>
            <h1 className="text-lg font-black text-gray-900 tracking-tight leading-none">MEXICANO</h1>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Badminton Manager</p>
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
        {/* User Welcome */}
        <div className="flex items-center gap-4 bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
          <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-xl font-black text-blue-600">
            {user?.name?.[0].toUpperCase()}
          </div>
          <div>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Welcome back</p>
            <h2 className="text-lg font-black text-gray-900 leading-tight">{user?.name}</h2>
          </div>
        </div>

        {/* Join Session */}
        <div className="bg-white p-6 rounded-3xl shadow-md border border-gray-100 space-y-4">
          <div>
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-1">Enter Arena</h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Got a code? Join the match now.</p>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="CODE"
              className="flex-1 bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 font-black text-center tracking-widest focus:outline-none focus:border-blue-500 transition-all uppercase"
            />
            <button
              onClick={joinSession}
              className="bg-gray-900 text-white px-6 rounded-2xl font-black uppercase text-xs active:scale-95 transition-all shadow-lg"
            >
              Join
            </button>
          </div>
        </div>

        {/* Create Session (Admin Only) */}
        {user?.isAdmin && (
          <div className="bg-blue-600 p-6 rounded-3xl shadow-xl shadow-blue-100 space-y-5 text-white">
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest mb-1">Host Tournament</h3>
              <p className="text-[10px] text-blue-100 font-bold uppercase tracking-wider">Start a new rolling Mexicano session</p>
            </div>
            
            <div className="space-y-3">
              <input
                type="text"
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                placeholder="Session Name"
                className="w-full bg-blue-500/50 border-2 border-blue-400/30 rounded-2xl px-4 py-3 placeholder:text-blue-200 font-bold focus:outline-none focus:border-white transition-all"
              />
              
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setSessionType(SessionType.POINTS)}
                  className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    sessionType === SessionType.POINTS ? 'bg-white text-blue-600 shadow-md' : 'bg-blue-500/30 text-white'
                  }`}
                >
                  Points Format
                </button>
                <button
                  onClick={() => setSessionType(SessionType.ELO)}
                  className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    sessionType === SessionType.ELO ? 'bg-white text-blue-600 shadow-md' : 'bg-blue-500/30 text-white'
                  }`}
                >
                  ELO Format
                </button>
              </div>

              {/* Player Selection for New Session */}
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-100">Quick-Add Players</p>
                <div className="max-h-40 overflow-y-auto pr-2 space-y-1 custom-scrollbar">
                  {allPlayers.filter(p => p.id !== user.id).map(player => (
                    <button
                      key={player.id}
                      onClick={() => togglePlayerSelection(player.id)}
                      className={`w-full flex justify-between items-center px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                        selectedPlayerIds.includes(player.id) ? 'bg-white/20 border-white/40' : 'bg-blue-700/30 border-transparent'
                      } border`}
                    >
                      <span>{player.name}</span>
                      {selectedPlayerIds.includes(player.id) && <span>✓</span>}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={createSession}
                className="w-full bg-white text-blue-600 py-4 rounded-2xl font-black uppercase tracking-widest text-xs active:scale-95 transition-all shadow-lg mt-2"
              >
                Create Session
              </button>
            </div>
          </div>
        )}

        {/* Sessions List */}
        <div className="space-y-4 pb-10">
          <div className="flex justify-between items-end px-2">
            <div>
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-0.5">Active Arenas</h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Your recent tournaments</p>
            </div>
          </div>
          
          <div className="space-y-3">
            {sessions.length === 0 ? (
              <div className="bg-white p-10 rounded-3xl border-2 border-dashed border-gray-100 text-center">
                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">No active sessions</p>
              </div>
            ) : (
              sessions.map((s) => (
                <Link
                  key={s.id}
                  href={`/session/${s.code}`}
                  className="block bg-white p-5 rounded-3xl shadow-sm border border-gray-100 active:scale-95 active:bg-gray-50 transition-all group"
                >
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-black text-gray-900 group-hover:text-blue-600 transition-colors">{s.name}</h4>
                    <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg uppercase tracking-widest">{s.code}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                      {s.players.length} Players • {s.type}
                    </p>
                    <div className={`w-2 h-2 rounded-full ${s.status === SessionStatus.ACTIVE ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}></div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Error Toast */}
      {error && (
        <div className="fixed bottom-6 left-6 right-6 z-50">
          <div className="bg-red-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex justify-between items-center">
            <p className="text-xs font-black uppercase tracking-wide">{error}</p>
            <button onClick={() => setError("")} className="font-black">×</button>
          </div>
        </div>
      )}
    </main>
  );
}
