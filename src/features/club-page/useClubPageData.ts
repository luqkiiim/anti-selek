"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ClubClaimRequest,
  ClubPageClub,
  ClubPageMember,
  ClubPageNotificationsSummary,
  ClubPagePulse,
  ClubPageSession,
  ClubPageUser,
} from "@/components/club/clubTypes";
import { fetchClubPageSnapshot } from "./clubPageApi";

interface ClubPageRouter {
  push: (href: string) => void;
}

export function useClubPageData({
  clubId,
  status,
  router,
}: {
  clubId: string;
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
  const [notifications, setNotifications] =
    useState<ClubPageNotificationsSummary>({ unreadCount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const refreshClubData = useCallback(async () => {
    if (!clubId) return;

    const snapshot = await fetchClubPageSnapshot(clubId);
    setUser(snapshot.user);
    setClub(snapshot.club);
    setClubMembers(snapshot.clubMembers);
    setSessions(snapshot.sessions);
    setClubPulse(snapshot.clubPulse);
    setClaimRequests(snapshot.claimRequests);
    setNotifications(snapshot.notifications);
  }, [clubId]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/signin");
      return;
    }

    if (status !== "authenticated" || !clubId) return;

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
  }, [clubId, refreshClubData, router, status]);

  return {
    user,
    club,
    clubMembers,
    sessions,
    clubPulse,
    claimRequests,
    notifications,
    setNotifications,
    loading,
    error,
    setError,
    success,
    setSuccess,
    refreshClubData,
  };
}
