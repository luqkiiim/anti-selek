"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { getClaimRequesterEligibility } from "@/lib/communityClaimRules";
import { getSessionModeLabel } from "@/lib/sessionModeLabels";
import type {
  CommunityClaimRequest,
  CommunityGuestConfig,
  CommunityPageCommunity,
  CommunityPageMember,
  CommunityPageSection,
  CommunityPageSession,
  CommunityPageUser,
} from "@/components/community/communityTypes";
import {
  ClaimRequestStatus,
  PartnerPreference,
  PlayerGender,
  SessionMode,
  SessionStatus,
  SessionType,
} from "@/types/enums";

export function useCommunityPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const communityId = typeof params.id === "string" ? params.id : "";
  const openModeLabel = getSessionModeLabel(SessionMode.MEXICANO);
  const mixedModeLabel = getSessionModeLabel(SessionMode.MIXICANO);

  const [user, setUser] = useState<CommunityPageUser | null>(null);
  const [community, setCommunity] = useState<CommunityPageCommunity | null>(null);
  const [communityMembers, setCommunityMembers] = useState<CommunityPageMember[]>([]);
  const [sessions, setSessions] = useState<CommunityPageSession[]>([]);
  const [claimRequests, setClaimRequests] = useState<CommunityClaimRequest[]>([]);

  const [newSessionName, setNewSessionName] = useState("");
  const [sessionType, setSessionType] = useState<SessionType>(
    SessionType.POINTS
  );
  const [sessionMode, setSessionMode] = useState<SessionMode>(
    SessionMode.MEXICANO
  );
  const [courtCount, setCourtCount] = useState(3);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [guestNameInput, setGuestNameInput] = useState("");
  const [guestGenderInput, setGuestGenderInput] = useState<PlayerGender>(
    PlayerGender.MALE
  );
  const [guestPreferenceInput, setGuestPreferenceInput] =
    useState<PartnerPreference>(PartnerPreference.OPEN);
  const [guestInitialEloInput, setGuestInitialEloInput] = useState<number>(1000);
  const [guestConfigs, setGuestConfigs] = useState<CommunityGuestConfig[]>([]);

  const [loading, setLoading] = useState(true);
  const [creatingSession, setCreatingSession] = useState(false);
  const [activeSection, setActiveSection] =
    useState<CommunityPageSection>("overview");
  const [showHostPanel, setShowHostPanel] = useState(false);
  const [showPlayersModal, setShowPlayersModal] = useState(false);
  const [showGuestsModal, setShowGuestsModal] = useState(false);
  const [playerSearch, setPlayerSearch] = useState("");
  const [rollingBackTournamentCode, setRollingBackTournamentCode] = useState<
    string | null
  >(null);
  const [requestingClaimFor, setRequestingClaimFor] = useState<string | null>(
    null
  );
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
    () => sessions.filter((sessionItem) => sessionItem.status !== SessionStatus.COMPLETED),
    [sessions]
  );

  const pastTournaments = useMemo(
    () =>
      sessions
        .filter((sessionItem) => sessionItem.status === SessionStatus.COMPLETED)
        .sort((a, b) => {
          const aTime = new Date(a.endedAt ?? a.createdAt).getTime();
          const bTime = new Date(b.endedAt ?? b.createdAt).getTime();
          return bTime - aTime;
        }),
    [sessions]
  );

  const latestPastTournamentId = pastTournaments[0]?.id ?? null;
  const latestPastTournament = pastTournaments[0] ?? null;
  const leaderboardPreview = leaderboard.slice(0, 5);
  const canManageCommunity =
    (!!community && community.role === "ADMIN") || !!user?.isAdmin;
  const selectablePlayers = communityMembers.filter(
    (member) => member.id !== user?.id
  );
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
    () =>
      new Map(
        claimRequests.map((claimRequest) => [
          claimRequest.targetUserId,
          claimRequest,
        ])
      ),
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

      const [membersRes, sessionsRes, claimRequestsRes] = await Promise.all(
        requests
      );
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
        throw new Error(
          claimRequestsData.error || "Failed to load claim requests"
        );
      }

      setCommunityMembers(Array.isArray(membersData) ? membersData : []);
      setSessions(Array.isArray(sessionsData) ? sessionsData : []);
      setClaimRequests(
        Array.isArray(claimRequestsData) ? claimRequestsData : []
      );

      if (options?.includeCommunity) {
        const communitiesRes = await fetch("/api/communities");
        const communitiesData = await safeJson(communitiesRes);
        if (!communitiesRes.ok) {
          throw new Error(communitiesData.error || "Failed to load communities");
        }

        const list = Array.isArray(communitiesData)
          ? (communitiesData as CommunityPageCommunity[])
          : [];
        const currentCommunity =
          list.find((communityItem) => communityItem.id === communityId) || null;
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

    void (async () => {
      try {
        setLoading(true);
        setError("");
        setSuccess("");

        const meRes = await fetch("/api/user/me");
        const meData = await safeJson(meRes);
        if (!meRes.ok || !meData.user) {
          throw new Error(meData.error || "Failed to load user");
        }
        setUser(meData.user as CommunityPageUser);

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
        (guest) =>
          ![PlayerGender.MALE, PlayerGender.FEMALE].includes(guest.gender)
      );
      if (invalidGuest) {
        setError(
          `${mixedModeLabel} requires MALE/FEMALE gender for guest ${invalidGuest.name}`
        );
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
      setError(
        err instanceof Error ? err.message : "Failed to create tournament"
      );
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

  const rollbackTournament = async (tournament: CommunityPageSession) => {
    if (!canManageCommunity) return;

    const confirmed = confirm(
      `Rollback and delete "${tournament.name}"?\n\nThis will reverse rating changes from this tournament and cannot be undone.`
    );
    if (!confirmed) return;

    setRollingBackTournamentCode(tournament.code);
    setError("");
    setSuccess("");
    try {
      const rollbackRes = await fetch(
        `/api/sessions/${tournament.code}/rollback`,
        {
          method: "POST",
        }
      );
      const rollbackData = await safeJson(rollbackRes);
      if (!rollbackRes.ok) {
        setError(rollbackData.error || "Failed to rollback tournament");
        return;
      }

      await refreshCommunityData({ includeCommunity: true });
      setSuccess(`Rolled back "${tournament.name}".`);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to rollback tournament"
      );
    } finally {
      setRollingBackTournamentCode(null);
    }
  };

  const requestClaim = async (player: CommunityPageMember) => {
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
      setSuccess(
        `Claim request sent for ${player.name}. A community admin must approve it.`
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to request claim");
    } finally {
      setRequestingClaimFor(null);
    }
  };

  const togglePlayerSelection = (playerId: string) => {
    setSelectedPlayerIds((prev) =>
      prev.includes(playerId)
        ? prev.filter((id) => id !== playerId)
        : [...prev, playerId]
    );
  };

  const toggleAllPlayers = () => {
    const allOtherIds = selectablePlayers.map((player) => player.id);
    if (selectedPlayerIds.length === allOtherIds.length) {
      setSelectedPlayerIds([]);
      return;
    }
    setSelectedPlayerIds(allOtherIds);
  };

  const addGuestName = () => {
    const trimmed = guestNameInput.trim();
    if (!trimmed) return;
    if (
      sessionMode === SessionMode.MIXICANO &&
      ![PlayerGender.MALE, PlayerGender.FEMALE].includes(guestGenderInput)
    ) {
      setError(
        `Choose MALE/FEMALE for guest before adding in ${mixedModeLabel}`
      );
      return;
    }
    if (
      guestConfigs.some(
        (guest) => guest.name.toLowerCase() === trimmed.toLowerCase()
      )
    ) {
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
    setGuestConfigs((prev) =>
      prev.filter((guest) => guest.name !== nameToRemove)
    );
  };

  const handleGuestGenderChange = (nextGender: PlayerGender) => {
    setGuestGenderInput(nextGender);
    setGuestPreferenceInput(
      nextGender === PlayerGender.FEMALE
        ? PartnerPreference.FEMALE_FLEX
        : PartnerPreference.OPEN
    );
  };

  const openPlayersModal = () => {
    setShowPlayersModal(true);
  };

  const closePlayersModal = () => {
    setShowPlayersModal(false);
    setPlayerSearch("");
  };

  const openGuestsModal = () => {
    setShowGuestsModal(true);
  };

  const closeGuestsModal = () => {
    setShowGuestsModal(false);
    setGuestNameInput("");
  };

  const switchSection = (section: CommunityPageSection) => {
    setActiveSection(section);
    if (section !== "overview") {
      setShowHostPanel(false);
    }
  };

  const handleHostButtonClick = () => {
    setActiveSection("overview");
    setShowHostPanel((prev) => !prev);
  };

  const openCommunityPlayerProfile = (playerId: string) => {
    router.push(`/profile/${playerId}?communityId=${communityId}`);
  };

  const openTournament = (code: string) => {
    router.push(`/session/${code}`);
  };

  return {
    status,
    communityId,
    openModeLabel,
    mixedModeLabel,
    user,
    community,
    communityMembers,
    sessions,
    claimRequests,
    newSessionName,
    setNewSessionName,
    sessionType,
    setSessionType,
    sessionMode,
    setSessionMode,
    courtCount,
    setCourtCount,
    selectedPlayerIds,
    guestNameInput,
    setGuestNameInput,
    guestGenderInput,
    guestPreferenceInput,
    setGuestPreferenceInput,
    guestInitialEloInput,
    setGuestInitialEloInput,
    guestConfigs,
    loading,
    creatingSession,
    activeSection,
    showHostPanel,
    showPlayersModal,
    showGuestsModal,
    playerSearch,
    setPlayerSearch,
    rollingBackTournamentCode,
    requestingClaimFor,
    error,
    setError,
    success,
    setSuccess,
    leaderboard,
    activeTournaments,
    pastTournaments,
    latestPastTournamentId,
    latestPastTournament,
    leaderboardPreview,
    canManageCommunity,
    selectablePlayers,
    filteredSelectablePlayers,
    currentUserClaimEligibility,
    pendingClaimByTargetId,
    myPendingClaimRequest,
    createSession,
    joinTournament,
    rollbackTournament,
    requestClaim,
    togglePlayerSelection,
    toggleAllPlayers,
    addGuestName,
    removeGuestName,
    handleGuestGenderChange,
    openPlayersModal,
    closePlayersModal,
    openGuestsModal,
    closeGuestsModal,
    switchSection,
    handleHostButtonClick,
    openCommunityPlayerProfile,
    openTournament,
  };
}
