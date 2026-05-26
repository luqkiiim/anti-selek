import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  ADMIN_ONBOARDING_TUTORIAL_KEY,
} from "@/lib/adminOnboarding";
import {
  CommunityPlayerStatus,
  MatchStatus,
  PartnerPreference,
  PlayerGender,
  SessionCommunityRole,
  SessionCommunityStatus,
  SessionMode,
  SessionPool,
  SessionStatus,
  SessionType,
} from "@/types/enums";

export const TUTORIAL_PLAYGROUND_LABEL = "Tutorial playground";
export const TUTORIAL_PLAYGROUND_SESSION_NAME = "Practice rally";

export const TUTORIAL_FAKE_PLAYERS = [
  {
    name: "Aiman",
    gender: PlayerGender.MALE,
    partnerPreference: PartnerPreference.OPEN,
    elo: 1040,
  },
  {
    name: "Siti",
    gender: PlayerGender.FEMALE,
    partnerPreference: PartnerPreference.FEMALE_FLEX,
    elo: 1015,
  },
  {
    name: "Farah",
    gender: PlayerGender.FEMALE,
    partnerPreference: PartnerPreference.OPEN,
    elo: 1075,
  },
  {
    name: "Haziq",
    gender: PlayerGender.MALE,
    partnerPreference: PartnerPreference.OPEN,
    elo: 980,
  },
  {
    name: "Aina",
    gender: PlayerGender.FEMALE,
    partnerPreference: PartnerPreference.FEMALE_FLEX,
    elo: 990,
  },
  {
    name: "Danish",
    gender: PlayerGender.MALE,
    partnerPreference: PartnerPreference.OPEN,
    elo: 1105,
  },
  {
    name: "Mira",
    gender: PlayerGender.FEMALE,
    partnerPreference: PartnerPreference.OPEN,
    elo: 1030,
  },
  {
    name: "Irfan",
    gender: PlayerGender.MALE,
    partnerPreference: PartnerPreference.OPEN,
    elo: 1060,
  },
  {
    name: "Nadia",
    gender: PlayerGender.FEMALE,
    partnerPreference: PartnerPreference.FEMALE_FLEX,
    elo: 970,
  },
  {
    name: "Zul",
    gender: PlayerGender.MALE,
    partnerPreference: PartnerPreference.OPEN,
    elo: 1005,
  },
  {
    name: "Amir",
    gender: PlayerGender.MALE,
    partnerPreference: PartnerPreference.OPEN,
    elo: 1090,
  },
  {
    name: "Yana",
    gender: PlayerGender.FEMALE,
    partnerPreference: PartnerPreference.OPEN,
    elo: 1020,
  },
  {
    name: "Rafi",
    gender: PlayerGender.MALE,
    partnerPreference: PartnerPreference.OPEN,
    elo: 995,
  },
] as const;

type TutorialTx = Prisma.TransactionClient;

export interface TutorialPlaygroundSummary {
  communityId: string;
  communityName: string;
  sessionCode: string | null;
  playersCount: number;
  courtsCount: number;
  isTutorial: true;
}

function getTutorialCommunityName(userId: string) {
  return `${TUTORIAL_PLAYGROUND_LABEL} ${userId.slice(-8)}`;
}

async function summarizeTutorialPlayground(
  tx: TutorialTx,
  communityId: string
): Promise<TutorialPlaygroundSummary> {
  const community = await tx.community.findUnique({
    where: { id: communityId },
    select: {
      id: true,
      name: true,
      sessions: {
        where: { isTest: true },
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
        take: 1,
        select: {
          code: true,
          _count: {
            select: {
              courts: true,
              players: true,
            },
          },
        },
      },
    },
  });

  if (!community) {
    throw new Error("Tutorial playground not found");
  }

  const session = community.sessions[0] ?? null;

  return {
    communityId: community.id,
    communityName: community.name,
    sessionCode: session?.code ?? null,
    playersCount: session?._count.players ?? 0,
    courtsCount: session?._count.courts ?? 0,
    isTutorial: true,
  };
}

async function createTutorialCommunity(tx: TutorialTx, userId: string) {
  return tx.community.create({
    data: {
      name: getTutorialCommunityName(userId),
      createdById: userId,
      isTutorial: true,
      tutorialOwnerId: userId,
      members: {
        create: {
          userId,
          role: "ADMIN",
          status: CommunityPlayerStatus.CORE,
        },
      },
    },
    select: { id: true, isTutorial: true },
  });
}

async function seedTutorialPlaygroundData(
  tx: TutorialTx,
  communityId: string,
  ownerUserId: string
) {
  await tx.communityMember.upsert({
    where: {
      communityId_userId: {
        communityId,
        userId: ownerUserId,
      },
    },
    update: {
      role: "ADMIN",
      status: CommunityPlayerStatus.CORE,
      elo: 1000,
    },
    create: {
      communityId,
      userId: ownerUserId,
      role: "ADMIN",
      status: CommunityPlayerStatus.CORE,
      elo: 1000,
    },
  });

  const fakeUsers = [];
  for (const player of TUTORIAL_FAKE_PLAYERS) {
    const user = await tx.user.create({
      data: {
        name: player.name,
        email: null,
        passwordHash: null,
        isClaimed: false,
        elo: player.elo,
        gender: player.gender,
        partnerPreference: player.partnerPreference,
      },
      select: {
        id: true,
        gender: true,
        partnerPreference: true,
        elo: true,
      },
    });
    fakeUsers.push(user);
  }

  await tx.communityMember.createMany({
    data: fakeUsers.map((user, index) => ({
      communityId,
      userId: user.id,
      role: "MEMBER",
      status:
        index % 6 === 4
          ? CommunityPlayerStatus.OCCASIONAL
          : CommunityPlayerStatus.CORE,
      elo: user.elo,
    })),
  });

  const now = new Date();
  const sessionId = randomUUID();
  const courtIds = [randomUUID(), randomUUID()];
  await tx.session.create({
    data: {
      id: sessionId,
      code: sessionId,
      communityId,
      name: TUTORIAL_PLAYGROUND_SESSION_NAME,
      type: SessionType.POINTS,
      mode: SessionMode.MEXICANO,
      status: SessionStatus.ACTIVE,
      isTest: true,
      autoQueueEnabled: true,
      courts: {
        create: courtIds.map((id, index) => ({
          id,
          courtNumber: index + 1,
        })),
      },
      sessionCommunities: {
        create: {
          communityId,
          role: SessionCommunityRole.HOST,
          status: SessionCommunityStatus.ACCEPTED,
          requestedById: ownerUserId,
          reviewedById: ownerUserId,
          reviewedAt: now,
        },
      },
      players: {
        create: fakeUsers.map((user) => ({
          userId: user.id,
          isGuest: false,
          gender: user.gender,
          partnerPreference: user.partnerPreference,
          pool: SessionPool.A,
          sessionPoints: 0,
          joinedAt: now,
          availableSince: now,
          ladderEntryAt: now,
        })),
      },
    },
  });

  const matchSeeds = [
    {
      courtId: courtIds[0],
      users: fakeUsers.slice(0, 4),
    },
    {
      courtId: courtIds[1],
      users: fakeUsers.slice(4, 8),
    },
  ];

  for (const seed of matchSeeds) {
    const match = await tx.match.create({
      data: {
        id: randomUUID(),
        sessionId,
        courtId: seed.courtId,
        status: MatchStatus.IN_PROGRESS,
        team1User1Id: seed.users[0].id,
        team1User2Id: seed.users[1].id,
        team2User1Id: seed.users[2].id,
        team2User2Id: seed.users[3].id,
      },
      select: { id: true },
    });

    await tx.court.update({
      where: { id: seed.courtId },
      data: { currentMatchId: match.id },
    });
  }
}

async function clearTutorialPlaygroundData(
  tx: TutorialTx,
  communityId: string,
  ownerUserId: string
) {
  const sessionRows = await tx.session.findMany({
    where: { communityId },
    select: { id: true },
  });
  const sessionIds = sessionRows.map((session) => session.id);

  if (sessionIds.length > 0) {
    await tx.court.updateMany({
      where: { sessionId: { in: sessionIds } },
      data: { currentMatchId: null },
    });
    await tx.queuedMatch.deleteMany({
      where: { sessionId: { in: sessionIds } },
    });
    await tx.matchEloAdjustment.deleteMany({
      where: { communityId },
    });
    await tx.match.deleteMany({
      where: { sessionId: { in: sessionIds } },
    });
    await tx.sessionPlayer.deleteMany({
      where: { sessionId: { in: sessionIds } },
    });
    await tx.sessionCommunity.deleteMany({
      where: { sessionId: { in: sessionIds } },
    });
    await tx.session.deleteMany({
      where: { id: { in: sessionIds } },
    });
  }

  await tx.claimRequest.deleteMany({ where: { communityId } });
  await tx.offlineIdentityLinkRequest.deleteMany({
    where: {
      OR: [
        { sourceCommunityId: communityId },
        { targetCommunityId: communityId },
      ],
    },
  });
  await tx.offlineIdentityMember.deleteMany({ where: { communityId } });

  const fakeMembers = await tx.communityMember.findMany({
    where: {
      communityId,
      userId: { not: ownerUserId },
      user: {
        email: null,
        isClaimed: false,
      },
    },
    select: { userId: true },
  });
  const fakeUserIds = fakeMembers.map((member) => member.userId);

  if (fakeUserIds.length > 0) {
    await tx.communityMember.deleteMany({
      where: {
        communityId,
        userId: { in: fakeUserIds },
      },
    });
    await tx.user.deleteMany({
      where: {
        id: { in: fakeUserIds },
        email: null,
        isClaimed: false,
      },
    });
  }

  await tx.communityMember.updateMany({
    where: { communityId, userId: ownerUserId },
    data: {
      role: "ADMIN",
      status: CommunityPlayerStatus.CORE,
      elo: 1000,
    },
  });

  await tx.tutorialProgress.deleteMany({
    where: {
      userId: ownerUserId,
      tutorialKey: ADMIN_ONBOARDING_TUTORIAL_KEY,
    },
  });
}

export async function getTutorialPlaygroundSummary(userId: string) {
  const playground = await prisma.community.findUnique({
    where: { tutorialOwnerId: userId },
    select: { id: true, isTutorial: true },
  });

  if (!playground?.isTutorial) {
    return null;
  }

  return prisma.$transaction((tx) =>
    summarizeTutorialPlayground(tx, playground.id)
  );
}

export async function ensureTutorialPlayground(userId: string) {
  return prisma.$transaction(async (tx) => {
    let playground = await tx.community.findUnique({
      where: { tutorialOwnerId: userId },
      select: { id: true, isTutorial: true },
    });

    if (!playground) {
      playground = await createTutorialCommunity(tx, userId);
      await seedTutorialPlaygroundData(tx, playground.id, userId);
    } else if (!playground.isTutorial) {
      throw new Error("Tutorial owner is attached to a non-tutorial community");
    }

    return summarizeTutorialPlayground(tx, playground.id);
  });
}

export async function resetTutorialPlayground(userId: string) {
  return prisma.$transaction(async (tx) => {
    let playground = await tx.community.findUnique({
      where: { tutorialOwnerId: userId },
      select: { id: true, isTutorial: true },
    });

    if (!playground) {
      playground = await createTutorialCommunity(tx, userId);
    } else if (!playground.isTutorial) {
      throw new Error("Tutorial owner is attached to a non-tutorial community");
    } else {
      await clearTutorialPlaygroundData(tx, playground.id, userId);
    }

    await seedTutorialPlaygroundData(tx, playground.id, userId);
    return summarizeTutorialPlayground(tx, playground.id);
  });
}

export async function deleteTutorialPlayground(userId: string, communityId: string) {
  return prisma.$transaction(async (tx) => {
    const playground = await tx.community.findUnique({
      where: { id: communityId },
      select: {
        id: true,
        isTutorial: true,
        tutorialOwnerId: true,
      },
    });

    if (
      !playground?.isTutorial ||
      playground.tutorialOwnerId !== userId
    ) {
      throw new Error("Tutorial playground not found");
    }

    await clearTutorialPlaygroundData(tx, playground.id, userId);
    await tx.community.delete({ where: { id: playground.id } });

    return { success: true };
  });
}
