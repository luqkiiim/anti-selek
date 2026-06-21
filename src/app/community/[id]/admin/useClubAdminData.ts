"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ClubAdminClaimRequest,
  ClubAdminClub,
  ClubAdminOfflineIdentityLink,
  ClubAdminPlayer,
} from "@/components/club-admin/clubAdminTypes";
import { fetchClubAdminSnapshot } from "./clubAdminApi";

interface ClubAdminRouter {
  push: (href: string) => void;
  replace: (href: string) => void;
}

export function useClubAdminData({
  communityId,
  status,
  router,
}: {
  communityId: string;
  status: "authenticated" | "loading" | "unauthenticated";
  router: ClubAdminRouter;
}) {
  const [club, setClub] = useState<ClubAdminClub | null>(null);
  const [players, setPlayers] = useState<ClubAdminPlayer[]>([]);
  const [claimRequests, setClaimRequests] = useState<
    ClubAdminClaimRequest[]
  >([]);
  const [offlineIdentityLinks, setOfflineIdentityLinks] = useState<
    ClubAdminOfflineIdentityLink[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchClubAndPlayers = useCallback(async () => {
    if (!communityId) return;

    const snapshot = await fetchClubAdminSnapshot(communityId);
    if (snapshot.club.role !== "ADMIN") {
      router.replace(`/community/${communityId}`);
      throw new Error("Only club admins can access this page");
    }

    setClub(snapshot.club);
    setPlayers(snapshot.players);
    setClaimRequests(snapshot.claimRequests);
    setOfflineIdentityLinks(snapshot.offlineIdentityLinks);
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
        await fetchClubAndPlayers();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load admin page");
      } finally {
        setLoading(false);
      }
    })();
  }, [communityId, fetchClubAndPlayers, router, status]);

  return {
    club,
    setClub,
    players,
    setPlayers,
    claimRequests,
    setClaimRequests,
    offlineIdentityLinks,
    setOfflineIdentityLinks,
    loading,
    error,
    setError,
    success,
    setSuccess,
    fetchClubAndPlayers,
  };
}
