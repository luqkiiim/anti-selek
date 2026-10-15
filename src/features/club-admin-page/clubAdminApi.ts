"use client";

import { adminApi } from "@/lib/adminClient";

import type {
  ClubAdminClaimRequest,
  ClubAdminClub,
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

export async function fetchClubAdminSnapshot(clubId: string, signal?: AbortSignal) {
  const clubRes = await adminFetch(`/api/clubs/${clubId}`, { signal });
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
    };
  }

  const [playersRes, claimRequestsRes] = await Promise.all([
    adminFetch(`/api/clubs/${clubId}/members`, { signal }),
    currentClub.isTutorial
      ? Promise.resolve(null)
      : adminFetch(`/api/clubs/${clubId}/claim-requests`, { signal }),
  ]);
  const [playersData, claimRequestsData] = await Promise.all([
    safeJson(playersRes),
    claimRequestsRes ? safeJson(claimRequestsRes) : Promise.resolve([]),
  ]);

  if (!playersRes.ok) {
    throw new Error(playersData.error || "Failed to load players");
  }
  if (claimRequestsRes && !claimRequestsRes.ok) {
    throw new Error(claimRequestsData.error || "Failed to load claim requests");
  }
  return {
    club: currentClub,
    players: Array.isArray(playersData)
      ? (playersData as ClubAdminPlayer[])
      : [],
    claimRequests: Array.isArray(claimRequestsData)
      ? (claimRequestsData as ClubAdminClaimRequest[])
      : (claimRequestsData.requests ?? []).filter((entry: { kind: string }) => entry.kind === "EXISTING_PLAYER").map((entry: {
          id: string; requesterUserId: string; requesterName: string; requesterEmail: string | null;
          requestedPlayerId: string; targetName: string; status: ClubAdminClaimRequest["status"];
          note?: string; createdAt: string; revision: number;
        }): ClubAdminClaimRequest => ({
          id: entry.id, requesterUserId: entry.requesterUserId, requesterName: entry.requesterName, requesterEmail: entry.requesterEmail,
          targetUserId: entry.requestedPlayerId, targetName: entry.targetName, targetEmail: null, status: entry.status,
          note: entry.note, createdAt: entry.createdAt, revision: entry.revision,
        })),
  };
}

// Compatibility response for legacy handlers; the shared client bounds the full body read.
export async function adminFetch(url: string, init?: RequestInit): Promise<Response> {
  const data = await adminApi<unknown>(url, init?.method ?? "GET",
    typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
    { signal: init?.signal ?? undefined });
  return new Response(JSON.stringify(data ?? {}), { status: 200 });
}
