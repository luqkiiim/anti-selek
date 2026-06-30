"use client";

import type {
  ClubClaimRequest,
  ClubPageNotificationsSummary,
  ClubPageClub,
  ClubPageMember,
  ClubPagePulse,
  ClubPageSession,
  ClubPageUser,
} from "@/components/club/clubTypes";

export async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: "Invalid server response" };
  }
}

export async function fetchClubPageSnapshot(clubId: string) {
  const snapshotRes = await fetch(`/api/clubs/${clubId}`);
  const snapshotData = await safeJson(snapshotRes);
  if (!snapshotRes.ok) {
    throw new Error(snapshotData.error || "Failed to load club");
  }

  return {
    user: snapshotData.viewer
      ? (snapshotData.viewer as ClubPageUser)
      : null,
    club: snapshotData.club
      ? (snapshotData.club as ClubPageClub)
      : null,
    clubMembers: Array.isArray(snapshotData.clubMembers)
      ? (snapshotData.clubMembers as ClubPageMember[])
      : [],
    sessions: Array.isArray(snapshotData.sessions)
      ? (snapshotData.sessions as ClubPageSession[])
      : [],
    clubPulse: snapshotData.clubPulse
      ? (snapshotData.clubPulse as ClubPagePulse)
      : null,
    claimRequests: Array.isArray(snapshotData.claimRequests)
      ? (snapshotData.claimRequests as ClubClaimRequest[])
      : [],
    notifications: snapshotData.notifications
      ? (snapshotData.notifications as ClubPageNotificationsSummary)
      : { unreadCount: 0 },
  };
}
