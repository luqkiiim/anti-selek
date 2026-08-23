import { CourtGroupType, SessionPool } from "@/types/enums";
import {
  getNormalizedSessionPool,
  type SessionPoolConfigLike,
} from "@/lib/sessionPools";

export const COMPETITIVE_POOL = SessionPool.A;
export const SOCIAL_POOL = SessionPool.B;

export interface CourtGroupSnapshot {
  courtGroupType: CourtGroupType;
  poolASeatCount: number;
  poolBSeatCount: number;
}

export function getPlayerGroupLabel(pool: SessionPool | string) {
  return getNormalizedSessionPool(pool) === SessionPool.A
    ? "Competitive"
    : "Social";
}

export function getCourtGroupTypeLabel(type: CourtGroupType | string | null) {
  switch (type) {
    case CourtGroupType.COMPETITIVE:
      return "Competitive";
    case CourtGroupType.SOCIAL:
      return "Social";
    case CourtGroupType.CROSSOVER:
      return "Crossover";
    case CourtGroupType.OPEN_OVERFLOW:
      return "Open Overflow";
    default:
      return null;
  }
}

export function isValidCourtGroupType(value: unknown): value is CourtGroupType {
  return Object.values(CourtGroupType).includes(value as CourtGroupType);
}

export function classifyCourtGroupSnapshot(
  team1: readonly [string, string],
  team2: readonly [string, string],
  poolByUserId: ReadonlyMap<string, SessionPool | string | null | undefined>
): CourtGroupSnapshot {
  const team1Pools = team1.map((userId) =>
    getNormalizedSessionPool(poolByUserId.get(userId))
  );
  const team2Pools = team2.map((userId) =>
    getNormalizedSessionPool(poolByUserId.get(userId))
  );
  const allPools = [...team1Pools, ...team2Pools];
  const poolASeatCount = allPools.filter(
    (pool) => pool === SessionPool.A
  ).length;
  const poolBSeatCount = 4 - poolASeatCount;

  let courtGroupType = CourtGroupType.OPEN_OVERFLOW;
  if (poolASeatCount === 4) {
    courtGroupType = CourtGroupType.COMPETITIVE;
  } else if (poolBSeatCount === 4) {
    courtGroupType = CourtGroupType.SOCIAL;
  } else if (
    poolASeatCount === 2 &&
    team1Pools[0] !== team1Pools[1] &&
    team2Pools[0] !== team2Pools[1]
  ) {
    courtGroupType = CourtGroupType.CROSSOVER;
  }

  return { courtGroupType, poolASeatCount, poolBSeatCount };
}

export function getFixedPlayerGroupConfig(): SessionPoolConfigLike {
  return {
    poolsEnabled: true,
    poolAName: "Competitive",
    poolBName: "Social",
  };
}
