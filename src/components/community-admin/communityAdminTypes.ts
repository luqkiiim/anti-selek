"use client";

import {
  ClaimRequestStatus,
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
  gender: PlayerGender;
  partnerPreference: PartnerPreference;
  elo: number;
  isActive: boolean;
  isClaimed: boolean;
  role: "ADMIN" | "MEMBER";
  createdAt: string;
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
  createdAt: string;
}

export type CommunityAdminSection = "players" | "claims" | "settings";
