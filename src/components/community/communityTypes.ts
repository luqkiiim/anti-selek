import type { ClaimRequesterEligibility } from "@/lib/communityClaimRules";
import {
  ClaimRequestStatus,
  PartnerPreference,
  PlayerGender,
  SessionMode,
  SessionType,
} from "@/types/enums";

export interface CommunityPageUser {
  id: string;
  name: string;
  email: string;
  isAdmin?: boolean;
  elo: number;
  gender: PlayerGender;
  partnerPreference: PartnerPreference;
}

export interface CommunityPageCommunity {
  id: string;
  name: string;
  role: "ADMIN" | "MEMBER";
  isPasswordProtected: boolean;
  membersCount: number;
  sessionsCount: number;
}

export interface CommunityPageMember {
  id: string;
  name: string;
  email?: string | null;
  gender: PlayerGender;
  partnerPreference: PartnerPreference;
  elo: number;
  wins: number;
  losses: number;
  isClaimed: boolean;
  role: "ADMIN" | "MEMBER";
}

export interface CommunityPageSession {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
  createdAt: string;
  endedAt?: string | null;
  players: { user: { id: string; name: string } }[];
}

export interface CommunityGuestConfig {
  name: string;
  gender: PlayerGender;
  partnerPreference: PartnerPreference;
  initialElo: number;
}

export interface CommunityClaimRequest {
  id: string;
  communityId: string;
  requesterUserId: string;
  requesterName: string;
  requesterEmail: string | null;
  targetUserId: string;
  targetName: string;
  targetEmail: string | null;
  status: ClaimRequestStatus;
  note?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
}

export interface CommunityLeaderboardClaimState {
  currentUser: CommunityPageUser | null;
  currentUserClaimEligibility: ClaimRequesterEligibility;
  myPendingClaimRequest: CommunityClaimRequest | null;
  pendingClaimByTargetId: Map<string, CommunityClaimRequest>;
  requestingClaimFor: string | null;
}

export type CommunityPageSection =
  | "overview"
  | "tournaments"
  | "leaderboard";
