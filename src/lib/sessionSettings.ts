import {
  SessionBalanceMetric,
  SessionMatchmakingStyle,
  SessionMode,
  SessionPairingMode,
  SessionScoringType,
  SessionType,
} from "@/types/enums";

export interface SessionSettings {
  scoringType: SessionScoringType;
  matchmakingStyle: SessionMatchmakingStyle;
  balanceMetric: SessionBalanceMetric;
  pairingMode: SessionPairingMode;
}

export interface SessionSettingsSource {
  type?: string | null;
  mode?: string | null;
  scoringType?: string | null;
  matchmakingStyle?: string | null;
  balanceMetric?: string | null;
  pairingMode?: string | null;
}

const scoringTypes = new Set<string>(Object.values(SessionScoringType));
const matchmakingStyles = new Set<string>(
  Object.values(SessionMatchmakingStyle)
);
const balanceMetrics = new Set<string>(Object.values(SessionBalanceMetric));
const pairingModes = new Set<string>(Object.values(SessionPairingMode));
const sessionTypes = new Set<string>(Object.values(SessionType));
const sessionModes = new Set<string>(Object.values(SessionMode));

export function isValidSessionScoringType(
  value: unknown
): value is SessionScoringType {
  return typeof value === "string" && scoringTypes.has(value);
}

export function isValidSessionMatchmakingStyle(
  value: unknown
): value is SessionMatchmakingStyle {
  return typeof value === "string" && matchmakingStyles.has(value);
}

export function isValidSessionBalanceMetric(
  value: unknown
): value is SessionBalanceMetric {
  return typeof value === "string" && balanceMetrics.has(value);
}

export function isValidSessionPairingMode(
  value: unknown
): value is SessionPairingMode {
  return typeof value === "string" && pairingModes.has(value);
}

function getLegacyMatchmakingStyle(type?: string | null) {
  switch (type) {
    case SessionType.SOCIAL_MIX:
      return SessionMatchmakingStyle.SOCIAL;
    case SessionType.RACE:
    case SessionType.LADDER:
      return SessionMatchmakingStyle.LEVEL_MATCH;
    default:
      return SessionMatchmakingStyle.BALANCED;
  }
}

function getLegacyBalanceMetric(type?: string | null) {
  return type === SessionType.ELO
    ? SessionBalanceMetric.RATING
    : SessionBalanceMetric.SESSION_POINTS;
}

function getLegacyPairingMode(mode?: string | null) {
  return mode === SessionMode.MIXICANO
    ? SessionPairingMode.MIXED
    : SessionPairingMode.OPEN;
}

export function getSessionSettings(source: SessionSettingsSource): SessionSettings {
  const settings = {
    scoringType: isValidSessionScoringType(source.scoringType)
      ? source.scoringType
      : SessionScoringType.POINTS,
    matchmakingStyle: isValidSessionMatchmakingStyle(source.matchmakingStyle)
      ? source.matchmakingStyle
      : getLegacyMatchmakingStyle(source.type),
    balanceMetric: isValidSessionBalanceMetric(source.balanceMetric)
      ? source.balanceMetric
      : getLegacyBalanceMetric(source.type),
    pairingMode: isValidSessionPairingMode(source.pairingMode)
      ? source.pairingMode
      : getLegacyPairingMode(source.mode),
  };

  const hasLegacyType =
    typeof source.type === "string" && sessionTypes.has(source.type);
  const derivedLegacyType = getLegacySessionTypeForSettings(settings);
  if (
    hasLegacyType &&
    source.type !== SessionType.LADDER &&
    source.type !== derivedLegacyType
  ) {
    return {
      scoringType: SessionScoringType.POINTS,
      matchmakingStyle: getLegacyMatchmakingStyle(source.type),
      balanceMetric: getLegacyBalanceMetric(source.type),
      pairingMode: getLegacyPairingMode(source.mode),
    };
  }

  const hasLegacyMode =
    typeof source.mode === "string" && sessionModes.has(source.mode);
  if (
    hasLegacyMode &&
    source.mode !== getLegacySessionModeForSettings(settings)
  ) {
    return {
      ...settings,
      pairingMode: getLegacyPairingMode(source.mode),
    };
  }

  return settings;
}

export function getLegacySessionTypeForSettings(settings: SessionSettings) {
  if (settings.matchmakingStyle === SessionMatchmakingStyle.SOCIAL) {
    return SessionType.SOCIAL_MIX;
  }

  if (settings.matchmakingStyle === SessionMatchmakingStyle.LEVEL_MATCH) {
    return SessionType.RACE;
  }

  if (settings.balanceMetric === SessionBalanceMetric.RATING) {
    return SessionType.ELO;
  }

  return SessionType.POINTS;
}

export function getLegacySessionModeForSettings(settings: SessionSettings) {
  return settings.pairingMode === SessionPairingMode.MIXED
    ? SessionMode.MIXICANO
    : SessionMode.MEXICANO;
}

export function getEffectiveSessionType(source: SessionSettingsSource) {
  if (source.type === SessionType.LADDER) {
    return SessionType.LADDER;
  }

  return getLegacySessionTypeForSettings(getSessionSettings(source));
}

export function getEffectiveSessionMode(source: SessionSettingsSource) {
  return getLegacySessionModeForSettings(getSessionSettings(source));
}

export function getMatchmakingStyleLabel(style: SessionMatchmakingStyle | string) {
  switch (style) {
    case SessionMatchmakingStyle.BALANCED:
      return "Balanced";
    case SessionMatchmakingStyle.SOCIAL:
      return "Social";
    case SessionMatchmakingStyle.LEVEL_MATCH:
      return "Level Match";
    default:
      return style;
  }
}

export function getBalanceMetricLabel(metric: SessionBalanceMetric | string) {
  switch (metric) {
    case SessionBalanceMetric.SESSION_POINTS:
      return "Session points";
    case SessionBalanceMetric.RATING:
      return "Rating";
    default:
      return metric;
  }
}

export function getPairingModeLabel(mode: SessionPairingMode | string) {
  switch (mode) {
    case SessionPairingMode.OPEN:
      return "Open";
    case SessionPairingMode.MIXED:
      return "Mixed";
    default:
      return mode;
  }
}
