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
  SessionType,
} from "@/types/enums";

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
}

export interface NormalizedGuestConfig {
  name: string;
  gender: PlayerGender;
  partnerPreference: PartnerPreference;
  mixedSideOverride: MixedSide | null;
  initialElo: number;
}

export interface ParsedCreateSessionRequest {
  name: string;
  type: SessionType;
  mode: SessionMode;
  communityId: string;
  courtCount: number;
  requestedPlayerIds: string[];
  playerConfigMap: Map<string, PlayerConfigOverride>;
  normalizedGuests: NormalizedGuestConfig[];
}

export const mixedModeLabel = getSessionModeLabel(SessionMode.MIXICANO);

export { defaultPartnerPreferenceForGender };

export function getMixedSideOptionLabel(gender: PlayerGender) {
  return getMixedSideOverrideOptionForGender(gender)?.label ?? null;
}
