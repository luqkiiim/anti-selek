import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getCommunityEloByUserId, withCommunityElo } from "@/lib/communityElo";
import { isCommunityOperatorRole } from "@/lib/communityRoles";
import { getOfflineIdentityInfoByUserId } from "@/lib/offlineIdentities";
import {
  getPlayerCommunityBadges,
  withPlayerCommunityBadges,
} from "@/lib/sessionCollab";
import { resolveMixedSideState } from "@/lib/mixedSide";
import { getNormalizedSessionPool } from "@/lib/sessionPools";
import {
  MixedSide,
  PlayerGender,
  SessionMode,
  SessionPool,
  SessionStatus,
  SessionCommunityRole,
  SessionCommunityStatus,
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
  const requesterMembership = await prisma.communityMember.findUnique({
    where: {
      communityId_userId: {
        communityId: input.communityId,
        userId: requesterId,
      },
    },
    include: {
      community: {
        select: { isTutorial: true, tutorialOwnerId: true },
      },
    },
  });

  if (!requesterMembership && !requesterIsAdmin) {
    throw new SessionRouteError("Not a community member", 403);
  }
  if (
    !requesterIsAdmin &&
    !isCommunityOperatorRole(requesterMembership?.role)
  ) {
    throw new SessionRouteError(
      "Only community admins or staff can create tournaments",
      403
    );
  }
  const hostCommunity =
    requesterMembership?.community ??
    (await prisma.community.findUnique({
      where: { id: input.communityId },
      select: { isTutorial: true, tutorialOwnerId: true },
    }));
  if (hostCommunity?.isTutorial && hostCommunity.tutorialOwnerId !== requesterId) {
    throw new SessionRouteError("Tutorial playground not found", 404);
  }
  if (hostCommunity?.isTutorial && input.partnerCommunityId) {
    throw new SessionRouteError(
      "Tutorial playground sessions cannot invite collab communities",
      400
    );
  }

  const involvedCommunityIds = input.partnerCommunityId
    ? [input.communityId, input.partnerCommunityId]
    : [input.communityId];
  if (input.partnerCommunityId) {
    const partnerCommunity = await prisma.community.findUnique({
      where: { id: input.partnerCommunityId },
      select: { id: true, isTutorial: true },
    });

    if (!partnerCommunity) {
      throw new SessionRouteError("Partner community not found", 404);
    }
    if (partnerCommunity.isTutorial) {
      throw new SessionRouteError(
        "Tutorial playgrounds cannot be used for collab tournaments",
        400
      );
    }
  }

  const memberRows = await prisma.communityMember.findMany({
    where: { communityId: { in: involvedCommunityIds } },
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
        communityId: input.communityId,
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
        sessionCommunities: {
          create: [
            {
              communityId: input.communityId,
              role: SessionCommunityRole.HOST,
              status: SessionCommunityStatus.ACCEPTED,
              requestedById: requesterId,
              reviewedById: requesterId,
              reviewedAt: new Date(),
            },
            ...(input.partnerCommunityId
              ? [
                  {
                    communityId: input.partnerCommunityId,
                    role: SessionCommunityRole.PARTNER,
                    status: SessionCommunityStatus.PENDING,
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
        sessionCommunities: {
          include: {
            community: { select: { id: true, name: true } },
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
    input.partnerCommunityId && newSession.players.length > 0
      ? withPlayerCommunityBadges(
          newSession.players,
          await getPlayerCommunityBadges(prisma, involvedCommunityIds, playerIds),
          newSession.communityId
        )
      : newSession.communityId && newSession.players.length > 0
        ? withCommunityElo(
            newSession.players,
            await getCommunityEloByUserId(newSession.communityId, playerIds)
          )
        : newSession.players;

  return { ...newSession, players };
}
