"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type {
  ClubAdminOfflineIdentityLink,
  ClubAdminPlayer,
} from "@/components/club-admin/clubAdminTypes";
import type {
  ClubCollabCandidate,
  ClubPageMember,
} from "@/components/club/clubTypes";
import { safeJson } from "./clubAdminApi";

export function useClubAdminOfflineIdentityLinks({
  clubId,
  players,
  refreshClubData,
  setError,
  setSuccess,
}: {
  clubId: string;
  players: ClubAdminPlayer[];
  refreshClubData: () => Promise<void>;
  setError: Dispatch<SetStateAction<string>>;
  setSuccess: Dispatch<SetStateAction<string>>;
}) {
  const [linkSourceUserId, setLinkSourceUserId] = useState("");
  const [targetClubSearch, setTargetClubSearch] = useState("");
  const [selectedTargetClub, setSelectedTargetClub] =
    useState<ClubCollabCandidate | null>(null);
  const [targetClubCandidates, setTargetClubCandidates] = useState<
    ClubCollabCandidate[]
  >([]);
  const [loadingTargetClubs, setLoadingTargetClubs] =
    useState(false);
  const [targetRoster, setTargetRoster] = useState<ClubPageMember[]>([]);
  const [loadingTargetRoster, setLoadingTargetRoster] = useState(false);
  const [linkTargetUserId, setLinkTargetUserId] = useState("");
  const [submittingOfflineIdentityLink, setSubmittingOfflineIdentityLink] =
    useState(false);
  const [reviewingOfflineIdentityLinkId, setReviewingOfflineIdentityLinkId] =
    useState<string | null>(null);

  useEffect(() => {
    if (!clubId || selectedTargetClub) {
      setTargetClubCandidates([]);
      setLoadingTargetClubs(false);
      return;
    }

    const search = targetClubSearch.trim();
    if (search.length < 2) {
      setTargetClubCandidates([]);
      setLoadingTargetClubs(false);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void (async () => {
        setLoadingTargetClubs(true);
        try {
          const res = await fetch(
            `/api/clubs/${clubId}/collab-candidates?search=${encodeURIComponent(search)}`
          );
          const data = await safeJson(res);
          if (!res.ok) {
            throw new Error(data.error || "Failed to search clubs");
          }
          if (!cancelled) {
            setTargetClubCandidates(Array.isArray(data) ? data : []);
          }
        } catch (err: unknown) {
          if (!cancelled) {
            setTargetClubCandidates([]);
            setError(
              err instanceof Error ? err.message : "Failed to search clubs"
            );
          }
        } finally {
          if (!cancelled) {
            setLoadingTargetClubs(false);
          }
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [clubId, selectedTargetClub, setError, targetClubSearch]);

  useEffect(() => {
    if (!clubId || !selectedTargetClub) {
      setTargetRoster([]);
      setLinkTargetUserId("");
      setLoadingTargetRoster(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      setLoadingTargetRoster(true);
      try {
        const res = await fetch(
          `/api/clubs/${clubId}/collab-roster?partnerClubId=${encodeURIComponent(selectedTargetClub.id)}`
        );
        const data = await safeJson(res);
        if (!res.ok) {
          throw new Error(data.error || "Failed to load target roster");
        }
        if (!cancelled) {
          setTargetRoster(Array.isArray(data) ? data : []);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setTargetRoster([]);
          setError(err instanceof Error ? err.message : "Failed to load target roster");
        }
      } finally {
        if (!cancelled) {
          setLoadingTargetRoster(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clubId, selectedTargetClub, setError]);

  const sourcePlaceholderOptions = useMemo(
    () =>
      players
        .filter((player) => !player.isClaimed && player.email === null)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [players]
  );

  const targetPlaceholderOptions = useMemo(() => {
    if (!selectedTargetClub) return [];

    return targetRoster
      .map((player) => {
        const targetBadge =
          player.communityBadges?.find(
            (badge) => badge.id === selectedTargetClub.id
          ) ??
          player.linkedClubBadges?.find(
            (badge) => badge.id === selectedTargetClub.id
          );

        if (!targetBadge) return null;

        return {
          id: targetBadge.userId ?? player.id,
          name: player.name,
          elo: typeof targetBadge.elo === "number" ? targetBadge.elo : player.elo,
          isClaimed: player.isClaimed,
          email: player.email ?? null,
        };
      })
      .filter(
        (
          player
        ): player is {
          id: string;
          name: string;
          elo: number;
          isClaimed: boolean;
          email: string | null;
        } => !!player && !player.isClaimed && player.email === null
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedTargetClub, targetRoster]);

  const selectTargetClub = (candidate: ClubCollabCandidate) => {
    setSelectedTargetClub(candidate);
    setTargetClubSearch("");
    setTargetClubCandidates([]);
    setLinkTargetUserId("");
  };

  const clearTargetClub = () => {
    setSelectedTargetClub(null);
    setTargetRoster([]);
    setLinkTargetUserId("");
  };

  const submitOfflineIdentityLink = async () => {
    if (!clubId || !selectedTargetClub || !linkSourceUserId || !linkTargetUserId) {
      return;
    }

    setSubmittingOfflineIdentityLink(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/clubs/${clubId}/offline-identity-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUserId: linkSourceUserId,
          targetClubId: selectedTargetClub.id,
          targetUserId: linkTargetUserId,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to request identity link");
      }

      setSuccess(
        data.status === "ACCEPTED"
          ? "Offline identity link approved."
          : "Offline identity link request sent."
      );
      setLinkSourceUserId("");
      clearTargetClub();
      await refreshClubData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to request identity link");
    } finally {
      setSubmittingOfflineIdentityLink(false);
    }
  };

  const reviewOfflineIdentityLink = async (
    link: ClubAdminOfflineIdentityLink,
    status: "ACCEPTED" | "REJECTED"
  ) => {
    setReviewingOfflineIdentityLinkId(link.id);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(
        `/api/clubs/${clubId}/offline-identity-links/${link.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }
      );
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to review identity link");
      }

      setSuccess(
        status === "ACCEPTED"
          ? "Offline identity link approved."
          : "Offline identity link rejected."
      );
      await refreshClubData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to review identity link");
    } finally {
      setReviewingOfflineIdentityLinkId(null);
    }
  };

  const unlinkOfflineIdentity = async (link: ClubAdminOfflineIdentityLink) => {
    setReviewingOfflineIdentityLinkId(link.id);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(
        `/api/clubs/${clubId}/offline-identity-links/${link.id}`,
        { method: "DELETE" }
      );
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to unlink identity");
      }

      setSuccess("Offline identity link removed.");
      await refreshClubData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to unlink identity");
    } finally {
      setReviewingOfflineIdentityLinkId(null);
    }
  };

  return {
    linkSourceUserId,
    setLinkSourceUserId,
    targetClubSearch,
    setTargetClubSearch,
    selectedTargetClub,
    targetClubCandidates,
    loadingTargetClubs,
    loadingTargetRoster,
    linkTargetUserId,
    setLinkTargetUserId,
    sourcePlaceholderOptions,
    targetPlaceholderOptions,
    submittingOfflineIdentityLink,
    reviewingOfflineIdentityLinkId,
    selectTargetClub,
    clearTargetClub,
    submitOfflineIdentityLink,
    reviewOfflineIdentityLink,
    unlinkOfflineIdentity,
  };
}
