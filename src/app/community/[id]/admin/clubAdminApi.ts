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

export async function fetchClubAdminSnapshot(clubId: string) {
  const clubRes = await fetch(`/api/clubs/${clubId}`);
  const clubData = await safeJson(clubRes);
  if (!clubRes.ok) {
    throw new Error(clubData.error || "Failed to load club");
  }

  const currentClub = clubData.club
    ? (clubData.club as ClubAdminClub)
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
      fetch(`/api/clubs/${clubId}/members`),
      currentClub.isTutorial
        ? Promise.resolve(null)
        : fetch(`/api/clubs/${clubId}/claim-requests`),
      currentClub.isTutorial
        ? Promise.resolve(null)
        : fetch(`/api/clubs/${clubId}/offline-identity-links`),
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
