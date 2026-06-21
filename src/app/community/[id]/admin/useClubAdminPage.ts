"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import type { ClubAdminSection } from "@/components/club-admin/clubAdminTypes";
import { getClubAdminGenderPillLabel } from "@/components/club-admin/clubAdminDisplay";
import { ClubPlayerStatus } from "@/types/enums";
import { useClubAdminClubActions } from "./useClubAdminClubActions";
import { useClubAdminData } from "./useClubAdminData";
import { useClubAdminOfflineIdentityLinks } from "./useClubAdminOfflineIdentityLinks";
import { useClubAdminPlayerActions } from "./useClubAdminPlayerActions";

export function useClubAdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const communityId = typeof params.id === "string" ? params.id : "";

  const [activeSection, setActiveSection] =
    useState<ClubAdminSection>("players");
  const [playerSearch, setPlayerSearch] = useState("");

  const adminData = useClubAdminData({
    communityId,
    status,
    router,
  });

  const playerActions = useClubAdminPlayerActions({
    communityId,
    currentUserId: session?.user?.id,
    players: adminData.players,
    setPlayers: adminData.setPlayers,
    refreshClubData: adminData.fetchClubAndPlayers,
    router,
    setError: adminData.setError,
    setSuccess: adminData.setSuccess,
  });

  const clubActions = useClubAdminClubActions({
    communityId,
    club: adminData.club,
    refreshClubData: adminData.fetchClubAndPlayers,
    router,
    setError: adminData.setError,
    setSuccess: adminData.setSuccess,
  });

  const offlineIdentityLinkActions = useClubAdminOfflineIdentityLinks({
    communityId,
    players: adminData.players,
    refreshClubData: adminData.fetchClubAndPlayers,
    setError: adminData.setError,
    setSuccess: adminData.setSuccess,
  });

  const claimedPlayersCount = adminData.players.filter(
    (player) => player.isClaimed
  ).length;
  const adminPlayersCount = adminData.players.filter(
    (player) => player.role === "ADMIN"
  ).length;
  const occasionalPlayersCount = adminData.players.filter(
    (player) => player.status === ClubPlayerStatus.OCCASIONAL
  ).length;
  const searchQuery = playerSearch.trim().toLowerCase();
  const filteredPlayers = adminData.players
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((player) => {
      if (!searchQuery) return true;
      return (
        player.name.toLowerCase().includes(searchQuery) ||
        player.email?.toLowerCase().includes(searchQuery) ||
        player.status.toLowerCase().includes(searchQuery) ||
        getClubAdminGenderPillLabel(player)
          .toLowerCase()
          .includes(searchQuery)
      );
    });

  return {
    status,
    currentUserId: session?.user?.id,
    isGlobalAdmin: !!session?.user?.isAdmin,
    communityId,
    activeSection,
    setActiveSection,
    playerSearch,
    setPlayerSearch,
    claimedPlayersCount,
    adminPlayersCount,
    occasionalPlayersCount,
    filteredPlayers,
    ...adminData,
    ...playerActions,
    ...clubActions,
    ...offlineIdentityLinkActions,
  };
}
