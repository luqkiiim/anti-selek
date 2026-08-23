import type { Prisma, PrismaClient } from "@prisma/client";
import { isValidSessionPool } from "@/lib/sessionPools";
import { hasQueuedMatchUser } from "@/lib/sessionQueue";
import { SessionStatus, type SessionPool } from "@/types/enums";

type PendingPoolTransaction = Prisma.TransactionClient & {
  queuedMatch?: {
    findUnique?: (args: unknown) => Promise<{
      id: string;
      isAutomatic: boolean;
      team1User1Id: string;
      team1User2Id: string;
      team2User1Id: string;
      team2User2Id: string;
    } | null>;
    deleteMany?: (args: unknown) => Promise<{ count: number }>;
  };
  sessionPlayer: Prisma.TransactionClient["sessionPlayer"] & {
    findMany?: (args: unknown) => Promise<
      Array<{ userId: string; pendingPool: string | null }>
    >;
  };
};

export interface ApplyPendingPlayerGroupChangesResult {
  appliedCount: number;
  appliedUserIds: string[];
  automaticQueueInvalidated: boolean;
}

export interface PreferredPoolPropagationResult {
  immediateSessionCount: number;
  deferredSessionCount: number;
  automaticQueueSessionIds: string[];
}

export async function propagatePreferredPoolToClubSessions(
  db: PrismaClient,
  {
    clubId,
    userId,
    preferredPool,
  }: {
    clubId: string;
    userId: string;
    preferredPool: SessionPool;
  }
): Promise<PreferredPoolPropagationResult> {
  return db.$transaction(async (tx) => {
    const sessionPlayers = await tx.sessionPlayer.findMany({
      where: {
        userId,
        session: {
          poolsEnabled: true,
          status: { not: SessionStatus.COMPLETED },
          OR: [
            { clubId },
            {
              sessionClubs: { some: { clubId } },
              club: { members: { none: { userId } } },
            },
          ],
        },
      },
      select: {
        sessionId: true,
        pool: true,
        pendingPool: true,
        session: {
          select: {
            autoQueueEnabled: true,
            queuedMatch: {
              select: {
                id: true,
                createdAt: true,
                isAutomatic: true,
                team1User1Id: true,
                team1User2Id: true,
                team2User1Id: true,
                team2User2Id: true,
              },
            },
            courts: {
              select: {
                currentMatch: {
                  select: {
                    team1User1Id: true,
                    team1User2Id: true,
                    team2User1Id: true,
                    team2User2Id: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    let immediateSessionCount = 0;
    let deferredSessionCount = 0;
    const automaticQueueSessionIds = new Set<string>();

    for (const player of sessionPlayers) {
      const queuedMatch = player.session.queuedMatch;
      const isPlaying = player.session.courts.some((court) => {
        const match = court.currentMatch;
        return (
          !!match &&
          [
            match.team1User1Id,
            match.team1User2Id,
            match.team2User1Id,
            match.team2User2Id,
          ].includes(userId)
        );
      });
      const isManuallyQueued =
        !!queuedMatch &&
        !queuedMatch.isAutomatic &&
        hasQueuedMatchUser(queuedMatch, userId);
      const changesCurrentPool = player.pool !== preferredPool;

      if (changesCurrentPool && (isPlaying || isManuallyQueued)) {
        if (player.pendingPool !== preferredPool) {
          await tx.sessionPlayer.update({
            where: {
              sessionId_userId: { sessionId: player.sessionId, userId },
            },
            data: { pendingPool: preferredPool },
          });
        }
        deferredSessionCount += 1;
        continue;
      }

      if (changesCurrentPool || player.pendingPool !== null) {
        await tx.sessionPlayer.update({
          where: {
            sessionId_userId: { sessionId: player.sessionId, userId },
          },
          data: { pool: preferredPool, pendingPool: null },
        });
        immediateSessionCount += 1;
      }

      if (
        (changesCurrentPool && queuedMatch?.isAutomatic) ||
        (player.session.autoQueueEnabled && !queuedMatch)
      ) {
        automaticQueueSessionIds.add(player.sessionId);
      }
    }

    if (automaticQueueSessionIds.size > 0) {
      await tx.queuedMatch.deleteMany({
        where: {
          sessionId: { in: Array.from(automaticQueueSessionIds) },
          isAutomatic: true,
        },
      });
    }

    return {
      immediateSessionCount,
      deferredSessionCount,
      automaticQueueSessionIds: Array.from(automaticQueueSessionIds),
    };
  });
}

/**
 * Applies deferred group changes once a player is no longer protected by a
 * manual queued match. The optional delegate checks keep older focused test
 * doubles compatible while production Prisma clients use the full path.
 */
export async function applyPendingPlayerGroupChangesInTransaction(
  transaction: Prisma.TransactionClient,
  {
    sessionId,
    userIds,
  }: {
    sessionId: string;
    userIds: string[];
  }
): Promise<ApplyPendingPlayerGroupChangesResult> {
  const tx = transaction as PendingPoolTransaction;
  const uniqueUserIds = Array.from(new Set(userIds));
  if (uniqueUserIds.length === 0 || !tx.sessionPlayer.findMany) {
    return {
      appliedCount: 0,
      appliedUserIds: [],
      automaticQueueInvalidated: false,
    };
  }

  const pendingPlayers = await tx.sessionPlayer.findMany({
    where: {
      sessionId,
      userId: { in: uniqueUserIds },
      pendingPool: { not: null },
    },
    select: { userId: true, pendingPool: true },
  });
  if (pendingPlayers.length === 0) {
    return {
      appliedCount: 0,
      appliedUserIds: [],
      automaticQueueInvalidated: false,
    };
  }

  const queuedMatch = tx.queuedMatch?.findUnique
    ? await tx.queuedMatch.findUnique({
        where: { sessionId },
        select: {
          id: true,
          isAutomatic: true,
          team1User1Id: true,
          team1User2Id: true,
          team2User1Id: true,
          team2User2Id: true,
        },
      })
    : null;
  const manualQueueUserIds =
    queuedMatch && !queuedMatch.isAutomatic
      ? new Set([
          queuedMatch.team1User1Id,
          queuedMatch.team1User2Id,
          queuedMatch.team2User1Id,
          queuedMatch.team2User2Id,
        ])
      : new Set<string>();
  const applicablePlayers = pendingPlayers.filter(
    (player) =>
      isValidSessionPool(player.pendingPool) &&
      !manualQueueUserIds.has(player.userId)
  );

  for (const pool of ["A", "B"] as const) {
    const poolUserIds = applicablePlayers
      .filter((player) => player.pendingPool === pool)
      .map((player) => player.userId);
    if (poolUserIds.length === 0) continue;

    await tx.sessionPlayer.updateMany({
      where: { sessionId, userId: { in: poolUserIds } },
      data: { pool, pendingPool: null },
    });
  }

  let automaticQueueInvalidated = false;
  if (
    applicablePlayers.length > 0 &&
    queuedMatch?.isAutomatic &&
    tx.queuedMatch?.deleteMany
  ) {
    const deleted = await tx.queuedMatch.deleteMany({
      where: {
        id: queuedMatch.id,
        sessionId,
        isAutomatic: true,
      },
    });
    automaticQueueInvalidated = deleted.count > 0;
  }

  return {
    appliedCount: applicablePlayers.length,
    appliedUserIds: applicablePlayers.map((player) => player.userId),
    automaticQueueInvalidated,
  };
}
