import { getSessionModeLabel } from "@/lib/sessionModeLabels";
import {
  defaultPartnerPreferenceForGender,
  getMixedSideOverrideOptionForGender,
} from "@/lib/mixedSide";
import {
  MixedSide,
  PartnerPreference,
  PlayerGender,
  SessionMode,
  SessionPool,
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
}

export interface NormalizedGuestConfig {
  name: string;
  gender: PlayerGender;
  partnerPreference: PartnerPreference;
  mixedSideOverride: MixedSide | null;
  pool: SessionPool;
  initialElo: number;
}

export interface ParsedCreateSessionRequest {
  name: string;
  type: SessionType;
  mode: SessionMode;
  communityId: string;
  isTest: boolean;
  courtCount: number;
  requestedPlayerIds: string[];
  playerConfigMap: Map<string, PlayerConfigOverride>;
  normalizedGuests: NormalizedGuestConfig[];
  autoQueueEnabled: boolean;
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
