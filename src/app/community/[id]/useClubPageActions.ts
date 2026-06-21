"use client";

import {
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type {
  ClubPageMember,
  ClubPageSection,
  ClubPageSession,
} from "@/components/club/clubTypes";
import { safeJson } from "./clubPageApi";

interface ClubPageRouter {
  push: (href: string) => void;
}

export function useClubPageActions({
  clubId,
  canManageClub,
  canAdminClub,
  router,
  refreshClubData,
  setError,
  setSuccess,
}: {
  clubId: string;
  canManageClub: boolean;
  canAdminClub: boolean;
  router: ClubPageRouter;
  refreshClubData: () => Promise<void>;
  setError: Dispatch<SetStateAction<string>>;
  setSuccess: Dispatch<SetStateAction<string>>;
}) {
  const [activeSection, setActiveSection] =
    useState<ClubPageSection>("overview");
  const [lastNonHostSection, setLastNonHostSection] = useState<
    Exclude<ClubPageSection, "host">
  >("overview");
  const [rollingBackTournamentCode, setRollingBackTournamentCode] = useState<
    string | null
  >(null);
  const [pendingRollbackTournament, setPendingRollbackTournament] =
    useState<ClubPageSession | null>(null);
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

  const requestRollbackTournament = (tournament: ClubPageSession) => {
    if (!canAdminClub) return;
    setError("");
    setSuccess("");
    setPendingRollbackTournament(tournament);
  };

  const closeRollbackModal = () => {
    if (rollingBackTournamentCode !== null) return;
    setPendingRollbackTournament(null);
  };

  const confirmRollbackTournament = async () => {
    if (!canAdminClub || !pendingRollbackTournament) return false;

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

      await refreshClubData();
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

  const requestClaim = async (player: ClubPageMember) => {
    if (!clubId) return;

    setRequestingClaimFor(player.id);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/clubs/${clubId}/claim-requests`, {
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

      await refreshClubData();
      setSuccess(
        `Claim request sent for ${player.name}. A club admin must approve it.`
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to request claim");
    } finally {
      setRequestingClaimFor(null);
    }
  };

  const reviewCollabTournament = async (
    code: string,
    status: "ACCEPTED" | "REJECTED"
  ) => {
    if (!canAdminClub) return;

    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/sessions/${code}/collab`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to review collab request");
      }

      const clubName =
        typeof data.clubName === "string" ? data.clubName : "club";
      await refreshClubData();
      setSuccess(
        status === "ACCEPTED"
          ? `Approved collab with ${clubName}.`
          : `Rejected collab with ${clubName}.`
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to review collab request"
      );
    }
  };

  const switchSection = useCallback((section: ClubPageSection) => {
    setActiveSection(section);
    if (section !== "host") {
      setLastNonHostSection(section);
    }
  }, []);

  const exitHostMode = useCallback(() => {
    setActiveSection(lastNonHostSection);
  }, [lastNonHostSection]);

  const handleHostButtonClick = useCallback(() => {
    if (!canManageClub) return;
    if (activeSection === "host") {
      exitHostMode();
      return;
    }
    setLastNonHostSection(activeSection);
    setActiveSection("host");
  }, [activeSection, canManageClub, exitHostMode]);

  const openClubPlayerProfile = (playerId: string) => {
    router.push(`/profile/${playerId}?clubId=${clubId}`);
  };

  const openTournament = (code: string) => {
    router.push(`/session/${code}`);
  };

  return {
    activeSection,
    lastNonHostSection,
    rollingBackTournamentCode,
    pendingRollbackTournament,
    requestingClaimFor,
    joinTournament,
    requestRollbackTournament,
    closeRollbackModal,
    confirmRollbackTournament,
    requestClaim,
    reviewCollabTournament,
    switchSection,
    exitHostMode,
    handleHostButtonClick,
    openClubPlayerProfile,
    openTournament,
  };
}
