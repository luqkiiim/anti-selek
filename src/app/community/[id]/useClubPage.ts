"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { getClaimRequesterEligibility } from "@/lib/clubClaimRules";
import {
  isClubAdminRole,
  isClubOperatorRole,
} from "@/lib/clubRoles";
import { getSessionModeLabel } from "@/lib/sessionModeLabels";
import {
  ClaimRequestStatus,
  ClubPlayerStatus,
  SessionMode,
  SessionStatus,
} from "@/types/enums";
import { useClubHostSetup } from "./useClubHostSetup";
import { useClubPageActions } from "./useClubPageActions";
import { useClubPageData } from "./useClubPageData";

export function useClubPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const communityId = typeof params.id === "string" ? params.id : "";
  const openModeLabel = getSessionModeLabel(SessionMode.MEXICANO);
  const mixedModeLabel = getSessionModeLabel(SessionMode.MIXICANO);

  const data = useClubPageData({
    communityId,
    status,
    router,
  });

  const leaderboard = useMemo(
    () =>
      data.clubMembers
        .filter((member) => member.status !== ClubPlayerStatus.OCCASIONAL)
        .sort((a, b) => {
        if (b.elo !== a.elo) return b.elo - a.elo;
        return a.name.localeCompare(b.name);
      }),
    [data.clubMembers]
  );

  const activeTournaments = useMemo(
    () =>
      data.sessions.filter(
        (sessionItem) =>
          !sessionItem.isTest && sessionItem.status !== SessionStatus.COMPLETED
      ),
    [data.sessions]
  );

  const pastTournaments = useMemo(
    () =>
      data.sessions
        .filter(
          (sessionItem) =>
            !sessionItem.isTest &&
            sessionItem.status === SessionStatus.COMPLETED
        )
        .sort((a, b) => {
          const aTime = new Date(a.endedAt ?? a.createdAt).getTime();
          const bTime = new Date(b.endedAt ?? b.createdAt).getTime();
          return bTime - aTime;
        }),
    [data.sessions]
  );

  const testSessions = useMemo(
    () =>
      data.sessions
        .filter((sessionItem) => sessionItem.isTest)
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
  const canAdminClub =
    (!!data.club && isClubAdminRole(data.club.role)) ||
    !!data.user?.isAdmin;
  const canManageClub =
    (!!data.club && isClubOperatorRole(data.club.role)) ||
    !!data.user?.isAdmin;
  const baseSelectablePlayers = useMemo(
    () =>
      data.clubMembers
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [data.clubMembers]
  );
  const currentUserClubMember =
    data.clubMembers.find((member) => member.id === data.user?.id) ?? null;
  const currentUserHasClubSessionHistory = useMemo(
    () =>
      data.sessions.some((sessionItem) =>
        sessionItem.players.some((playerItem) => playerItem.user.id === data.user?.id)
      ),
    [data.sessions, data.user?.id]
  );
  const currentUserClaimEligibility = getClaimRequesterEligibility({
    isClaimed: currentUserClubMember?.isClaimed ?? false,
    clubElo: currentUserClubMember?.elo ?? 1000,
    hasClubSessionHistory: currentUserHasClubSessionHistory,
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

  const hostSetup = useClubHostSetup({
    communityId,
    router,
    selectablePlayers: baseSelectablePlayers,
    mixedModeLabel,
    setError: data.setError,
    setSuccess: data.setSuccess,
  });

  const filteredSelectablePlayers = useMemo(
    () =>
      hostSetup.selectablePlayers.filter((member) =>
        member.name.toLowerCase().includes(hostSetup.playerSearch.toLowerCase())
      ),
    [hostSetup.playerSearch, hostSetup.selectablePlayers]
  );

  const actions = useClubPageActions({
    communityId,
    canManageClub,
    canAdminClub,
    router,
    refreshClubData: data.refreshClubData,
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
    canManageClub,
    canAdminClub,
    testSessions,
    filteredSelectablePlayers,
    currentUserClaimEligibility,
    pendingClaimByTargetId,
    myPendingClaimRequest,
    ...data,
    ...hostSetup,
    ...actions,
  };
}
