"use client";

import type {
  ClubClaimRequest,
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

export async function fetchClubPageSnapshot(communityId: string) {
  const snapshotRes = await fetch(`/api/communities/${communityId}`);
  const snapshotData = await safeJson(snapshotRes);
  if (!snapshotRes.ok) {
    throw new Error(snapshotData.error || "Failed to load club");
  }

  return {
    user: snapshotData.viewer
      ? (snapshotData.viewer as ClubPageUser)
      : null,
    club: snapshotData.community
      ? (snapshotData.community as ClubPageClub)
      : null,
    clubMembers: Array.isArray(snapshotData.communityMembers)
      ? (snapshotData.communityMembers as ClubPageMember[])
      : [],
    sessions: Array.isArray(snapshotData.sessions)
      ? (snapshotData.sessions as ClubPageSession[])
      : [],
    clubPulse: snapshotData.communityPulse
      ? (snapshotData.communityPulse as ClubPagePulse)
      : null,
    claimRequests: Array.isArray(snapshotData.claimRequests)
      ? (snapshotData.claimRequests as ClubClaimRequest[])
      : [],
  };
}
