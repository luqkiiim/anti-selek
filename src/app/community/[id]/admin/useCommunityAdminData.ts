"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  CommunityAdminClaimRequest,
  CommunityAdminCommunity,
  CommunityAdminPlayer,
} from "@/components/community-admin/communityAdminTypes";
import { fetchCommunityAdminSnapshot } from "./communityAdminApi";

interface CommunityAdminRouter {
  push: (href: string) => void;
  replace: (href: string) => void;
}

export function useCommunityAdminData({
  communityId,
  status,
  router,
}: {
  communityId: string;
  status: "authenticated" | "loading" | "unauthenticated";
  router: CommunityAdminRouter;
}) {
  const [community, setCommunity] = useState<CommunityAdminCommunity | null>(
    null
  );
  const [players, setPlayers] = useState<CommunityAdminPlayer[]>([]);
  const [claimRequests, setClaimRequests] = useState<
    CommunityAdminClaimRequest[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchCommunityAndPlayers = useCallback(async () => {
    if (!communityId) return;

    const snapshot = await fetchCommunityAdminSnapshot(communityId);
    if (snapshot.community.role !== "ADMIN") {
      router.replace(`/community/${communityId}`);
      throw new Error("Only community admins can access this page");
    }

    setCommunity(snapshot.community);
    setPlayers(snapshot.players);
    setClaimRequests(snapshot.claimRequests);
  }, [communityId, router]);

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
        await fetchCommunityAndPlayers();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load admin page");
      } finally {
        setLoading(false);
      }
    })();
  }, [communityId, fetchCommunityAndPlayers, router, status]);

  return {
    community,
    setCommunity,
    players,
    setPlayers,
    claimRequests,
    setClaimRequests,
    loading,
    error,
    setError,
    success,
    setSuccess,
    fetchCommunityAndPlayers,
  };
}
