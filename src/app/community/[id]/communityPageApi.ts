"use client";

import type {
  CommunityClaimRequest,
  CommunityPageCommunity,
  CommunityPageMember,
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

export async function fetchCommunityViewer() {
  const meRes = await fetch("/api/user/me");
  const meData = await safeJson(meRes);
  if (!meRes.ok || !meData.user) {
    throw new Error(meData.error || "Failed to load user");
  }

  return meData.user as CommunityPageUser;
}

export async function fetchCommunityPageSnapshot(
  communityId: string,
  options?: { includeCommunity?: boolean }
) {
  const requests = [
    fetch(`/api/communities/${communityId}/members`),
    fetch(`/api/sessions?communityId=${encodeURIComponent(communityId)}`),
    fetch(`/api/communities/${communityId}/claim-requests`),
  ] as const;

  const [membersRes, sessionsRes, claimRequestsRes] = await Promise.all(requests);
  const [membersData, sessionsData, claimRequestsData] = await Promise.all([
    safeJson(membersRes),
    safeJson(sessionsRes),
    safeJson(claimRequestsRes),
  ]);

  if (!membersRes.ok) {
    throw new Error(membersData.error || "Failed to load community members");
  }
  if (!sessionsRes.ok) {
    throw new Error(sessionsData.error || "Failed to load tournaments");
  }
  if (!claimRequestsRes.ok) {
    throw new Error(claimRequestsData.error || "Failed to load claim requests");
  }

  let community: CommunityPageCommunity | null = null;
  if (options?.includeCommunity) {
    const communitiesRes = await fetch("/api/communities");
    const communitiesData = await safeJson(communitiesRes);
    if (!communitiesRes.ok) {
      throw new Error(communitiesData.error || "Failed to load communities");
    }

    const list = Array.isArray(communitiesData)
      ? (communitiesData as CommunityPageCommunity[])
      : [];
    community =
      list.find((communityItem) => communityItem.id === communityId) || null;
    if (!community) {
      throw new Error("Community not found or access denied");
    }
  }

  return {
    community,
    communityMembers: Array.isArray(membersData)
      ? (membersData as CommunityPageMember[])
      : [],
    sessions: Array.isArray(sessionsData)
      ? (sessionsData as CommunityPageSession[])
      : [],
    claimRequests: Array.isArray(claimRequestsData)
      ? (claimRequestsData as CommunityClaimRequest[])
      : [],
  };
}
