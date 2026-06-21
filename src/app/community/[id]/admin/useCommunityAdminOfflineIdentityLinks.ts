"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type {
  CommunityAdminOfflineIdentityLink,
  CommunityAdminPlayer,
} from "@/components/community-admin/communityAdminTypes";
import type {
  CommunityCollabCandidate,
  CommunityPageMember,
} from "@/components/community/communityTypes";
import { safeJson } from "./communityAdminApi";

export function useCommunityAdminOfflineIdentityLinks({
  communityId,
  players,
  refreshCommunityData,
  setError,
  setSuccess,
}: {
  communityId: string;
  players: CommunityAdminPlayer[];
  refreshCommunityData: () => Promise<void>;
  setError: Dispatch<SetStateAction<string>>;
  setSuccess: Dispatch<SetStateAction<string>>;
}) {
  const [linkSourceUserId, setLinkSourceUserId] = useState("");
  const [targetCommunitySearch, setTargetCommunitySearch] = useState("");
  const [selectedTargetCommunity, setSelectedTargetCommunity] =
    useState<CommunityCollabCandidate | null>(null);
  const [targetCommunityCandidates, setTargetCommunityCandidates] = useState<
    CommunityCollabCandidate[]
  >([]);
  const [loadingTargetCommunities, setLoadingTargetCommunities] =
    useState(false);
  const [targetRoster, setTargetRoster] = useState<CommunityPageMember[]>([]);
  const [loadingTargetRoster, setLoadingTargetRoster] = useState(false);
  const [linkTargetUserId, setLinkTargetUserId] = useState("");
  const [submittingOfflineIdentityLink, setSubmittingOfflineIdentityLink] =
    useState(false);
  const [reviewingOfflineIdentityLinkId, setReviewingOfflineIdentityLinkId] =
    useState<string | null>(null);

  useEffect(() => {
    if (!communityId || selectedTargetCommunity) {
      setTargetCommunityCandidates([]);
      setLoadingTargetCommunities(false);
      return;
    }

    const search = targetCommunitySearch.trim();
    if (search.length < 2) {
      setTargetCommunityCandidates([]);
      setLoadingTargetCommunities(false);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void (async () => {
        setLoadingTargetCommunities(true);
        try {
          const res = await fetch(
            `/api/communities/${communityId}/collab-candidates?search=${encodeURIComponent(search)}`
          );
          const data = await safeJson(res);
          if (!res.ok) {
            throw new Error(data.error || "Failed to search clubs");
          }
          if (!cancelled) {
            setTargetCommunityCandidates(Array.isArray(data) ? data : []);
          }
        } catch (err: unknown) {
          if (!cancelled) {
            setTargetCommunityCandidates([]);
            setError(
              err instanceof Error ? err.message : "Failed to search clubs"
            );
          }
        } finally {
          if (!cancelled) {
            setLoadingTargetCommunities(false);
          }
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [communityId, selectedTargetCommunity, setError, targetCommunitySearch]);

  useEffect(() => {
    if (!communityId || !selectedTargetCommunity) {
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
          `/api/communities/${communityId}/collab-roster?partnerCommunityId=${encodeURIComponent(selectedTargetCommunity.id)}`
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
  }, [communityId, selectedTargetCommunity, setError]);

  const sourcePlaceholderOptions = useMemo(
    () =>
      players
        .filter((player) => !player.isClaimed && player.email === null)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [players]
  );

  const targetPlaceholderOptions = useMemo(() => {
    if (!selectedTargetCommunity) return [];

    return targetRoster
      .map((player) => {
        const targetBadge =
          player.communityBadges?.find(
            (badge) => badge.id === selectedTargetCommunity.id
          ) ??
          player.linkedCommunityBadges?.find(
            (badge) => badge.id === selectedTargetCommunity.id
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
  }, [selectedTargetCommunity, targetRoster]);

  const selectTargetCommunity = (candidate: CommunityCollabCandidate) => {
    setSelectedTargetCommunity(candidate);
    setTargetCommunitySearch("");
    setTargetCommunityCandidates([]);
    setLinkTargetUserId("");
  };

  const clearTargetCommunity = () => {
    setSelectedTargetCommunity(null);
    setTargetRoster([]);
    setLinkTargetUserId("");
  };

  const submitOfflineIdentityLink = async () => {
    if (!communityId || !selectedTargetCommunity || !linkSourceUserId || !linkTargetUserId) {
      return;
    }

    setSubmittingOfflineIdentityLink(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/communities/${communityId}/offline-identity-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUserId: linkSourceUserId,
          targetCommunityId: selectedTargetCommunity.id,
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
      clearTargetCommunity();
      await refreshCommunityData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to request identity link");
    } finally {
      setSubmittingOfflineIdentityLink(false);
    }
  };

  const reviewOfflineIdentityLink = async (
    link: CommunityAdminOfflineIdentityLink,
    status: "ACCEPTED" | "REJECTED"
  ) => {
    setReviewingOfflineIdentityLinkId(link.id);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(
        `/api/communities/${communityId}/offline-identity-links/${link.id}`,
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
      await refreshCommunityData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to review identity link");
    } finally {
      setReviewingOfflineIdentityLinkId(null);
    }
  };

  const unlinkOfflineIdentity = async (link: CommunityAdminOfflineIdentityLink) => {
    setReviewingOfflineIdentityLinkId(link.id);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(
        `/api/communities/${communityId}/offline-identity-links/${link.id}`,
        { method: "DELETE" }
      );
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to unlink identity");
      }

      setSuccess("Offline identity link removed.");
      await refreshCommunityData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to unlink identity");
    } finally {
      setReviewingOfflineIdentityLinkId(null);
    }
  };

  return {
    linkSourceUserId,
    setLinkSourceUserId,
    targetCommunitySearch,
    setTargetCommunitySearch,
    selectedTargetCommunity,
    targetCommunityCandidates,
    loadingTargetCommunities,
    loadingTargetRoster,
    linkTargetUserId,
    setLinkTargetUserId,
    sourcePlaceholderOptions,
    targetPlaceholderOptions,
    submittingOfflineIdentityLink,
    reviewingOfflineIdentityLinkId,
    selectTargetCommunity,
    clearTargetCommunity,
    submitOfflineIdentityLink,
    reviewOfflineIdentityLink,
    unlinkOfflineIdentity,
  };
}
