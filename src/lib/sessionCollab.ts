import type { Prisma, PrismaClient } from "@prisma/client";
import {
  COMMUNITY_OPERATOR_ROLES,
  isClubAdminRole,
  isClubOperatorRole,
} from "@/lib/clubRoles";
import { getLinkedClubUserResolver } from "@/lib/offlineIdentities";
import {
  SessionClubRole,
  SessionClubStatus,
  ClubRole,
} from "@/types/enums";

type DbClient = Prisma.TransactionClient | PrismaClient;

interface SessionIdentity {
  id: string;
  communityId?: string | null;
}

export interface SessionClubLink {
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

export function orderSessionClubLinks<T extends { role: string; createdAt?: Date }>(
  links: T[]
) {
  return links.slice().sort((left, right) => {
    if (left.role === right.role) {
      return (left.createdAt?.getTime() ?? 0) - (right.createdAt?.getTime() ?? 0);
    }

    return left.role === SessionClubRole.HOST ? -1 : 1;
  });
}

async function getLegacySessionClubLink(
  tx: DbClient,
  session: SessionIdentity,
  statuses?: string[]
): Promise<SessionClubLink[]> {
  if (
    !session.communityId ||
    (statuses && !statuses.includes(SessionClubStatus.ACCEPTED))
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
  const fallbackClub =
    (await communityDelegate?.findUnique?.({
      where: { id: session.communityId },
      select: { id: true, name: true },
    })) ?? { id: session.communityId, name: "" };

  return [
    {
      id: `legacy:${session.id}:${session.communityId}`,
      sessionId: session.id,
      communityId: session.communityId,
      role: SessionClubRole.HOST,
      status: SessionClubStatus.ACCEPTED,
      reviewedAt: null,
      community: fallbackClub,
    },
  ];
}

export async function getSessionClubLinks(
  tx: DbClient,
  session: SessionIdentity,
  statuses?: string[]
): Promise<SessionClubLink[]> {
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
        }) => Promise<Array<SessionClubLink & { createdAt?: Date }>>;
      };
    }
  ).sessionCommunity;

  if (!sessionCommunityDelegate?.findMany) {
    return getLegacySessionClubLink(tx, session, statuses);
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
    return orderSessionClubLinks(links);
  }

  return getLegacySessionClubLink(tx, session, statuses);
}

export async function getAcceptedSessionClubIds(
  tx: DbClient,
  session: SessionIdentity
) {
  const links = await getSessionClubLinks(tx, session, [
    SessionClubStatus.ACCEPTED,
  ]);
  const ids = links.map((link) => link.communityId);

  if (session.communityId && !ids.includes(session.communityId)) {
    ids.unshift(session.communityId);
  }

  return Array.from(new Set(ids));
}

export async function getSessionClubIdsForAccess(
  tx: DbClient,
  session: SessionIdentity
) {
  const links = await getSessionClubLinks(tx, session, [
    SessionClubStatus.ACCEPTED,
    SessionClubStatus.PENDING,
  ]);
  const ids = links.map((link) => link.communityId);

  if (session.communityId && !ids.includes(session.communityId)) {
    ids.unshift(session.communityId);
  }

  return Array.from(new Set(ids));
}

function getClubMemberDelegate(tx: DbClient) {
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
    roles: [ClubRole.ADMIN],
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
    roles: ClubRole[];
  }
) {
  const communityIds = acceptedOnly
    ? await getAcceptedSessionClubIds(tx, session)
    : await getSessionClubIdsForAccess(tx, session);

  if (communityIds.length === 0) {
    return null;
  }

  const communityMemberDelegate = getClubMemberDelegate(tx);
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
      roles.length === 1 && roles[0] === ClubRole.ADMIN
        ? isClubAdminRole(membership?.role)
        : isClubOperatorRole(membership?.role);
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
    ? await getAcceptedSessionClubIds(tx, session)
    : await getSessionClubIdsForAccess(tx, session);

  if (communityIds.length === 0) {
    return null;
  }

  const communityMemberDelegate = getClubMemberDelegate(tx);
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

export async function getPlayerClubBadges(
  tx: DbClient,
  communityIds: string[],
  userIds: string[]
) {
  const uniqueClubIds = Array.from(new Set(communityIds));
  const uniqueUserIds = Array.from(new Set(userIds));
  if (uniqueClubIds.length === 0 || uniqueUserIds.length === 0) {
    return new Map<string, Array<{ id: string; name: string; elo: number }>>();
  }

  const linkedUserResolver = await getLinkedClubUserResolver(tx, {
    userIds: uniqueUserIds,
    communityIds: uniqueClubIds,
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
      communityId: { in: uniqueClubIds },
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

  const rowByClubAndUser = new Map(
    rows.map((row) => [`${row.community.id}:${row.userId}`, row])
  );
  const badgesByUserId = new Map<
    string,
    Array<{ id: string; name: string; elo: number }>
  >();
  for (const sourceUserId of uniqueUserIds) {
    const badges: Array<{ id: string; name: string; elo: number }> = [];
    for (const communityId of uniqueClubIds) {
      const linkedUserId = linkedUserResolver.getUserIdForClub(
        sourceUserId,
        communityId
      );
      const row = rowByClubAndUser.get(`${communityId}:${linkedUserId}`);
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
      const leftIndex = uniqueClubIds.indexOf(left.id);
      const rightIndex = uniqueClubIds.indexOf(right.id);
      return leftIndex - rightIndex || left.name.localeCompare(right.name);
    });
  }

  return badgesByUserId;
}

export function withPlayerClubBadges<
  T extends { userId: string; user: { elo: number } },
>(
  players: T[],
  badgesByUserId: Map<string, Array<{ id: string; name: string; elo: number }>>,
  preferredClubId?: string | null
) {
  return players.map((player) => {
    const communityBadges = badgesByUserId.get(player.userId) ?? [];
    const preferredBadge = preferredClubId
      ? communityBadges.find((badge) => badge.id === preferredClubId)
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
