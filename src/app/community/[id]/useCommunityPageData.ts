"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  CommunityClaimRequest,
  CommunityPageCommunity,
  CommunityPageMember,
  CommunityPageSession,
  CommunityPageUser,
} from "@/components/community/communityTypes";
import {
  fetchCommunityPageSnapshot,
  fetchCommunityViewer,
} from "./communityPageApi";

interface CommunityPageRouter {
  push: (href: string) => void;
}

export function useCommunityPageData({
  communityId,
  status,
  router,
}: {
  communityId: string;
  status: "authenticated" | "loading" | "unauthenticated";
  router: CommunityPageRouter;
}) {
  const [user, setUser] = useState<CommunityPageUser | null>(null);
  const [community, setCommunity] = useState<CommunityPageCommunity | null>(null);
  const [communityMembers, setCommunityMembers] = useState<CommunityPageMember[]>(
    []
  );
  const [sessions, setSessions] = useState<CommunityPageSession[]>([]);
  const [claimRequests, setClaimRequests] = useState<CommunityClaimRequest[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const refreshCommunityData = useCallback(
    async (options?: { includeCommunity?: boolean }) => {
      if (!communityId) return;

      const snapshot = await fetchCommunityPageSnapshot(communityId, options);
      setCommunityMembers(snapshot.communityMembers);
      setSessions(snapshot.sessions);
      setClaimRequests(snapshot.claimRequests);
      if (snapshot.community) {
        setCommunity(snapshot.community);
      }
    },
    [communityId]
  );

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
        setUser(await fetchCommunityViewer());
        await refreshCommunityData({ includeCommunity: true });
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load community");
      } finally {
        setLoading(false);
      }
    })();
  }, [communityId, refreshCommunityData, router, status]);

  return {
    user,
    community,
    communityMembers,
    sessions,
    claimRequests,
    loading,
    error,
    setError,
    success,
    setSuccess,
    refreshCommunityData,
  };
}
