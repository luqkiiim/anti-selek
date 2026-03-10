"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  FlashMessage,
  HeroCard,
} from "@/components/ui/chrome";
import { HostTournamentPanel } from "@/components/community/HostTournamentPanel";
import { CurrentTournamentsPanel } from "@/components/community/CurrentTournamentsPanel";
import { PastTournamentsPanel } from "@/components/community/PastTournamentsPanel";
import {
  doClaimNamesMatch,
  getClaimRequesterEligibility,
} from "@/lib/communityClaimRules";
import { getSessionModeLabel } from "@/lib/sessionModeLabels";
import {
  ClaimRequestStatus,
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
  isAdmin?: boolean;
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
  isClaimed: boolean;
  role: "ADMIN" | "MEMBER";
}

interface Session {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
  createdAt: string;
  endedAt?: string | null;
  players: { user: { id: string; name: string } }[];
}

interface GuestConfig {
  name: string;
  gender: PlayerGender;
  partnerPreference: PartnerPreference;
  initialElo: number;
}

interface ClaimRequest {
  id: string;
  communityId: string;
  requesterUserId: string;
  requesterName: string;
  requesterEmail: string | null;
  targetUserId: string;
  targetName: string;
  targetEmail: string | null;
  status: ClaimRequestStatus;
  note?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
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
  const openModeLabel = getSessionModeLabel(SessionMode.MEXICANO);
  const mixedModeLabel = getSessionModeLabel(SessionMode.MIXICANO);

  const [user, setUser] = useState<User | null>(null);
  const [community, setCommunity] = useState<Community | null>(null);
  const [communityMembers, setCommunityMembers] = useState<CommunityMember[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [claimRequests, setClaimRequests] = useState<ClaimRequest[]>([]);

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
  const [rollingBackTournamentCode, setRollingBackTournamentCode] = useState<string | null>(null);
  const [requestingClaimFor, setRequestingClaimFor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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
    () =>
      sessions
        .filter((s) => s.status === SessionStatus.COMPLETED)
        .sort((a, b) => {
          const aTime = new Date(a.endedAt ?? a.createdAt).getTime();
          const bTime = new Date(b.endedAt ?? b.createdAt).getTime();
          return bTime - aTime;
        }),
    [sessions]
  );
  const latestPastTournamentId = pastTournaments[0]?.id ?? null;

  const canManageCommunity = (!!community && community.role === "ADMIN") || !!user?.isAdmin;
  const selectablePlayers = communityMembers.filter((member) => member.id !== user?.id);
  const filteredSelectablePlayers = selectablePlayers.filter((member) =>
    member.name.toLowerCase().includes(playerSearch.toLowerCase())
  );
  const currentUserCommunityMember =
    communityMembers.find((member) => member.id === user?.id) ?? null;
  const currentUserHasCommunitySessionHistory = useMemo(
    () =>
      sessions.some((sessionItem) =>
        sessionItem.players.some((playerItem) => playerItem.user.id === user?.id)
      ),
    [sessions, user?.id]
  );
  const currentUserClaimEligibility = getClaimRequesterEligibility({
    isClaimed: currentUserCommunityMember?.isClaimed ?? false,
    communityElo: currentUserCommunityMember?.elo ?? 1000,
    hasCommunitySessionHistory: currentUserHasCommunitySessionHistory,
  });
  const pendingClaimByTargetId = useMemo(
    () => new Map(claimRequests.map((claimRequest) => [claimRequest.targetUserId, claimRequest])),
    [claimRequests]
  );
  const myPendingClaimRequest = useMemo(
    () =>
      claimRequests.find(
        (claimRequest) =>
          claimRequest.requesterUserId === user?.id &&
          claimRequest.status === ClaimRequestStatus.PENDING
      ) ?? null,
    [claimRequests, user?.id]
  );

  const refreshCommunityData = useCallback(
    async (options?: { includeCommunity?: boolean }) => {
      if (!communityId) return;

      const requests = [
        fetch(`/api/communities/${communityId}/members`),
        fetch(`/api/sessions?communityId=${encodeURIComponent(communityId)}`),
        fetch(`/api/communities/${communityId}/claim-requests`),
      ] as const;

      const [membersRes, sessionsRes, claimRequestsRes] = await Promise.all(requests);
      const [membersData, sessionsData, claimRequestsData] = await Promise.all([
        safeJson(membersRes),
        safeJson(sessionsRes),
        safeJson(claimRequestsRes),
      ]);

      if (!membersRes.ok) {
        throw new Error(membersData.error || "Failed to load community members");
      }
      if (!sessionsRes.ok) {
        throw new Error(sessionsData.error || "Failed to load tournaments");
      }
      if (!claimRequestsRes.ok) {
        throw new Error(claimRequestsData.error || "Failed to load claim requests");
      }

      setCommunityMembers(Array.isArray(membersData) ? membersData : []);
      setSessions(Array.isArray(sessionsData) ? sessionsData : []);
      setClaimRequests(Array.isArray(claimRequestsData) ? claimRequestsData : []);

      if (options?.includeCommunity) {
        const communitiesRes = await fetch("/api/communities");
        const communitiesData = await safeJson(communitiesRes);
        if (!communitiesRes.ok) {
          throw new Error(communitiesData.error || "Failed to load communities");
        }

        const list = Array.isArray(communitiesData) ? (communitiesData as Community[]) : [];
        const currentCommunity = list.find((communityItem) => communityItem.id === communityId) || null;
        if (!currentCommunity) {
          throw new Error("Community not found or access denied");
        }
        setCommunity(currentCommunity);
      }
    },
    [communityId]
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
        setSuccess("");

        const meRes = await fetch("/api/user/me");
        const meData = await safeJson(meRes);
        if (!meRes.ok || !meData.user) {
          throw new Error(meData.error || "Failed to load user");
        }
        setUser(meData.user as User);

        await refreshCommunityData({ includeCommunity: true });
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load community");
      } finally {
        setLoading(false);
      }
    })();
  }, [status, router, communityId, refreshCommunityData]);

  const createSession = async () => {
    if (!newSessionName.trim() || !communityId) return;

    if (sessionMode === SessionMode.MIXICANO) {
      const invalidGuest = guestConfigs.find(
        (guest) => ![PlayerGender.MALE, PlayerGender.FEMALE].includes(guest.gender)
      );
      if (invalidGuest) {
        setError(`${mixedModeLabel} requires MALE/FEMALE gender for guest ${invalidGuest.name}`);
        return;
      }
    }

    setCreatingSession(true);
    setError("");
    setSuccess("");
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
    setSuccess("");
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

  const rollbackTournament = async (tournament: Session) => {
    if (!canManageCommunity) return;

    const confirmed = confirm(
      `Rollback and delete "${tournament.name}"?\n\nThis will reverse rating changes from this tournament and cannot be undone.`
    );
    if (!confirmed) return;

    setRollingBackTournamentCode(tournament.code);
    setError("");
    setSuccess("");
    try {
      const rollbackRes = await fetch(`/api/sessions/${tournament.code}/rollback`, {
        method: "POST",
      });
      const rollbackData = await safeJson(rollbackRes);
      if (!rollbackRes.ok) {
        setError(rollbackData.error || "Failed to rollback tournament");
        return;
      }

      await refreshCommunityData({ includeCommunity: true });
      setSuccess(`Rolled back "${tournament.name}".`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to rollback tournament");
    } finally {
      setRollingBackTournamentCode(null);
    }
  };

  const requestClaim = async (player: CommunityMember) => {
    if (!communityId) return;

    setRequestingClaimFor(player.id);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/communities/${communityId}/claim-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: player.id,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to request claim");
      }

      await refreshCommunityData();
      setSuccess(`Claim request sent for ${player.name}. A community admin must approve it.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to request claim");
    } finally {
      setRequestingClaimFor(null);
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
      setError(`Choose MALE/FEMALE for guest before adding in ${mixedModeLabel}`);
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
      <div className="app-page flex items-center justify-center px-6">
        <div className="app-panel flex flex-col items-center gap-4 px-8 py-8">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          <p className="app-eyebrow">Loading community</p>
        </div>
      </div>
    );
  }

  const shouldIgnoreCardNavigation = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    !!target.closest("button, a, select, input, option");
  const openCommunityPlayerProfile = (playerId: string) => {
    router.push(`/profile/${playerId}?communityId=${communityId}`);
  };
  const handleLeaderboardCardClick = (
    event: MouseEvent<HTMLDivElement>,
    playerId: string
  ) => {
    if (shouldIgnoreCardNavigation(event.target)) {
      return;
    }

    openCommunityPlayerProfile(playerId);
  };
  const handleLeaderboardCardKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    playerId: string
  ) => {
    if (shouldIgnoreCardNavigation(event.target)) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openCommunityPlayerProfile(playerId);
    }
  };
  const openTournament = (code: string) => {
    router.push(`/session/${code}`);
  };
  const handlePastTournamentCardClick = (
    event: MouseEvent<HTMLDivElement>,
    code: string
  ) => {
    if (shouldIgnoreCardNavigation(event.target)) {
      return;
    }

    openTournament(code);
  };
  const handlePastTournamentCardKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    code: string
  ) => {
    if (shouldIgnoreCardNavigation(event.target)) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openTournament(code);
    }
  };
  return (
    <main className="app-page">
      <div className="app-topbar">
        <div className="app-topbar-inner">
          <div className="flex items-center gap-3">
          <Link
            href="/"
            className="app-button-secondary px-4 py-2"
          >
            Back
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 tracking-tight leading-none">
              {community?.name || "Community"}
            </h1>
            <p className="text-[11px] text-gray-500">
              {community?.membersCount || 0} members, {community?.sessionsCount || 0} tournaments
            </p>
          </div>
        </div>

        {canManageCommunity && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHostPanel((prev) => !prev)}
              className="app-button-primary"
            >
              {showHostPanel ? "Hide Host" : "Host Tournament"}
            </button>
            <Link
              href={`/community/${communityId}/admin`}
              className="app-button-dark"
            >
              Admin
            </Link>
          </div>
        )}
        </div>
      </div>

      <div className="app-shell space-y-8">
        <HeroCard
          eyebrow="Community hub"
          title={community?.name || "Community"}
          meta={
            <>
              <span className={`app-chip ${community?.role === "ADMIN" ? "app-chip-accent" : "app-chip-neutral"}`}>
                {community?.role || "MEMBER"}
              </span>
              {community?.isPasswordProtected ? <span className="app-chip app-chip-warning">Protected</span> : null}
            </>
          }
        />

        {success ? <FlashMessage tone="success">{success}</FlashMessage> : null}

        <CurrentTournamentsPanel
          tournaments={activeTournaments}
          currentUserId={user?.id}
          onJoinTournament={joinTournament}
        />

        {canManageCommunity && showHostPanel && (
          <>
            <HostTournamentPanel
              newSessionName={newSessionName}
              onNewSessionNameChange={setNewSessionName}
              sessionType={sessionType}
              onSessionTypeChange={setSessionType}
              sessionMode={sessionMode}
              onSessionModeChange={setSessionMode}
              openModeLabel={openModeLabel}
              mixedModeLabel={mixedModeLabel}
              courtCount={courtCount}
              onCourtCountChange={setCourtCount}
              selectedPlayerCount={selectedPlayerIds.length}
              guestCount={guestConfigs.length}
              onOpenPlayers={() => setShowPlayersModal(true)}
              onOpenGuests={() => setShowGuestsModal(true)}
              onCreateSession={createSession}
              creatingSession={creatingSession}
            />
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
                    role="link"
                    tabIndex={0}
                    onClick={(event) => handleLeaderboardCardClick(event, player.id)}
                    onKeyDown={(event) => handleLeaderboardCardKeyDown(event, player.id)}
                    className="cursor-pointer rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 w-6 shrink-0">
                        #{index + 1}
                        </span>
                        <div className="min-w-0">
                          <Link href={`/profile/${player.id}?communityId=${communityId}`} className="text-sm font-black text-gray-900 hover:text-blue-600 hover:underline">
                            {player.name}
                          </Link>
                          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mt-1">
                            {player.role}
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-black text-gray-900">{player.elo}</p>
                        <p className="text-[10px] font-black uppercase tracking-wider whitespace-nowrap">
                          <span className="text-green-600">W {player.wins}</span>
                          <span className="text-gray-300"> / </span>
                          <span className="text-red-600">L {player.losses}</span>
                        </p>
                      </div>
                    </div>

                    {!player.isClaimed && player.email === null && player.id !== user?.id && (() => {
                      const isNameMatch = !!user && doClaimNamesMatch(user.name, player.name);
                      const existingRequest = pendingClaimByTargetId.get(player.id);
                      const canShowClaimControls =
                        existingRequest?.requesterUserId === user?.id ||
                        (isNameMatch && currentUserClaimEligibility.canRequest);

                      if (!canShowClaimControls) {
                        return null;
                      }

                      const buttonDisabled =
                        requestingClaimFor !== null ||
                        pendingClaimByTargetId.has(player.id) ||
                        (!!myPendingClaimRequest && myPendingClaimRequest.targetUserId !== player.id) ||
                        !currentUserClaimEligibility.canRequest;

                      const statusText =
                        existingRequest?.requesterUserId === user?.id
                          ? "Claim request submitted"
                          : existingRequest
                            ? "Awaiting admin review"
                            : currentUserClaimEligibility.reason ??
                              "Request ownership of this placeholder";

                      const buttonLabel =
                        existingRequest?.requesterUserId === user?.id
                          ? "Requested"
                          : existingRequest
                            ? "Pending"
                            : myPendingClaimRequest
                              ? "Pending Elsewhere"
                              : requestingClaimFor === player.id
                                ? "Sending..."
                                : "Request Claim";

                      return (
                        <div className="mt-3 flex items-center justify-between gap-3 border-t border-gray-200 pt-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                            {statusText}
                          </p>
                          <button
                            type="button"
                            onClick={() => requestClaim(player)}
                            disabled={buttonDisabled}
                            className="px-3 py-2 rounded-xl bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {buttonLabel}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                ))
              )}
            </div>
          </div>

          <PastTournamentsPanel
            tournaments={pastTournaments}
            canManageCommunity={canManageCommunity}
            latestPastTournamentId={latestPastTournamentId}
            rollingBackTournamentCode={rollingBackTournamentCode}
            onCardClick={handlePastTournamentCardClick}
            onCardKeyDown={handlePastTournamentCardKeyDown}
            onRollbackTournament={rollbackTournament}
          />
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
                          Rating {player.elo}
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
                      onChange={(e) => {
                        const nextGender = e.target.value as PlayerGender;
                        setGuestGenderInput(nextGender);
                        setGuestPreferenceInput(
                          nextGender === PlayerGender.FEMALE
                            ? PartnerPreference.FEMALE_FLEX
                            : PartnerPreference.OPEN
                        );
                      }}
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
                      {guestGenderInput === PlayerGender.FEMALE ? (
                        <>
                          <option value={PartnerPreference.FEMALE_FLEX} className="text-gray-900">
                            Default
                          </option>
                          <option value={PartnerPreference.OPEN} className="text-gray-900">
                            Open Tag
                          </option>
                        </>
                      ) : (
                        <option value={PartnerPreference.OPEN} className="text-gray-900">
                          Open
                        </option>
                      )}
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
                          {guest.gender === PlayerGender.FEMALE
                            ? guest.partnerPreference === PartnerPreference.OPEN
                              ? "F / Open Tag"
                              : "F / Default"
                            : "M"}
                        </span>
                      )}
                      <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider whitespace-nowrap">
                        Rating {guest.initialElo}
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
