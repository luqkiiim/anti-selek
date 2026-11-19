import type { Prisma } from "@prisma/client";
import { withLegacySportingAliases } from "@/lib/sportingIdentity";
import {
  getEffectiveSessionType,
  getEffectiveSessionMode,
} from "@/lib/sessionSettings";
import { SessionMode, SessionType } from "@/types/enums";
import { appendBalancedMatchTypeSnapshot } from "./balancedMatchTypePersistence";
import { appendManualClubPlayMatchType, isAutomaticClubPlayReason } from "./clubPlayPersistence";
import { appendManualLevelMatchType, hasLevelMatch3Commitment } from "./levelMatchPersistence";
import { isLevelMatch3Enabled } from "./ladder/levelDistribution";
import { parseBalancedMatchTypeSnapshot } from "./v3/balancedMatchTypes";
import { usesRotationMatchmaking } from "./v3/socialBatch";
import type { V3DoublesPartition } from "./v3/types";
import {
  parseSocialVarietySnapshot,
  withSocialVarietySnapshot,
} from "./v3/socialVariety";

/** Store assignment-time sides without changing the automatic/manual source. */
export async function resolveSocialHistoryReasonJson(
  tx: Prisma.TransactionClient,
  sessionId: string,
  partition: V3DoublesPartition,
  reasonJson?: string | null,
  options: { newCommitment?: boolean; reservation?: boolean } = {},
): Promise<string | null> {
  if (hasLevelMatch3Commitment(reasonJson) || isAutomaticClubPlayReason(reasonJson)) return reasonJson ?? null;
  // A queued commitment keeps its original sides when it becomes an active game.
  const existingSides = reasonJson
    ? parseSocialVarietySnapshot(reasonJson, partition)
    : null;
  if (
    reasonJson &&
    existingSides &&
    (!options.newCommitment ||
      process.env.BALANCED_MATCH_TYPE_DISTRIBUTION_ENABLED !== "1" ||
      parseBalancedMatchTypeSnapshot(reasonJson, partition))
  ) {
    return reasonJson;
  }
  const session = await tx.session.findUnique({
    where: { id: sessionId },
    select: {
      type: true,
      mode: true,
      scoringType: true,
      matchmakingStyle: true,
      balanceMetric: true,
      pairingMode: true,
      poolsEnabled: true,
      collabFormat: true,
      crossoverFrequency: true,
    },
  });
  if (session && getEffectiveSessionType(session) === SessionType.CLUB_PLAY &&
      getEffectiveSessionMode(session) === SessionMode.MIXICANO) {
    return options.reservation ? reasonJson ?? null : appendManualClubPlayMatchType(tx, sessionId, partition, reasonJson);
  }
  if (session && options.newCommitment && isLevelMatch3Enabled() &&
    getEffectiveSessionType(session) === SessionType.RACE && getEffectiveSessionMode(session) === SessionMode.MIXICANO) {
    return appendManualLevelMatchType(tx, sessionId, partition, reasonJson, session.poolsEnabled);
  }
  if (!session || !usesRotationMatchmaking(getEffectiveSessionType(session))) {
    return reasonJson ?? null;
  }

  let stored = reasonJson ?? "";
  if (!existingSides) {
    const players = await tx.sessionPlayer.findMany({
      where: {
        sessionId,
        playerId: { in: [...partition.team1, ...partition.team2] },
      },
      select: {
        playerId: true,
        gender: true,
        partnerPreference: true,
        mixedSideOverride: true,
      },
    });
    stored = withSocialVarietySnapshot(
      reasonJson,
      partition,
      withLegacySportingAliases(players),
    );
  }
  if (
    process.env.BALANCED_MATCH_TYPE_DISTRIBUTION_ENABLED === "1" &&
    [SessionType.POINTS, SessionType.ELO].includes(
      getEffectiveSessionType(session) as SessionType.POINTS | SessionType.ELO,
    ) &&
    getEffectiveSessionMode(session) === SessionMode.MIXICANO
  ) {
    return appendBalancedMatchTypeSnapshot(
      tx,
      sessionId,
      partition,
      stored,
      session,
    );
  }
  return stored;
}
