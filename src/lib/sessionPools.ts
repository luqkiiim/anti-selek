import { SessionCrossoverFrequency, SessionPool } from "@/types/enums";

export const DEFAULT_SESSION_POOL_A_NAME = "Competitive";
export const DEFAULT_SESSION_POOL_B_NAME = "Social";
export const DEFAULT_SESSION_POOL_CROSSOVER_MISS_THRESHOLD = 1;
export const DEFAULT_SESSION_CROSSOVER_FREQUENCY =
  SessionCrossoverFrequency.BALANCED;
export const SESSION_POOL_IDS = [SessionPool.A, SessionPool.B] as const;

export interface SessionPoolConfigLike {
  poolsEnabled?: boolean | null;
  poolAName?: string | null;
  poolBName?: string | null;
  poolACourtAssignments?: number | null;
  poolBCourtAssignments?: number | null;
  poolAMissedTurns?: number | null;
  poolBMissedTurns?: number | null;
  crossoverMissThreshold?: number | null;
  crossoverFrequency?: SessionCrossoverFrequency | string | null;
}

const crossoverFrequencyTargets = {
  [SessionCrossoverFrequency.OCCASIONAL]: { numerator: 1, denominator: 5 },
  [SessionCrossoverFrequency.BALANCED]: { numerator: 1, denominator: 3 },
  [SessionCrossoverFrequency.FREQUENT]: { numerator: 1, denominator: 2 },
} as const;

export function isValidSessionCrossoverFrequency(
  value: unknown
): value is SessionCrossoverFrequency {
  return Object.values(SessionCrossoverFrequency).includes(
    value as SessionCrossoverFrequency
  );
}

export function getSessionCrossoverFrequency(
  value: unknown
): SessionCrossoverFrequency {
  return isValidSessionCrossoverFrequency(value)
    ? value
    : DEFAULT_SESSION_CROSSOVER_FREQUENCY;
}

export function getSessionCrossoverTarget(value: unknown) {
  return crossoverFrequencyTargets[getSessionCrossoverFrequency(value)];
}

export function isValidSessionPool(value: unknown): value is SessionPool {
  return value === SessionPool.A || value === SessionPool.B;
}

export function getNormalizedSessionPool(
  value: SessionPool | string | null | undefined
): SessionPool {
  return isValidSessionPool(value) ? value : SessionPool.B;
}

export function normalizeSessionPoolName(
  value: string | null | undefined,
  fallback: string
) {
  return value?.trim() ? value.trim() : fallback;
}

export function getSessionPoolName(
  _config: SessionPoolConfigLike,
  pool: SessionPool
) {
  return pool === SessionPool.A
    ? DEFAULT_SESSION_POOL_A_NAME
    : DEFAULT_SESSION_POOL_B_NAME;
}

export function getSessionPoolNames(config: SessionPoolConfigLike) {
  return {
    [SessionPool.A]: getSessionPoolName(config, SessionPool.A),
    [SessionPool.B]: getSessionPoolName(config, SessionPool.B),
  } as const;
}

export function getSessionPoolOptions(config: SessionPoolConfigLike) {
  return SESSION_POOL_IDS.map((pool) => ({
    value: pool,
    label: getSessionPoolName(config, pool),
  }));
}

export function getSessionPoolCourtAssignments(
  config: SessionPoolConfigLike,
  pool: SessionPool
) {
  const raw =
    pool === SessionPool.A
      ? config.poolACourtAssignments
      : config.poolBCourtAssignments;

  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
}

export function getSessionPoolMissedTurns(
  config: SessionPoolConfigLike,
  pool: SessionPool
) {
  const raw =
    pool === SessionPool.A ? config.poolAMissedTurns : config.poolBMissedTurns;

  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
}

export function getSessionPoolCrossoverMissThreshold(
  config: SessionPoolConfigLike
) {
  const raw = config.crossoverMissThreshold;
  return typeof raw === "number" && raw >= 0
    ? raw
    : DEFAULT_SESSION_POOL_CROSSOVER_MISS_THRESHOLD;
}

export function getOppositeSessionPool(pool: SessionPool) {
  return pool === SessionPool.A ? SessionPool.B : SessionPool.A;
}

export function getSessionPoolCounts<T>(
  items: readonly T[],
  getPool: (item: T) => SessionPool | string | null | undefined
) {
  const counts = {
    [SessionPool.A]: 0,
    [SessionPool.B]: 0,
  };

  for (const item of items) {
    counts[getNormalizedSessionPool(getPool(item))] += 1;
  }

  return counts;
}

export function buildSessionPoolMap<T>(
  items: readonly T[],
  getUserId: (item: T) => string,
  getPool: (item: T) => SessionPool | string | null | undefined
) {
  return new Map(
    items.map((item) => [getUserId(item), getNormalizedSessionPool(getPool(item))])
  );
}

export function summarizeSessionPoolMembership(
  userIds: readonly string[],
  poolByUserId: ReadonlyMap<string, SessionPool | string | null | undefined>
) {
  const counts = {
    [SessionPool.A]: 0,
    [SessionPool.B]: 0,
  };

  for (const userId of userIds) {
    counts[getNormalizedSessionPool(poolByUserId.get(userId))] += 1;
  }

  const isCrossPool =
    counts[SessionPool.A] > 0 && counts[SessionPool.B] > 0;
  const dominantPool =
    counts[SessionPool.A] === counts[SessionPool.B]
      ? null
      : counts[SessionPool.A] > counts[SessionPool.B]
        ? SessionPool.A
        : SessionPool.B;

  return {
    counts,
    isCrossPool,
    dominantPool,
  };
}

export function getSessionPoolBadgeLabel(
  config: SessionPoolConfigLike,
  summary: ReturnType<typeof summarizeSessionPoolMembership>
) {
  if (!config.poolsEnabled) {
    return null;
  }

  if (summary.isCrossPool) {
    return "Open Overflow";
  }

  const pool = summary.dominantPool;
  return pool ? getSessionPoolName(config, pool) : null;
}
