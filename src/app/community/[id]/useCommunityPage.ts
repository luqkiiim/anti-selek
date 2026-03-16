"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { getClaimRequesterEligibility } from "@/lib/communityClaimRules";
import { getSessionModeLabel } from "@/lib/sessionModeLabels";
import { ClaimRequestStatus, SessionMode, SessionStatus } from "@/types/enums";
import { useCommunityHostSetup } from "./useCommunityHostSetup";
import { useCommunityPageActions } from "./useCommunityPageActions";
import { useCommunityPageData } from "./useCommunityPageData";

export function useCommunityPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const communityId = typeof params.id === "string" ? params.id : "";
  const openModeLabel = getSessionModeLabel(SessionMode.MEXICANO);
  const mixedModeLabel = getSessionModeLabel(SessionMode.MIXICANO);

  const data = useCommunityPageData({
    communityId,
    status,
    router,
  });

  const leaderboard = useMemo(
    () =>
      [...data.communityMembers].sort((a, b) => {
        if (b.elo !== a.elo) return b.elo - a.elo;
        return a.name.localeCompare(b.name);
      }),
    [data.communityMembers]
  );

  const activeTournaments = useMemo(
    () =>
      data.sessions.filter(
        (sessionItem) => sessionItem.status !== SessionStatus.COMPLETED
      ),
    [data.sessions]
  );

  const pastTournaments = useMemo(
    () =>
      data.sessions
        .filter((sessionItem) => sessionItem.status === SessionStatus.COMPLETED)
        .sort((a, b) => {
          const aTime = new Date(a.endedAt ?? a.createdAt).getTime();
          const bTime = new Date(b.endedAt ?? b.createdAt).getTime();
          return bTime - aTime;
        }),
    [data.sessions]
  );

  const latestPastTournamentId = pastTournaments[0]?.id ?? null;
  const latestPastTournament = pastTournaments[0] ?? null;
  const leaderboardPreview = leaderboard.slice(0, 5);
  const canManageCommunity =
    (!!data.community && data.community.role === "ADMIN") || !!data.user?.isAdmin;
  const selectablePlayers = data.communityMembers.filter(
    (member) => member.id !== data.user?.id
  );
  const currentUserCommunityMember =
    data.communityMembers.find((member) => member.id === data.user?.id) ?? null;
  const currentUserHasCommunitySessionHistory = useMemo(
    () =>
      data.sessions.some((sessionItem) =>
        sessionItem.players.some((playerItem) => playerItem.user.id === data.user?.id)
      ),
    [data.sessions, data.user?.id]
  );
  const currentUserClaimEligibility = getClaimRequesterEligibility({
    isClaimed: currentUserCommunityMember?.isClaimed ?? false,
    communityElo: currentUserCommunityMember?.elo ?? 1000,
    hasCommunitySessionHistory: currentUserHasCommunitySessionHistory,
  });
  const pendingClaimByTargetId = useMemo(
    () =>
      new Map(
        data.claimRequests.map((claimRequest) => [
          claimRequest.targetUserId,
          claimRequest,
        ])
      ),
    [data.claimRequests]
  );
  const myPendingClaimRequest = useMemo(
    () =>
      data.claimRequests.find(
        (claimRequest) =>
          claimRequest.requesterUserId === data.user?.id &&
          claimRequest.status === ClaimRequestStatus.PENDING
      ) ?? null,
    [data.claimRequests, data.user?.id]
  );

  const hostSetup = useCommunityHostSetup({
    communityId,
    router,
    selectablePlayers,
    mixedModeLabel,
    setError: data.setError,
    setSuccess: data.setSuccess,
  });

  const filteredSelectablePlayers = selectablePlayers.filter((member) =>
    member.name.toLowerCase().includes(hostSetup.playerSearch.toLowerCase())
  );

  const actions = useCommunityPageActions({
    communityId,
    canManageCommunity,
    router,
    refreshCommunityData: data.refreshCommunityData,
    setError: data.setError,
    setSuccess: data.setSuccess,
  });

  return {
    status,
    communityId,
    openModeLabel,
    mixedModeLabel,
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
    ...data,
    ...hostSetup,
    ...actions,
  };
}
