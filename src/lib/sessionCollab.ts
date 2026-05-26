import type { Prisma, PrismaClient } from "@prisma/client";
import {
  COMMUNITY_OPERATOR_ROLES,
  isCommunityAdminRole,
  isCommunityOperatorRole,
} from "@/lib/communityRoles";
import { getLinkedCommunityUserResolver } from "@/lib/offlineIdentities";
import {
  SessionCommunityRole,
  SessionCommunityStatus,
  CommunityRole,
} from "@/types/enums";

type DbClient = Prisma.TransactionClient | PrismaClient;

interface SessionIdentity {
  id: string;
  communityId?: string | null;
}

export interface SessionCommunityLink {
  id: string;
  sessionId: string;
  communityId: string;
  role: string;
  status: string;
  reviewedAt?: Date | null;
  community?: {
    id: string;
    name: string;
  };
}

export function orderSessionCommunityLinks<T extends { role: string; createdAt?: Date }>(
  links: T[]
) {
  return links.slice().sort((left, right) => {
    if (left.role === right.role) {
      return (left.createdAt?.getTime() ?? 0) - (right.createdAt?.getTime() ?? 0);
    }

    return left.role === SessionCommunityRole.HOST ? -1 : 1;
  });
}

async function getLegacySessionCommunityLink(
  tx: DbClient,
  session: SessionIdentity,
  statuses?: string[]
): Promise<SessionCommunityLink[]> {
  if (
    !session.communityId ||
    (statuses && !statuses.includes(SessionCommunityStatus.ACCEPTED))
  ) {
    return [];
  }

  const communityDelegate = (
    tx as unknown as {
      community?: {
        findUnique?: (args: {
          where: { id: string };
          select: { id: true; name: true };
        }) => Promise<{ id: string; name: string } | null>;
      };
    }
  ).community;
  const fallbackCommunity =
    (await communityDelegate?.findUnique?.({
      where: { id: session.communityId },
      select: { id: true, name: true },
    })) ?? { id: session.communityId, name: "" };

  return [
    {
      id: `legacy:${session.id}:${session.communityId}`,
      sessionId: session.id,
      communityId: session.communityId,
      role: SessionCommunityRole.HOST,
      status: SessionCommunityStatus.ACCEPTED,
      reviewedAt: null,
      community: fallbackCommunity,
    },
  ];
}

export async function getSessionCommunityLinks(
  tx: DbClient,
  session: SessionIdentity,
  statuses?: string[]
): Promise<SessionCommunityLink[]> {
  const sessionCommunityDelegate = (
    tx as unknown as {
      sessionCommunity?: {
        findMany?: (args: {
          where: {
            sessionId: string;
            status?: { in: string[] };
          };
          include: {
            community: {
              select: {
                id: true;
                name: true;
              };
            };
          };
          orderBy: Array<Record<string, string>>;
        }) => Promise<Array<SessionCommunityLink & { createdAt?: Date }>>;
      };
    }
  ).sessionCommunity;

  if (!sessionCommunityDelegate?.findMany) {
    return getLegacySessionCommunityLink(tx, session, statuses);
  }

  const links = await sessionCommunityDelegate.findMany({
    where: {
      sessionId: session.id,
      ...(statuses ? { status: { in: statuses } } : {}),
    },
    include: {
      community: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  if (links.length > 0 || !session.communityId) {
    return orderSessionCommunityLinks(links);
  }

  return getLegacySessionCommunityLink(tx, session, statuses);
}

export async function getAcceptedSessionCommunityIds(
  tx: DbClient,
  session: SessionIdentity
) {
  const links = await getSessionCommunityLinks(tx, session, [
    SessionCommunityStatus.ACCEPTED,
  ]);
  const ids = links.map((link) => link.communityId);

  if (session.communityId && !ids.includes(session.communityId)) {
    ids.unshift(session.communityId);
  }

  return Array.from(new Set(ids));
}

export async function getSessionCommunityIdsForAccess(
  tx: DbClient,
  session: SessionIdentity
) {
  const links = await getSessionCommunityLinks(tx, session, [
    SessionCommunityStatus.ACCEPTED,
    SessionCommunityStatus.PENDING,
  ]);
  const ids = links.map((link) => link.communityId);

  if (session.communityId && !ids.includes(session.communityId)) {
    ids.unshift(session.communityId);
  }

  return Array.from(new Set(ids));
}

function getCommunityMemberDelegate(tx: DbClient) {
  return (
    tx as unknown as {
      communityMember?: {
        findFirst?: (args: {
          where: {
            communityId: { in: string[] };
            userId: string;
            role?: string | { in: string[] };
          };
          select: {
            communityId: true;
            role: true;
            elo?: true;
          };
        }) => Promise<{ communityId?: string; role: string; elo?: number } | null>;
        findUnique?: (args: {
          where: {
            communityId_userId: {
              communityId: string;
              userId: string;
            };
          };
          select: {
            communityId: true;
            role: true;
            elo?: true;
          };
        }) => Promise<{ communityId?: string; role: string; elo?: number } | null>;
      };
    }
  ).communityMember;
}

export async function getSessionAdminMembership(
  tx: DbClient,
  {
    session,
    userId,
    acceptedOnly = false,
  }: {
    session: SessionIdentity;
    userId: string;
    acceptedOnly?: boolean;
  }
) {
  return getSessionRoleMembership(tx, {
    session,
    userId,
    acceptedOnly,
    roles: [CommunityRole.ADMIN],
  });
}

export async function getSessionOperatorMembership(
  tx: DbClient,
  {
    session,
    userId,
    acceptedOnly = false,
  }: {
    session: SessionIdentity;
    userId: string;
    acceptedOnly?: boolean;
  }
) {
  return getSessionRoleMembership(tx, {
    session,
    userId,
    acceptedOnly,
    roles: [...COMMUNITY_OPERATOR_ROLES],
  });
}

async function getSessionRoleMembership(
  tx: DbClient,
  {
    session,
    userId,
    acceptedOnly = false,
    roles,
  }: {
    session: SessionIdentity;
    userId: string;
    acceptedOnly?: boolean;
    roles: CommunityRole[];
  }
) {
  const communityIds = acceptedOnly
    ? await getAcceptedSessionCommunityIds(tx, session)
    : await getSessionCommunityIdsForAccess(tx, session);

  if (communityIds.length === 0) {
    return null;
  }

  const communityMemberDelegate = getCommunityMemberDelegate(tx);
  if (communityMemberDelegate?.findFirst) {
    return communityMemberDelegate.findFirst({
      where: {
        communityId: { in: communityIds },
        userId,
        role: roles.length === 1 ? roles[0] : { in: roles },
      },
      select: {
        communityId: true,
        role: true,
      },
    });
  }

  if (!communityMemberDelegate?.findUnique) {
    return null;
  }

  for (const communityId of communityIds) {
    const membership = await communityMemberDelegate.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId,
        },
      },
      select: {
        communityId: true,
        role: true,
      },
    });

    const hasRole =
      roles.length === 1 && roles[0] === CommunityRole.ADMIN
        ? isCommunityAdminRole(membership?.role)
        : isCommunityOperatorRole(membership?.role);
    if (membership && hasRole) {
      return {
        ...membership,
        communityId: membership.communityId ?? communityId,
      };
    }
  }

  return null;
}

export async function getSessionMembership(
  tx: DbClient,
  {
    session,
    userId,
    acceptedOnly = true,
  }: {
    session: SessionIdentity;
    userId: string;
    acceptedOnly?: boolean;
  }
) {
  const communityIds = acceptedOnly
    ? await getAcceptedSessionCommunityIds(tx, session)
    : await getSessionCommunityIdsForAccess(tx, session);

  if (communityIds.length === 0) {
    return null;
  }

  const communityMemberDelegate = getCommunityMemberDelegate(tx);
  if (communityMemberDelegate?.findFirst) {
    return communityMemberDelegate.findFirst({
      where: {
        communityId: { in: communityIds },
        userId,
      },
      select: {
        communityId: true,
        role: true,
        elo: true,
      },
    });
  }

  if (!communityMemberDelegate?.findUnique) {
    return null;
  }

  for (const communityId of communityIds) {
    const membership = await communityMemberDelegate.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId,
        },
      },
      select: {
        communityId: true,
        role: true,
        elo: true,
      },
    });

    if (membership) {
      return {
        ...membership,
        communityId: membership.communityId ?? communityId,
      };
    }
  }

  return null;
}

export async function getPlayerCommunityBadges(
  tx: DbClient,
  communityIds: string[],
  userIds: string[]
) {
  const uniqueCommunityIds = Array.from(new Set(communityIds));
  const uniqueUserIds = Array.from(new Set(userIds));
  if (uniqueCommunityIds.length === 0 || uniqueUserIds.length === 0) {
    return new Map<string, Array<{ id: string; name: string; elo: number }>>();
  }

  const linkedUserResolver = await getLinkedCommunityUserResolver(tx, {
    userIds: uniqueUserIds,
    communityIds: uniqueCommunityIds,
  });
  const candidateUserIds = Array.from(
    new Set(
      uniqueUserIds.flatMap((userId) => linkedUserResolver.getLinkedUserIds(userId))
    )
  );

  const communityMemberDelegate = (
    tx as unknown as {
      communityMember?: {
        findMany?: (args: {
          where: {
            communityId: { in: string[] };
            userId: { in: string[] };
          };
          select: {
            userId: true;
            elo: true;
            community: {
              select: {
                id: true;
                name: true;
              };
            };
          };
        }) => Promise<
          Array<{
            userId: string;
            elo: number;
            community: {
              id: string;
              name: string;
            };
          }>
        >;
      };
    }
  ).communityMember;

  if (!communityMemberDelegate?.findMany) {
    return new Map<string, Array<{ id: string; name: string; elo: number }>>();
  }

  const rows = await communityMemberDelegate.findMany({
    where: {
      communityId: { in: uniqueCommunityIds },
      userId: { in: candidateUserIds },
    },
    select: {
      userId: true,
      elo: true,
      community: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  const rowByCommunityAndUser = new Map(
    rows.map((row) => [`${row.community.id}:${row.userId}`, row])
  );
  const badgesByUserId = new Map<
    string,
    Array<{ id: string; name: string; elo: number }>
  >();
  for (const sourceUserId of uniqueUserIds) {
    const badges: Array<{ id: string; name: string; elo: number }> = [];
    for (const communityId of uniqueCommunityIds) {
      const linkedUserId = linkedUserResolver.getUserIdForCommunity(
        sourceUserId,
        communityId
      );
      const row = rowByCommunityAndUser.get(`${communityId}:${linkedUserId}`);
      if (!row) continue;

      badges.push({
        id: row.community.id,
        name: row.community.name,
        elo: row.elo,
      });
    }
    if (badges.length > 0) {
      badgesByUserId.set(sourceUserId, badges);
    }
  }

  for (const badges of badgesByUserId.values()) {
    badges.sort((left, right) => {
      const leftIndex = uniqueCommunityIds.indexOf(left.id);
      const rightIndex = uniqueCommunityIds.indexOf(right.id);
      return leftIndex - rightIndex || left.name.localeCompare(right.name);
    });
  }

  return badgesByUserId;
}

export function withPlayerCommunityBadges<
  T extends { userId: string; user: { elo: number } },
>(
  players: T[],
  badgesByUserId: Map<string, Array<{ id: string; name: string; elo: number }>>,
  preferredCommunityId?: string | null
) {
  return players.map((player) => {
    const communityBadges = badgesByUserId.get(player.userId) ?? [];
    const preferredBadge = preferredCommunityId
      ? communityBadges.find((badge) => badge.id === preferredCommunityId)
      : communityBadges[0];

    return {
      ...player,
      communityBadges,
      user: {
        ...player.user,
        elo: preferredBadge?.elo ?? player.user.elo,
      },
    };
  });
}
