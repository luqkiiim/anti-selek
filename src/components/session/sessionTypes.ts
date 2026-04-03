import {
  CommunityPlayerStatus,
  MixedSide,
  PartnerPreference,
  PlayerGender,
  SessionMode,
  SessionPool,
} from "@/types/enums";

export interface Player {
  userId: string;
  sessionPoints: number;
  ladderEntryAt?: string;
  isPaused: boolean;
  isGuest: boolean;
  gender: PlayerGender;
  partnerPreference: PartnerPreference;
  mixedSideOverride?: MixedSide | null;
  pool: SessionPool;
  user: {
    id: string;
    name: string;
    elo: number;
  };
}

export interface Match {
  id: string;
  status: string;
  scoreSubmittedByUserId?: string | null;
  team1User1: { id: string; name: string };
  team1User2: { id: string; name: string };
  team2User1: { id: string; name: string };
  team2User2: { id: string; name: string };
  team1Score?: number;
  team2Score?: number;
  completedAt?: string;
}

export interface QueuedMatch {
  id: string;
  createdAt?: string;
  targetPool?: SessionPool | null;
  team1User1: { id: string; name: string };
  team1User2: { id: string; name: string };
  team2User1: { id: string; name: string };
  team2User2: { id: string; name: string };
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
  poolsEnabled: boolean;
  poolAName?: string | null;
  poolBName?: string | null;
  poolACourtAssignments: number;
  poolBCourtAssignments: number;
  poolAMissedTurns: number;
  poolBMissedTurns: number;
  crossoverMissThreshold: number;
  viewerCanManage?: boolean;
  viewerCommunityRole?: string | null;
  courts: Court[];
  players: Player[];
  matches?: CompletedMatchInfo[];
  queuedMatch?: QueuedMatch | null;
}

export interface CurrentUser {
  id: string;
  isAdmin?: boolean;
  isClaimed?: boolean;
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
