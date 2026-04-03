import {
  defaultPartnerPreferenceForGender,
  getLegacyMixedSideOverride,
  isValidMixedSide,
  isValidPartnerPreference,
  isValidPlayerGender,
  resolveMixedSideState,
} from "@/lib/mixedSide";
import {
  isValidSessionPool,
  normalizeSessionPoolName,
} from "@/lib/sessionPools";
import {
  MixedSide,
  PartnerPreference,
  PlayerGender,
  SessionMode,
  SessionPool,
  SessionType,
} from "@/types/enums";
import {
  DEFAULT_SESSION_POOL_A_NAME,
  DEFAULT_SESSION_POOL_B_NAME,
  DEFAULT_SESSION_POOL_CROSSOVER_MISS_THRESHOLD,
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
  poolsEnabled?: unknown;
  poolAName?: unknown;
  poolBName?: unknown;
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
      mixedSideOverride?: unknown;
      pool?: unknown;
    };
    if (typeof candidate.userId !== "string") continue;

    const normalized: PlayerConfigOverride = {};
    if (isValidPlayerGender(candidate.gender)) {
      normalized.gender = candidate.gender;
    }
    if (isValidPartnerPreference(candidate.partnerPreference)) {
      normalized.partnerPreference = candidate.partnerPreference;
    }
    if (isValidMixedSide(candidate.mixedSideOverride)) {
      normalized.mixedSideOverride = candidate.mixedSideOverride;
    } else if (
      isValidPlayerGender(candidate.gender) &&
      isValidPartnerPreference(candidate.partnerPreference)
    ) {
      normalized.mixedSideOverride = getLegacyMixedSideOverride(
        candidate.gender,
        candidate.partnerPreference
      );
    }
    if (isValidSessionPool(candidate.pool)) {
      normalized.pool = candidate.pool;
    }

    playerConfigMap.set(candidate.userId, normalized);
  }

  return playerConfigMap;
}

function normalizeGuests(
  guestNames: unknown,
  guestConfigs: unknown,
  mode: SessionMode,
  poolsEnabled: boolean
) {
  const normalizedGuestsByName = new Map<string, NormalizedGuestConfig>();

  const upsertGuest = (
    guestName: string,
    gender: PlayerGender =
      mode === SessionMode.MIXICANO
        ? PlayerGender.MALE
        : PlayerGender.UNSPECIFIED,
    mixedSideOverride: MixedSide | null = null,
    partnerPreference: PartnerPreference = defaultPartnerPreferenceForGender(
      gender
    ),
    pool: SessionPool = SessionPool.A,
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
      mixedSideOverride,
      pool,
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
        mixedSideOverride?: unknown;
        pool?: unknown;
        initialElo?: unknown;
      };
      if (typeof candidate.name !== "string") continue;

      const gender = isValidPlayerGender(candidate.gender)
        ? candidate.gender
        : mode === SessionMode.MIXICANO
          ? PlayerGender.MALE
          : PlayerGender.UNSPECIFIED;
      const { mixedSideOverride, partnerPreference } = resolveMixedSideState({
        gender,
        mixedSideOverride:
          isValidMixedSide(candidate.mixedSideOverride) ||
          candidate.mixedSideOverride === null
            ? candidate.mixedSideOverride
            : undefined,
        partnerPreference: isValidPartnerPreference(candidate.partnerPreference)
          ? candidate.partnerPreference
          : undefined,
      });
      const initialElo =
        typeof candidate.initialElo === "number" &&
        Number.isInteger(candidate.initialElo) &&
        candidate.initialElo >= 0 &&
        candidate.initialElo <= 5000
          ? candidate.initialElo
          : 1000;
      const pool =
        poolsEnabled && isValidSessionPool(candidate.pool)
          ? candidate.pool
          : SessionPool.A;

      upsertGuest(
        candidate.name,
        gender,
        mixedSideOverride,
        partnerPreference,
        pool,
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
    poolsEnabled = false,
    poolAName = DEFAULT_SESSION_POOL_A_NAME,
    poolBName = DEFAULT_SESSION_POOL_B_NAME,
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
  if (
    ![
      SessionType.POINTS,
      SessionType.ELO,
      SessionType.LADDER,
      SessionType.RACE,
    ].includes(
      type as SessionType
    )
  ) {
    throw new SessionRouteError("Invalid session type", 400);
  }

  const requestedPlayerIds = Array.isArray(playerIds)
    ? playerIds.filter((id): id is string => typeof id === "string")
    : [];
  const normalizedPoolsEnabled = poolsEnabled === true;
  const normalizedPoolAName = normalizeSessionPoolName(
    typeof poolAName === "string" ? poolAName : null,
    DEFAULT_SESSION_POOL_A_NAME
  );
  const normalizedPoolBName = normalizeSessionPoolName(
    typeof poolBName === "string" ? poolBName : null,
    DEFAULT_SESSION_POOL_B_NAME
  );

  if (normalizedPoolsEnabled && normalizedPoolAName === normalizedPoolBName) {
    throw new SessionRouteError("Pool names must be different", 400);
  }

  return {
    name: name.trim(),
    type: type as SessionType,
    mode: mode as SessionMode,
    communityId,
    courtCount: courtCount as number,
    requestedPlayerIds,
    playerConfigMap: normalizePlayerConfigMap(playerConfigs),
    normalizedGuests: normalizeGuests(
      guestNames,
      guestConfigs,
      mode as SessionMode,
      normalizedPoolsEnabled
    ),
    poolsEnabled: normalizedPoolsEnabled,
    poolAName: normalizedPoolAName,
    poolBName: normalizedPoolBName,
    crossoverMissThreshold: DEFAULT_SESSION_POOL_CROSSOVER_MISS_THRESHOLD,
  };
}
