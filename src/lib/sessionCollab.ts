import type { Prisma, PrismaClient } from "@prisma/client";
import {
  COMMUNITY_OPERATOR_ROLES,
  isClubAdminRole,
  isClubOperatorRole,
} from "@/lib/clubRoles";
import { getLinkedClubUserResolver } from "@/lib/offlineIdentities";
import { getAccountClubContext } from "@/lib/playerIdentity";
import {
  SessionClubRole,
  SessionClubStatus,
  ClubRole,
} from "@/types/enums";

type DbClient = Prisma.TransactionClient | PrismaClient;

interface SessionIdentity {
  id: string;
  clubId?: string | null;
}

export interface SessionClubLink {
  id: string;
  sessionId: string;
  clubId: string;
  role: string;
  status: string;
  reviewedAt?: Date | null;
  club?: {
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
    !session.clubId ||
    (statuses && !statuses.includes(SessionClubStatus.ACCEPTED))
  ) {
    return [];
  }

  const clubDelegate = (
    tx as unknown as {
      club?: {
        findUnique?: (args: {
          where: { id: string };
          select: { id: true; name: true };
        }) => Promise<{ id: string; name: string } | null>;
      };
    }
  ).club;
  const fallbackClub =
    (await clubDelegate?.findUnique?.({
      where: { id: session.clubId },
      select: { id: true, name: true },
    })) ?? { id: session.clubId, name: "" };

  return [
    {
      id: `legacy:${session.id}:${session.clubId}`,
      sessionId: session.id,
      clubId: session.clubId,
      role: SessionClubRole.HOST,
      status: SessionClubStatus.ACCEPTED,
      reviewedAt: null,
      club: fallbackClub,
    },
  ];
}

export async function getSessionClubLinks(
  tx: DbClient,
  session: SessionIdentity,
  statuses?: string[]
): Promise<SessionClubLink[]> {
  const sessionClubDelegate = (
    tx as unknown as {
      sessionClub?: {
        findMany?: (args: {
          where: {
            sessionId: string;
            status?: { in: string[] };
          };
          include: {
            club: {
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
  ).sessionClub;

  if (!sessionClubDelegate?.findMany) {
    return getLegacySessionClubLink(tx, session, statuses);
  }

  const links = await sessionClubDelegate.findMany({
    where: {
      sessionId: session.id,
      ...(statuses ? { status: { in: statuses } } : {}),
    },
    include: {
      club: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  if (links.length > 0 || !session.clubId) {
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
  const ids = links.map((link) => link.clubId);

  if (session.clubId && !ids.includes(session.clubId)) {
    ids.unshift(session.clubId);
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
  const ids = links.map((link) => link.clubId);

  if (session.clubId && !ids.includes(session.clubId)) {
    ids.unshift(session.clubId);
  }

  return Array.from(new Set(ids));
}

/** Account roles are independent of sporting profile ownership. */
export async function getSessionAdminMembership(tx: DbClient, args: { session: SessionIdentity; userId: string; acceptedOnly?: boolean }) {
  return getSessionRoleMembership(tx, { ...args, roles: [ClubRole.OWNER, ClubRole.ADMIN] });
}
export async function getSessionOperatorMembership(tx: DbClient, args: { session: SessionIdentity; userId: string; acceptedOnly?: boolean }) {
  return getSessionRoleMembership(tx, { ...args, roles: [...COMMUNITY_OPERATOR_ROLES] });
}
async function getSessionRoleMembership(tx: DbClient, { session, userId, acceptedOnly = false, roles }: { session: SessionIdentity; userId: string; acceptedOnly?: boolean; roles: ClubRole[] }) {
  const clubIds = acceptedOnly ? await getAcceptedSessionClubIds(tx, session) : await getSessionClubIdsForAccess(tx, session);
  if (!clubIds.length) return null;
  return tx.clubAccess.findFirst({ where: { clubId: { in: clubIds }, userId, status: "ACTIVE", role: { in: roles } }, select: { clubId: true, role: true } });
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
  const clubIds = acceptedOnly
    ? await getAcceptedSessionClubIds(tx, session)
    : await getSessionClubIdsForAccess(tx, session);

  for (const clubId of clubIds) {
    const context = await getAccountClubContext(tx, { userId, clubId });
    if (context.canAccess) {
      return { clubId, role: context.role };
    }
  }
  return null;
}

export async function isAccountSessionPlayer(
  tx: DbClient,
  sessionId: string,
  accountUserId: string
) {
  const participant = await tx.sessionPlayer.findFirst({
    where: { sessionId, player: { ownerUserId: accountUserId } },
    select: { id: true },
  });
  return !!participant;
}

export async function getPlayerClubBadges(
  tx: DbClient,
  clubIds: string[],
  userIds: string[]
) {
  const uniqueClubIds = Array.from(new Set(clubIds));
  const uniqueUserIds = Array.from(new Set(userIds));
  if (uniqueClubIds.length === 0 || uniqueUserIds.length === 0) {
    return new Map<string, Array<{ id: string; name: string; elo: number }>>();
  }

  const linkedUserResolver = await getLinkedClubUserResolver(tx, {
    userIds: uniqueUserIds,
    clubIds: uniqueClubIds,
  });
  const candidateUserIds = Array.from(
    new Set(
      uniqueUserIds.flatMap((playerId) => linkedUserResolver.getLinkedUserIds(playerId))
    )
  );

  const clubMemberDelegate = (
    tx as unknown as {
      clubMember?: {
        findMany?: (args: {
          where: {
            clubId: { in: string[] };
            playerId: { in: string[] };
          };
          select: {
            playerId: true;
            elo: true;
            club: {
              select: {
                id: true;
                name: true;
              };
            };
          };
        }) => Promise<
          Array<{
            playerId: string;
            elo: number;
            club: {
              id: string;
              name: string;
            };
          }>
        >;
      };
    }
  ).clubMember;

  if (!clubMemberDelegate?.findMany) {
    return new Map<string, Array<{ id: string; name: string; elo: number }>>();
  }

  const rows = await clubMemberDelegate.findMany({
    where: {
      clubId: { in: uniqueClubIds },
      playerId: { in: candidateUserIds },
    },
    select: {
      playerId: true,
      elo: true,
      club: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  const rowByClubAndUser = new Map(
    rows.map((row) => [`${row.club.id}:${row.playerId}`, row])
  );
  const badgesByUserId = new Map<
    string,
    Array<{ id: string; name: string; elo: number }>
  >();
  for (const sourceUserId of uniqueUserIds) {
    const badges: Array<{ id: string; name: string; elo: number }> = [];
    for (const clubId of uniqueClubIds) {
      const linkedUserId = linkedUserResolver.getUserIdForClub(
        sourceUserId,
        clubId
      );
      const row = rowByClubAndUser.get(`${clubId}:${linkedUserId}`);
      if (!row) continue;

      badges.push({
        id: row.club.id,
        name: row.club.name,
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
  T extends { playerId: string; player: { elo: number } },
>(
  players: T[],
  badgesByUserId: Map<string, Array<{ id: string; name: string; elo: number }>>,
  preferredClubId?: string | null
) {
  return players.map((player) => {
    const clubBadges = badgesByUserId.get(player.playerId) ?? [];
    const preferredBadge = preferredClubId
      ? clubBadges.find((badge) => badge.id === preferredClubId)
      : clubBadges[0];

    return {
      ...player,
      communityBadges: clubBadges,
      player: {
        ...player.player,
        elo: preferredBadge?.elo ?? player.player.elo,
      },
    };
  });
}
