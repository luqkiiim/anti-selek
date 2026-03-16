import { getSessionModeLabel } from "@/lib/sessionModeLabels";
import {
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
}

export interface NormalizedGuestConfig {
  name: string;
  gender: PlayerGender;
  partnerPreference: PartnerPreference;
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

export function defaultPartnerPreferenceForGender(
  gender: PlayerGender
): PartnerPreference {
  return gender === PlayerGender.FEMALE
    ? PartnerPreference.FEMALE_FLEX
    : PartnerPreference.OPEN;
}

