"use client";

import {
  ClaimRequestStatus,
  ClubPlayerStatus,
  MixedSide,
  PartnerPreference,
  PlayerGender,
} from "@/types/enums";

export interface ClubAdminClub {
  id: string;
  name: string;
  role: "ADMIN" | "STAFF" | "MEMBER";
  viewerIsOwner?: boolean;
  isPasswordProtected: boolean;
  isTutorial: boolean;
  tutorialOwnerId?: string | null;
  membersCount: number;
  sessionsCount: number;
}

export interface ClubAdminPlayer {
  id: string;
  name: string;
  email: string | null;
  avatarUrl?: string | null;
  status: ClubPlayerStatus;
  gender: PlayerGender;
  partnerPreference: PartnerPreference;
  mixedSideOverride?: MixedSide | null;
  elo: number;
  isActive: boolean;
  isClaimed: boolean;
  role: "ADMIN" | "STAFF" | "MEMBER";
  isOwner?: boolean;
  createdAt: string;
  offlineIdentityId?: string | null;
  linkedClubBadges?: Array<{ id: string; name: string; userId: string }>;
}

export interface ClubAdminClaimRequest {
  id: string;
  requesterUserId: string;
  requesterName: string;
  requesterEmail: string | null;
  targetUserId: string;
  targetName: string;
  targetEmail: string | null;
  status: ClaimRequestStatus;
  note?: string | null;
  linkedClubNames?: string[];
  createdAt: string;
}

export interface ClubAdminOfflineIdentityLink {
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

export type ClubAdminSection = "players" | "links" | "claims" | "settings";
