import type { ClaimRequesterEligibility } from "@/lib/clubClaimRules";
import type { ClubPulseSnapshot } from "@/lib/clubPulse";
import {
  ClaimRequestStatus,
  ClubPlayerStatus,
  MixedSide,
  PartnerPreference,
  PlayerGender,
  SessionCollabFormat,
  SessionPool,
} from "@/types/enums";

export interface ClubPageUser {
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

export interface ClubPageClub {
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

export interface ClubPageMember {
  id: string;
  name: string;
  email?: string | null;
  avatarUrl?: string | null;
  status: ClubPlayerStatus;
  needsMoreRest: boolean;
  gender: PlayerGender;
  partnerPreference: PartnerPreference;
  mixedSideOverride?: MixedSide | null;
  elo: number;
  wins: number;
  losses: number;
  previousRank?: number | null;
  rankDelta?: number | null;
  isClaimed: boolean;
  role: "ADMIN" | "STAFF" | "MEMBER";
  isOwner?: boolean;
  matchesPlayed?: number;
  offlineIdentityId?: string | null;
  communityBadges?: Array<{ id: string; name: string; elo: number; userId?: string }>;
  linkedClubBadges?: Array<{ id: string; name: string; elo?: number; userId: string }>;
}

export interface ClubPageSession {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
  isTest: boolean;
  collabFormat?: SessionCollabFormat;
  sourceSessionId?: string | null;
  createdAt: string;
  endedAt?: string | null;
  players: { user: { id: string; name: string; avatarUrl?: string | null } }[];
  collabStatus?: "PENDING" | "ACCEPTED" | "REJECTED";
  clubs?: Array<{
    id: string;
    name: string;
    role: "HOST" | "PARTNER";
    status: "PENDING" | "ACCEPTED" | "REJECTED";
  }>;
}

export interface ClubCollabCandidate {
  id: string;
  name: string;
  membersCount: number;
}

export interface ClubGuestConfig {
  name: string;
  gender: PlayerGender;
  partnerPreference: PartnerPreference;
  mixedSideOverride?: MixedSide | null;
  pool: SessionPool;
  initialElo: number;
  representingClubId?: string | null;
}

export interface ClubClaimRequest {
  id: string;
  clubId: string;
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
  reviewedAt?: string | null;
}

export interface ClubPageNotificationsSummary {
  unreadCount: number;
}

export interface ClubNotificationItem {
  id: string;
  type: string;
  newsItemId: string;
  newsType: string;
  title: string;
  detail: string;
  value: string;
  readAt: string | null;
  createdAt: string | null;
  actor: {
    id: string;
    name: string;
    avatarUrl?: string | null;
  };
  session: {
    id: string;
    code: string;
    name: string;
    date: string | null;
  };
}

export type ClubPagePulse = ClubPulseSnapshot;

export interface ClubLeaderboardClaimState {
  currentUser: ClubPageUser | null;
  currentUserClaimEligibility: ClaimRequesterEligibility;
  myPendingClaimRequest: ClubClaimRequest | null;
  pendingClaimByTargetId: Map<string, ClubClaimRequest>;
  requestingClaimFor: string | null;
}

export type ClubPageSection =
  | "overview"
  | "host"
  | "tournaments"
  | "leaderboard"
  | "profile";
