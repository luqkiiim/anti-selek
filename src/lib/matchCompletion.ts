import { prisma } from "@/lib/prisma";
import { isValidMatchScore } from "@/lib/matchRules";
import { getLinkedCommunityUserResolver } from "@/lib/offlineIdentities";
import { getAcceptedSessionCommunityIds } from "@/lib/sessionCollab";
import { getStandingPointsForTeam } from "@/lib/sessionStandings";
import { MatchStatus, SessionStatus, SessionType } from "@/types/enums";
import type { Prisma } from "@prisma/client";

const K_FACTOR = 32;
const SINGLE_GUEST_MULTIPLIER = 0.75;
const MULTI_GUEST_MULTIPLIER = 0.5;

function calculateEloChange(
  winnerElo: number,
  loserElo: number,
  winnerScore: number,
  loserScore: number
): number {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  const scoreDiff = winnerScore - loserScore;
  const marginMultiplier = 1 + (scoreDiff - 2) * 0.05;

  return Math.round(K_FACTOR * (1 - expectedWinner) * marginMultiplier);
}

function getGuestImpactMultiplier(guestCount: number): number {
  if (guestCount <= 0) return 1;
  if (guestCount === 1) return SINGLE_GUEST_MULTIPLIER;
  return MULTI_GUEST_MULTIPLIER;
}

function applyGuestMultiplierToDelta(delta: number, multiplier: number): number {
  if (delta === 0 || multiplier === 1) return delta;
  const magnitude = Math.max(1, Math.round(Math.abs(delta) * multiplier));
  return delta > 0 ? magnitude : -magnitude;
}

interface MatchUserSnapshot {
  id: string;
  name: string;
  elo: number;
}

export interface FinalizableMatch {
  id: string;
  sessionId: string;
  courtId: string;
  team1User1Id: string;
  team1User2Id: string;
  team2User1Id: string;
  team2User2Id: string;
  team1Score?: number | null;
  team2Score?: number | null;
  session: {
    communityId: string | null;
    type: string;
    isTest: boolean;
  };
  team1User1: MatchUserSnapshot;
  team1User2: MatchUserSnapshot;
  team2User1: MatchUserSnapshot;
  team2User2: MatchUserSnapshot;
}

interface FinalizeMatchResultArgs {
  match: FinalizableMatch;
  expectedStatus: MatchStatus.IN_PROGRESS | MatchStatus.PENDING_APPROVAL;
  finalTeam1Score: number;
  finalTeam2Score: number;
  scoreSubmittedByUserId?: string | null;
  completedAt?: Date;
}

export class UndoCompletedMatchError extends Error {
  constructor(
    public readonly code:
      | "MATCH_NOT_FOUND"
      | "MATCH_NOT_COMPLETED"
      | "SESSION_NOT_ACTIVE"
      | "NOT_LATEST_COMPLETED_MATCH",
    message: string
  ) {
    super(message);
    this.name = "UndoCompletedMatchError";
  }
}

interface UndoCompletedMatchResultArgs {
  matchId: string;
  undoneAt?: Date;
}

async function getCommunityEloByUserIdInTransaction(
  tx: Prisma.TransactionClient,
  communityId: string,
  userIds: string[]
): Promise<Map<string, number>> {
  const uniqueUserIds = Array.from(new Set(userIds));
  if (uniqueUserIds.length === 0) {
    return new Map<string, number>();
  }

  const rows = await tx.communityMember.findMany({
    where: {
      communityId,
      userId: { in: uniqueUserIds },
    },
    select: { userId: true, elo: true },
  });

  return new Map(rows.map((row) => [row.userId, row.elo]));
}

async function getUserEloByUserIdInTransaction(
  tx: Prisma.TransactionClient,
  userIds: string[]
): Promise<Map<string, number>> {
  const uniqueUserIds = Array.from(new Set(userIds));
  if (uniqueUserIds.length === 0) {
    return new Map<string, number>();
  }

  const rows = await tx.user.findMany({
    where: { id: { in: uniqueUserIds } },
    select: { id: true, elo: true },
  });

  return new Map(rows.map((row) => [row.id, row.elo]));
}

interface TeamEloDeltas {
  team1Delta: number;
  team2Delta: number;
}

interface EloAdjustmentInput {
  matchId: string;
  communityId: string;
  userId: string;
  sourceUserId?: string;
  delta: number;
  beforeElo: number;
  afterElo: number;
}

function getMatchEloAdjustmentDelegate(tx: Prisma.TransactionClient) {
  return (
    tx as unknown as {
      matchEloAdjustment?: {
        createMany?: (args: { data: EloAdjustmentInput[] }) => Promise<unknown>;
        findMany?: (args: {
          where: { matchId: string };
          select: {
            communityId: true;
            userId: true;
            delta: true;
          };
        }) => Promise<
          Array<{
            communityId: string;
            userId: string;
            delta: number;
          }>
        >;
      };
    }
  ).matchEloAdjustment;
}

function calculateTeamEloDeltas({
  winnerTeam,
  team1AvgElo,
  team2AvgElo,
  team1Points,
  team2Points,
  guestImpactMultiplier,
}: {
  winnerTeam: 1 | 2;
  team1AvgElo: number;
  team2AvgElo: number;
  team1Points: number;
  team2Points: number;
  guestImpactMultiplier: number;
}): TeamEloDeltas {
  let team1EloChange: number;
  let team2EloChange: number;

  if (winnerTeam === 1) {
    const delta = calculateEloChange(
      team1AvgElo,
      team2AvgElo,
      team1Points,
      team2Points
    );
    team1EloChange = delta;
    team2EloChange = -delta;
  } else {
    const delta = calculateEloChange(
      team2AvgElo,
      team1AvgElo,
      team2Points,
      team1Points
    );
    team1EloChange = -delta;
    team2EloChange = delta;
  }

  return {
    team1Delta: applyGuestMultiplierToDelta(
      team1EloChange,
      guestImpactMultiplier
    ),
    team2Delta: applyGuestMultiplierToDelta(
      team2EloChange,
      guestImpactMultiplier
    ),
  };
}

function getPlayerSnapshotElo(match: FinalizableMatch, userId: string) {
  if (match.team1User1Id === userId) return match.team1User1.elo;
  if (match.team1User2Id === userId) return match.team1User2.elo;
  if (match.team2User1Id === userId) return match.team2User1.elo;
  if (match.team2User2Id === userId) return match.team2User2.elo;
  return 1000;
}

function getDisplayPlayerEloChanges({
  adjustments,
  preferredCommunityId,
}: {
  adjustments: EloAdjustmentInput[];
  preferredCommunityId?: string | null;
}) {
  const byUserId = new Map<string, EloAdjustmentInput[]>();
  for (const adjustment of adjustments) {
    const displayUserId = adjustment.sourceUserId ?? adjustment.userId;
    const displayCurrent = byUserId.get(displayUserId) ?? [];
    displayCurrent.push(adjustment);
    byUserId.set(displayUserId, displayCurrent);
  }

  return Array.from(byUserId.entries()).map(([userId, userAdjustments]) => {
    const preferred = preferredCommunityId
      ? userAdjustments.find(
          (adjustment) => adjustment.communityId === preferredCommunityId
        )
      : null;
    const selected = preferred ?? userAdjustments[0];

    return {
      userId,
      delta: selected.delta,
      communityId: selected.communityId,
    };
  });
}

async function buildCommunityEloAdjustments({
  tx,
  match,
  playerIds,
  isGuestByUserId,
  winnerTeam,
  team1Points,
  team2Points,
  guestImpactMultiplier,
  userEloByUserId,
}: {
  tx: Prisma.TransactionClient;
  match: FinalizableMatch;
  playerIds: string[];
  isGuestByUserId: Map<string, boolean>;
  winnerTeam: 1 | 2;
  team1Points: number;
  team2Points: number;
  guestImpactMultiplier: number;
  userEloByUserId: Map<string, number>;
}) {
  const communityIds = match.session.communityId
    ? await getAcceptedSessionCommunityIds(tx, {
        id: match.sessionId,
        communityId: match.session.communityId,
      })
    : [];

  if (communityIds.length === 0) {
    return {
      teamDeltasByCommunityId: new Map<string, TeamEloDeltas>(),
      adjustments: [] as EloAdjustmentInput[],
      sourceEloByUserId: new Map<string, number>(),
    };
  }

  const linkedUserResolver = await getLinkedCommunityUserResolver(tx, {
    userIds: playerIds,
    communityIds,
  });
  const membershipUserIds = Array.from(
    new Set(
      playerIds.flatMap((userId) => linkedUserResolver.getLinkedUserIds(userId))
    )
  );
  const memberships = await tx.communityMember.findMany({
    where: {
      communityId: { in: communityIds },
      userId: { in: membershipUserIds },
    },
    select: {
      communityId: true,
      userId: true,
      elo: true,
    },
  });
  const membershipByCommunityAndUser = new Map<string, number>();
  for (const membership of memberships) {
    membershipByCommunityAndUser.set(
      `${membership.communityId}:${membership.userId}`,
      membership.elo
    );
  }

  const hostCommunityId = match.session.communityId;
  const sourceEloByUserId = new Map<string, number>();
  for (const userId of playerIds) {
    const playerCommunityIds = communityIds.filter((communityId) => {
      const linkedUserId = linkedUserResolver.getUserIdForCommunity(
        userId,
        communityId
      );
      return membershipByCommunityAndUser.has(`${communityId}:${linkedUserId}`);
    });
    const sourceCommunityId =
      (hostCommunityId && playerCommunityIds.includes(hostCommunityId)
        ? hostCommunityId
        : playerCommunityIds[0]) ?? null;
    const sourceCommunityUserId = sourceCommunityId
      ? linkedUserResolver.getUserIdForCommunity(userId, sourceCommunityId)
      : userId;
    const sourceElo = sourceCommunityId
      ? membershipByCommunityAndUser.get(
          `${sourceCommunityId}:${sourceCommunityUserId}`
        )
      : undefined;

    sourceEloByUserId.set(
      userId,
      sourceElo ??
        userEloByUserId.get(userId) ??
        getPlayerSnapshotElo(match, userId)
    );
  }

  const team1Ids = [match.team1User1Id, match.team1User2Id];
  const team2Ids = [match.team2User1Id, match.team2User2Id];
  const teamDeltasByCommunityId = new Map<string, TeamEloDeltas>();
  const adjustments: EloAdjustmentInput[] = [];

  for (const communityId of communityIds) {
    const getRating = (userId: string) => {
      const linkedUserId = linkedUserResolver.getUserIdForCommunity(
        userId,
        communityId
      );
      return (
        membershipByCommunityAndUser.get(`${communityId}:${linkedUserId}`) ??
        sourceEloByUserId.get(userId) ??
        userEloByUserId.get(userId) ??
        getPlayerSnapshotElo(match, userId)
      );
    };

    const team1AvgElo = (getRating(team1Ids[0]) + getRating(team1Ids[1])) / 2;
    const team2AvgElo = (getRating(team2Ids[0]) + getRating(team2Ids[1])) / 2;
    const deltas = calculateTeamEloDeltas({
      winnerTeam,
      team1AvgElo,
      team2AvgElo,
      team1Points,
      team2Points,
      guestImpactMultiplier,
    });
    teamDeltasByCommunityId.set(communityId, deltas);

    for (const userId of team1Ids) {
      const linkedUserId = linkedUserResolver.getUserIdForCommunity(
        userId,
        communityId
      );
      const beforeElo = membershipByCommunityAndUser.get(
        `${communityId}:${linkedUserId}`
      );
      if (beforeElo === undefined || isGuestByUserId.get(userId) === true) {
        continue;
      }

      adjustments.push({
        matchId: match.id,
        communityId,
        userId: linkedUserId,
        sourceUserId: userId,
        delta: deltas.team1Delta,
        beforeElo,
        afterElo: beforeElo + deltas.team1Delta,
      });
    }

    for (const userId of team2Ids) {
      const linkedUserId = linkedUserResolver.getUserIdForCommunity(
        userId,
        communityId
      );
      const beforeElo = membershipByCommunityAndUser.get(
        `${communityId}:${linkedUserId}`
      );
      if (beforeElo === undefined || isGuestByUserId.get(userId) === true) {
        continue;
      }

      adjustments.push({
        matchId: match.id,
        communityId,
        userId: linkedUserId,
        sourceUserId: userId,
        delta: deltas.team2Delta,
        beforeElo,
        afterElo: beforeElo + deltas.team2Delta,
      });
    }
  }

  return { teamDeltasByCommunityId, adjustments, sourceEloByUserId };
}

export async function finalizeMatchResultInTransaction(
  tx: Prisma.TransactionClient,
  {
    match,
    expectedStatus,
    finalTeam1Score,
    finalTeam2Score,
    scoreSubmittedByUserId,
    completedAt,
  }: FinalizeMatchResultArgs
) {
  if (!isValidMatchScore(finalTeam1Score, finalTeam2Score)) {
    throw new Error("INVALID_SCORE");
  }

  const team1Points = finalTeam1Score;
  const team2Points = finalTeam2Score;
  const winnerTeam = team1Points > team2Points ? 1 : 2;
  const finalizedAt = completedAt ?? new Date();
  const team1StandingPoints = getStandingPointsForTeam(winnerTeam, 1);
  const team2StandingPoints = getStandingPointsForTeam(winnerTeam, 2);
  const awardsStandingPoints =
    match.session.type !== SessionType.LADDER &&
    match.session.type !== SessionType.RACE;

  const playerIds = [
    match.team1User1Id,
    match.team1User2Id,
    match.team2User1Id,
    match.team2User2Id,
  ];
  const sessionPlayerRows = await tx.sessionPlayer.findMany({
    where: {
      sessionId: match.sessionId,
      userId: { in: playerIds },
    },
    select: {
      userId: true,
      isGuest: true,
    },
  });
  const isGuestByUserId = new Map<string, boolean>(
    sessionPlayerRows.map((player) => [player.userId, player.isGuest])
  );
  const guestCount = playerIds.filter(
    (userId) => isGuestByUserId.get(userId) === true
  ).length;
  const guestImpactMultiplier = getGuestImpactMultiplier(guestCount);
  const userEloByUserId = await getUserEloByUserIdInTransaction(tx, playerIds);
  const communityEloResult = await buildCommunityEloAdjustments({
    tx,
    match,
    playerIds,
    isGuestByUserId,
    winnerTeam,
    team1Points,
    team2Points,
    guestImpactMultiplier,
    userEloByUserId,
  });
  const hostCommunityDeltas = match.session.communityId
    ? communityEloResult.teamDeltasByCommunityId.get(match.session.communityId)
    : undefined;
  const firstCommunityDeltas = Array.from(
    communityEloResult.teamDeltasByCommunityId.values()
  )[0];
  const fallbackDeltas = calculateTeamEloDeltas({
    winnerTeam,
    team1AvgElo:
      ((communityEloResult.sourceEloByUserId.get(match.team1User1Id) ??
        userEloByUserId.get(match.team1User1Id) ??
        match.team1User1.elo) +
        (communityEloResult.sourceEloByUserId.get(match.team1User2Id) ??
          userEloByUserId.get(match.team1User2Id) ??
          match.team1User2.elo)) /
      2,
    team2AvgElo:
      ((communityEloResult.sourceEloByUserId.get(match.team2User1Id) ??
        userEloByUserId.get(match.team2User1Id) ??
        match.team2User1.elo) +
        (communityEloResult.sourceEloByUserId.get(match.team2User2Id) ??
          userEloByUserId.get(match.team2User2Id) ??
          match.team2User2.elo)) /
      2,
    team1Points,
    team2Points,
    guestImpactMultiplier,
  });
  const persistedTeam1EloChange =
    hostCommunityDeltas?.team1Delta ??
    firstCommunityDeltas?.team1Delta ??
    fallbackDeltas.team1Delta;
  const persistedTeam2EloChange =
    hostCommunityDeltas?.team2Delta ??
    firstCommunityDeltas?.team2Delta ??
    fallbackDeltas.team2Delta;

  const updatedMatchResult = await tx.match.updateMany({
    where: { id: match.id, status: expectedStatus },
    data: {
      team1Score: finalTeam1Score,
      team2Score: finalTeam2Score,
      winnerTeam,
      team1EloChange: persistedTeam1EloChange,
      team2EloChange: persistedTeam2EloChange,
      status: MatchStatus.COMPLETED,
      completedAt: finalizedAt,
      ...(scoreSubmittedByUserId !== undefined ? { scoreSubmittedByUserId } : {}),
    },
  });

  if (updatedMatchResult.count === 0) {
    throw new Error("ALREADY_PROCESSED");
  }

  const updatedMatch = await tx.match.findUnique({
    where: { id: match.id },
  });

  await tx.sessionPlayer.updateMany({
    where: {
      sessionId: match.sessionId,
      userId: { in: [match.team1User1Id, match.team1User2Id] },
    },
    data: {
      ...(awardsStandingPoints
        ? { sessionPoints: { increment: team1StandingPoints } }
        : {}),
      matchesPlayed: { increment: 1 },
      lastPlayedAt: finalizedAt,
      availableSince: finalizedAt,
    },
  });

  await tx.sessionPlayer.updateMany({
    where: {
      sessionId: match.sessionId,
      userId: { in: [match.team2User1Id, match.team2User2Id] },
    },
    data: {
      ...(awardsStandingPoints
        ? { sessionPoints: { increment: team2StandingPoints } }
        : {}),
      matchesPlayed: { increment: 1 },
      lastPlayedAt: finalizedAt,
      availableSince: finalizedAt,
    },
  });

  await tx.sessionPlayer.update({
    where: {
      sessionId_userId: {
        sessionId: match.sessionId,
        userId: match.team1User1Id,
      },
    },
    data: { lastPartnerId: match.team1User2Id },
  });
  await tx.sessionPlayer.update({
    where: {
      sessionId_userId: {
        sessionId: match.sessionId,
        userId: match.team1User2Id,
      },
    },
    data: { lastPartnerId: match.team1User1Id },
  });
  await tx.sessionPlayer.update({
    where: {
      sessionId_userId: {
        sessionId: match.sessionId,
        userId: match.team2User1Id,
      },
    },
    data: { lastPartnerId: match.team2User2Id },
  });
  await tx.sessionPlayer.update({
    where: {
      sessionId_userId: {
        sessionId: match.sessionId,
        userId: match.team2User2Id,
      },
    },
    data: { lastPartnerId: match.team2User1Id },
  });

  if (!match.session.isTest && communityEloResult.adjustments.length > 0) {
    for (const adjustment of communityEloResult.adjustments) {
      await tx.communityMember.update({
        where: {
          communityId_userId: {
            communityId: adjustment.communityId,
            userId: adjustment.userId,
          },
        },
        data: {
          elo: { increment: adjustment.delta },
        },
      });
    }

    await getMatchEloAdjustmentDelegate(tx)?.createMany?.({
      data: communityEloResult.adjustments.map(
        ({ sourceUserId: _sourceUserId, ...adjustment }) => adjustment
      ),
    });
  } else if (!match.session.isTest && match.session.communityId) {
    const team1Ids = [match.team1User1Id, match.team1User2Id];
    const team2Ids = [match.team2User1Id, match.team2User2Id];

    const team1CommunityMemberIds = team1Ids.filter(
      (userId) => isGuestByUserId.get(userId) !== true
    );
    const team2CommunityMemberIds = team2Ids.filter(
      (userId) => isGuestByUserId.get(userId) !== true
    );

    if (team1CommunityMemberIds.length > 0) {
      await tx.communityMember.updateMany({
        where: {
          communityId: match.session.communityId,
          userId: { in: team1CommunityMemberIds },
        },
        data: { elo: { increment: persistedTeam1EloChange } },
      });
    }
    if (team2CommunityMemberIds.length > 0) {
      await tx.communityMember.updateMany({
        where: {
          communityId: match.session.communityId,
          userId: { in: team2CommunityMemberIds },
        },
        data: { elo: { increment: persistedTeam2EloChange } },
      });
    }
  } else if (!match.session.isTest) {
    const team1CoreIds = [match.team1User1Id, match.team1User2Id].filter(
      (userId) => isGuestByUserId.get(userId) !== true
    );
    const team2CoreIds = [match.team2User1Id, match.team2User2Id].filter(
      (userId) => isGuestByUserId.get(userId) !== true
    );

    if (team1CoreIds.length > 0) {
      await tx.user.updateMany({
        where: { id: { in: team1CoreIds } },
        data: { elo: { increment: persistedTeam1EloChange } },
      });
    }
    if (team2CoreIds.length > 0) {
      await tx.user.updateMany({
        where: { id: { in: team2CoreIds } },
        data: { elo: { increment: persistedTeam2EloChange } },
      });
    }
  }

  await tx.court.update({
    where: { id: match.courtId },
    data: { currentMatchId: null },
  });

  if (!updatedMatch || match.session.isTest || communityEloResult.adjustments.length === 0) {
    return updatedMatch;
  }

  return {
    ...updatedMatch,
    playerEloChanges: getDisplayPlayerEloChanges({
      adjustments: communityEloResult.adjustments,
      preferredCommunityId: match.session.communityId,
    }),
    eloAdjustments: communityEloResult.adjustments,
  };
}

function getMatchPartnerIdForUser(
  match: {
    team1User1Id: string;
    team1User2Id: string;
    team2User1Id: string;
    team2User2Id: string;
  },
  userId: string
) {
  if (match.team1User1Id === userId) return match.team1User2Id;
  if (match.team1User2Id === userId) return match.team1User1Id;
  if (match.team2User1Id === userId) return match.team2User2Id;
  if (match.team2User2Id === userId) return match.team2User1Id;
  return null;
}

async function restoreSessionPlayerRotationState(
  tx: Prisma.TransactionClient,
  {
    sessionId,
    userIds,
    availableSince,
  }: {
    sessionId: string;
    userIds: string[];
    availableSince: Date;
  }
) {
  for (const userId of userIds) {
    const previousCompletedMatch = await tx.match.findFirst({
      where: {
        sessionId,
        status: MatchStatus.COMPLETED,
        OR: [
          { team1User1Id: userId },
          { team1User2Id: userId },
          { team2User1Id: userId },
          { team2User2Id: userId },
        ],
      },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      select: {
        completedAt: true,
        createdAt: true,
        team1User1Id: true,
        team1User2Id: true,
        team2User1Id: true,
        team2User2Id: true,
      },
    });

    await tx.sessionPlayer.updateMany({
      where: { sessionId, userId },
      data: {
        availableSince,
        lastPlayedAt: previousCompletedMatch?.completedAt ?? null,
        lastPartnerId: previousCompletedMatch
          ? getMatchPartnerIdForUser(previousCompletedMatch, userId)
          : null,
      },
    });
  }
}

export async function undoCompletedMatchResultInTransaction(
  tx: Prisma.TransactionClient,
  { matchId, undoneAt }: UndoCompletedMatchResultArgs
) {
  const undoneAtDate = undoneAt ?? new Date();
  const match = await tx.match.findUnique({
    where: { id: matchId },
    include: {
      session: {
        select: {
          communityId: true,
          isTest: true,
          status: true,
          type: true,
        },
      },
    },
  });

  if (!match) {
    throw new UndoCompletedMatchError("MATCH_NOT_FOUND", "Match not found");
  }

  if (match.status !== MatchStatus.COMPLETED) {
    throw new UndoCompletedMatchError(
      "MATCH_NOT_COMPLETED",
      "Only completed matches can be undone."
    );
  }

  if (match.session.status !== SessionStatus.ACTIVE) {
    throw new UndoCompletedMatchError(
      "SESSION_NOT_ACTIVE",
      "Only active sessions can undo completed matches."
    );
  }

  const latestCompletedMatch = await tx.match.findFirst({
    where: {
      sessionId: match.sessionId,
      status: MatchStatus.COMPLETED,
    },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });

  if (latestCompletedMatch?.id !== match.id) {
    throw new UndoCompletedMatchError(
      "NOT_LATEST_COMPLETED_MATCH",
      "Only the latest completed match can be undone."
    );
  }

  const team1Ids = [match.team1User1Id, match.team1User2Id];
  const team2Ids = [match.team2User1Id, match.team2User2Id];
  const affectedUserIds = [...team1Ids, ...team2Ids];
  const sessionPlayerRows = await tx.sessionPlayer.findMany({
    where: {
      sessionId: match.sessionId,
      userId: { in: affectedUserIds },
    },
    select: {
      userId: true,
      isGuest: true,
    },
  });
  const isGuestByUserId = new Map(
    sessionPlayerRows.map((player) => [player.userId, player.isGuest])
  );

  const ledgerAdjustments =
    (await getMatchEloAdjustmentDelegate(tx)?.findMany?.({
      where: { matchId: match.id },
      select: {
        communityId: true,
        userId: true,
        delta: true,
      },
    })) ?? [];
  const team1ReverseEloDelta = -(match.team1EloChange ?? 0);
  const team2ReverseEloDelta = -(match.team2EloChange ?? 0);

  if (!match.session.isTest && ledgerAdjustments.length > 0) {
    for (const adjustment of ledgerAdjustments) {
      if (adjustment.delta === 0) continue;

      await tx.communityMember.updateMany({
        where: {
          communityId: adjustment.communityId,
          userId: adjustment.userId,
        },
        data: {
          elo: { increment: -adjustment.delta },
        },
      });
    }
  } else if (!match.session.isTest) {
    const team1CoreIds = team1Ids.filter(
      (userId) => isGuestByUserId.get(userId) !== true
    );
    const team2CoreIds = team2Ids.filter(
      (userId) => isGuestByUserId.get(userId) !== true
    );

    if (match.session.communityId) {
      if (team1CoreIds.length > 0 && team1ReverseEloDelta !== 0) {
        await tx.communityMember.updateMany({
          where: {
            communityId: match.session.communityId,
            userId: { in: team1CoreIds },
          },
          data: { elo: { increment: team1ReverseEloDelta } },
        });
      }
      if (team2CoreIds.length > 0 && team2ReverseEloDelta !== 0) {
        await tx.communityMember.updateMany({
          where: {
            communityId: match.session.communityId,
            userId: { in: team2CoreIds },
          },
          data: { elo: { increment: team2ReverseEloDelta } },
        });
      }
    } else {
      if (team1CoreIds.length > 0 && team1ReverseEloDelta !== 0) {
        await tx.user.updateMany({
          where: { id: { in: team1CoreIds } },
          data: { elo: { increment: team1ReverseEloDelta } },
        });
      }
      if (team2CoreIds.length > 0 && team2ReverseEloDelta !== 0) {
        await tx.user.updateMany({
          where: { id: { in: team2CoreIds } },
          data: { elo: { increment: team2ReverseEloDelta } },
        });
      }
    }
  }

  const winnerTeam = match.winnerTeam === 1 || match.winnerTeam === 2
    ? match.winnerTeam
    : null;
  const awardsStandingPoints =
    winnerTeam !== null &&
    match.session.type !== SessionType.LADDER &&
    match.session.type !== SessionType.RACE;
  const team1StandingPoints = awardsStandingPoints
    ? getStandingPointsForTeam(winnerTeam, 1)
    : 0;
  const team2StandingPoints = awardsStandingPoints
    ? getStandingPointsForTeam(winnerTeam, 2)
    : 0;

  await tx.sessionPlayer.updateMany({
    where: {
      sessionId: match.sessionId,
      userId: { in: team1Ids },
    },
    data: {
      ...(team1StandingPoints > 0
        ? { sessionPoints: { decrement: team1StandingPoints } }
        : {}),
      matchesPlayed: { decrement: 1 },
    },
  });
  await tx.sessionPlayer.updateMany({
    where: {
      sessionId: match.sessionId,
      userId: { in: team2Ids },
    },
    data: {
      ...(team2StandingPoints > 0
        ? { sessionPoints: { decrement: team2StandingPoints } }
        : {}),
      matchesPlayed: { decrement: 1 },
    },
  });

  const deleteResult = await tx.match.deleteMany({
    where: {
      id: match.id,
      status: MatchStatus.COMPLETED,
    },
  });

  if (deleteResult.count === 0) {
    throw new UndoCompletedMatchError(
      "MATCH_NOT_COMPLETED",
      "Match was already updated by someone else."
    );
  }

  await restoreSessionPlayerRotationState(tx, {
    sessionId: match.sessionId,
    userIds: affectedUserIds,
    availableSince: undoneAtDate,
  });

  return {
    ok: true,
    undoneMatchId: match.id,
    affectedUserIds,
  };
}

export async function finalizeMatchResult(args: FinalizeMatchResultArgs) {
  return prisma.$transaction((tx) => finalizeMatchResultInTransaction(tx, args));
}

export async function undoCompletedMatchResult(
  args: UndoCompletedMatchResultArgs
) {
  return prisma.$transaction((tx) =>
    undoCompletedMatchResultInTransaction(tx, args)
  );
}
