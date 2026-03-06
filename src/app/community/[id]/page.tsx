"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  PartnerPreference,
  PlayerGender,
  SessionMode,
  SessionStatus,
  SessionType,
} from "@/types/enums";

interface User {
  id: string;
  name: string;
  email: string;
  elo: number;
  gender: PlayerGender;
  partnerPreference: PartnerPreference;
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
  gender: PlayerGender;
  partnerPreference: PartnerPreference;
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

interface GuestConfig {
  name: string;
  gender: PlayerGender;
  partnerPreference: PartnerPreference;
  initialElo: number;
}

const GUEST_ELO_PRESETS = [
  { label: "Beginner", value: 850 },
  { label: "Average", value: 1000 },
  { label: "Advanced", value: 1200 },
] as const;

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
  const [sessionMode, setSessionMode] = useState<SessionMode>(SessionMode.MEXICANO);
  const [courtCount, setCourtCount] = useState(3);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [guestNameInput, setGuestNameInput] = useState("");
  const [guestGenderInput, setGuestGenderInput] = useState<PlayerGender>(PlayerGender.MALE);
  const [guestPreferenceInput, setGuestPreferenceInput] = useState<PartnerPreference>(
    PartnerPreference.OPEN
  );
  const [guestInitialEloInput, setGuestInitialEloInput] = useState<number>(1000);
  const [guestConfigs, setGuestConfigs] = useState<GuestConfig[]>([]);

  const [loading, setLoading] = useState(true);
  const [creatingSession, setCreatingSession] = useState(false);
  const [showHostPanel, setShowHostPanel] = useState(false);
  const [showPlayersModal, setShowPlayersModal] = useState(false);
  const [showGuestsModal, setShowGuestsModal] = useState(false);
  const [playerSearch, setPlayerSearch] = useState("");
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
  const selectablePlayers = communityMembers.filter((member) => member.id !== user?.id);
  const filteredSelectablePlayers = selectablePlayers.filter((member) =>
    member.name.toLowerCase().includes(playerSearch.toLowerCase())
  );

  useEffect(() => {
    setSelectedPlayerIds([]);
    setGuestConfigs([]);
    setGuestNameInput("");
    setGuestGenderInput(PlayerGender.MALE);
    setGuestPreferenceInput(PartnerPreference.OPEN);
    setGuestInitialEloInput(1000);
    setPlayerSearch("");
    setShowPlayersModal(false);
    setShowGuestsModal(false);
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

  const createSession = async () => {
    if (!newSessionName.trim() || !communityId) return;

    if (sessionMode === SessionMode.MIXICANO) {
      const invalidGuest = guestConfigs.find(
        (guest) => ![PlayerGender.MALE, PlayerGender.FEMALE].includes(guest.gender)
      );
      if (invalidGuest) {
        setError(`MIXICANO requires MALE/FEMALE gender for guest ${invalidGuest.name}`);
        return;
      }
    }

    setCreatingSession(true);
    setError("");
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newSessionName,
          type: sessionType,
          mode: sessionMode,
          courtCount,
          communityId,
          playerIds: selectedPlayerIds,
          guestConfigs,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setError(data.error || "Failed to create tournament");
        return;
      }

      setNewSessionName("");
      setSelectedPlayerIds([]);
      setGuestConfigs([]);
      setGuestNameInput("");
      setGuestGenderInput(PlayerGender.MALE);
      setGuestPreferenceInput(PartnerPreference.OPEN);
      setGuestInitialEloInput(1000);
      setCourtCount(3);
      router.push(`/session/${data.code}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create tournament");
    } finally {
      setCreatingSession(false);
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

  const addGuestName = () => {
    const trimmed = guestNameInput.trim();
    if (!trimmed) return;
    if (
      sessionMode === SessionMode.MIXICANO &&
      ![PlayerGender.MALE, PlayerGender.FEMALE].includes(guestGenderInput)
    ) {
      setError("Choose MALE/FEMALE for guest before adding in MIXICANO");
      return;
    }
    if (guestConfigs.some((guest) => guest.name.toLowerCase() === trimmed.toLowerCase())) {
      setGuestNameInput("");
      return;
    }
    setGuestConfigs((prev) => [
      ...prev,
      {
        name: trimmed,
        gender: guestGenderInput,
        partnerPreference: guestPreferenceInput,
        initialElo: guestInitialEloInput,
      },
    ]);
    setGuestNameInput("");
    setGuestGenderInput(PlayerGender.MALE);
    setGuestPreferenceInput(PartnerPreference.OPEN);
    setGuestInitialEloInput(1000);
  };

  const removeGuestName = (nameToRemove: string) => {
    setGuestConfigs((prev) => prev.filter((guest) => guest.name !== nameToRemove));
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

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setSessionMode(SessionMode.MEXICANO)}
                    className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                      sessionMode === SessionMode.MEXICANO
                        ? "bg-white text-blue-600 shadow-md"
                        : "bg-blue-500/30 text-white"
                    }`}
                  >
                    Mexicano
                  </button>
                  <button
                    onClick={() => setSessionMode(SessionMode.MIXICANO)}
                    className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                      sessionMode === SessionMode.MIXICANO
                        ? "bg-white text-blue-600 shadow-md"
                        : "bg-blue-500/30 text-white"
                    }`}
                  >
                    Mixicano
                  </button>
                </div>
                {sessionMode === SessionMode.MIXICANO && (
                  <p className="text-[10px] font-bold text-blue-100 uppercase tracking-wider">
                    Core members default to MALE. Set guest gender only when needed.
                  </p>
                )}

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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="bg-blue-700/30 border border-white/20 rounded-xl px-3 py-3 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-100">Players</p>
                    <p className="text-xs font-bold">{selectedPlayerIds.length} selected</p>
                    <button
                      type="button"
                      onClick={() => setShowPlayersModal(true)}
                      className="w-full bg-white text-blue-600 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest"
                    >
                      Add Players
                    </button>
                  </div>
                  <div className="bg-blue-700/30 border border-white/20 rounded-xl px-3 py-3 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-100">Guests</p>
                    <p className="text-xs font-bold">{guestConfigs.length} pre-added</p>
                    <button
                      type="button"
                      onClick={() => setShowGuestsModal(true)}
                      className="w-full bg-white text-blue-600 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest"
                    >
                      Add Guests
                    </button>
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
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
                      <span className="text-green-600">W {player.wins}</span>
                      <span className="text-gray-300"> / </span>
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

          </div>
        </div>
      </div>

      {showPlayersModal && (
        <div className="fixed inset-0 bg-gray-900/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col animate-in slide-in-from-bottom duration-300">
            <div className="px-4 py-3 border-b flex justify-between items-center">
              <div>
                <h2 className="text-base font-black text-gray-900">Add Players</h2>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                  {selectedPlayerIds.length} selected
                </p>
              </div>
              <button
                onClick={() => {
                  setShowPlayersModal(false);
                  setPlayerSearch("");
                }}
                className="bg-gray-100 text-gray-400 hover:text-gray-600 w-7 h-7 rounded-full flex items-center justify-center text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <div className="px-3 py-2 border-b bg-gray-50/50 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Search players..."
                  value={playerSearch}
                  onChange={(e) => setPlayerSearch(e.target.value)}
                  className="w-full h-9 bg-white border border-gray-200 rounded-lg px-3 text-xs font-bold focus:outline-none focus:border-blue-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => {
                    const allOtherIds = selectablePlayers.map((p) => p.id);
                    if (selectedPlayerIds.length === allOtherIds.length) {
                      setSelectedPlayerIds([]);
                    } else {
                      setSelectedPlayerIds(allOtherIds);
                    }
                  }}
                  className="h-9 bg-gray-900 text-white px-3 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap"
                >
                  {selectedPlayerIds.length === selectablePlayers.length ? "Deselect All" : "Select All"}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
              {filteredSelectablePlayers.length === 0 ? (
                <div className="text-center py-10 text-gray-400 italic text-sm">No players found.</div>
              ) : (
                filteredSelectablePlayers.map((player) => {
                  const isSelected = selectedPlayerIds.includes(player.id);
                  return (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => togglePlayerSelection(player.id)}
                      className={`w-full flex justify-between items-center px-3 py-2 rounded-xl border text-left transition-colors ${
                        isSelected
                          ? "bg-blue-50 border-blue-200"
                          : "bg-gray-50 border-gray-100 hover:bg-gray-100"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="font-black text-sm text-gray-900 truncate">{player.name}</p>
                        <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider whitespace-nowrap">
                          ELO {player.elo}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-black uppercase tracking-widest ${
                          isSelected ? "text-blue-600" : "text-gray-400"
                        }`}
                      >
                        {isSelected ? "Selected" : "Add"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="p-3 bg-white border-t sm:rounded-b-2xl flex justify-end">
              <button
                onClick={() => {
                  setShowPlayersModal(false);
                  setPlayerSearch("");
                }}
                className="bg-gray-900 text-white px-4 py-2 rounded-lg font-black uppercase tracking-widest text-[10px] shadow-sm active:scale-95 transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {showGuestsModal && (
        <div className="fixed inset-0 bg-gray-900/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col animate-in slide-in-from-bottom duration-300">
            <div className="px-4 py-3 border-b flex justify-between items-center">
              <div>
                <h2 className="text-base font-black text-gray-900">Add Guests</h2>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                  {guestConfigs.length} pre-added
                </p>
              </div>
              <button
                onClick={() => {
                  setShowGuestsModal(false);
                  setGuestNameInput("");
                }}
                className="bg-gray-100 text-gray-400 hover:text-gray-600 w-7 h-7 rounded-full flex items-center justify-center text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <div className="px-3 py-2 border-b bg-gray-50/50 space-y-2">
              <div
                className={`grid gap-2 ${
                  sessionMode === SessionMode.MIXICANO
                    ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                    : "grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                }`}
              >
                <input
                  type="text"
                  value={guestNameInput}
                  onChange={(e) => setGuestNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addGuestName();
                    }
                  }}
                  placeholder="Guest name"
                  className="h-9 bg-white border border-gray-200 rounded-lg px-3 text-xs font-bold focus:outline-none focus:border-blue-500 transition-all"
                />
                <select
                  value={guestInitialEloInput}
                  onChange={(e) => setGuestInitialEloInput(parseInt(e.target.value, 10))}
                  className="h-9 bg-white border border-gray-200 rounded-lg px-2 text-[10px] font-bold focus:outline-none focus:border-blue-500 transition-all"
                >
                  {GUEST_ELO_PRESETS.map((preset) => (
                    <option key={preset.label} value={preset.value}>
                      {preset.label} ({preset.value})
                    </option>
                  ))}
                </select>
                {sessionMode === SessionMode.MIXICANO && (
                  <>
                    <select
                      value={guestGenderInput}
                      onChange={(e) => setGuestGenderInput(e.target.value as PlayerGender)}
                      className="h-9 bg-white border border-gray-200 rounded-lg px-2 text-[10px] font-bold focus:outline-none focus:border-blue-500 transition-all"
                    >
                      <option value={PlayerGender.MALE} className="text-gray-900">
                        Male
                      </option>
                      <option value={PlayerGender.FEMALE} className="text-gray-900">
                        Female
                      </option>
                    </select>
                    <select
                      value={guestPreferenceInput}
                      onChange={(e) => setGuestPreferenceInput(e.target.value as PartnerPreference)}
                      className="h-9 bg-white border border-gray-200 rounded-lg px-2 text-[10px] font-bold focus:outline-none focus:border-blue-500 transition-all"
                    >
                      <option value={PartnerPreference.OPEN} className="text-gray-900">
                        Open
                      </option>
                      <option value={PartnerPreference.FEMALE_FLEX} className="text-gray-900">
                        Female Flex
                      </option>
                    </select>
                  </>
                )}
                <button
                  type="button"
                  onClick={addGuestName}
                  disabled={!guestNameInput.trim()}
                  className="h-9 bg-gray-900 text-white px-3 rounded-lg text-[10px] font-black uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                >
                  Add
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
              {guestConfigs.length === 0 ? (
                <div className="text-center py-10 text-gray-400 italic text-sm">No guests added yet.</div>
              ) : (
                guestConfigs.map((guest) => (
                  <div
                    key={guest.name}
                    className="flex justify-between items-center px-3 py-2 rounded-xl border bg-gray-50 border-gray-100"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="font-black text-sm text-gray-900 truncate">{guest.name}</p>
                      {sessionMode === SessionMode.MIXICANO && (
                        <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider whitespace-nowrap">
                          {guest.gender === PlayerGender.FEMALE ? "F" : "M"} / {guest.partnerPreference === PartnerPreference.FEMALE_FLEX ? "Flex" : "Open"}
                        </span>
                      )}
                      <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider whitespace-nowrap">
                        ELO {guest.initialElo}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeGuestName(guest.name)}
                      className="text-[10px] text-red-600 font-black uppercase tracking-widest"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="p-3 bg-white border-t sm:rounded-b-2xl flex justify-end">
              <button
                onClick={() => {
                  setShowGuestsModal(false);
                  setGuestNameInput("");
                }}
                className="bg-gray-900 text-white px-4 py-2 rounded-lg font-black uppercase tracking-widest text-[10px] shadow-sm active:scale-95 transition-all"
              >
                Done
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
