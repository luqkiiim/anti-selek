import {
  ClubPlayerStatus,
  CourtGroupType,
  MixedSide,
  PartnerPreference,
  PlayerGender,
  SessionBalanceMetric,
  SessionCollabFormat,
  SessionMatchmakingStyle,
  SessionMode,
  SessionPairingMode,
  SessionCrossoverFrequency,
  SessionPool,
  SessionScoringType,
} from "@/types/enums";
import type { MatchmakingReason } from "@/lib/matchmaking/matchReason";

export interface Player {
  userId: string;
  /** Exact club-local profile selected for this session participant. */
  profileClubId?: string | null;
  representingClubId?: string | null;
  sessionPoints: number;
  ladderEntryAt?: string;
  joinedAt?: string;
  isPaused: boolean;
  skipNextMatchAt?: string | null;
  skipNextMatchRequestedById?: string | null;
  isGuest: boolean;
  gender: PlayerGender;
  partnerPreference: PartnerPreference;
  mixedSideOverride?: MixedSide | null;
  pool: SessionPool;
  pendingPool?: SessionPool | null;
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
  createdAt?: string;
  scoringFormat?: "SINGLE_GAME" | "BEST_OF_THREE";
  gameScoresJson?: string | null;
  scoreRevision?: number;
  status: string;
  scoreSubmittedByUserId?: string | null;
  scoreSubmittedByPlayerId?: string | null;
  team1ClubId?: string | null;
  team2ClubId?: string | null;
  team1User1: { id: string; name: string; avatarUrl?: string | null };
  team1User2: { id: string; name: string; avatarUrl?: string | null };
  team2User1: { id: string; name: string; avatarUrl?: string | null };
  team2User2: { id: string; name: string; avatarUrl?: string | null };
  team1Score?: number;
  team2Score?: number;
  completedAt?: string;
  matchmakingReason?: MatchmakingReason | null;
  courtGroupType?: CourtGroupType | null;
  poolASeatCount?: number | null;
  poolBSeatCount?: number | null;
}

export interface QueuedMatch {
  id: string;
  createdAt?: string;
  isAutomatic?: boolean;
  targetPool?: SessionPool | null;
  team1ClubId?: string | null;
  team2ClubId?: string | null;
  team1User1: { id: string; name: string; avatarUrl?: string | null };
  team1User2: { id: string; name: string; avatarUrl?: string | null };
  team2User1: { id: string; name: string; avatarUrl?: string | null };
  team2User2: { id: string; name: string; avatarUrl?: string | null };
  matchmakingReason?: MatchmakingReason | null;
  courtGroupType?: CourtGroupType | null;
  poolASeatCount?: number | null;
  poolBSeatCount?: number | null;
}

export interface CompletedMatchInfo {
  id: string;
  scoringFormat?: "SINGLE_GAME" | "BEST_OF_THREE";
  gameScoresJson?: string | null;
  scoreRevision?: number;
  createdAt?: string;
  team1User1Id: string;
  team1User2Id: string;
  team2User1Id: string;
  team2User2Id: string;
  team1ClubId?: string | null;
  team2ClubId?: string | null;
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

export interface ClubUser {
  id: string;
  profileClubId?: string | null;
  name: string;
  avatarUrl?: string | null;
  elo: number;
  status: ClubPlayerStatus;
  preferredPool: SessionPool;
  representingClubId?: string | null;
  representingClubName?: string | null;
  gender: PlayerGender;
  partnerPreference: PartnerPreference;
  mixedSideOverride?: MixedSide | null;
}

export interface SessionData {
  id: string;
  code: string;
  viewerUserId?: string | null;
  viewerPlayerId?: string | null;
  eligibleProfiles?: EligibleSessionProfile[];
  selectedSelf?: Pick<EligibleSessionProfile, "playerId" | "profileClubId"> | null;
  clubId?: string | null;
  name: string;
  type: string;
  mode: SessionMode;
  collabFormat?: SessionCollabFormat;
  collaborationVersion?: number;
  schedulingMode?: "FREE_PLAY" | "LINEUP";
  scoringFormat?: "SINGLE_GAME" | "BEST_OF_THREE";
  ratingMode?: "RATED" | "UNRATED";
  rulesRevision?: number;
  resultsRevision?: number;
  scoringType?: SessionScoringType;
  matchmakingStyle?: SessionMatchmakingStyle;
  balanceMetric?: SessionBalanceMetric;
  pairingMode?: SessionPairingMode;
  status: string;
  ratingPolicyVersion?: number;
  isTest: boolean;
  sourceSessionId?: string | null;
  autoQueueEnabled: boolean;
  respectPlayerRest: boolean;
  poolsEnabled: boolean;
  poolAName?: string | null;
  poolBName?: string | null;
  poolACourtAssignments: number;
  poolBCourtAssignments: number;
  poolAMissedTurns: number;
  poolBMissedTurns: number;
  crossoverMissThreshold: number;
  crossoverFrequency: SessionCrossoverFrequency;
  viewerCanManage?: boolean;
  viewerCanChangeCourtCount?: boolean;
  viewerCanRename?: boolean;
  viewerCanUseAdminSessionControls?: boolean;
  viewerCanDelete?: boolean;
  viewerCanRollback?: boolean;
  viewerIsQuickAccess?: boolean;
  viewerClubRole?: string | null;
  isTutorialClub?: boolean;
  tutorialOwnerId?: string | null;
  clubs?: Array<{
    id: string;
    name: string;
    avatarUrl?: string | null;
    role: string;
    status: string;
  }>;
  courts: Court[];
  players: Player[];
  matches?: CompletedMatchInfo[];
  queuedMatch?: QueuedMatch | null;
}

export interface EligibleSessionProfile {
  playerId: string;
  profileClubId: string;
  clubName: string;
  playerName: string;
  ownerUserId: string;
  elo: number;
  preferredPool: SessionPool;
}

export interface CurrentUser {
  id: string;
  playerId?: string | null;
  isAdmin?: boolean;
  isClaimed?: boolean;
  isQuickAccess?: boolean;
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

export interface PreferenceEditorPopoverAnchor {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type PreferenceEditorState = {
  userId: string;
} & (
  | {
      placement: "sheet";
    }
  | {
      placement: "popover";
      anchor: PreferenceEditorPopoverAnchor;
    }
);

export interface MatchScoreState {
  team1: string;
  team2: string;
}

export type MatchScores = Record<string, MatchScoreState>;
