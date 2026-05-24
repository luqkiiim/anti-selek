"use client";

import {
  ClaimRequestStatus,
  CommunityPlayerStatus,
  MixedSide,
  PartnerPreference,
  PlayerGender,
} from "@/types/enums";

export interface CommunityAdminCommunity {
  id: string;
  name: string;
  role: "ADMIN" | "MEMBER";
  isPasswordProtected: boolean;
  membersCount: number;
  sessionsCount: number;
}

export interface CommunityAdminPlayer {
  id: string;
  name: string;
  email: string | null;
  avatarUrl?: string | null;
  status: CommunityPlayerStatus;
  gender: PlayerGender;
  partnerPreference: PartnerPreference;
  mixedSideOverride?: MixedSide | null;
  elo: number;
  isActive: boolean;
  isClaimed: boolean;
  role: "ADMIN" | "MEMBER";
  createdAt: string;
  offlineIdentityId?: string | null;
  linkedCommunityBadges?: Array<{ id: string; name: string; userId: string }>;
}

export interface CommunityAdminClaimRequest {
  id: string;
  requesterUserId: string;
  requesterName: string;
  requesterEmail: string | null;
  targetUserId: string;
  targetName: string;
  targetEmail: string | null;
  status: ClaimRequestStatus;
  note?: string | null;
  linkedCommunityNames?: string[];
  createdAt: string;
}

export interface CommunityAdminOfflineIdentityLink {
  id: string;
  offlineIdentityId: string | null;
  sourceCommunityId: string;
  sourceCommunityName: string;
  sourceUserId: string;
  sourceUserName: string;
  sourceUserEmail: string | null;
  targetCommunityId: string;
  targetCommunityName: string;
  targetUserId: string;
  targetUserName: string;
  targetUserEmail: string | null;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  requestedById: string | null;
  requestedByName: string | null;
  reviewedById: string | null;
  reviewedByName: string | null;
  reviewedAt?: string | null;
  createdAt: string;
}

export type CommunityAdminSection = "players" | "links" | "claims" | "settings";
