import type { Prisma } from "@prisma/client";
import { getEffectiveSessionType } from "@/lib/sessionSettings";
import { SessionType } from "@/types/enums";
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
  reasonJson?: string | null
): Promise<string | null> {
  // A queued commitment keeps its original sides when it becomes an active game.
  if (reasonJson && parseSocialVarietySnapshot(reasonJson, partition)) {
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
    },
  });
  if (!session || getEffectiveSessionType(session) !== SessionType.SOCIAL_MIX) {
    return reasonJson ?? null;
  }

  const players = await tx.sessionPlayer.findMany({
    where: {
      sessionId,
      userId: { in: [...partition.team1, ...partition.team2] },
    },
    select: {
      userId: true,
      gender: true,
      partnerPreference: true,
      mixedSideOverride: true,
    },
  });
  return withSocialVarietySnapshot(reasonJson, partition, players);
}
