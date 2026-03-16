"use client";

import type {
  CommunityAdminClaimRequest,
  CommunityAdminCommunity,
  CommunityAdminPlayer,
} from "@/components/community-admin/communityAdminTypes";

export async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: "Invalid server response" };
  }
}

export async function fetchCommunityAdminSnapshot(communityId: string) {
  const communitiesRes = await fetch("/api/communities");
  const communitiesData = await safeJson(communitiesRes);
  if (!communitiesRes.ok) {
    throw new Error(communitiesData.error || "Failed to load communities");
  }

  const list = Array.isArray(communitiesData)
    ? (communitiesData as CommunityAdminCommunity[])
    : [];
  const currentCommunity =
    list.find((item) => item.id === communityId) || null;
  if (!currentCommunity) {
    throw new Error("Community not found or access denied");
  }

  const [playersRes, claimRequestsRes] = await Promise.all([
    fetch(`/api/communities/${communityId}/members`),
    fetch(`/api/communities/${communityId}/claim-requests`),
  ]);
  const [playersData, claimRequestsData] = await Promise.all([
    safeJson(playersRes),
    safeJson(claimRequestsRes),
  ]);

  if (!playersRes.ok) {
    throw new Error(playersData.error || "Failed to load players");
  }
  if (!claimRequestsRes.ok) {
    throw new Error(claimRequestsData.error || "Failed to load claim requests");
  }

  return {
    community: currentCommunity,
    players: Array.isArray(playersData)
      ? (playersData as CommunityAdminPlayer[])
      : [],
    claimRequests: Array.isArray(claimRequestsData)
      ? (claimRequestsData as CommunityAdminClaimRequest[])
      : [],
  };
}
