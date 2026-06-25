import { getSessionModeLabel } from "@/lib/sessionModeLabels";
import {
  defaultPartnerPreferenceForGender,
  getMixedSideOverrideOptionForGender,
} from "@/lib/mixedSide";
import {
  MixedSide,
  PartnerPreference,
  PlayerGender,
  SessionBalanceMetric,
  SessionCollabFormat,
  SessionMatchmakingStyle,
  SessionMode,
  SessionPairingMode,
  SessionPool,
  SessionScoringType,
  SessionType,
} from "@/types/enums";
import {
  DEFAULT_SESSION_POOL_CROSSOVER_MISS_THRESHOLD,
  DEFAULT_SESSION_POOL_A_NAME,
  DEFAULT_SESSION_POOL_B_NAME,
} from "@/lib/sessionPools";

export class SessionRouteError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "SessionRouteError";
  }
}

export interface PlayerConfigOverride {
  gender?: PlayerGender;
  partnerPreference?: PartnerPreference;
  mixedSideOverride?: MixedSide | null;
  pool?: SessionPool;
  representingClubId?: string | null;
}

export interface NormalizedGuestConfig {
  name: string;
  gender: PlayerGender;
  partnerPreference: PartnerPreference;
  mixedSideOverride: MixedSide | null;
  pool: SessionPool;
  initialElo: number;
  representingClubId?: string | null;
}

export interface ParsedCreateSessionRequest {
  name: string;
  type: SessionType;
  mode: SessionMode;
  scoringType: SessionScoringType;
  matchmakingStyle: SessionMatchmakingStyle;
  balanceMetric: SessionBalanceMetric;
  pairingMode: SessionPairingMode;
  collabFormat: SessionCollabFormat;
  clubId: string;
  partnerClubId?: string | null;
  isTest: boolean;
  courtCount: number;
  requestedPlayerIds: string[];
  playerConfigMap: Map<string, PlayerConfigOverride>;
  normalizedGuests: NormalizedGuestConfig[];
  autoQueueEnabled: boolean;
  respectPlayerRest: boolean;
  poolsEnabled: boolean;
  poolAName: string;
  poolBName: string;
  crossoverMissThreshold: number;
}

export const mixedModeLabel = getSessionModeLabel(SessionMode.MIXICANO);

export { defaultPartnerPreferenceForGender };

export function getMixedSideOptionLabel(gender: PlayerGender) {
  return getMixedSideOverrideOptionForGender(gender)?.label ?? null;
}

export {
  DEFAULT_SESSION_POOL_A_NAME,
  DEFAULT_SESSION_POOL_B_NAME,
  DEFAULT_SESSION_POOL_CROSSOVER_MISS_THRESHOLD,
};
