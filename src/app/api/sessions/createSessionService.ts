import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getCommunityEloByUserId, withCommunityElo } from "@/lib/communityElo";
import { resolveMixedSideState } from "@/lib/mixedSide";
import {
  MixedSide,
  PlayerGender,
  SessionMode,
  SessionStatus,
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
  });

  if (!requesterMembership && !requesterIsAdmin) {
    throw new SessionRouteError("Not a community member", 403);
  }
  if (!requesterIsAdmin && requesterMembership?.role !== "ADMIN") {
    throw new SessionRouteError(
      "Only community admins can create tournaments",
      403
    );
  }

  const memberRows = await prisma.communityMember.findMany({
    where: { communityId: input.communityId },
    select: { userId: true },
  });
  const memberSet = new Set(memberRows.map((member) => member.userId));
  const uniquePlayerIds = Array.from(new Set(input.requestedPlayerIds)).filter(
    (id) => memberSet.has(id)
  );

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
        status: SessionStatus.WAITING,
        courts: {
          create: Array.from({ length: input.courtCount }, (_, index) => ({
            courtNumber: index + 1,
          })),
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
          sessionPoints: 0,
          joinedAt: new Date(),
          availableSince: new Date(),
        })),
      });
    }

    return tx.session.findUnique({
      where: { id: createdSession.id },
      include: {
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

  const players =
    newSession.communityId && newSession.players.length > 0
      ? withCommunityElo(
          newSession.players,
          await getCommunityEloByUserId(
            newSession.communityId,
            newSession.players.map((player) => player.userId)
          )
        )
      : newSession.players;

  return { ...newSession, players };
}
