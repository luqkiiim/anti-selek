"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ClubClaimRequest,
  ClubPageClub,
  ClubPageMember,
  ClubPagePulse,
  ClubPageSession,
  ClubPageUser,
} from "@/components/club/clubTypes";
import { fetchClubPageSnapshot } from "./clubPageApi";

interface ClubPageRouter {
  push: (href: string) => void;
}

export function useClubPageData({
  communityId,
  status,
  router,
}: {
  communityId: string;
  status: "authenticated" | "loading" | "unauthenticated";
  router: ClubPageRouter;
}) {
  const [user, setUser] = useState<ClubPageUser | null>(null);
  const [club, setClub] = useState<ClubPageClub | null>(null);
  const [clubMembers, setClubMembers] = useState<ClubPageMember[]>([]);
  const [sessions, setSessions] = useState<ClubPageSession[]>([]);
  const [clubPulse, setClubPulse] = useState<ClubPagePulse | null>(null);
  const [claimRequests, setClaimRequests] = useState<ClubClaimRequest[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const refreshClubData = useCallback(async () => {
    if (!communityId) return;

    const snapshot = await fetchClubPageSnapshot(communityId);
    setUser(snapshot.user);
    setClub(snapshot.club);
    setClubMembers(snapshot.clubMembers);
    setSessions(snapshot.sessions);
    setClubPulse(snapshot.clubPulse);
    setClaimRequests(snapshot.claimRequests);
  }, [communityId]);

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
        await refreshClubData();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load club");
      } finally {
        setLoading(false);
      }
    })();
  }, [communityId, refreshClubData, router, status]);

  return {
    user,
    club,
    clubMembers,
    sessions,
    clubPulse,
    claimRequests,
    loading,
    error,
    setError,
    success,
    setSuccess,
    refreshClubData,
  };
}
