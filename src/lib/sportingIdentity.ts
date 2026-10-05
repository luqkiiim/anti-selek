/**
 * Compatibility boundary for the existing frontend and matchmaking DTOs.
 * A legacy sporting `userId` is a Player ID, never an authenticated account ID.
 * Database queries and authorization use the canonical fields directly.
 */
export type LegacySportingAliases<T> = T extends Date
  ? T
  : T extends readonly (infer U)[]
    ? LegacySportingAliases<U>[]
    : T extends object
      ? { [K in keyof T]: LegacySportingAliases<T[K]> }
        & (T extends { playerId: infer I } ? { userId: I } : object)
        & (T extends { player: infer P } ? { user: LegacySportingAliases<P> } : object)
        & (T extends { ownerUserId: string | null } ? { isClaimed: boolean; email: string | null } : object)
        & (T extends { lastPartnerPlayerId: infer I } ? { lastPartnerId: I } : object)
        & (T extends { team1Player1Id: infer I } ? { team1User1Id: I } : object)
        & (T extends { team1Player2Id: infer I } ? { team1User2Id: I } : object)
        & (T extends { team2Player1Id: infer I } ? { team2User1Id: I } : object)
        & (T extends { team2Player2Id: infer I } ? { team2User2Id: I } : object)
        & (T extends { team1Player1: infer P } ? { team1User1: LegacySportingAliases<P> } : object)
        & (T extends { team1Player2: infer P } ? { team1User2: LegacySportingAliases<P> } : object)
        & (T extends { team2Player1: infer P } ? { team2User1: LegacySportingAliases<P> } : object)
        & (T extends { team2Player2: infer P } ? { team2User2: LegacySportingAliases<P> } : object)
      : T;

export function withLegacySportingAliases<T>(value: T): LegacySportingAliases<T> {
  if (value === null || typeof value !== "object" || value instanceof Date) {
    return value as LegacySportingAliases<T>;
  }
  if (Array.isArray(value)) {
    return value.map(withLegacySportingAliases) as LegacySportingAliases<T>;
  }
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    result[key] = withLegacySportingAliases(child);
  }
  const aliases: Record<string, string> = {
    playerId: "userId", player: "user", lastPartnerPlayerId: "lastPartnerId",
    team1Player1Id: "team1User1Id", team1Player2Id: "team1User2Id",
    team2Player1Id: "team2User1Id", team2Player2Id: "team2User2Id",
    team1Player1: "team1User1", team1Player2: "team1User2",
    team2Player1: "team2User1", team2Player2: "team2User2",
  };
  for (const [canonical, legacy] of Object.entries(aliases)) {
    if (canonical in result && !(legacy in result)) result[legacy] = result[canonical];
  }
  if ("ownerUserId" in result) {
    result.isClaimed = result.ownerUserId !== null && result.ownerUserId !== undefined;
    const owner = result.ownerUser as { email?: unknown } | null | undefined;
    result.email = typeof owner?.email === "string" ? owner.email : null;
  }
  return result as LegacySportingAliases<T>;
}

/** Keep the matcher contract stable while its identifiers now represent Players. */
export function asMatchmakingPlayer<T extends {
  playerId: string;
  player: { elo: number };
  lastPartnerPlayerId?: string | null;
}>(row: T) {
  return withLegacySportingAliases(row);
}
