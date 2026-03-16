"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type {
  CommunityPageMember,
  CommunityPageSection,
  CommunityPageSession,
} from "@/components/community/communityTypes";
import { safeJson } from "./communityPageApi";

interface CommunityPageRouter {
  push: (href: string) => void;
}

export function useCommunityPageActions({
  communityId,
  canManageCommunity,
  router,
  refreshCommunityData,
  setError,
  setSuccess,
}: {
  communityId: string;
  canManageCommunity: boolean;
  router: CommunityPageRouter;
  refreshCommunityData: (options?: { includeCommunity?: boolean }) => Promise<void>;
  setError: Dispatch<SetStateAction<string>>;
  setSuccess: Dispatch<SetStateAction<string>>;
}) {
  const [activeSection, setActiveSection] =
    useState<CommunityPageSection>("overview");
  const [showHostPanel, setShowHostPanel] = useState(false);
  const [rollingBackTournamentCode, setRollingBackTournamentCode] = useState<
    string | null
  >(null);
  const [pendingRollbackTournament, setPendingRollbackTournament] =
    useState<CommunityPageSession | null>(null);
  const [requestingClaimFor, setRequestingClaimFor] = useState<string | null>(
    null
  );

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

  const requestRollbackTournament = (tournament: CommunityPageSession) => {
    if (!canManageCommunity) return;
    setError("");
    setSuccess("");
    setPendingRollbackTournament(tournament);
  };

  const closeRollbackModal = () => {
    if (rollingBackTournamentCode !== null) return;
    setPendingRollbackTournament(null);
  };

  const confirmRollbackTournament = async () => {
    if (!canManageCommunity || !pendingRollbackTournament) return false;

    const tournament = pendingRollbackTournament;
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
        return false;
      }

      await refreshCommunityData({ includeCommunity: true });
      setSuccess(`Rolled back "${tournament.name}".`);
      setPendingRollbackTournament(null);
      return true;
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to rollback tournament"
      );
      return false;
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
    activeSection,
    showHostPanel,
    rollingBackTournamentCode,
    pendingRollbackTournament,
    requestingClaimFor,
    joinTournament,
    requestRollbackTournament,
    closeRollbackModal,
    confirmRollbackTournament,
    requestClaim,
    switchSection,
    handleHostButtonClick,
    openCommunityPlayerProfile,
    openTournament,
  };
}
