import type { Prisma, PrismaClient } from "@prisma/client";
import { OfflineIdentityLinkStatus } from "@/types/enums";

type DbClient = Prisma.TransactionClient | PrismaClient;

const MATCH_USER_FIELDS = [
  "team1User1Id",
  "team1User2Id",
  "team2User1Id",
  "team2User2Id",
] as const;

export class OfflineIdentityError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "OfflineIdentityError";
    this.statusCode = statusCode;
  }
}

export function isOfflineIdentityPlaceholder(user: {
  isClaimed: boolean;
  email: string | null;
}) {
  return !user.isClaimed && user.email === null;
}

export async function getCommunityAdminMembership(
  tx: DbClient,
  communityId: string,
  userId: string,
  isGlobalAdmin = false
) {
  if (isGlobalAdmin) {
    return { role: "ADMIN" };
  }

  return tx.communityMember.findUnique({
    where: {
      communityId_userId: {
        communityId,
        userId,
      },
    },
    select: { role: true },
  });
}

export async function isCommunityAdmin(
  tx: DbClient,
  communityId: string,
  userId: string,
  isGlobalAdmin = false
) {
  const membership = await getCommunityAdminMembership(
    tx,
    communityId,
    userId,
    isGlobalAdmin
  );

  return membership?.role === "ADMIN";
}

async function assertPlaceholderMembership(
  tx: DbClient,
  {
    communityId,
    userId,
    label,
  }: {
    communityId: string;
    userId: string;
    label: string;
  }
) {
  const membership = await tx.communityMember.findUnique({
    where: {
      communityId_userId: {
        communityId,
        userId,
      },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          isClaimed: true,
        },
      },
      community: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!membership) {
    throw new OfflineIdentityError(`${label} placeholder is not in that community`, 404);
  }

  if (!isOfflineIdentityPlaceholder(membership.user)) {
    throw new OfflineIdentityError(
      `${label} must be an unclaimed placeholder without email`,
      400
    );
  }

  return membership;
}

async function getExistingIdentityIdsForUsers(tx: DbClient, userIds: string[]) {
  const rows = await tx.offlineIdentityMember.findMany({
    where: { userId: { in: userIds } },
    select: {
      userId: true,
      offlineIdentityId: true,
    },
  });

  return new Map(rows.map((row) => [row.userId, row.offlineIdentityId]));
}

async function assertNoSameSessionOrMatchConflict(
  tx: DbClient,
  sourceUserId: string,
  targetUserId: string
) {
  const sharedSession = await tx.session.findFirst({
    where: {
      AND: [
        { players: { some: { userId: sourceUserId } } },
        { players: { some: { userId: targetUserId } } },
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
            [field]: sourceUserId,
          })),
        },
        {
          OR: MATCH_USER_FIELDS.map((field) => ({
            [field]: targetUserId,
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
    sourceCommunityId,
    sourceUserId,
    targetCommunityId,
    targetUserId,
    requestedById,
  }: {
    sourceCommunityId: string;
    sourceUserId: string;
    targetCommunityId: string;
    targetUserId: string;
    requestedById: string;
  }
) {
  const identityIds = await getExistingIdentityIdsForUsers(tx, [
    sourceUserId,
    targetUserId,
  ]);
  const sourceIdentityId = identityIds.get(sourceUserId) ?? null;
  const targetIdentityId = identityIds.get(targetUserId) ?? null;

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
      communityId: true,
      userId: true,
    },
  });
  for (const member of existingMembers) {
    if (member.userId !== sourceUserId) {
      await assertNoSameSessionOrMatchConflict(tx, member.userId, sourceUserId);
    }
    if (member.userId !== targetUserId) {
      await assertNoSameSessionOrMatchConflict(tx, member.userId, targetUserId);
    }
  }
  const memberByCommunityId = new Map(
    existingMembers.map((member) => [member.communityId, member.userId])
  );

  const existingSourceUserId = memberByCommunityId.get(sourceCommunityId);
  if (existingSourceUserId && existingSourceUserId !== sourceUserId) {
    throw new OfflineIdentityError(
      "This offline identity already has another placeholder in the source community",
      409
    );
  }

  const existingTargetUserId = memberByCommunityId.get(targetCommunityId);
  if (existingTargetUserId && existingTargetUserId !== targetUserId) {
    throw new OfflineIdentityError(
      "This offline identity already has another placeholder in the target community",
      409
    );
  }

  await tx.offlineIdentityMember.upsert({
    where: {
      communityId_userId: {
        communityId: sourceCommunityId,
        userId: sourceUserId,
      },
    },
    update: {},
    create: {
      offlineIdentityId,
      communityId: sourceCommunityId,
      userId: sourceUserId,
      addedById: requestedById,
    },
  });

  await tx.offlineIdentityMember.upsert({
    where: {
      communityId_userId: {
        communityId: targetCommunityId,
        userId: targetUserId,
      },
    },
    update: {},
    create: {
      offlineIdentityId,
      communityId: targetCommunityId,
      userId: targetUserId,
      addedById: requestedById,
    },
  });

  return offlineIdentityId;
}

export async function createOfflineIdentityLinkRequest(
  tx: Prisma.TransactionClient,
  {
    sourceCommunityId,
    sourceUserId,
    targetCommunityId,
    targetUserId,
    requestedById,
    autoApprove,
  }: {
    sourceCommunityId: string;
    sourceUserId: string;
    targetCommunityId: string;
    targetUserId: string;
    requestedById: string;
    autoApprove: boolean;
  }
) {
  if (sourceCommunityId === targetCommunityId) {
    throw new OfflineIdentityError("Choose placeholders from two different communities", 400);
  }

  if (sourceUserId === targetUserId) {
    throw new OfflineIdentityError("These placeholders are already the same account", 400);
  }

  await assertPlaceholderMembership(tx, {
    communityId: sourceCommunityId,
    userId: sourceUserId,
    label: "Source",
  });
  await assertPlaceholderMembership(tx, {
    communityId: targetCommunityId,
    userId: targetUserId,
    label: "Target",
  });
  await assertNoSameSessionOrMatchConflict(tx, sourceUserId, targetUserId);

  const existingRequest = await tx.offlineIdentityLinkRequest.findFirst({
    where: {
      OR: [
        {
          sourceCommunityId,
          sourceUserId,
          targetCommunityId,
          targetUserId,
        },
        {
          sourceCommunityId: targetCommunityId,
          sourceUserId: targetUserId,
          targetCommunityId: sourceCommunityId,
          targetUserId: sourceUserId,
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
    sourceUserId,
    targetUserId,
  ]);
  const initialIdentityId =
    identityIds.get(sourceUserId) ?? identityIds.get(targetUserId) ?? null;
  const reviewedAt = autoApprove ? new Date() : null;
  const status = autoApprove
    ? OfflineIdentityLinkStatus.ACCEPTED
    : OfflineIdentityLinkStatus.PENDING;
  const request = await tx.offlineIdentityLinkRequest.create({
    data: {
      offlineIdentityId: initialIdentityId,
      sourceCommunityId,
      sourceUserId,
      targetCommunityId,
      targetUserId,
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
    sourceCommunityId,
    sourceUserId,
    targetCommunityId,
    targetUserId,
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
    targetCommunityId,
    reviewerUserId,
    status,
  }: {
    requestId: string;
    targetCommunityId: string;
    reviewerUserId: string;
    status: OfflineIdentityLinkStatus.ACCEPTED | OfflineIdentityLinkStatus.REJECTED;
  }
) {
  const request = await tx.offlineIdentityLinkRequest.findUnique({
    where: { id: requestId },
    include: offlineIdentityLinkRequestInclude,
  });

  if (!request || request.targetCommunityId !== targetCommunityId) {
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
    communityId: request.sourceCommunityId,
    userId: request.sourceUserId,
    label: "Source",
  });
  await assertPlaceholderMembership(tx, {
    communityId: request.targetCommunityId,
    userId: request.targetUserId,
    label: "Target",
  });
  await assertNoSameSessionOrMatchConflict(
    tx,
    request.sourceUserId,
    request.targetUserId
  );

  const offlineIdentityId = await resolveIdentityForAcceptedLink(tx, {
    sourceCommunityId: request.sourceCommunityId,
    sourceUserId: request.sourceUserId,
    targetCommunityId: request.targetCommunityId,
    targetUserId: request.targetUserId,
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
  sourceCommunity: { select: { id: true, name: true } },
  targetCommunity: { select: { id: true, name: true } },
  sourceUser: { select: { id: true, name: true, email: true } },
  targetUser: { select: { id: true, name: true, email: true } },
  requestedBy: { select: { id: true, name: true, email: true } },
  reviewedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.OfflineIdentityLinkRequestInclude;

export function toOfflineIdentityLinkResponse(request: {
  id: string;
  offlineIdentityId: string | null;
  sourceCommunityId: string;
  sourceUserId: string;
  targetCommunityId: string;
  targetUserId: string;
  status: string;
  requestedById: string | null;
  reviewedById: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  sourceCommunity: { id: string; name: string };
  targetCommunity: { id: string; name: string };
  sourceUser: { id: string; name: string; email: string | null };
  targetUser: { id: string; name: string; email: string | null };
  requestedBy: { id: string; name: string; email: string | null } | null;
  reviewedBy: { id: string; name: string; email: string | null } | null;
}) {
  return {
    id: request.id,
    offlineIdentityId: request.offlineIdentityId,
    sourceCommunityId: request.sourceCommunityId,
    sourceCommunityName: request.sourceCommunity.name,
    sourceUserId: request.sourceUserId,
    sourceUserName: request.sourceUser.name,
    sourceUserEmail: request.sourceUser.email,
    targetCommunityId: request.targetCommunityId,
    targetCommunityName: request.targetCommunity.name,
    targetUserId: request.targetUserId,
    targetUserName: request.targetUser.name,
    targetUserEmail: request.targetUser.email,
    status: request.status,
    requestedById: request.requestedById,
    requestedByName: request.requestedBy?.name ?? null,
    reviewedById: request.reviewedById,
    reviewedByName: request.reviewedBy?.name ?? null,
    reviewedAt: request.reviewedAt,
    createdAt: request.createdAt,
  };
}

export interface LinkedCommunityUserResolver {
  getUserIdForCommunity: (sourceUserId: string, communityId: string) => string;
  getLinkedUserIds: (sourceUserId: string) => string[];
  getOfflineIdentityId: (sourceUserId: string) => string | null;
}

export async function getLinkedCommunityUserResolver(
  tx: DbClient,
  {
    userIds,
    communityIds,
  }: {
    userIds: string[];
    communityIds: string[];
  }
): Promise<LinkedCommunityUserResolver> {
  const uniqueUserIds = Array.from(new Set(userIds));
  const uniqueCommunityIds = Array.from(new Set(communityIds));
  if (uniqueUserIds.length === 0 || uniqueCommunityIds.length === 0) {
    return {
      getUserIdForCommunity: (sourceUserId) => sourceUserId,
      getLinkedUserIds: (sourceUserId) => [sourceUserId],
      getOfflineIdentityId: () => null,
    };
  }

  const seedMembers = await tx.offlineIdentityMember.findMany({
    where: { userId: { in: uniqueUserIds } },
    select: {
      userId: true,
      offlineIdentityId: true,
    },
  });
  const identityIdByUserId = new Map(
    seedMembers.map((member) => [member.userId, member.offlineIdentityId])
  );
  const identityIds = Array.from(new Set(seedMembers.map((member) => member.offlineIdentityId)));
  if (identityIds.length === 0) {
    return {
      getUserIdForCommunity: (sourceUserId) => sourceUserId,
      getLinkedUserIds: (sourceUserId) => [sourceUserId],
      getOfflineIdentityId: () => null,
    };
  }

  const allMembers = await tx.offlineIdentityMember.findMany({
    where: {
      offlineIdentityId: { in: identityIds },
      communityId: { in: uniqueCommunityIds },
    },
    select: {
      offlineIdentityId: true,
      communityId: true,
      userId: true,
    },
  });
  const userIdByIdentityAndCommunity = new Map<string, string>();
  const linkedUserIdsByIdentity = new Map<string, string[]>();

  for (const member of allMembers) {
    userIdByIdentityAndCommunity.set(
      `${member.offlineIdentityId}:${member.communityId}`,
      member.userId
    );
    const current = linkedUserIdsByIdentity.get(member.offlineIdentityId) ?? [];
    current.push(member.userId);
    linkedUserIdsByIdentity.set(member.offlineIdentityId, current);
  }

  return {
    getUserIdForCommunity: (sourceUserId, communityId) => {
      const identityId = identityIdByUserId.get(sourceUserId);
      if (!identityId) return sourceUserId;
      return (
        userIdByIdentityAndCommunity.get(`${identityId}:${communityId}`) ??
        sourceUserId
      );
    },
    getLinkedUserIds: (sourceUserId) => {
      const identityId = identityIdByUserId.get(sourceUserId);
      if (!identityId) return [sourceUserId];
      return Array.from(
        new Set([sourceUserId, ...(linkedUserIdsByIdentity.get(identityId) ?? [])])
      );
    },
    getOfflineIdentityId: (sourceUserId) => identityIdByUserId.get(sourceUserId) ?? null,
  };
}

export async function getCommunityStatUserResolver(
  tx: DbClient,
  {
    communityId,
    memberUserIds,
  }: {
    communityId: string;
    memberUserIds: string[];
  }
) {
  const localMembers = await tx.offlineIdentityMember.findMany({
    where: {
      communityId,
      userId: { in: memberUserIds },
    },
    select: {
      offlineIdentityId: true,
      userId: true,
    },
  });
  const localUserIdByIdentityId = new Map(
    localMembers.map((member) => [member.offlineIdentityId, member.userId])
  );
  const identityIds = Array.from(localUserIdByIdentityId.keys());
  const linkedMembers =
    identityIds.length > 0
      ? await tx.offlineIdentityMember.findMany({
          where: { offlineIdentityId: { in: identityIds } },
          select: {
            offlineIdentityId: true,
            userId: true,
          },
        })
      : [];
  const identityIdByUserId = new Map(
    linkedMembers.map((member) => [member.userId, member.offlineIdentityId])
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
    where: { userId: { in: Array.from(new Set(userIds)) } },
    select: {
      userId: true,
      offlineIdentityId: true,
      offlineIdentity: {
        select: {
          members: {
            select: {
              communityId: true,
              userId: true,
              community: {
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
      row.userId,
      {
        offlineIdentityId: row.offlineIdentityId,
        linkedCommunityBadges: row.offlineIdentity.members.map((member) => ({
          id: member.community.id,
          name: member.community.name,
          userId: member.userId,
        })),
      },
    ])
  );
}
