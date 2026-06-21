"use client";

import type {
  CommunityClaimRequest,
  CommunityPageCommunity,
  CommunityPageMember,
  CommunityPagePulse,
  CommunityPageSession,
  CommunityPageUser,
} from "@/components/community/communityTypes";

export async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: "Invalid server response" };
  }
}

export async function fetchCommunityPageSnapshot(communityId: string) {
  const snapshotRes = await fetch(`/api/communities/${communityId}`);
  const snapshotData = await safeJson(snapshotRes);
  if (!snapshotRes.ok) {
    throw new Error(snapshotData.error || "Failed to load club");
  }

  return {
    user: snapshotData.viewer
      ? (snapshotData.viewer as CommunityPageUser)
      : null,
    community: snapshotData.community
      ? (snapshotData.community as CommunityPageCommunity)
      : null,
    communityMembers: Array.isArray(snapshotData.communityMembers)
      ? (snapshotData.communityMembers as CommunityPageMember[])
      : [],
    sessions: Array.isArray(snapshotData.sessions)
      ? (snapshotData.sessions as CommunityPageSession[])
      : [],
    communityPulse: snapshotData.communityPulse
      ? (snapshotData.communityPulse as CommunityPagePulse)
      : null,
    claimRequests: Array.isArray(snapshotData.claimRequests)
      ? (snapshotData.claimRequests as CommunityClaimRequest[])
      : [],
  };
}
