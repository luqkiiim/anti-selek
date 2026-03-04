"use client";

import { useEffect, useMemo, useState } from "react";
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
  const { status } = useSession();
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [selectedCommunityId, setSelectedCommunityId] = useState("");
  const [communityMembers, setCommunityMembers] = useState<CommunityMember[]>([]);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [newSessionName, setNewSessionName] = useState("");
  const [sessionType, setSessionType] = useState<SessionType>(SessionType.POINTS);

  const [newCommunityName, setNewCommunityName] = useState("");
  const [newCommunityPassword, setNewCommunityPassword] = useState("");
  const [joinCommunityName, setJoinCommunityName] = useState("");
  const [joinCommunityPassword, setJoinCommunityPassword] = useState("");
  const [isCreateCommunityOpen, setIsCreateCommunityOpen] = useState(false);
  const [isJoinCommunityOpen, setIsJoinCommunityOpen] = useState(false);
  const [creatingCommunity, setCreatingCommunity] = useState(false);
  const [joiningCommunity, setJoiningCommunity] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [existingPlayerEmail, setExistingPlayerEmail] = useState("");
  const [addingPlayer, setAddingPlayer] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const safeJson = async (res: Response) => {
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return { error: "Invalid server response" };
    }
  };

  const selectedCommunity = useMemo(
    () => communities.find((c) => c.id === selectedCommunityId) || null,
    [communities, selectedCommunityId]
  );
  const canManageCommunity = !!selectedCommunity && (selectedCommunity.role === "ADMIN" || !!user?.isAdmin);

  const fetchUser = async () => {
    const res = await fetch("/api/user/me");
    const data = await safeJson(res);
    if (data.user) {
      setUser(data.user);
      return data.user as User;
    }
    return null;
  };

  const fetchCommunities = async () => {
    const res = await fetch("/api/communities");
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.error || "Failed to load communities");
    const list = Array.isArray(data) ? data : [];
    setCommunities(list);

    const stillValid = list.some((c: Community) => c.id === selectedCommunityId);
    if (!selectedCommunityId || !stillValid) {
      setSelectedCommunityId(list[0]?.id || "");
    }
  };

  const fetchSessions = async (communityId: string) => {
    if (!communityId) {
      setSessions([]);
      return;
    }
    const res = await fetch(`/api/sessions?communityId=${encodeURIComponent(communityId)}`);
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.error || "Failed to load tournaments");
    setSessions(Array.isArray(data) ? data : []);
  };

  const fetchCommunityMembers = async (communityId: string) => {
    if (!communityId) {
      setCommunityMembers([]);
      return;
    }
    const res = await fetch(`/api/communities/${communityId}/members`);
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.error || "Failed to load community members");
    setCommunityMembers(Array.isArray(data) ? data : []);
  };

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
  }, [status, router]);

  useEffect(() => {
    if (!selectedCommunityId || status !== "authenticated") return;
    (async () => {
      try {
        setError("");
        await fetchSessions(selectedCommunityId);
        await fetchCommunityMembers(selectedCommunityId);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load community data");
      }
    })();
  }, [selectedCommunityId, status]);

  useEffect(() => {
    setSelectedPlayerIds([]);
  }, [selectedCommunityId]);

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
      if (data?.id) setSelectedCommunityId(data.id);
    } catch (err) {
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
      if (data?.id) setSelectedCommunityId(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join community");
    } finally {
      setJoiningCommunity(false);
    }
  };

  const createSession = async () => {
    if (!newSessionName.trim() || !selectedCommunityId) return;
    setError("");
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newSessionName,
        type: sessionType,
        communityId: selectedCommunityId,
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
    router.push(`/session/${data.code}`);
  };

  const addPlayerToCommunity = async () => {
    if (!selectedCommunityId || !newPlayerName.trim()) return;

    setError("");
    setAddingPlayer(true);
    try {
      const res = await fetch(`/api/communities/${selectedCommunityId}/members`, {
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
      await fetchCommunityMembers(selectedCommunityId);
      await fetchCommunities();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add player");
    } finally {
      setAddingPlayer(false);
    }
  };

  const joinTournament = async (code: string) => {
    setError("");
    const res = await fetch(`/api/sessions/${code}/join`, { method: "POST" });
    const data = await safeJson(res);
    if (!res.ok) {
      setError(data.error || "Failed to join tournament");
      return;
    }
    router.push(`/session/${code}`);
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
              communities.map((c) => {
                const isSelected = c.id === selectedCommunityId;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCommunityId(c.id)}
                    className={`w-full text-left rounded-2xl p-4 border-2 transition-all ${
                      isSelected ? "border-blue-500 bg-blue-50" : "border-gray-100 bg-gray-50"
                    }`}
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
                  </button>
                );
              })
            )}
          </div>

          {selectedCommunity && (
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
              Selected: {selectedCommunity.name}
            </p>
          )}
        </div>

        {canManageCommunity && (
          <>
            <div className="bg-white p-6 rounded-3xl shadow-md border border-gray-100 space-y-3">
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Add Player to Community</h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                Add by name to create an unclaimed player profile, or provide an email to add an existing signed-up user.
              </p>
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
              <button
                onClick={addPlayerToCommunity}
                disabled={addingPlayer || !newPlayerName.trim() || !selectedCommunityId}
                className="w-full bg-gray-900 text-white px-6 py-3 rounded-2xl font-black uppercase text-xs active:scale-95 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {addingPlayer ? "Adding..." : "Add Player"}
              </button>
            </div>

            <div className="bg-blue-600 p-6 rounded-3xl shadow-xl shadow-blue-100 space-y-5 text-white">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest mb-1">Host Tournament</h3>
                <p className="text-[10px] text-blue-100 font-bold uppercase tracking-wider">
                  Everyone in this community can see this tournament.
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
                      {selectedPlayerIds.length === communityMembers.filter((p) => p.id !== user?.id).length ? "Deselect All" : "Select All"}
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
                  className="w-full bg-white text-blue-600 py-4 rounded-2xl font-black uppercase tracking-widest text-xs active:scale-95 transition-all shadow-lg mt-2"
                >
                  Create Tournament
                </button>
              </div>
            </div>
          </>
        )}

        <div className="space-y-4 pb-10">
          <div className="flex justify-between items-end px-2">
            <div>
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-0.5">Tournaments</h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                Active and past tournaments in this community
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {sessions.length === 0 ? (
              <div className="bg-white p-10 rounded-3xl border-2 border-dashed border-gray-100 text-center">
                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">No tournaments yet</p>
              </div>
            ) : (
              sessions.map((s) => {
                const isParticipant = s.players.some((p) => p.user.id === user?.id);
                return (
                  <div
                    key={s.id}
                    className="block bg-white p-5 rounded-3xl shadow-sm border border-gray-100 transition-all group"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-black text-gray-900 group-hover:text-blue-600 transition-colors">{s.name}</h4>
                      <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg uppercase tracking-widest">
                        {s.status}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                        {s.players.length} Players - {s.type}
                      </p>
                      <div className="flex items-center gap-2">
                        {s.status === SessionStatus.ACTIVE && <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>}
                        {isParticipant ? (
                          <Link
                            href={`/session/${s.code}`}
                            className="text-[10px] bg-blue-600 text-white px-3 py-1.5 rounded-lg font-black uppercase tracking-wider"
                          >
                            Open
                          </Link>
                        ) : (
                          <button
                            onClick={() => joinTournament(s.code)}
                            className="text-[10px] bg-gray-900 text-white px-3 py-1.5 rounded-lg font-black uppercase tracking-wider"
                          >
                            Join
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
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
