"use client";

import type {
  ClubAdminClaimRequest,
  ClubAdminClub,
  ClubAdminOfflineIdentityLink,
  ClubAdminPlayer,
} from "@/components/club-admin/clubAdminTypes";

export async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: "Invalid server response" };
  }
}

export async function fetchClubAdminSnapshot(communityId: string) {
  const communityRes = await fetch(`/api/communities/${communityId}`);
  const communityData = await safeJson(communityRes);
  if (!communityRes.ok) {
    throw new Error(communityData.error || "Failed to load club");
  }

  const currentClub = communityData.community
    ? (communityData.community as ClubAdminClub)
    : null;
  if (!currentClub) {
    throw new Error("Club not found or access denied");
  }
  if (currentClub.role !== "ADMIN") {
    return {
      club: currentClub,
      players: [],
      claimRequests: [],
      offlineIdentityLinks: [],
    };
  }

  const [playersRes, claimRequestsRes, offlineIdentityLinksRes] =
    await Promise.all([
      fetch(`/api/communities/${communityId}/members`),
      currentClub.isTutorial
        ? Promise.resolve(null)
        : fetch(`/api/communities/${communityId}/claim-requests`),
      currentClub.isTutorial
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
    club: currentClub,
    players: Array.isArray(playersData)
      ? (playersData as ClubAdminPlayer[])
      : [],
    claimRequests: Array.isArray(claimRequestsData)
      ? (claimRequestsData as ClubAdminClaimRequest[])
      : [],
    offlineIdentityLinks: Array.isArray(offlineIdentityLinksData)
      ? (offlineIdentityLinksData as ClubAdminOfflineIdentityLink[])
      : [],
  };
}
