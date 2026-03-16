import {
  PartnerPreference,
  PlayerGender,
  SessionMode,
  SessionType,
} from "@/types/enums";
import {
  defaultPartnerPreferenceForGender,
  type NormalizedGuestConfig,
  type ParsedCreateSessionRequest,
  type PlayerConfigOverride,
  SessionRouteError,
} from "./sessionRouteShared";

interface CreateSessionBody {
  name?: unknown;
  type?: unknown;
  mode?: unknown;
  playerIds?: unknown;
  guestNames?: unknown;
  playerConfigs?: unknown;
  guestConfigs?: unknown;
  communityId?: unknown;
  courtCount?: unknown;
}

function isValidPlayerGender(value: unknown): value is PlayerGender {
  return (
    typeof value === "string" &&
    [PlayerGender.MALE, PlayerGender.FEMALE, PlayerGender.UNSPECIFIED].includes(
      value as PlayerGender
    )
  );
}

function isValidPartnerPreference(value: unknown): value is PartnerPreference {
  return (
    typeof value === "string" &&
    [PartnerPreference.OPEN, PartnerPreference.FEMALE_FLEX].includes(
      value as PartnerPreference
    )
  );
}

function normalizePlayerConfigMap(playerConfigs: unknown) {
  const playerConfigMap = new Map<string, PlayerConfigOverride>();
  if (!Array.isArray(playerConfigs)) {
    return playerConfigMap;
  }

  for (const config of playerConfigs) {
    if (typeof config !== "object" || config === null) continue;

    const candidate = config as {
      userId?: unknown;
      gender?: unknown;
      partnerPreference?: unknown;
    };
    if (typeof candidate.userId !== "string") continue;

    const normalized: PlayerConfigOverride = {};
    if (isValidPlayerGender(candidate.gender)) {
      normalized.gender = candidate.gender;
    }
    if (isValidPartnerPreference(candidate.partnerPreference)) {
      normalized.partnerPreference = candidate.partnerPreference;
    }

    playerConfigMap.set(candidate.userId, normalized);
  }

  return playerConfigMap;
}

function normalizeGuests(
  guestNames: unknown,
  guestConfigs: unknown,
  mode: SessionMode
) {
  const normalizedGuestsByName = new Map<string, NormalizedGuestConfig>();

  const upsertGuest = (
    guestName: string,
    gender: PlayerGender =
      mode === SessionMode.MIXICANO
        ? PlayerGender.MALE
        : PlayerGender.UNSPECIFIED,
    partnerPreference: PartnerPreference = defaultPartnerPreferenceForGender(
      gender
    ),
    initialElo = 1000,
    overwrite = false
  ) => {
    const trimmed = guestName.trim();
    if (trimmed.length < 2) return;

    const key = trimmed.toLowerCase();
    if (normalizedGuestsByName.has(key) && !overwrite) return;

    normalizedGuestsByName.set(key, {
      name: trimmed,
      gender,
      partnerPreference,
      initialElo,
    });
  };

  if (Array.isArray(guestNames)) {
    for (const guestName of guestNames) {
      if (typeof guestName === "string") {
        upsertGuest(guestName);
      }
    }
  }

  if (Array.isArray(guestConfigs)) {
    for (const guest of guestConfigs) {
      if (typeof guest !== "object" || guest === null) continue;

      const candidate = guest as {
        name?: unknown;
        gender?: unknown;
        partnerPreference?: unknown;
        initialElo?: unknown;
      };
      if (typeof candidate.name !== "string") continue;

      const gender = isValidPlayerGender(candidate.gender)
        ? candidate.gender
        : mode === SessionMode.MIXICANO
          ? PlayerGender.MALE
          : PlayerGender.UNSPECIFIED;
      const partnerPreference = isValidPartnerPreference(
        candidate.partnerPreference
      )
        ? candidate.partnerPreference
        : defaultPartnerPreferenceForGender(gender);
      const initialElo =
        typeof candidate.initialElo === "number" &&
        Number.isInteger(candidate.initialElo) &&
        candidate.initialElo >= 0 &&
        candidate.initialElo <= 5000
          ? candidate.initialElo
          : 1000;

      upsertGuest(
        candidate.name,
        gender,
        partnerPreference,
        initialElo,
        true
      );
    }
  }

  return Array.from(normalizedGuestsByName.values());
}

export function parseCreateSessionRequest(
  body: unknown
): ParsedCreateSessionRequest {
  if (!body || typeof body !== "object") {
    throw new SessionRouteError("Invalid request body", 400);
  }

  const {
    name,
    type = SessionType.POINTS,
    mode = SessionMode.MEXICANO,
    playerIds = [],
    guestNames = [],
    playerConfigs = [],
    guestConfigs = [],
    communityId,
    courtCount = 3,
  } = body as CreateSessionBody;

  if (typeof name !== "string" || !name.trim()) {
    throw new SessionRouteError("Session name required", 400);
  }
  if (typeof communityId !== "string" || !communityId) {
    throw new SessionRouteError("Community is required", 400);
  }
  if (
    !Number.isInteger(courtCount) ||
    (courtCount as number) < 1 ||
    (courtCount as number) > 10
  ) {
    throw new SessionRouteError(
      "Court count must be an integer between 1 and 10",
      400
    );
  }
  if (![SessionMode.MEXICANO, SessionMode.MIXICANO].includes(mode as SessionMode)) {
    throw new SessionRouteError("Invalid session mode", 400);
  }

  const requestedPlayerIds = Array.isArray(playerIds)
    ? playerIds.filter((id): id is string => typeof id === "string")
    : [];

  return {
    name: name.trim(),
    type: type as SessionType,
    mode: mode as SessionMode,
    communityId,
    courtCount: courtCount as number,
    requestedPlayerIds,
    playerConfigMap: normalizePlayerConfigMap(playerConfigs),
    normalizedGuests: normalizeGuests(guestNames, guestConfigs, mode as SessionMode),
  };
}

