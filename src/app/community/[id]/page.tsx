"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { SessionStatus, SessionType } from "@/types/enums";

interface User {
  id: string;
  name: string;
  email: string;
  elo: number;
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
  wins: number;
  losses: number;
  role: "ADMIN" | "MEMBER";
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

export default function CommunityPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const communityId = typeof params.id === "string" ? params.id : "";

  const [user, setUser] = useState<User | null>(null);
  const [community, setCommunity] = useState<Community | null>(null);
  const [communityMembers, setCommunityMembers] = useState<CommunityMember[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);

  const [newSessionName, setNewSessionName] = useState("");
  const [sessionType, setSessionType] = useState<SessionType>(SessionType.POINTS);
  const [courtCount, setCourtCount] = useState(3);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [existingPlayerEmail, setExistingPlayerEmail] = useState("");
  const [showAddPlayerCard, setShowAddPlayerCard] = useState(false);

  const [loading, setLoading] = useState(true);
  const [creatingSession, setCreatingSession] = useState(false);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [showHostPanel, setShowHostPanel] = useState(false);
  const [error, setError] = useState("");

  const safeJson = async (res: Response) => {
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return { error: "Invalid server response" };
    }
  };

  const leaderboard = useMemo(
    () =>
      [...communityMembers].sort((a, b) => {
        if (b.elo !== a.elo) return b.elo - a.elo;
        return a.name.localeCompare(b.name);
      }),
    [communityMembers]
  );

  const activeTournaments = useMemo(
    () => sessions.filter((s) => s.status !== SessionStatus.COMPLETED),
    [sessions]
  );

  const pastTournaments = useMemo(
    () => sessions.filter((s) => s.status === SessionStatus.COMPLETED),
    [sessions]
  );

  const canManageCommunity = !!community && community.role === "ADMIN";

  useEffect(() => {
    setSelectedPlayerIds([]);
  }, [communityId]);

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

        const meRes = await fetch("/api/user/me");
        const meData = await safeJson(meRes);
        if (!meRes.ok || !meData.user) {
          throw new Error(meData.error || "Failed to load user");
        }
        setUser(meData.user as User);

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
        setCommunity(currentCommunity);

        const [membersRes, sessionsRes] = await Promise.all([
          fetch(`/api/communities/${communityId}/members`),
          fetch(`/api/sessions?communityId=${encodeURIComponent(communityId)}`),
        ]);
        const [membersData, sessionsData] = await Promise.all([safeJson(membersRes), safeJson(sessionsRes)]);

        if (!membersRes.ok) {
          throw new Error(membersData.error || "Failed to load community members");
        }
        if (!sessionsRes.ok) {
          throw new Error(sessionsData.error || "Failed to load tournaments");
        }

        setCommunityMembers(Array.isArray(membersData) ? membersData : []);
        setSessions(Array.isArray(sessionsData) ? sessionsData : []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load community");
      } finally {
        setLoading(false);
      }
    })();
  }, [status, router, communityId]);

  const refreshCommunityData = async () => {
    if (!communityId) return;

    const [membersRes, sessionsRes, communitiesRes] = await Promise.all([
      fetch(`/api/communities/${communityId}/members`),
      fetch(`/api/sessions?communityId=${encodeURIComponent(communityId)}`),
      fetch("/api/communities"),
    ]);
    const [membersData, sessionsData, communitiesData] = await Promise.all([
      safeJson(membersRes),
      safeJson(sessionsRes),
      safeJson(communitiesRes),
    ]);

    if (!membersRes.ok) throw new Error(membersData.error || "Failed to load community members");
    if (!sessionsRes.ok) throw new Error(sessionsData.error || "Failed to load tournaments");
    if (!communitiesRes.ok) throw new Error(communitiesData.error || "Failed to load communities");

    setCommunityMembers(Array.isArray(membersData) ? membersData : []);
    setSessions(Array.isArray(sessionsData) ? sessionsData : []);
    const list = Array.isArray(communitiesData) ? (communitiesData as Community[]) : [];
    const currentCommunity = list.find((c) => c.id === communityId) || null;
    setCommunity(currentCommunity);
  };

  const createSession = async () => {
    if (!newSessionName.trim() || !communityId) return;
    setCreatingSession(true);
    setError("");
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newSessionName,
          type: sessionType,
          courtCount,
          communityId,
          playerIds: selectedPlayerIds,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setError(data.error || "Failed to create tournament");
        return;
      }

      setNewSessionName("");
      setSelectedPlayerIds([]);
      setCourtCount(3);
      router.push(`/session/${data.code}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create tournament");
    } finally {
      setCreatingSession(false);
    }
  };

  const addPlayerToCommunity = async () => {
    if (!communityId || !newPlayerName.trim()) return;
    setAddingPlayer(true);
    setError("");
    try {
      const res = await fetch(`/api/communities/${communityId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newPlayerName,
          email: existingPlayerEmail || undefined,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setError(data.error || "Failed to add player");
        return;
      }

      setNewPlayerName("");
      setExistingPlayerEmail("");
      setShowAddPlayerCard(false);
      await refreshCommunityData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add player");
    } finally {
      setAddingPlayer(false);
    }
  };

  const joinTournament = async (code: string) => {
    setError("");
    try {
      const res = await fetch(`/api/sessions/${code}/join`, { method: "POST" });
      const data = await safeJson(res);
      if (!res.ok) {
        setError(data.error || "Failed to join tournament");
        return;
      }
      router.push(`/session/${code}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to join tournament");
    }
  };

  const togglePlayerSelection = (playerId: string) => {
    setSelectedPlayerIds((prev) =>
      prev.includes(playerId) ? prev.filter((id) => id !== playerId) : [...prev, playerId]
    );
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Loading Community...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-[10px] font-black text-gray-500 uppercase tracking-widest border border-gray-200 rounded-xl px-3 py-2 hover:text-blue-600 hover:border-blue-300 transition-colors"
          >
            Back
          </Link>
          <div>
            <h1 className="text-lg font-black text-gray-900 tracking-tight leading-none">
              {community?.name || "Community"}
            </h1>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
              {community?.membersCount || 0} Members - {community?.sessionsCount || 0} Tournaments
            </p>
          </div>
        </div>

        {canManageCommunity && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHostPanel((prev) => !prev)}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl font-black uppercase text-[10px] active:scale-95 transition-all shadow-lg"
            >
              {showHostPanel ? "Hide Host" : "Host Tournament"}
            </button>
            <Link
              href={`/community/${communityId}/admin`}
              className="bg-gray-900 text-white px-4 py-2 rounded-xl font-black uppercase text-[10px] active:scale-95 transition-all shadow-lg"
            >
              Admin
            </Link>
          </div>
        )}
      </div>

      <div className="max-w-6xl mx-auto px-6 pt-8 space-y-8">
        {canManageCommunity && showHostPanel && (
          <>
            <div className="bg-blue-600 p-6 rounded-3xl shadow-xl shadow-blue-100 space-y-5 text-white">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest mb-1">Host Tournament</h3>
                <p className="text-[10px] text-blue-100 font-bold uppercase tracking-wider">
                  Create a tournament for players in this community.
                </p>
              </div>

              <div className="space-y-3">
                <input
                  type="text"
                  value={newSessionName}
                  onChange={(e) => setNewSessionName(e.target.value)}
                  placeholder="Tournament Name"
                  className="w-full bg-blue-500/50 border-2 border-blue-400/30 rounded-2xl px-4 py-3 placeholder:text-blue-200 font-bold focus:outline-none focus:border-white transition-all"
                />

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setSessionType(SessionType.POINTS)}
                    className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                      sessionType === SessionType.POINTS ? "bg-white text-blue-600 shadow-md" : "bg-blue-500/30 text-white"
                    }`}
                  >
                    Points Format
                  </button>
                  <button
                    onClick={() => setSessionType(SessionType.ELO)}
                    className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                      sessionType === SessionType.ELO ? "bg-white text-blue-600 shadow-md" : "bg-blue-500/30 text-white"
                    }`}
                  >
                    ELO Format
                  </button>
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-100">Courts Available</p>
                  <select
                    value={courtCount}
                    onChange={(e) => setCourtCount(parseInt(e.target.value, 10))}
                    className="w-full bg-blue-500/50 border-2 border-blue-400/30 rounded-2xl px-4 py-3 font-bold focus:outline-none focus:border-white transition-all"
                  >
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((count) => (
                      <option key={count} value={count} className="text-gray-900">
                        {count} Court{count > 1 ? "s" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-100">Quick-Add Players</p>
                    <button
                      onClick={() => {
                        const allOtherIds = communityMembers.filter((p) => p.id !== user?.id).map((p) => p.id);
                        if (selectedPlayerIds.length === allOtherIds.length) {
                          setSelectedPlayerIds([]);
                        } else {
                          setSelectedPlayerIds(allOtherIds);
                        }
                      }}
                      className="text-[9px] font-black uppercase tracking-widest bg-white/20 px-2 py-1 rounded-lg hover:bg-white/30 transition-all"
                    >
                      {selectedPlayerIds.length === communityMembers.filter((p) => p.id !== user?.id).length
                        ? "Deselect All"
                        : "Select All"}
                    </button>
                  </div>
                  <div className="max-h-40 overflow-y-auto pr-2 space-y-1 custom-scrollbar">
                    {communityMembers
                      .filter((p) => p.id !== user?.id)
                      .map((player) => (
                        <button
                          key={player.id}
                          onClick={() => togglePlayerSelection(player.id)}
                          className={`w-full flex justify-between items-center px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                            selectedPlayerIds.includes(player.id) ? "bg-white/20 border-white/40" : "bg-blue-700/30 border-transparent"
                          } border`}
                        >
                          <span>{player.name}</span>
                          {selectedPlayerIds.includes(player.id) && <span>OK</span>}
                        </button>
                      ))}
                  </div>
                </div>

                <button
                  onClick={createSession}
                  disabled={creatingSession || !newSessionName.trim()}
                  className="w-full bg-white text-blue-600 py-4 rounded-2xl font-black uppercase tracking-widest text-xs active:scale-95 transition-all shadow-lg mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creatingSession ? "Creating..." : "Create Tournament"}
                </button>
              </div>
            </div>
          </>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          <div className="bg-white p-6 rounded-3xl shadow-md border border-gray-100 space-y-4">
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Leaderboard</h3>
            <div className="space-y-2">
              {leaderboard.length === 0 ? (
                <div className="bg-gray-50 border-2 border-dashed border-gray-100 rounded-2xl p-4 text-center">
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">No players yet</p>
                </div>
              ) : (
                leaderboard.map((player, index) => (
                  <div
                    key={player.id}
                    className="bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 w-6">
                        #{index + 1}
                      </span>
                      <div>
                        <Link href={`/profile/${player.id}?communityId=${communityId}`} className="text-sm font-black text-gray-900 hover:text-blue-600 hover:underline">
                          {player.name}
                        </Link>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{player.role}</p>
                      </div>
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-wider whitespace-nowrap">
                      <span className="text-green-600">W {player.wins}</span>{" "}
                      <span className="text-red-600">L {player.losses}</span>
                    </p>
                    <p className="text-sm font-black text-gray-900 text-right">{player.elo}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="space-y-8">
            <div className="bg-white p-6 rounded-3xl shadow-md border border-gray-100 space-y-4">
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Current Tournaments</h3>
              <div className="space-y-3">
                {activeTournaments.length === 0 ? (
                  <div className="bg-gray-50 border-2 border-dashed border-gray-100 rounded-2xl p-4 text-center">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">No active tournaments</p>
                  </div>
                ) : (
                  activeTournaments.map((tournament) => {
                    const isParticipant = tournament.players.some((p) => p.user.id === user?.id);
                    return (
                      <div key={tournament.id} className="block bg-gray-50 p-4 rounded-2xl border border-gray-100">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-black text-gray-900">{tournament.name}</h4>
                          <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg uppercase tracking-widest">
                            {tournament.status}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                            {tournament.players.length} Players - {tournament.type}
                          </p>
                          {isParticipant ? (
                            <Link
                              href={`/session/${tournament.code}`}
                              className="text-[10px] bg-blue-600 text-white px-3 py-1.5 rounded-lg font-black uppercase tracking-wider"
                            >
                              Open
                            </Link>
                          ) : (
                            <button
                              onClick={() => joinTournament(tournament.code)}
                              className="text-[10px] bg-gray-900 text-white px-3 py-1.5 rounded-lg font-black uppercase tracking-wider"
                            >
                              Join
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-md border border-gray-100 space-y-4 pb-10">
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Past Tournaments</h3>
              <div className="space-y-3">
                {pastTournaments.length === 0 ? (
                  <div className="bg-gray-50 border-2 border-dashed border-gray-100 rounded-2xl p-4 text-center">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">No past tournaments</p>
                  </div>
                ) : (
                  pastTournaments.map((tournament) => (
                    <Link
                      key={tournament.id}
                      href={`/session/${tournament.code}`}
                      className="block bg-gray-50 p-4 rounded-2xl border border-gray-100 hover:border-blue-400 transition-colors"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-black text-gray-900">{tournament.name}</h4>
                        <span className="text-[10px] font-black text-gray-600 bg-gray-200 px-2 py-1 rounded-lg uppercase tracking-widest">
                          {tournament.status}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                        {tournament.players.length} Players - {tournament.type} -{" "}
                        {new Date(tournament.createdAt).toLocaleDateString()}
                      </p>
                    </Link>
                  ))
                )}
              </div>
            </div>

            {canManageCommunity && (
              <div className="bg-white p-6 rounded-3xl shadow-md border border-gray-100">
                <button
                  onClick={() => setShowAddPlayerCard((prev) => !prev)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div>
                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Add Player to Community</h3>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-1">
                      Add by name or optional email
                    </p>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">
                    {showAddPlayerCard ? "Hide" : "Open"}
                  </span>
                </button>

                {showAddPlayerCard && (
                  <div className="mt-4 space-y-3">
                    <input
                      type="text"
                      value={newPlayerName}
                      onChange={(e) => setNewPlayerName(e.target.value)}
                      placeholder="Player Name"
                      className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 font-bold focus:outline-none focus:border-blue-500 transition-all"
                    />
                    <input
                      type="email"
                      value={existingPlayerEmail}
                      onChange={(e) => setExistingPlayerEmail(e.target.value)}
                      placeholder="Existing user email (optional)"
                      className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 font-bold focus:outline-none focus:border-blue-500 transition-all"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowAddPlayerCard(false)}
                        className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-2xl font-black uppercase tracking-widest text-xs active:scale-95 transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={addPlayerToCommunity}
                        disabled={addingPlayer || !newPlayerName.trim()}
                        className="flex-1 bg-gray-900 text-white py-3 rounded-2xl font-black uppercase tracking-widest text-xs active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {addingPlayer ? "Adding..." : "Add Player"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
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
