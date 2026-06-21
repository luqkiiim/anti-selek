import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getClubEloByUserId, withClubElo } from "@/lib/clubElo";
import { isClubOperatorRole } from "@/lib/clubRoles";
import { getOfflineIdentityInfoByUserId } from "@/lib/offlineIdentities";
import {
  getPlayerClubBadges,
  withPlayerClubBadges,
} from "@/lib/sessionCollab";
import { resolveMixedSideState } from "@/lib/mixedSide";
import { getNormalizedSessionPool } from "@/lib/sessionPools";
import {
  MixedSide,
  PlayerGender,
  SessionMode,
  SessionPool,
  SessionStatus,
  SessionClubRole,
  SessionClubStatus,
} from "@/types/enums";
import {
  mixedModeLabel,
  type ParsedCreateSessionRequest,
  SessionRouteError,
} from "./sessionRouteShared";

function buildMemberSessionConfigs({
  uniquePlayerIds,
  selectedUsers,
  playerConfigMap,
  mode,
  poolsEnabled,
}: {
  uniquePlayerIds: string[];
  selectedUsers: Array<{
    id: string;
    name: string;
    gender: string;
    partnerPreference: string;
    mixedSideOverride: string | null;
  }>;
  playerConfigMap: ParsedCreateSessionRequest["playerConfigMap"];
  mode: SessionMode;
  poolsEnabled: boolean;
}) {
  const selectedUserById = new Map(selectedUsers.map((user) => [user.id, user]));

  return uniquePlayerIds.map((userId) => {
    const selectedUser = selectedUserById.get(userId);
    const override = playerConfigMap.get(userId);
    const rawGender =
      override?.gender ?? (selectedUser?.gender as PlayerGender | undefined);
    const sessionGender =
      mode === SessionMode.MIXICANO
        ? [PlayerGender.MALE, PlayerGender.FEMALE].includes(
            rawGender as PlayerGender
          )
          ? (rawGender as PlayerGender)
          : PlayerGender.MALE
        : [PlayerGender.MALE, PlayerGender.FEMALE, PlayerGender.UNSPECIFIED].includes(
              rawGender as PlayerGender
            )
          ? (rawGender as PlayerGender)
          : PlayerGender.UNSPECIFIED;
    const resolvedMixedState = resolveMixedSideState({
      gender: sessionGender,
      mixedSideOverride:
        override?.mixedSideOverride !== undefined
          ? override.mixedSideOverride
          : override?.gender !== undefined
            ? null
            : (selectedUser?.mixedSideOverride as MixedSide | null | undefined),
      partnerPreference:
        override?.partnerPreference ??
        (override?.gender !== undefined
          ? undefined
          : selectedUser?.partnerPreference),
    });

    return {
      userId,
      isGuest: false,
      gender: sessionGender,
      partnerPreference: resolvedMixedState.partnerPreference,
      mixedSideOverride: resolvedMixedState.mixedSideOverride,
      pool: poolsEnabled
        ? getNormalizedSessionPool(override?.pool)
        : SessionPool.A,
      sessionPoints: 0,
    };
  });
}

export async function createSessionForUser({
  requesterId,
  requesterIsAdmin,
  input,
}: {
  requesterId: string;
  requesterIsAdmin: boolean;
  input: ParsedCreateSessionRequest;
}) {
  const requesterMembership = await prisma.clubMember.findUnique({
    where: {
      clubId_userId: {
        clubId: input.clubId,
        userId: requesterId,
      },
    },
    include: {
      club: {
        select: { isTutorial: true, tutorialOwnerId: true },
      },
    },
  });

  if (!requesterMembership && !requesterIsAdmin) {
    throw new SessionRouteError("Not a club member", 403);
  }
  if (
    !requesterIsAdmin &&
    !isClubOperatorRole(requesterMembership?.role)
  ) {
    throw new SessionRouteError(
      "Only club admins or staff can create tournaments",
      403
    );
  }
  const hostClub =
    requesterMembership?.club ??
    (await prisma.club.findUnique({
      where: { id: input.clubId },
      select: { isTutorial: true, tutorialOwnerId: true },
    }));
  if (hostClub?.isTutorial && hostClub.tutorialOwnerId !== requesterId) {
    throw new SessionRouteError("Tutorial playground not found", 404);
  }
  if (hostClub?.isTutorial && input.partnerClubId) {
    throw new SessionRouteError(
      "Tutorial playground sessions cannot invite collab clubs",
      400
    );
  }

  const involvedClubIds = input.partnerClubId
    ? [input.clubId, input.partnerClubId]
    : [input.clubId];
  if (input.partnerClubId) {
    const partnerClub = await prisma.club.findUnique({
      where: { id: input.partnerClubId },
      select: { id: true, isTutorial: true },
    });

    if (!partnerClub) {
      throw new SessionRouteError("Partner club not found", 404);
    }
    if (partnerClub.isTutorial) {
      throw new SessionRouteError(
        "Tutorial playgrounds cannot be used for collab tournaments",
        400
      );
    }
  }

  const memberRows = await prisma.clubMember.findMany({
    where: { clubId: { in: involvedClubIds } },
    select: { userId: true },
  });
  const memberSet = new Set(memberRows.map((member) => member.userId));
  const uniquePlayerIds = Array.from(new Set(input.requestedPlayerIds)).filter(
    (id) => memberSet.has(id)
  );
  const offlineIdentityInfoByUserId = await getOfflineIdentityInfoByUserId(
    prisma,
    uniquePlayerIds
  );
  const selectedOfflineIdentityIds = uniquePlayerIds
    .map((userId) => offlineIdentityInfoByUserId.get(userId)?.offlineIdentityId)
    .filter((id): id is string => typeof id === "string");
  if (new Set(selectedOfflineIdentityIds).size !== selectedOfflineIdentityIds.length) {
    throw new SessionRouteError(
      "A linked offline player was selected more than once",
      400
    );
  }

  if (uniquePlayerIds.length + input.normalizedGuests.length < 2) {
    throw new SessionRouteError(
      "At least 2 total players (members and/or guests) are required to create a tournament",
      400
    );
  }

  const selectedUsers = await prisma.user.findMany({
    where: { id: { in: uniquePlayerIds } },
    select: {
      id: true,
      name: true,
      gender: true,
      partnerPreference: true,
      mixedSideOverride: true,
    },
  });
  const memberSessionConfigs = buildMemberSessionConfigs({
    uniquePlayerIds,
    selectedUsers,
    playerConfigMap: input.playerConfigMap,
    mode: input.mode,
    poolsEnabled: input.poolsEnabled,
  });

  if (input.mode === SessionMode.MIXICANO) {
    const invalidGuest = input.normalizedGuests.find(
      (guest) => ![PlayerGender.MALE, PlayerGender.FEMALE].includes(guest.gender)
    );
    if (invalidGuest) {
      throw new SessionRouteError(
        `${mixedModeLabel} requires guest gender for ${invalidGuest.name}`,
        400
      );
    }
  }

  const sessionId = randomUUID();
  const newSession = await prisma.$transaction(async (tx) => {
    const createdSession = await tx.session.create({
      data: {
        id: sessionId,
        code: sessionId,
        clubId: input.clubId,
        name: input.name,
        type: input.type,
        mode: input.mode,
        scoringType: input.scoringType,
        matchmakingStyle: input.matchmakingStyle,
        balanceMetric: input.balanceMetric,
        pairingMode: input.pairingMode,
        status: SessionStatus.WAITING,
        isTest: input.isTest,
        autoQueueEnabled: input.autoQueueEnabled,
        respectPlayerRest: input.respectPlayerRest,
        poolsEnabled: input.poolsEnabled,
        poolAName: input.poolAName,
        poolBName: input.poolBName,
        crossoverMissThreshold: input.crossoverMissThreshold,
        courts: {
          create: Array.from({ length: input.courtCount }, (_, index) => ({
            courtNumber: index + 1,
          })),
        },
        sessionClubs: {
          create: [
            {
              clubId: input.clubId,
              role: SessionClubRole.HOST,
              status: SessionClubStatus.ACCEPTED,
              requestedById: requesterId,
              reviewedById: requesterId,
              reviewedAt: new Date(),
            },
            ...(input.partnerClubId
              ? [
                  {
                    clubId: input.partnerClubId,
                    role: SessionClubRole.PARTNER,
                    status: SessionClubStatus.PENDING,
                    requestedById: requesterId,
                  },
                ]
              : []),
          ],
        },
        players: {
          create: memberSessionConfigs,
        },
      },
    });

    if (input.normalizedGuests.length > 0) {
      const createdGuests = await Promise.all(
        input.normalizedGuests.map((guest) =>
          tx.user.create({
            data: {
              name: guest.name,
              email: null,
              passwordHash: null,
              isClaimed: false,
              elo: guest.initialElo,
              gender: guest.gender,
              partnerPreference: guest.partnerPreference,
              mixedSideOverride: guest.mixedSideOverride,
            },
            select: {
              id: true,
              gender: true,
              partnerPreference: true,
              mixedSideOverride: true,
            },
          })
        )
      );

      await tx.sessionPlayer.createMany({
        data: createdGuests.map((guest, index) => ({
          sessionId: createdSession.id,
          userId: guest.id,
          isGuest: true,
          gender: guest.gender,
          partnerPreference:
            guest.partnerPreference ??
            input.normalizedGuests[index].partnerPreference,
          mixedSideOverride:
            guest.mixedSideOverride ??
            input.normalizedGuests[index].mixedSideOverride,
          pool: input.poolsEnabled
            ? input.normalizedGuests[index].pool
            : SessionPool.A,
          sessionPoints: 0,
          joinedAt: new Date(),
          availableSince: new Date(),
        })),
      });
    }

    return tx.session.findUnique({
      where: { id: createdSession.id },
      include: {
        sessionClubs: {
          include: {
            club: { select: { id: true, name: true } },
          },
        },
        courts: true,
        players: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                elo: true,
                gender: true,
                partnerPreference: true,
                mixedSideOverride: true,
              },
            },
          },
        },
      },
    });
  });

  if (!newSession) {
    throw new SessionRouteError("Failed to load created tournament", 500);
  }

  const playerIds = newSession.players.map((player) => player.userId);
  const players =
    input.partnerClubId && newSession.players.length > 0
      ? withPlayerClubBadges(
          newSession.players,
          await getPlayerClubBadges(prisma, involvedClubIds, playerIds),
          newSession.clubId
        )
      : newSession.clubId && newSession.players.length > 0
        ? withClubElo(
            newSession.players,
            await getClubEloByUserId(newSession.clubId, playerIds)
          )
        : newSession.players;

  return { ...newSession, players };
}
