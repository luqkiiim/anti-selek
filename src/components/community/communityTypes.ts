import type { ClaimRequesterEligibility } from "@/lib/communityClaimRules";
import type { CommunityPulseSnapshot } from "@/lib/communityPulse";
import {
  ClaimRequestStatus,
  CommunityPlayerStatus,
  MixedSide,
  PartnerPreference,
  PlayerGender,
  SessionPool,
} from "@/types/enums";

export interface CommunityPageUser {
  id: string;
  name: string;
  email: string | null;
  avatarUrl?: string | null;
  isAdmin?: boolean;
  elo: number;
  gender: PlayerGender;
  partnerPreference: PartnerPreference;
  mixedSideOverride?: MixedSide | null;
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
  avatarUrl?: string | null;
  status: CommunityPlayerStatus;
  gender: PlayerGender;
  partnerPreference: PartnerPreference;
  mixedSideOverride?: MixedSide | null;
  elo: number;
  wins: number;
  losses: number;
  isClaimed: boolean;
  role: "ADMIN" | "MEMBER";
  offlineIdentityId?: string | null;
  communityBadges?: Array<{ id: string; name: string; elo: number; userId?: string }>;
  linkedCommunityBadges?: Array<{ id: string; name: string; elo?: number; userId: string }>;
}

export interface CommunityPageSession {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
  isTest: boolean;
  sourceSessionId?: string | null;
  createdAt: string;
  endedAt?: string | null;
  players: { user: { id: string; name: string; avatarUrl?: string | null } }[];
  collabStatus?: "PENDING" | "ACCEPTED" | "REJECTED";
  communities?: Array<{
    id: string;
    name: string;
    role: "HOST" | "PARTNER";
    status: "PENDING" | "ACCEPTED" | "REJECTED";
  }>;
}

export interface CommunityCollabCandidate {
  id: string;
  name: string;
  membersCount: number;
}

export interface CommunityGuestConfig {
  name: string;
  gender: PlayerGender;
  partnerPreference: PartnerPreference;
  mixedSideOverride?: MixedSide | null;
  pool: SessionPool;
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
  linkedCommunityNames?: string[];
  createdAt: string;
  reviewedAt?: string | null;
}

export type CommunityPagePulse = CommunityPulseSnapshot;

export interface CommunityLeaderboardClaimState {
  currentUser: CommunityPageUser | null;
  currentUserClaimEligibility: ClaimRequesterEligibility;
  myPendingClaimRequest: CommunityClaimRequest | null;
  pendingClaimByTargetId: Map<string, CommunityClaimRequest>;
  requestingClaimFor: string | null;
}

export type CommunityPageSection =
  | "overview"
  | "host"
  | "tournaments"
  | "leaderboard"
  | "profile";
