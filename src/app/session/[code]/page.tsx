"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  MatchStatus,
  PartnerPreference,
  PlayerGender,
  SessionMode,
  SessionStatus,
  SessionType,
} from "@/types/enums";

interface Player {
  userId: string;
  sessionPoints: number;
  isPaused: boolean;
  isGuest: boolean;
  gender: PlayerGender;
  partnerPreference: PartnerPreference;
  user: {
    id: string;
    name: string;
    elo: number;
  };
}

interface Match {
  id: string;
  status: string;
  team1User1: { id: string; name: string };
  team1User2: { id: string; name: string };
  team2User1: { id: string; name: string };
  team2User2: { id: string; name: string };
  team1Score?: number;
  team2Score?: number;
  completedAt?: string;
}

interface CompletedMatchInfo {
  id: string;
  team1User1Id: string;
  team1User2Id: string;
  team2User1Id: string;
  team2User2Id: string;
  team1Score?: number;
  team2Score?: number;
  winnerTeam: number;
  status: string;
  completedAt?: string;
}

interface Court {
  id: string;
  courtNumber: number;
  currentMatch: Match | null;
}

interface CommunityUser {
  id: string;
  name: string;
  elo: number;
  gender: PlayerGender;
  partnerPreference: PartnerPreference;
}

interface SessionData {
  id: string;
  code: string;
  communityId?: string | null;
  name: string;
  type: string;
  mode: SessionMode;
  status: string;
  viewerCanManage?: boolean;
  viewerCommunityRole?: string | null;
  courts: Court[];
  players: Player[];
  matches?: CompletedMatchInfo[];
}

interface CurrentUser {
  id: string;
  isAdmin?: boolean;
}

type ManualMatchSlot =
  | "team1User1Id"
  | "team1User2Id"
  | "team2User1Id"
  | "team2User2Id";

interface ManualMatchFormState {
  team1User1Id: string;
  team1User2Id: string;
  team2User1Id: string;
  team2User2Id: string;
}

const GUEST_ELO_PRESETS = [
  { label: "Beginner", value: 850 },
  { label: "Average", value: 1000 },
  { label: "Advanced", value: 1200 },
] as const;

export default function SessionPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const code = params?.code as string;

  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState("");
  
  // Late joiner state
  const [showRosterModal, setShowRosterModal] = useState(false);
  const [rosterSearch, setRosterSearch] = useState("");
  const [communityPlayers, setCommunityPlayers] = useState<CommunityUser[]>([]);
  const [addingPlayerId, setAddingPlayerId] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestGender, setGuestGender] = useState<PlayerGender>(PlayerGender.MALE);
  const [guestPreference, setGuestPreference] = useState<PartnerPreference>(PartnerPreference.OPEN);
  const [guestInitialElo, setGuestInitialElo] = useState<number>(1000);
  const [addingGuest, setAddingGuest] = useState(false);
  const [savingPreferencesFor, setSavingPreferencesFor] = useState<string | null>(null);
  const [openPreferenceEditor, setOpenPreferenceEditor] = useState<{
    userId: string;
    top: number;
    left: number;
    openUp: boolean;
  } | null>(null);

  // Track scores per match locally
  const [matchScores, setMatchScores] = useState<Record<string, { team1: string; team2: string }>>({});
  const [submittingMatchId, setSubmittingMatchId] = useState<string | null>(null);
  const [reopeningMatchId, setReopeningMatchId] = useState<string | null>(null);
  const [undoingCourtId, setUndoingCourtId] = useState<string | null>(null);
  const [manualCourtId, setManualCourtId] = useState<string | null>(null);
  const [creatingManualMatch, setCreatingManualMatch] = useState(false);
  const [manualMatchForm, setManualMatchForm] = useState<ManualMatchFormState>({
    team1User1Id: "",
    team1User2Id: "",
    team2User1Id: "",
    team2User2Id: "",
  });

  const togglePreferenceEditor = (userId: string, triggerEl: HTMLElement) => {
    setOpenPreferenceEditor((prev) => {
      if (prev?.userId === userId) return null;

      const rect = triggerEl.getBoundingClientRect();
      const panelWidth = 176; // matches w-44
      const panelHeight = 220; // approximate editor height
      const margin = 8;
      const openUp = window.innerHeight - rect.bottom < panelHeight;

      const left = Math.min(
        Math.max(margin, rect.left),
        Math.max(margin, window.innerWidth - panelWidth - margin)
      );
      const top = openUp ? rect.top - margin : rect.bottom + margin;

      return { userId, top, left, openUp };
    });
  };

  useEffect(() => {
    if (!openPreferenceEditor) return;
    const close = () => setOpenPreferenceEditor(null);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [openPreferenceEditor]);

  // Helper to safely parse JSON
  const safeJson = useCallback(async (res: Response) => {
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      console.error("Failed to parse JSON:", text);
      return { error: "Invalid server response" };
    }
  }, []);

  const fetchSession = useCallback(async () => {
    if (!code) return;
    try {
      const res = await fetch(`/api/sessions/${code}`);
      const data = await safeJson(res);
      if (!res.ok) {
        setError(data.error || "Failed to load session");
        return;
      }
      setSessionData(data);
    } catch (err) {
      console.error(err);
      setError("Failed to load session");
    }
  }, [code, safeJson]);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch("/api/user/me");
      if (res.ok) {
        const data = await safeJson(res);
        if (data.user) {
          setUser(data.user as CurrentUser);
        }
      }
    } catch (err) {
      console.error(err);
    }
  }, [safeJson]);

  const fetchCommunityPlayers = async () => {
    if (!sessionData?.communityId) return;
    try {
      const res = await fetch(`/api/communities/${sessionData.communityId}/members`);
      const data = await safeJson(res);
      if (res.ok) {
        setCommunityPlayers(
          Array.isArray(data)
            ? data
                .map((p: unknown) => {
                  if (typeof p !== "object" || p === null) return null;
                  const candidate = p as {
                    id?: unknown;
                    name?: unknown;
                    elo?: unknown;
                    gender?: unknown;
                    partnerPreference?: unknown;
                  };
                  if (
                    typeof candidate.id !== "string" ||
                    typeof candidate.name !== "string" ||
                    typeof candidate.elo !== "number"
                  ) {
                    return null;
                  }
                  const gender =
                    typeof candidate.gender === "string" &&
                    [PlayerGender.MALE, PlayerGender.FEMALE, PlayerGender.UNSPECIFIED].includes(
                      candidate.gender as PlayerGender
                    )
                      ? (candidate.gender as PlayerGender)
                      : PlayerGender.UNSPECIFIED;
                  const partnerPreference =
                    typeof candidate.partnerPreference === "string" &&
                    [PartnerPreference.OPEN, PartnerPreference.FEMALE_FLEX].includes(
                      candidate.partnerPreference as PartnerPreference
                    )
                      ? (candidate.partnerPreference as PartnerPreference)
                      : gender === PlayerGender.FEMALE
                        ? PartnerPreference.FEMALE_FLEX
                        : PartnerPreference.OPEN;

                  return {
                    id: candidate.id,
                    name: candidate.name,
                    elo: candidate.elo,
                    gender,
                    partnerPreference,
                  };
                })
                .filter((p): p is CommunityUser => p !== null)
            : []
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/signin");
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user?.id && code) {
      fetchUser();
      fetchSession();
      const interval = setInterval(fetchSession, 3000);
      return () => clearInterval(interval);
    }
  }, [session, code, fetchSession, fetchUser]);

  const startSession = async () => {
    try {
      const res = await fetch(`/api/sessions/${code}/start`, { method: "POST" });
      if (res.ok) {
        fetchSession();
      } else {
        const data = await safeJson(res);
        setError(data.error || "Failed to start session");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const endSession = async () => {
    if (!confirm("End this session now? This will close all courts and finalize standings.")) {
      return;
    }
    try {
      const res = await fetch(`/api/sessions/${code}/end`, { method: "POST" });
      if (res.ok) {
        const destination = sessionData?.communityId ? `/community/${sessionData.communityId}` : "/";
        router.push(destination);
      } else {
        const data = await safeJson(res);
        setError(data.error || "Failed to end session");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const togglePausePlayer = async (userId: string, currentPaused: boolean) => {
    try {
      const res = await fetch(`/api/sessions/${code}/pause-player`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, isPaused: !currentPaused }),
      });
      if (res.ok) {
        fetchSession();
      } else {
        const data = await safeJson(res);
        setError(data.error || "Failed to update player status");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const addPlayerToSession = async (userId: string) => {
    setAddingPlayerId(userId);
    try {
      const adminRes = await fetch(`/api/sessions/${code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      if (adminRes.ok) {
        fetchSession();
      } else {
        const data = await safeJson(adminRes);
        setError(data.error || "Failed to add player");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAddingPlayerId(null);
    }
  };

  const generateMatch = async (courtId: string) => {
    try {
      const res = await fetch(`/api/sessions/${code}/generate-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courtId }),
      });
      if (res.ok) {
        fetchSession();
      } else {
        const data = await safeJson(res);
        setError(data.error || "Failed to generate match");
      }
    } catch (err) {
      console.error(err);
      setError("Network error generating match");
    }
  };

  const openManualMatchModal = (courtId: string) => {
    setManualCourtId(courtId);
    setManualMatchForm({
      team1User1Id: "",
      team1User2Id: "",
      team2User1Id: "",
      team2User2Id: "",
    });
    setError("");
  };

  const closeManualMatchModal = () => {
    setManualCourtId(null);
    setCreatingManualMatch(false);
    setManualMatchForm({
      team1User1Id: "",
      team1User2Id: "",
      team2User1Id: "",
      team2User2Id: "",
    });
  };

  const updateManualMatchSlot = (slot: ManualMatchSlot, value: string) => {
    setManualMatchForm((prev) => ({
      ...prev,
      [slot]: value,
    }));
  };

  const createManualMatch = async () => {
    if (!manualCourtId) return;

    const { team1User1Id, team1User2Id, team2User1Id, team2User2Id } = manualMatchForm;
    if (!team1User1Id || !team1User2Id || !team2User1Id || !team2User2Id) {
      setError("Choose all 4 players before creating a manual match");
      return;
    }

    setCreatingManualMatch(true);
    setError("");
    try {
      const res = await fetch(`/api/sessions/${code}/generate-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courtId: manualCourtId,
          manualTeams: {
            team1: [team1User1Id, team1User2Id],
            team2: [team2User1Id, team2User2Id],
          },
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setError(data.error || "Failed to create manual match");
        return;
      }

      closeManualMatchModal();
      fetchSession();
    } catch (err) {
      console.error(err);
      setError("Network error creating manual match");
    } finally {
      setCreatingManualMatch(false);
    }
  };

  const addGuestToSession = async () => {
    const name = guestName.trim();
    if (!name) return;
    if (
      sessionData?.mode === SessionMode.MIXICANO &&
      ![PlayerGender.MALE, PlayerGender.FEMALE].includes(guestGender)
    ) {
      setError("MIXICANO requires selecting MALE/FEMALE for guests");
      return;
    }

    setAddingGuest(true);
    setError("");

    try {
      const res = await fetch(`/api/sessions/${code}/guests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          initialElo: guestInitialElo,
          gender: guestGender,
          partnerPreference: guestPreference,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setError(data.error || "Failed to add guest");
        return;
      }

      setGuestName("");
      setGuestGender(PlayerGender.MALE);
      setGuestPreference(PartnerPreference.OPEN);
      setGuestInitialElo(1000);
      fetchSession();
    } catch (err) {
      console.error(err);
      setError("Failed to add guest");
    } finally {
      setAddingGuest(false);
    }
  };

  const reshuffleMatch = async (courtId: string) => {
    if (!confirm("Are you sure you want to reshuffle? This will delete the current match and pick new players.")) return;
    try {
      const res = await fetch(`/api/sessions/${code}/generate-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courtId, forceReshuffle: true }),
      });
      if (res.ok) {
        fetchSession();
      } else {
        const data = await safeJson(res);
        setError(data.error || "Failed to reshuffle match");
      }
    } catch (err) {
      console.error(err);
      setError("Network error reshuffling match");
    }
  };

  const undoMatchSelection = async (courtId: string) => {
    if (!confirm("Undo this match selection? The 4 selected players will return to the pool.")) return;
    setUndoingCourtId(courtId);
    setError("");
    try {
      const res = await fetch(`/api/sessions/${code}/generate-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courtId, undoCurrentMatch: true }),
      });
      if (res.ok) {
        fetchSession();
      } else {
        const data = await safeJson(res);
        setError(data.error || "Failed to undo match");
      }
    } catch (err) {
      console.error(err);
      setError("Network error undoing match");
    } finally {
      setUndoingCourtId(null);
    }
  };

  const handleScoreChange = (matchId: string, team: 'team1' | 'team2', value: string) => {
    setMatchScores(prev => ({
      ...prev,
      [matchId]: {
        ...(prev[matchId] || { team1: "", team2: "" }),
        [team]: value
      }
    }));
  };

  const submitScore = async (matchId: string) => {
    const scores = matchScores[matchId];
    if (!scores || !scores.team1 || !scores.team2) return;
    
    setSubmittingMatchId(matchId);
    setError("");
    
    try {
      const res = await fetch(`/api/matches/${matchId}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team1Score: parseInt(scores.team1),
          team2Score: parseInt(scores.team2),
        }),
      });
      if (res.ok) {
        // Clear local scores for this match
        setMatchScores(prev => {
          const newScores = { ...prev };
          delete newScores[matchId];
          return newScores;
        });
        fetchSession();
      } else {
        const data = await safeJson(res);
        setError(data.error || "Failed to submit score");
      }
    } catch (err) {
      console.error(err);
      setError("Network error submitting score");
    } finally {
      setSubmittingMatchId(null);
    }
  };

  const approveScore = async (matchId: string, overrideTeam1?: number, overrideTeam2?: number) => {
    try {
      const res = await fetch(`/api/matches/${matchId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team1Score: overrideTeam1,
          team2Score: overrideTeam2,
        }),
      });
      if (res.ok) {
        fetchSession();
      } else {
        const data = await safeJson(res);
        setError(data.error || "Failed to approve score");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const reopenScoreForEdit = async (matchId: string) => {
    setReopeningMatchId(matchId);
    setError("");
    try {
      const res = await fetch(`/api/matches/${matchId}/reopen`, {
        method: "POST",
      });
      if (res.ok) {
        setMatchScores((prev) => {
          const next = { ...prev };
          delete next[matchId];
          return next;
        });
        fetchSession();
      } else {
        const data = await safeJson(res);
        setError(data.error || "Failed to reopen score entry");
      }
    } catch (err) {
      console.error(err);
      setError("Network error reopening score entry");
    } finally {
      setReopeningMatchId(null);
    }
  };

  const updatePlayerPreference = async (
    userId: string,
    nextGender: PlayerGender,
    nextPreference: PartnerPreference
  ) => {
    setSavingPreferencesFor(userId);
    setError("");
    try {
      const res = await fetch(`/api/sessions/${code}/players/${userId}/preferences`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gender: nextGender,
          partnerPreference: nextPreference,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setError(data.error || "Failed to update preference");
        return;
      }
      fetchSession();
    } catch (err) {
      console.error(err);
      setError("Failed to update preference");
    } finally {
      setSavingPreferencesFor(null);
    }
  };

  if (status === "loading" || !sessionData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const isAdmin = !!sessionData.viewerCanManage || !!user?.isAdmin || !!session?.user?.isAdmin;
  const currentUserId = session?.user?.id || "";
  const isMixicano = sessionData.mode === SessionMode.MIXICANO;
  const busySessionPlayerIds = new Set<string>();
  sessionData.courts.forEach((court) => {
    if (!court.currentMatch) return;
    busySessionPlayerIds.add(court.currentMatch.team1User1.id);
    busySessionPlayerIds.add(court.currentMatch.team1User2.id);
    busySessionPlayerIds.add(court.currentMatch.team2User1.id);
    busySessionPlayerIds.add(court.currentMatch.team2User2.id);
  });
  const manualMatchPlayerOptions = sessionData.players
    .filter((player) => !player.isPaused && !busySessionPlayerIds.has(player.userId))
    .slice()
    .sort((a, b) => a.user.name.localeCompare(b.user.name));
  const selectedManualPlayerIds = new Set(
    Object.values(manualMatchForm).filter((value) => value.length > 0)
  );
  const activeManualCourt = manualCourtId
    ? sessionData.courts.find((court) => court.id === manualCourtId) ?? null
    : null;

  // Helper to calculate player stats for the session
  const calculatePlayerSessionStats = (userId: string) => {
    const sessionMatches = sessionData.matches || [];
    let played = 0;
    let wins = 0;
    let losses = 0;

    sessionMatches.forEach(m => {
      const isTeam1 = m.team1User1Id === userId || m.team1User2Id === userId;
      const isTeam2 = m.team2User1Id === userId || m.team2User2Id === userId;

      if (isTeam1 || isTeam2) {
        played++;
        if (isTeam1 && m.winnerTeam === 1) wins++;
        else if (isTeam2 && m.winnerTeam === 2) wins++;
        else losses++;
      }
    });

    return { played, wins, losses };
  };

  const calculatePlayerPointDiff = (userId: string) => {
    const sessionMatches = sessionData.matches || [];
    let pointDiff = 0;

    sessionMatches.forEach((m) => {
      if (m.status !== MatchStatus.COMPLETED) return;
      if (typeof m.team1Score !== "number" || typeof m.team2Score !== "number") return;

      const isTeam1 = m.team1User1Id === userId || m.team1User2Id === userId;
      const isTeam2 = m.team2User1Id === userId || m.team2User2Id === userId;
      if (isTeam1) pointDiff += m.team1Score - m.team2Score;
      if (isTeam2) pointDiff += m.team2Score - m.team1Score;
    });

    return pointDiff;
  };

  // Filter out players already in session AND apply search
  const playersNotInSession = communityPlayers
    .filter(cp => !sessionData.players.some(sp => sp.userId === cp.id))
    .filter(cp => cp.name.toLowerCase().includes(rosterSearch.toLowerCase()));

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Mobile-Friendly Header */}
      <nav className="bg-white/95 backdrop-blur shadow-sm sticky top-0 z-30 border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap gap-3 justify-between items-center">
          <div className="flex flex-col">
            <h1 className="text-lg font-black text-gray-900 leading-tight truncate max-w-[160px] sm:max-w-[260px] md:max-w-[360px]">
              {sessionData.name}
            </h1>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded uppercase tracking-wider">{sessionData.code}</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{sessionData.status}</span>
              <span className="text-[10px] font-bold text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded uppercase tracking-wider">
                {sessionData.mode}
              </span>
            </div>
          </div>
          <button
            onClick={() =>
              router.push(sessionData.communityId ? `/community/${sessionData.communityId}` : "/")
            }
            className="bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg text-sm font-bold active:scale-95 transition-transform"
          >
            Back
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-4 w-full flex-1">
        {error && (
          <div className="bg-red-500 text-white px-4 py-3 rounded-xl mb-4 flex justify-between items-center shadow-lg">
            <span className="text-sm font-bold">{error}</span>
            <button onClick={() => setError("")} className="font-bold text-xl ml-2 leading-none">&times;</button>
          </div>
        )}

        {/* Admin Quick Actions */}
        {isAdmin && (
          <div className="flex overflow-x-auto gap-2 pb-4 scrollbar-hide no-scrollbar">
            {sessionData.status === SessionStatus.WAITING && (
              <button
                onClick={startSession}
                className="whitespace-nowrap bg-green-600 text-white px-4 py-2.5 rounded-xl font-black text-sm uppercase tracking-wider shadow-md active:bg-green-700 active:scale-95 transition-all"
              >
                Start Session
              </button>
            )}
            <button
              onClick={() => {
                fetchCommunityPlayers();
                setGuestName("");
                setGuestGender(PlayerGender.MALE);
                setGuestPreference(PartnerPreference.OPEN);
                setGuestInitialElo(1000);
                setShowRosterModal(true);
              }}
              className="whitespace-nowrap bg-blue-600 text-white px-4 py-2.5 rounded-xl font-black text-sm uppercase tracking-wider shadow-md active:bg-blue-700 active:scale-95 transition-all"
            >
              Add Players
            </button>
            {sessionData.status === SessionStatus.ACTIVE && (
              <button
                onClick={endSession}
                className="whitespace-nowrap bg-red-600 text-white px-4 py-2.5 rounded-xl font-black text-sm uppercase tracking-wider shadow-md active:bg-red-700 active:scale-95 transition-all"
              >
                End Session
              </button>
            )}
          </div>
        )}

        {/* Courts Grid - Up to 3 columns on tablet/desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-8">
          {sessionData.courts
            .sort((a, b) => a.courtNumber - b.courtNumber)
            .map((court) => {
              const currentMatch = court.currentMatch;
              const isParticipant = currentMatch && [
                currentMatch.team1User1.id,
                currentMatch.team1User2.id,
                currentMatch.team2User1.id,
                currentMatch.team2User2.id
              ].includes(currentUserId);
              
              const canEdit = currentMatch?.status === MatchStatus.IN_PROGRESS && (isAdmin || isParticipant);
              const scores = currentMatch ? (matchScores[currentMatch.id] || { team1: "", team2: "" }) : { team1: "", team2: "" };

              return (
                <div key={court.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col min-w-0">
                  <div className="bg-gray-50/80 px-3 py-2.5 border-b border-gray-100 flex justify-between items-center">
                    <h2 className="text-sm font-black text-gray-500 uppercase tracking-widest">Court {court.courtNumber}</h2>
                    <div className="flex gap-2">
                      {sessionData.status === SessionStatus.ACTIVE && !court.currentMatch && isAdmin && (
                        <>
                          <button
                            onClick={() => generateMatch(court.id)}
                            className="text-[10px] bg-blue-600 text-white px-2.5 py-1.5 rounded-lg font-black uppercase tracking-wider active:scale-95 transition-all"
                          >
                            New Match
                          </button>
                          <button
                            onClick={() => openManualMatchModal(court.id)}
                            className="text-[10px] bg-gray-900 text-white px-2.5 py-1.5 rounded-lg font-black uppercase tracking-wider active:scale-95 transition-all"
                          >
                            Manual
                          </button>
                        </>
                      )}
                      {currentMatch && currentMatch.status === MatchStatus.IN_PROGRESS && isAdmin && (
                        <button
                          onClick={() => reshuffleMatch(court.id)}
                          className="text-[10px] bg-gray-100 text-gray-600 px-2.5 py-1.5 rounded-lg font-black uppercase tracking-wider active:scale-95 transition-all flex items-center gap-1"
                          title="Pick different players"
                        >
                          Reshuffle
                        </button>
                      )}
                      {currentMatch && currentMatch.status === MatchStatus.IN_PROGRESS && isAdmin && (
                        <button
                          onClick={() => undoMatchSelection(court.id)}
                          disabled={undoingCourtId === court.id}
                          className="text-[10px] bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-1.5 rounded-lg font-black uppercase tracking-wider active:scale-95 transition-all flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Put selected players back in pool"
                        >
                          {undoingCourtId === court.id ? "Undoing..." : "Undo"}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="p-3 flex-1 flex flex-col justify-center">
                    {currentMatch ? (
                      <div className="space-y-3">
                        {/* Team 1 Card */}
                        <div className={`p-3 rounded-xl border-2 transition-all ${currentMatch.status === MatchStatus.PENDING_APPROVAL ? 'bg-gray-50 border-gray-100' : 'bg-blue-50/50 border-blue-100'}`}>
                          <div className="flex justify-between items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-0.5">Team 1</p>
                              <p className="font-bold text-gray-900 truncate text-sm leading-tight">
                                {currentMatch.team1User1.name}<br/>{currentMatch.team1User2.name}
                              </p>
                            </div>
                            {canEdit ? (
                              <input
                                type="number"
                                inputMode="numeric"
                                value={scores.team1}
                                onChange={(e) => handleScoreChange(currentMatch.id, 'team1', e.target.value)}
                                className="w-14 h-12 border-2 border-blue-200 rounded-xl text-center font-black text-xl focus:outline-none focus:border-blue-500 bg-white"
                                placeholder="0"
                              />
                            ) : currentMatch.status === MatchStatus.PENDING_APPROVAL && (
                              <div className="text-2xl font-black text-gray-900 pr-2">{currentMatch.team1Score}</div>
                            )}
                          </div>
                        </div>

                        {/* VS Divider */}
                        <div className="relative flex items-center justify-center py-1">
                          <div className="h-px bg-gray-100 flex-1"></div>
                          <span className="mx-3 text-[10px] font-black text-gray-300 italic uppercase">VS</span>
                          <div className="h-px bg-gray-100 flex-1"></div>
                        </div>

                        {/* Team 2 Card */}
                        <div className={`p-3 rounded-xl border-2 transition-all ${currentMatch.status === MatchStatus.PENDING_APPROVAL ? 'bg-gray-50 border-gray-100' : 'bg-blue-50 border-blue-200'}`}>
                          <div className="flex justify-between items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest mb-0.5">Team 2</p>
                              <p className="font-bold text-gray-900 truncate text-sm leading-tight">
                                {currentMatch.team2User1.name}<br/>{currentMatch.team2User2.name}
                              </p>
                            </div>
                            {canEdit ? (
                              <input
                                type="number"
                                inputMode="numeric"
                                value={scores.team2}
                                onChange={(e) => handleScoreChange(currentMatch.id, 'team2', e.target.value)}
                                className="w-14 h-12 border-2 border-blue-200 rounded-xl text-center font-black text-xl focus:outline-none focus:border-blue-500 bg-white"
                                placeholder="0"
                              />
                            ) : currentMatch.status === MatchStatus.PENDING_APPROVAL && (
                              <div className="text-2xl font-black text-gray-900 pr-2">{currentMatch.team2Score}</div>
                            )}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        {canEdit && (
                          <div className="pt-2">
                            <button
                              onClick={() => submitScore(currentMatch.id)}
                              disabled={submittingMatchId === currentMatch.id || !scores.team1 || !scores.team2}
                              className="w-full bg-gray-900 text-white py-3 rounded-xl font-black uppercase text-sm shadow-md active:bg-gray-800 active:scale-95 disabled:opacity-50 transition-all"
                            >
                              {submittingMatchId === currentMatch.id ? "Saving..." : "Submit Score"}
                            </button>
                          </div>
                        )}

                        {currentMatch.status === MatchStatus.PENDING_APPROVAL && (
                          <div className="pt-2 space-y-2">
                            {isAdmin && (
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  onClick={() => approveScore(currentMatch.id)}
                                  className="w-full bg-blue-600 text-white py-3 rounded-xl font-black uppercase text-sm shadow-md active:bg-blue-700 active:scale-95 transition-all"
                                >
                                  Approve Results
                                </button>
                                <button
                                  onClick={() => reopenScoreForEdit(currentMatch.id)}
                                  disabled={reopeningMatchId === currentMatch.id}
                                  className="w-full bg-gray-100 text-gray-700 border border-gray-200 py-3 rounded-xl font-black uppercase text-sm active:bg-gray-200 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {reopeningMatchId === currentMatch.id ? "Opening..." : "Back To Edit"}
                                </button>
                              </div>
                            )}
                            <div className="bg-orange-50 text-orange-700 text-[10px] font-black py-2 rounded-lg text-center uppercase tracking-widest border border-orange-100">
                              Awaiting Approval
                            </div>
                          </div>
                        )}
                        
                        {currentMatch.status === MatchStatus.IN_PROGRESS && !canEdit && (
                          <div className="py-2 text-center">
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-blue-100 text-blue-800">
                              Match Active
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-10 px-4">
                        <div className="text-xs mb-2 opacity-40 font-black tracking-[0.35em]">COURT</div>
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">
                          {sessionData.status === SessionStatus.ACTIVE ? "Next match soon" : "Court Inactive"}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
        </div>

        {/* Combined Mobile Leaderboard / Standings */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className={`${sessionData.type === SessionType.ELO ? 'bg-blue-700' : 'bg-blue-600'} px-5 py-4 flex justify-between items-center transition-colors`}>
              <h2 className="text-sm font-black text-white uppercase tracking-widest">
                {sessionData.type === SessionType.ELO ? 'ELO Rankings' : 'Live Standings'}
              </h2>
              <span className="text-[10px] font-bold text-white/70 uppercase tracking-widest">
                {sessionData.type === SessionType.ELO ? 'Dynamic Ratings' : 'Point Totals'}
              </span>
            </div>
            
            <div className="overflow-x-auto overscroll-x-contain">
              <table
                className={`w-max sm:w-full table-fixed sm:table-auto ${
                  sessionData.type === SessionType.POINTS
                    ? "min-w-[448px] sm:min-w-[760px]"
                    : "min-w-[360px] sm:min-w-[640px]"
                }`}
              >
                <thead className="bg-gray-50/50 border-b border-gray-100">
                  <tr>
                    <th className="w-8 sm:w-10 px-1.5 sm:px-2 py-3 text-left text-[9px] sm:text-[10px] font-black text-gray-400 uppercase tracking-widest">#</th>
                    <th className="w-[112px] sm:w-auto px-1 sm:px-2 py-3 text-left text-[9px] sm:text-[10px] font-black text-gray-400 uppercase tracking-wide sm:tracking-widest">Player</th>
                    {sessionData.type === SessionType.POINTS ? (
                      <>
                        <th className="w-11 sm:w-24 px-1 sm:px-4 py-3 text-center text-[8px] sm:text-[10px] font-black text-gray-400 uppercase tracking-wide sm:tracking-widest">Pts</th>
                        <th className="w-12 sm:w-24 px-1 sm:px-4 py-3 text-center text-[8px] sm:text-[10px] font-black text-gray-400 uppercase tracking-wide sm:tracking-widest">
                          <span className="sm:hidden">+/-</span>
                          <span className="hidden sm:inline">Diff</span>
                        </th>
                        <th className="w-10 sm:w-24 px-1 sm:px-4 py-3 text-center text-[8px] sm:text-[10px] font-black text-gray-400 uppercase tracking-wide sm:tracking-widest">MP</th>
                        <th className="w-11 sm:w-24 px-1 sm:px-4 py-3 text-center text-[8px] sm:text-[10px] font-black text-gray-400 uppercase tracking-wide sm:tracking-widest">W/L</th>
                      </>
                    ) : (
                      <>
                        <th className="w-14 sm:w-24 px-1 sm:px-4 py-3 text-right text-[8px] sm:text-[10px] font-black text-gray-400 uppercase tracking-wide sm:tracking-widest">
                          {SessionType.ELO}
                        </th>
                        <th className="w-10 sm:w-24 px-1 sm:px-4 py-3 text-center text-[8px] sm:text-[10px] font-black text-gray-400 uppercase tracking-wide sm:tracking-widest">MP</th>
                        <th className="w-11 sm:w-24 px-1 sm:px-4 py-3 text-center text-[8px] sm:text-[10px] font-black text-gray-400 uppercase tracking-wide sm:tracking-widest">W/L</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {sessionData.players
                    .sort((a, b) => 
                      sessionData.type === SessionType.ELO 
                        ? b.user.elo - a.user.elo 
                        : b.sessionPoints - a.sessionPoints ||
                          calculatePlayerPointDiff(b.userId) - calculatePlayerPointDiff(a.userId) ||
                          a.user.name.localeCompare(b.user.name)
                    )
                    .map((player, idx) => {
                      const stats = calculatePlayerSessionStats(player.userId);
                      const isMe = player.userId === currentUserId;
                      const canToggle = isAdmin || isMe;
                      const pointDiff = calculatePlayerPointDiff(player.userId);

                      return (
                        <tr key={player.userId} className={`active:bg-gray-50 transition-colors ${player.isPaused ? 'opacity-40 grayscale' : ''}`}>
                          <td className="w-8 sm:w-10 px-1.5 sm:px-2 py-3 sm:py-4 whitespace-nowrap">
                            <span className={`w-5 h-5 sm:w-6 sm:h-6 rounded-lg flex items-center justify-center text-[9px] sm:text-[10px] font-black ${
                              idx === 0
                                ? "bg-amber-100 text-amber-700 border border-amber-300"
                                : idx === 1
                                  ? "bg-slate-100 text-slate-700 border border-slate-300"
                                  : idx === 2
                                    ? "bg-orange-100 text-orange-700 border border-orange-300"
                                    : "bg-white text-gray-500 border border-gray-300"
                            }`}>
                              {idx + 1}
                            </span>
                          </td>
                          <td className="w-[112px] sm:w-auto px-1 sm:px-2 py-3 sm:py-4 min-w-[112px] sm:min-w-[140px] align-top">
                            <div className="flex flex-col gap-1.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Link
                                  href={
                                    sessionData.communityId && !player.isGuest
                                      ? `/profile/${player.user.id}?communityId=${sessionData.communityId}`
                                      : `/profile/${player.user.id}`
                                  }
                                  className="block max-w-[92px] sm:max-w-none truncate sm:whitespace-normal font-bold text-gray-900 text-[11px] sm:text-sm hover:text-blue-600 leading-tight"
                                >
                                  {player.user.name}
                                </Link>
                                {isMe && (
                                  <span className="h-5 sm:h-6 px-1 sm:px-2 rounded-full text-[7px] sm:text-[9px] font-black uppercase tracking-[0.08em] sm:tracking-wide bg-blue-100 text-blue-700 border border-blue-200 inline-flex items-center">
                                    Me
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 flex-wrap relative">
                                {sessionData.type !== SessionType.ELO && (
                                  <span className="hidden sm:inline text-[9px] font-bold text-gray-400 uppercase">
                                    ELO {player.user.elo}
                                  </span>
                                )}
                                {canToggle && (
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      togglePausePlayer(player.userId, player.isPaused);
                                    }}
                                    className={`h-5 sm:h-6 px-1 sm:px-2 rounded-full text-[7px] sm:text-[9px] font-black uppercase tracking-[0.08em] sm:tracking-wide border inline-flex items-center shrink-0 ${
                                      player.isPaused
                                        ? "bg-rose-100 text-rose-700 border-rose-200"
                                        : "bg-gray-100 text-gray-600 border-gray-200"
                                    }`}
                                  >
                                    {player.isPaused ? "Resume" : "Pause"}
                                  </button>
                                )}
                                {isAdmin && isMixicano && (
                                  <button
                                    type="button"
                                    onClick={(e) =>
                                      togglePreferenceEditor(player.userId, e.currentTarget)
                                    }
                                    className="h-5 sm:h-6 px-1 sm:px-2 rounded-full text-[7px] sm:text-[9px] font-black uppercase tracking-[0.08em] sm:tracking-wide border inline-flex items-center bg-blue-100 text-blue-700 border-blue-200"
                                    >
                                      Edit
                                    </button>
                                )}
                                {player.isGuest && (
                                  <span className="h-5 sm:h-6 px-1 sm:px-2 rounded-full text-[7px] sm:text-[9px] font-black uppercase tracking-[0.08em] sm:tracking-wide bg-gray-100 text-gray-600 border border-gray-200 inline-flex items-center">
                                    Guest
                                  </span>
                                )}
                                {savingPreferencesFor === player.userId && (
                                  <span className="text-[8px] sm:text-[9px] font-black text-gray-400 uppercase tracking-wider">
                                    Saving...
                                  </span>
                                )}
                                {openPreferenceEditor?.userId === player.userId &&
                                  isAdmin &&
                                  isMixicano && (
                                  <div
                                    className="fixed z-40 bg-white border border-gray-200 rounded-xl shadow-lg p-2.5 w-44 space-y-2"
                                    style={{
                                      left: openPreferenceEditor.left,
                                      top: openPreferenceEditor.top,
                                      transform: openPreferenceEditor.openUp
                                        ? "translateY(-100%)"
                                        : "translateY(0)",
                                    }}
                                  >
                                    <div className="space-y-1">
                                      <p className="text-[9px] font-black uppercase tracking-wider text-gray-400">
                                        Gender
                                      </p>
                                      <select
                                        value={player.gender}
                                        onChange={async (e) => {
                                          const nextGender = e.target.value as PlayerGender;
                                          setOpenPreferenceEditor(null);
                                          const nextPreference =
                                            nextGender === PlayerGender.MALE
                                              ? PartnerPreference.OPEN
                                            : PartnerPreference.FEMALE_FLEX;
                                        await updatePlayerPreference(
                                          player.userId,
                                          nextGender,
                                          nextPreference
                                        );
                                      }}
                                      className="h-8 w-full bg-white border border-gray-200 rounded-lg px-2 text-[10px] font-black uppercase tracking-wide text-gray-700 focus:outline-none focus:border-blue-400"
                                    >
                                        <option value={PlayerGender.MALE}>Male</option>
                                        <option value={PlayerGender.FEMALE}>Female</option>
                                      </select>
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-[9px] font-black uppercase tracking-wider text-gray-400">
                                        Open Tag
                                      </p>
                                      {player.gender === PlayerGender.FEMALE ? (
                                        <select
                                          value={player.partnerPreference}
                                          onChange={async (e) => {
                                            const nextPreference = e.target.value as PartnerPreference;
                                            setOpenPreferenceEditor(null);
                                            await updatePlayerPreference(
                                              player.userId,
                                              player.gender,
                                              nextPreference
                                            );
                                          }}
                                          className="h-8 w-full bg-white border border-gray-200 rounded-lg px-2 text-[10px] font-black uppercase tracking-wide text-gray-700 focus:outline-none focus:border-blue-400"
                                        >
                                          <option value={PartnerPreference.FEMALE_FLEX}>Default</option>
                                          <option value={PartnerPreference.OPEN}>Open Tag</option>
                                        </select>
                                      ) : (
                                        <p className="text-[10px] font-black uppercase tracking-wide text-gray-500 px-1 py-2">
                                          Not Needed
                                        </p>
                                      )}
                                    </div>
                                    <div className="flex justify-end">
                                      <button
                                        type="button"
                                        onClick={() => setOpenPreferenceEditor(null)}
                                        className="text-[9px] font-black uppercase tracking-widest text-gray-500"
                                      >
                                        Close
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          {sessionData.type === SessionType.POINTS ? (
                            <>
                              <td className="w-11 sm:w-24 px-1 sm:px-4 py-3 sm:py-4 whitespace-nowrap text-center">
                                <span className="text-[13px] sm:text-base font-black text-blue-700">{player.sessionPoints}</span>
                              </td>
                              <td className="w-12 sm:w-24 px-1 sm:px-4 py-3 sm:py-4 whitespace-nowrap text-center">
                                <span className={`text-[11px] sm:text-sm font-medium ${pointDiff >= 0 ? "text-green-600" : "text-red-500"}`}>
                                  {pointDiff > 0 ? `+${pointDiff}` : pointDiff}
                                </span>
                              </td>
                              <td className="w-10 sm:w-24 px-1 sm:px-4 py-3 sm:py-4 whitespace-nowrap text-center">
                                <span className="text-[10px] sm:text-xs font-bold text-gray-600">{stats.played}</span>
                              </td>
                              <td className="w-11 sm:w-24 px-1 sm:px-4 py-3 sm:py-4 whitespace-nowrap text-center">
                                <div className="text-[8px] sm:text-[10px] font-black tracking-tighter">
                                  <span className="text-green-600">{stats.wins}</span>
                                  <span className="mx-0.5 text-gray-200">/</span>
                                  <span className="text-red-500">{stats.losses}</span>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="w-14 sm:w-24 px-1 sm:px-4 py-3 sm:py-4 whitespace-nowrap text-right">
                                <span className="text-[13px] sm:text-base font-black text-blue-700">{player.user.elo}</span>
                              </td>
                              <td className="w-10 sm:w-24 px-1 sm:px-4 py-3 sm:py-4 whitespace-nowrap text-center">
                                <span className="text-[10px] sm:text-xs font-bold text-gray-600">{stats.played}</span>
                              </td>
                              <td className="w-11 sm:w-24 px-1 sm:px-4 py-3 sm:py-4 whitespace-nowrap text-center">
                                <div className="text-[8px] sm:text-[10px] font-black tracking-tighter">
                                  <span className="text-green-600">{stats.wins}</span>
                                  <span className="mx-0.5 text-gray-200">/</span>
                                  <span className="text-red-500">{stats.losses}</span>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* Mobile-Friendly Roster Modal */}
      {showRosterModal && (
        <div className="fixed inset-0 bg-gray-900/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-w-lg w-full max-h-[92vh] flex flex-col animate-in slide-in-from-bottom duration-300">
            <div className="px-4 py-3 border-b flex justify-between items-center">
              <div>
                <h2 className="text-base font-black text-gray-900">Add Players</h2>
              </div>
              <button 
                onClick={() => {
                  setShowRosterModal(false);
                  setRosterSearch("");
                  setGuestName("");
                  setGuestGender(PlayerGender.MALE);
                  setGuestPreference(PartnerPreference.OPEN);
                  setGuestInitialElo(1000);
                }}
                className="bg-gray-100 text-gray-400 hover:text-gray-600 w-7 h-7 rounded-full flex items-center justify-center text-lg font-bold"
              >
                &times;
              </button>
            </div>
            
            {/* Search Bar */}
            <div className="px-3 py-2 border-b bg-gray-50/50 space-y-2">
              {isAdmin && (
                <div
                  className={`grid gap-2 ${
                    isMixicano
                      ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                      : "grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                  }`}
                >
                  <input
                    type="text"
                    placeholder="Guest name..."
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    className="flex-1 h-9 bg-white border border-gray-200 rounded-lg px-3 text-xs font-bold focus:outline-none focus:border-blue-500 transition-all"
                  />
                  <select
                    value={guestInitialElo}
                    onChange={(e) => setGuestInitialElo(parseInt(e.target.value, 10))}
                    className="h-9 bg-white border border-gray-200 rounded-lg px-2 text-[10px] font-bold focus:outline-none focus:border-blue-500 transition-all"
                  >
                    {GUEST_ELO_PRESETS.map((preset) => (
                      <option key={preset.label} value={preset.value}>
                        {preset.label} ({preset.value})
                      </option>
                    ))}
                  </select>
                  {isMixicano && (
                    <>
                      <select
                        value={guestGender}
                        onChange={(e) => {
                          const nextGender = e.target.value as PlayerGender;
                          setGuestGender(nextGender);
                          setGuestPreference(
                            nextGender === PlayerGender.FEMALE
                              ? PartnerPreference.FEMALE_FLEX
                              : PartnerPreference.OPEN
                          );
                        }}
                        className="h-9 bg-white border border-gray-200 rounded-lg px-2 text-[10px] font-bold focus:outline-none focus:border-blue-500 transition-all"
                      >
                        <option value={PlayerGender.MALE}>Male</option>
                        <option value={PlayerGender.FEMALE}>Female</option>
                      </select>
                      <select
                        value={guestPreference}
                        onChange={(e) => setGuestPreference(e.target.value as PartnerPreference)}
                        className="h-9 bg-white border border-gray-200 rounded-lg px-2 text-[10px] font-bold focus:outline-none focus:border-blue-500 transition-all"
                      >
                        {guestGender === PlayerGender.FEMALE ? (
                          <>
                            <option value={PartnerPreference.FEMALE_FLEX}>Default</option>
                            <option value={PartnerPreference.OPEN}>Open Tag</option>
                          </>
                        ) : (
                          <option value={PartnerPreference.OPEN}>Open</option>
                        )}
                      </select>
                    </>
                  )}
                  <button
                    onClick={addGuestToSession}
                    disabled={addingGuest || !guestName.trim()}
                    className="h-9 bg-gray-900 text-white px-3 rounded-lg text-[10px] font-black uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                  >
                    {addingGuest ? "Adding..." : "Add"}
                  </button>
                </div>
              )}
              <input
                type="text"
                placeholder="Search players..."
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
                className="w-full h-9 bg-white border border-gray-200 rounded-lg px-3 text-xs font-bold focus:outline-none focus:border-blue-500 transition-all"
              />
            </div>
            
            <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
              {playersNotInSession.length === 0 ? (
                <div className="text-center py-12 text-gray-400 italic text-sm">
                  Everyone is already playing!
                </div>
              ) : (
                playersNotInSession.map((player) => {
                  return (
                    <div
                      key={player.id}
                      className="flex justify-between items-center px-3 py-2 bg-gray-50 rounded-xl border border-gray-100 active:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="font-black text-sm text-gray-900 truncate">{player.name}</p>
                        <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider whitespace-nowrap">
                          ELO {player.elo}
                        </span>
                      </div>
                      <button
                        onClick={() => addPlayerToSession(player.id)}
                        disabled={addingPlayerId === player.id}
                        className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider shadow-sm active:scale-95 disabled:opacity-50 transition-all"
                      >
                        {addingPlayerId === player.id ? "..." : "Add"}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            
            <div className="p-3 bg-white border-t sm:rounded-b-2xl flex justify-end">
              <button
                onClick={() => {
                  setShowRosterModal(false);
                  setRosterSearch("");
                  setGuestName("");
                  setGuestGender(PlayerGender.MALE);
                  setGuestPreference(PartnerPreference.OPEN);
                  setGuestInitialElo(1000);
                }}
                className="bg-gray-900 text-white px-4 py-2 rounded-lg font-black uppercase tracking-widest text-[10px] shadow-sm active:scale-95 transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {manualCourtId && (
        <div className="fixed inset-0 bg-gray-900/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-w-lg w-full max-h-[92vh] flex flex-col animate-in slide-in-from-bottom duration-300">
            <div className="px-4 py-3 border-b flex justify-between items-center">
              <div>
                <h2 className="text-base font-black text-gray-900">Manual Match</h2>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                  {activeManualCourt ? `Court ${activeManualCourt.courtNumber}` : "Select Teams"}
                </p>
              </div>
              <button
                onClick={closeManualMatchModal}
                className="bg-gray-100 text-gray-400 hover:text-gray-600 w-7 h-7 rounded-full flex items-center justify-center text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto">
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">
                  Team 1
                </p>
                {(["team1User1Id", "team1User2Id"] as ManualMatchSlot[]).map((slot, index) => (
                  <select
                    key={slot}
                    value={manualMatchForm[slot]}
                    onChange={(e) => updateManualMatchSlot(slot, e.target.value)}
                    className="w-full h-11 bg-white border border-gray-200 rounded-xl px-3 text-sm font-bold focus:outline-none focus:border-blue-500 transition-all"
                  >
                    <option value="">Choose Player {index + 1}</option>
                    {manualMatchPlayerOptions.map((player) => {
                      const isTakenElsewhere =
                        selectedManualPlayerIds.has(player.userId) &&
                        manualMatchForm[slot] !== player.userId;
                      return (
                        <option
                          key={player.userId}
                          value={player.userId}
                          disabled={isTakenElsewhere}
                        >
                          {player.user.name} ({player.user.elo})
                        </option>
                      );
                    })}
                  </select>
                ))}
              </div>

              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">
                  Team 2
                </p>
                {(["team2User1Id", "team2User2Id"] as ManualMatchSlot[]).map((slot, index) => (
                  <select
                    key={slot}
                    value={manualMatchForm[slot]}
                    onChange={(e) => updateManualMatchSlot(slot, e.target.value)}
                    className="w-full h-11 bg-white border border-gray-200 rounded-xl px-3 text-sm font-bold focus:outline-none focus:border-blue-500 transition-all"
                  >
                    <option value="">Choose Player {index + 1}</option>
                    {manualMatchPlayerOptions.map((player) => {
                      const isTakenElsewhere =
                        selectedManualPlayerIds.has(player.userId) &&
                        manualMatchForm[slot] !== player.userId;
                      return (
                        <option
                          key={player.userId}
                          value={player.userId}
                          disabled={isTakenElsewhere}
                        >
                          {player.user.name} ({player.user.elo})
                        </option>
                      );
                    })}
                  </select>
                ))}
              </div>

              <div className="rounded-2xl border border-gray-100 bg-blue-50 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">
                  Note
                </p>
                <p className="text-xs text-blue-900 mt-1">
                  This bypasses automatic balancing for this one match only. Matchmaking state still updates normally when the result is approved.
                </p>
              </div>

              {manualMatchPlayerOptions.length < 4 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-xs font-bold text-amber-800">
                    At least 4 available, unpaused players are required to create a manual match.
                  </p>
                </div>
              )}
            </div>

            <div className="p-4 border-t bg-white sm:rounded-b-2xl flex justify-end gap-2">
              <button
                type="button"
                onClick={closeManualMatchModal}
                className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-[10px] font-black uppercase tracking-widest"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createManualMatch}
                disabled={creatingManualMatch || manualMatchPlayerOptions.length < 4}
                className="px-4 py-2 rounded-xl bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingManualMatch ? "Creating..." : "Create Match"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

