"use client";

import type {
  CommunityAdminClaimRequest,
  CommunityAdminCommunity,
  CommunityAdminOfflineIdentityLink,
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
  const communityRes = await fetch(`/api/communities/${communityId}`);
  const communityData = await safeJson(communityRes);
  if (!communityRes.ok) {
    throw new Error(communityData.error || "Failed to load community");
  }

  const currentCommunity = communityData.community
    ? (communityData.community as CommunityAdminCommunity)
    : null;
  if (!currentCommunity) {
    throw new Error("Community not found or access denied");
  }

  const [playersRes, claimRequestsRes, offlineIdentityLinksRes] =
    await Promise.all([
      fetch(`/api/communities/${communityId}/members`),
      currentCommunity.isTutorial
        ? Promise.resolve(null)
        : fetch(`/api/communities/${communityId}/claim-requests`),
      currentCommunity.isTutorial
        ? Promise.resolve(null)
        : fetch(`/api/communities/${communityId}/offline-identity-links`),
    ]);
  const [playersData, claimRequestsData, offlineIdentityLinksData] =
    await Promise.all([
      safeJson(playersRes),
      claimRequestsRes ? safeJson(claimRequestsRes) : Promise.resolve([]),
      offlineIdentityLinksRes
        ? safeJson(offlineIdentityLinksRes)
        : Promise.resolve([]),
    ]);

  if (!playersRes.ok) {
    throw new Error(playersData.error || "Failed to load players");
  }
  if (claimRequestsRes && !claimRequestsRes.ok) {
    throw new Error(claimRequestsData.error || "Failed to load claim requests");
  }
  if (offlineIdentityLinksRes && !offlineIdentityLinksRes.ok) {
    throw new Error(
      offlineIdentityLinksData.error || "Failed to load offline identity links"
    );
  }

  return {
    community: currentCommunity,
    players: Array.isArray(playersData)
      ? (playersData as CommunityAdminPlayer[])
      : [],
    claimRequests: Array.isArray(claimRequestsData)
      ? (claimRequestsData as CommunityAdminClaimRequest[])
      : [],
    offlineIdentityLinks: Array.isArray(offlineIdentityLinksData)
      ? (offlineIdentityLinksData as CommunityAdminOfflineIdentityLink[])
      : [],
  };
}
