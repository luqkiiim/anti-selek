"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import type { CommunityAdminSection } from "@/components/community-admin/communityAdminTypes";
import { getCommunityAdminGenderPillLabel } from "@/components/community-admin/communityAdminDisplay";
import { CommunityPlayerStatus } from "@/types/enums";
import { useCommunityAdminCommunityActions } from "./useCommunityAdminCommunityActions";
import { useCommunityAdminData } from "./useCommunityAdminData";
import { useCommunityAdminPlayerActions } from "./useCommunityAdminPlayerActions";

export function useCommunityAdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const communityId = typeof params.id === "string" ? params.id : "";

  const [activeSection, setActiveSection] =
    useState<CommunityAdminSection>("players");
  const [playerSearch, setPlayerSearch] = useState("");

  const adminData = useCommunityAdminData({
    communityId,
    status,
    router,
  });

  const playerActions = useCommunityAdminPlayerActions({
    communityId,
    players: adminData.players,
    setPlayers: adminData.setPlayers,
    refreshCommunityData: adminData.fetchCommunityAndPlayers,
    setError: adminData.setError,
    setSuccess: adminData.setSuccess,
  });

  const communityActions = useCommunityAdminCommunityActions({
    communityId,
    community: adminData.community,
    refreshCommunityData: adminData.fetchCommunityAndPlayers,
    router,
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
    (player) => player.status === CommunityPlayerStatus.OCCASIONAL
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
        getCommunityAdminGenderPillLabel(player)
          .toLowerCase()
          .includes(searchQuery)
      );
    });

  return {
    status,
    currentUserId: session?.user?.id,
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
    ...communityActions,
  };
}
