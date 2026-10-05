import type { Prisma, PrismaClient } from "@prisma/client";
import { ClubRole, OfflineIdentityLinkStatus } from "@/types/enums";
import { isClubAdminRole } from "@/lib/clubRoles";
import { withLegacyClubAliases } from "@/lib/clubContractAliases";

type DbClient = Prisma.TransactionClient | PrismaClient;

const MATCH_USER_FIELDS = [
  "team1Player1Id",
  "team1Player2Id",
  "team2Player1Id",
  "team2Player2Id",
] as const;

export class OfflineIdentityError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "OfflineIdentityError";
    this.statusCode = statusCode;
  }
}

export function isOfflineIdentityPlaceholder(player: {
  ownerUserId: string | null;
}) {
  return player.ownerUserId === null;
}

export async function getClubAdminMembership(
  tx: DbClient,
  clubId: string,
  accountUserId: string,
  isGlobalAdmin = false
) {
  if (isGlobalAdmin) {
    return { role: ClubRole.ADMIN };
  }

  const [club, access] = await Promise.all([
    tx.club.findUnique({
      where: { id: clubId },
      select: { createdById: true },
    }),
    tx.clubAccess.findUnique({
      where: { clubId_userId: { clubId, userId: accountUserId } },
      select: { role: true, status: true },
    }),
  ]);

  if (club?.createdById === accountUserId) {
    return access?.status === "ACTIVE" && isClubAdminRole(access.role) ? { role: ClubRole.OWNER } : null;
  }

  return access?.status === "ACTIVE" && isClubAdminRole(access.role) ? access : null;
}

export async function isClubAdmin(
  tx: DbClient,
  clubId: string,
  accountUserId: string,
  isGlobalAdmin = false
) {
  const membership = await getClubAdminMembership(
    tx,
    clubId,
    accountUserId,
    isGlobalAdmin
  );

  return membership?.role === ClubRole.OWNER || membership?.role === ClubRole.ADMIN;
}

async function assertPlaceholderMembership(
  tx: DbClient,
  {
    clubId,
    playerId,
    label,
  }: {
    clubId: string;
    playerId: string;
    label: string;
  }
) {
  const membership = await tx.clubMember.findUnique({
    where: {
      clubId_playerId: {
        clubId,
        playerId,
      },
    },
    include: {
      player: {
        select: {
          id: true,
          name: true,
          ownerUserId: true,
        },
      },
      club: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!membership) {
    throw new OfflineIdentityError(`${label} placeholder is not in that club`, 404);
  }

  if (!isOfflineIdentityPlaceholder(membership.player)) {
    throw new OfflineIdentityError(
      `${label} must be an unclaimed placeholder without email`,
      400
    );
  }

  return membership;
}

async function getExistingIdentityIdsForUsers(tx: DbClient, userIds: string[]) {
  const rows = await tx.offlineIdentityMember.findMany({
    where: { playerId: { in: userIds } },
    select: {
      playerId: true,
      offlineIdentityId: true,
    },
  });

  return new Map(rows.map((row) => [row.playerId, row.offlineIdentityId]));
}

async function assertNoSameSessionOrMatchConflict(
  tx: DbClient,
  sourcePlayerId: string,
  targetPlayerId: string
) {
  const sharedSession = await tx.session.findFirst({
    where: {
      AND: [
        { players: { some: { playerId: sourcePlayerId } } },
        { players: { some: { playerId: targetPlayerId } } },
      ],
    },
    select: { name: true },
  });

  if (sharedSession) {
    throw new OfflineIdentityError(
      `These placeholders already appeared together in ${sharedSession.name}. Manual merge required.`,
      409
    );
  }

  const sharedMatch = await tx.match.findFirst({
    where: {
      AND: [
        {
          OR: MATCH_USER_FIELDS.map((field) => ({
            [field]: sourcePlayerId,
          })),
        },
        {
          OR: MATCH_USER_FIELDS.map((field) => ({
            [field]: targetPlayerId,
          })),
        },
      ],
    },
    select: { id: true },
  });

  if (sharedMatch) {
    throw new OfflineIdentityError(
      "These placeholders already appeared together in a match. Manual merge required.",
      409
    );
  }
}

async function resolveIdentityForAcceptedLink(
  tx: Prisma.TransactionClient,
  {
    sourceClubId,
    sourcePlayerId,
    targetClubId,
    targetPlayerId,
    requestedById,
  }: {
    sourceClubId: string;
    sourcePlayerId: string;
    targetClubId: string;
    targetPlayerId: string;
    requestedById: string;
  }
) {
  const identityIds = await getExistingIdentityIdsForUsers(tx, [
    sourcePlayerId,
    targetPlayerId,
  ]);
  const sourceIdentityId = identityIds.get(sourcePlayerId) ?? null;
  const targetIdentityId = identityIds.get(targetPlayerId) ?? null;

  if (sourceIdentityId && targetIdentityId && sourceIdentityId !== targetIdentityId) {
    throw new OfflineIdentityError(
      "Both placeholders are already linked to different offline identities",
      409
    );
  }

  const offlineIdentityId =
    sourceIdentityId ??
    targetIdentityId ??
    (
      await tx.offlineIdentity.create({
        data: {
          createdById: requestedById,
        },
        select: { id: true },
      })
    ).id;

  const existingMembers = await tx.offlineIdentityMember.findMany({
    where: { offlineIdentityId },
    select: {
      clubId: true,
      playerId: true,
    },
  });
  for (const member of existingMembers) {
    if (member.playerId !== sourcePlayerId) {
      await assertNoSameSessionOrMatchConflict(tx, member.playerId, sourcePlayerId);
    }
    if (member.playerId !== targetPlayerId) {
      await assertNoSameSessionOrMatchConflict(tx, member.playerId, targetPlayerId);
    }
  }
  const memberByClubId = new Map(
    existingMembers.map((member) => [member.clubId, member.playerId])
  );

  const existingSourceUserId = memberByClubId.get(sourceClubId);
  if (existingSourceUserId && existingSourceUserId !== sourcePlayerId) {
    throw new OfflineIdentityError(
      "This offline identity already has another placeholder in the source club",
      409
    );
  }

  const existingTargetUserId = memberByClubId.get(targetClubId);
  if (existingTargetUserId && existingTargetUserId !== targetPlayerId) {
    throw new OfflineIdentityError(
      "This offline identity already has another placeholder in the target club",
      409
    );
  }

  await tx.offlineIdentityMember.upsert({
    where: {
      clubId_playerId: {
        clubId: sourceClubId,
        playerId: sourcePlayerId,
      },
    },
    update: {},
    create: {
      offlineIdentityId,
      clubId: sourceClubId,
      playerId: sourcePlayerId,
      addedById: requestedById,
    },
  });

  await tx.offlineIdentityMember.upsert({
    where: {
      clubId_playerId: {
        clubId: targetClubId,
        playerId: targetPlayerId,
      },
    },
    update: {},
    create: {
      offlineIdentityId,
      clubId: targetClubId,
      playerId: targetPlayerId,
      addedById: requestedById,
    },
  });

  return offlineIdentityId;
}

export async function createOfflineIdentityLinkRequest(
  tx: Prisma.TransactionClient,
  {
    sourceClubId,
    sourcePlayerId,
    targetClubId,
    targetPlayerId,
    requestedById,
    autoApprove,
  }: {
    sourceClubId: string;
    sourcePlayerId: string;
    targetClubId: string;
    targetPlayerId: string;
    requestedById: string;
    autoApprove: boolean;
  }
) {
  if (sourceClubId === targetClubId) {
    throw new OfflineIdentityError("Choose placeholders from two different clubs", 400);
  }

  if (sourcePlayerId === targetPlayerId) {
    throw new OfflineIdentityError("These placeholders are already the same account", 400);
  }

  await assertPlaceholderMembership(tx, {
    clubId: sourceClubId,
    playerId: sourcePlayerId,
    label: "Source",
  });
  await assertPlaceholderMembership(tx, {
    clubId: targetClubId,
    playerId: targetPlayerId,
    label: "Target",
  });
  await assertNoSameSessionOrMatchConflict(tx, sourcePlayerId, targetPlayerId);

  const existingRequest = await tx.offlineIdentityLinkRequest.findFirst({
    where: {
      OR: [
        {
          sourceClubId,
          sourcePlayerId,
          targetClubId,
          targetPlayerId,
        },
        {
          sourceClubId: targetClubId,
          sourcePlayerId: targetPlayerId,
          targetClubId: sourceClubId,
          targetPlayerId: sourcePlayerId,
        },
      ],
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (existingRequest?.status === OfflineIdentityLinkStatus.PENDING) {
    throw new OfflineIdentityError("This link request is already pending", 409);
  }

  if (existingRequest?.status === OfflineIdentityLinkStatus.ACCEPTED) {
    throw new OfflineIdentityError("These placeholders are already linked", 409);
  }

  const identityIds = await getExistingIdentityIdsForUsers(tx, [
    sourcePlayerId,
    targetPlayerId,
  ]);
  const initialIdentityId =
    identityIds.get(sourcePlayerId) ?? identityIds.get(targetPlayerId) ?? null;
  const reviewedAt = autoApprove ? new Date() : null;
  const status = autoApprove
    ? OfflineIdentityLinkStatus.ACCEPTED
    : OfflineIdentityLinkStatus.PENDING;
  const request = await tx.offlineIdentityLinkRequest.create({
    data: {
      offlineIdentityId: initialIdentityId,
      sourceClubId,
      sourcePlayerId,
      targetClubId,
      targetPlayerId,
      status,
      requestedById,
      reviewedById: autoApprove ? requestedById : null,
      reviewedAt,
    },
    include: offlineIdentityLinkRequestInclude,
  });

  if (!autoApprove) {
    return request;
  }

  const offlineIdentityId = await resolveIdentityForAcceptedLink(tx, {
    sourceClubId,
    sourcePlayerId,
    targetClubId,
    targetPlayerId,
    requestedById,
  });

  return tx.offlineIdentityLinkRequest.update({
    where: { id: request.id },
    data: { offlineIdentityId },
    include: offlineIdentityLinkRequestInclude,
  });
}

export async function reviewOfflineIdentityLinkRequest(
  tx: Prisma.TransactionClient,
  {
    requestId,
    targetClubId,
    reviewerUserId,
    status,
  }: {
    requestId: string;
    targetClubId: string;
    reviewerUserId: string;
    status: OfflineIdentityLinkStatus.ACCEPTED | OfflineIdentityLinkStatus.REJECTED;
  }
) {
  const request = await tx.offlineIdentityLinkRequest.findUnique({
    where: { id: requestId },
    include: offlineIdentityLinkRequestInclude,
  });

  if (!request || request.targetClubId !== targetClubId) {
    throw new OfflineIdentityError("Offline identity link request not found", 404);
  }

  if (request.status !== OfflineIdentityLinkStatus.PENDING) {
    throw new OfflineIdentityError("Offline identity link request is no longer pending", 409);
  }

  if (request.requestedById === reviewerUserId) {
    throw new OfflineIdentityError("Another admin must approve this link request", 403);
  }

  const reviewedAt = new Date();
  if (status === OfflineIdentityLinkStatus.REJECTED) {
    return tx.offlineIdentityLinkRequest.update({
      where: { id: request.id },
      data: {
        status,
        reviewedById: reviewerUserId,
        reviewedAt,
      },
      include: offlineIdentityLinkRequestInclude,
    });
  }

  await assertPlaceholderMembership(tx, {
    clubId: request.sourceClubId,
    playerId: request.sourcePlayerId,
    label: "Source",
  });
  await assertPlaceholderMembership(tx, {
    clubId: request.targetClubId,
    playerId: request.targetPlayerId,
    label: "Target",
  });
  await assertNoSameSessionOrMatchConflict(
    tx,
    request.sourcePlayerId,
    request.targetPlayerId
  );

  const offlineIdentityId = await resolveIdentityForAcceptedLink(tx, {
    sourceClubId: request.sourceClubId,
    sourcePlayerId: request.sourcePlayerId,
    targetClubId: request.targetClubId,
    targetPlayerId: request.targetPlayerId,
    requestedById: request.requestedById ?? reviewerUserId,
  });

  return tx.offlineIdentityLinkRequest.update({
    where: { id: request.id },
    data: {
      offlineIdentityId,
      status,
      reviewedById: reviewerUserId,
      reviewedAt,
    },
    include: offlineIdentityLinkRequestInclude,
  });
}

export const offlineIdentityLinkRequestInclude = {
  sourceClub: { select: { id: true, name: true } },
  targetClub: { select: { id: true, name: true } },
  sourcePlayer: { select: { id: true, name: true, ownerUser: { select: { email: true } } } },
  targetPlayer: { select: { id: true, name: true, ownerUser: { select: { email: true } } } },
  requestedBy: { select: { id: true, name: true, email: true } },
  reviewedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.OfflineIdentityLinkRequestInclude;

export function toOfflineIdentityLinkResponse(request: {
  id: string;
  offlineIdentityId: string | null;
  sourceClubId: string;
  sourcePlayerId: string;
  targetClubId: string;
  targetPlayerId: string;
  status: string;
  requestedById: string | null;
  reviewedById: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  sourceClub: { id: string; name: string };
  targetClub: { id: string; name: string };
  sourcePlayer: { id: string; name: string; ownerUser: { email: string } | null };
  targetPlayer: { id: string; name: string; ownerUser: { email: string } | null };
  requestedBy: { id: string; name: string; email: string | null } | null;
  reviewedBy: { id: string; name: string; email: string | null } | null;
}) {
  return withLegacyClubAliases({
    id: request.id,
    offlineIdentityId: request.offlineIdentityId,
    sourceClubId: request.sourceClubId,
    sourceClubName: request.sourceClub.name,
    sourcePlayerId: request.sourcePlayerId,
    sourceUserId: request.sourcePlayerId,
    sourcePlayerName: request.sourcePlayer.name,
    sourceUserName: request.sourcePlayer.name,
    sourceUserEmail: request.sourcePlayer.ownerUser?.email ?? null,
    targetClubId: request.targetClubId,
    targetClubName: request.targetClub.name,
    targetPlayerId: request.targetPlayerId,
    targetUserId: request.targetPlayerId,
    targetPlayerName: request.targetPlayer.name,
    targetUserName: request.targetPlayer.name,
    targetUserEmail: request.targetPlayer.ownerUser?.email ?? null,
    status: request.status,
    requestedById: request.requestedById,
    requestedByName: request.requestedBy?.name ?? null,
    reviewedById: request.reviewedById,
    reviewedByName: request.reviewedBy?.name ?? null,
    reviewedAt: request.reviewedAt,
    createdAt: request.createdAt,
  });
}

export interface LinkedClubUserResolver {
  getUserIdForClub: (sourcePlayerId: string, clubId: string) => string;
  getLinkedUserIds: (sourcePlayerId: string) => string[];
  getOfflineIdentityId: (sourcePlayerId: string) => string | null;
}

export async function getLinkedClubUserResolver(
  tx: DbClient,
  {
    userIds,
    clubIds,
  }: {
    userIds: string[];
    clubIds: string[];
  }
): Promise<LinkedClubUserResolver> {
  const uniqueUserIds = Array.from(new Set(userIds));
  const uniqueClubIds = Array.from(new Set(clubIds));
  if (uniqueUserIds.length === 0 || uniqueClubIds.length === 0) {
    return {
      getUserIdForClub: (sourcePlayerId) => sourcePlayerId,
      getLinkedUserIds: (sourcePlayerId) => [sourcePlayerId],
      getOfflineIdentityId: () => null,
    };
  }

  const seedMembers = await tx.offlineIdentityMember.findMany({
    where: { playerId: { in: uniqueUserIds } },
    select: {
      playerId: true,
      offlineIdentityId: true,
    },
  });
  const identityIdByUserId = new Map(
    seedMembers.map((member) => [member.playerId, member.offlineIdentityId])
  );
  const identityIds = Array.from(new Set(seedMembers.map((member) => member.offlineIdentityId)));
  if (identityIds.length === 0) {
    return {
      getUserIdForClub: (sourcePlayerId) => sourcePlayerId,
      getLinkedUserIds: (sourcePlayerId) => [sourcePlayerId],
      getOfflineIdentityId: () => null,
    };
  }

  const allMembers = await tx.offlineIdentityMember.findMany({
    where: {
      offlineIdentityId: { in: identityIds },
      clubId: { in: uniqueClubIds },
    },
    select: {
      offlineIdentityId: true,
      clubId: true,
      playerId: true,
    },
  });
  const userIdByIdentityAndClub = new Map<string, string>();
  const linkedUserIdsByIdentity = new Map<string, string[]>();

  for (const member of allMembers) {
    userIdByIdentityAndClub.set(
      `${member.offlineIdentityId}:${member.clubId}`,
      member.playerId
    );
    const current = linkedUserIdsByIdentity.get(member.offlineIdentityId) ?? [];
    current.push(member.playerId);
    linkedUserIdsByIdentity.set(member.offlineIdentityId, current);
  }

  return {
    getUserIdForClub: (sourcePlayerId, clubId) => {
      const identityId = identityIdByUserId.get(sourcePlayerId);
      if (!identityId) return sourcePlayerId;
      return (
        userIdByIdentityAndClub.get(`${identityId}:${clubId}`) ??
        sourcePlayerId
      );
    },
    getLinkedUserIds: (sourcePlayerId) => {
      const identityId = identityIdByUserId.get(sourcePlayerId);
      if (!identityId) return [sourcePlayerId];
      return Array.from(
        new Set([sourcePlayerId, ...(linkedUserIdsByIdentity.get(identityId) ?? [])])
      );
    },
    getOfflineIdentityId: (sourcePlayerId) => identityIdByUserId.get(sourcePlayerId) ?? null,
  };
}

export async function getClubStatUserResolver(
  tx: DbClient,
  {
    clubId,
    memberUserIds,
  }: {
    clubId: string;
    memberUserIds: string[];
  }
) {
  const localMembers = await tx.offlineIdentityMember.findMany({
    where: {
      clubId,
      playerId: { in: memberUserIds },
    },
    select: {
      offlineIdentityId: true,
      playerId: true,
    },
  });
  const localUserIdByIdentityId = new Map(
    localMembers.map((member) => [member.offlineIdentityId, member.playerId])
  );
  const identityIds = Array.from(localUserIdByIdentityId.keys());
  const linkedMembers =
    identityIds.length > 0
      ? await tx.offlineIdentityMember.findMany({
          where: { offlineIdentityId: { in: identityIds } },
          select: {
            offlineIdentityId: true,
            playerId: true,
          },
        })
      : [];
  const identityIdByUserId = new Map(
    linkedMembers.map((member) => [member.playerId, member.offlineIdentityId])
  );
  const directMemberUserIds = new Set(memberUserIds);

  return (userId: string) => {
    if (directMemberUserIds.has(userId)) return userId;
    const identityId = identityIdByUserId.get(userId);
    return identityId ? (localUserIdByIdentityId.get(identityId) ?? userId) : userId;
  };
}

export async function getOfflineIdentityInfoByUserId(
  tx: DbClient,
  userIds: string[]
) {
  const rows = await tx.offlineIdentityMember.findMany({
    where: { playerId: { in: Array.from(new Set(userIds)) } },
    select: {
      playerId: true,
      offlineIdentityId: true,
      offlineIdentity: {
        select: {
          members: {
            select: {
              clubId: true,
              playerId: true,
              club: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return new Map(
    rows.map((row) => [
      row.playerId,
      {
        offlineIdentityId: row.offlineIdentityId,
        linkedClubBadges: row.offlineIdentity.members.map((member) => ({
          id: member.club.id,
          name: member.club.name,
          userId: member.playerId,
        })),
      },
    ])
  );
}
