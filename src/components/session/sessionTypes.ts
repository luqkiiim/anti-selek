import {
  CommunityPlayerStatus,
  MixedSide,
  PartnerPreference,
  PlayerGender,
  SessionMode,
  SessionPool,
} from "@/types/enums";
import type { MatchmakingReason } from "@/lib/matchmaking/matchReason";

export interface Player {
  userId: string;
  sessionPoints: number;
  ladderEntryAt?: string;
  joinedAt?: string;
  isPaused: boolean;
  isGuest: boolean;
  gender: PlayerGender;
  partnerPreference: PartnerPreference;
  mixedSideOverride?: MixedSide | null;
  pool: SessionPool;
  user: {
    id: string;
    name: string;
    avatarUrl?: string | null;
    elo: number;
  };
  communityBadges?: Array<{ id: string; name: string; elo: number }>;
}

export interface Match {
  id: string;
  status: string;
  scoreSubmittedByUserId?: string | null;
  team1User1: { id: string; name: string; avatarUrl?: string | null };
  team1User2: { id: string; name: string; avatarUrl?: string | null };
  team2User1: { id: string; name: string; avatarUrl?: string | null };
  team2User2: { id: string; name: string; avatarUrl?: string | null };
  team1Score?: number;
  team2Score?: number;
  completedAt?: string;
  matchmakingReason?: MatchmakingReason | null;
}

export interface QueuedMatch {
  id: string;
  createdAt?: string;
  targetPool?: SessionPool | null;
  team1User1: { id: string; name: string; avatarUrl?: string | null };
  team1User2: { id: string; name: string; avatarUrl?: string | null };
  team2User1: { id: string; name: string; avatarUrl?: string | null };
  team2User2: { id: string; name: string; avatarUrl?: string | null };
  matchmakingReason?: MatchmakingReason | null;
}

export interface CompletedMatchInfo {
  id: string;
  team1User1Id: string;
  team1User2Id: string;
  team2User1Id: string;
  team2User2Id: string;
  team1Score?: number;
  team2Score?: number;
  winnerTeam: number;
  status: string;
  completedAt?: string;
}

export interface Court {
  id: string;
  courtNumber: number;
  label?: string | null;
  currentMatch: Match | null;
}

export interface CommunityUser {
  id: string;
  name: string;
  avatarUrl?: string | null;
  elo: number;
  status: CommunityPlayerStatus;
  gender: PlayerGender;
  partnerPreference: PartnerPreference;
  mixedSideOverride?: MixedSide | null;
}

export interface SessionData {
  id: string;
  code: string;
  communityId?: string | null;
  name: string;
  type: string;
  mode: SessionMode;
  status: string;
  isTest: boolean;
  sourceSessionId?: string | null;
  autoQueueEnabled: boolean;
  poolsEnabled: boolean;
  poolAName?: string | null;
  poolBName?: string | null;
  poolACourtAssignments: number;
  poolBCourtAssignments: number;
  poolAMissedTurns: number;
  poolBMissedTurns: number;
  crossoverMissThreshold: number;
  viewerCanManage?: boolean;
  viewerCanUseAdminSessionControls?: boolean;
  viewerCommunityRole?: string | null;
  isTutorialCommunity?: boolean;
  tutorialOwnerId?: string | null;
  communities?: Array<{
    id: string;
    name: string;
    role: string;
    status: string;
  }>;
  courts: Court[];
  players: Player[];
  matches?: CompletedMatchInfo[];
  queuedMatch?: QueuedMatch | null;
}

export interface CurrentUser {
  id: string;
  isAdmin?: boolean;
  isClaimed?: boolean;
  avatarUrl?: string | null;
}

export type ManualMatchSlot =
  | "team1User1Id"
  | "team1User2Id"
  | "team2User1Id"
  | "team2User2Id";

export interface ManualMatchFormState {
  team1User1Id: string;
  team1User2Id: string;
  team2User1Id: string;
  team2User2Id: string;
}

export interface PreferenceEditorState {
  userId: string;
  top: number;
  left: number;
}

export interface MatchScoreState {
  team1: string;
  team2: string;
}

export type MatchScores = Record<string, MatchScoreState>;
