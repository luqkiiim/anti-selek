import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withLegacyClubAliases } from "@/lib/clubContractAliases";
import {
  ADMIN_ONBOARDING_TUTORIAL_KEY,
} from "@/lib/adminOnboarding";
import {
  ClubPlayerStatus,
  MatchStatus,
  PartnerPreference,
  PlayerGender,
  SessionClubRole,
  SessionClubStatus,
  SessionMode,
  SessionPool,
  SessionStatus,
  SessionType,
} from "@/types/enums";

export const TUTORIAL_PLAYGROUND_LABEL = "Tutorial playground";
export const TUTORIAL_PLAYGROUND_SESSION_NAME = "Practice rally";
export const TUTORIAL_HISTORY_SESSION_NAMES = [
  "Warm-up Cup",
  "Evening Rally",
  "Weekend Cup",
] as const;

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
type TutorialFakePlayerName = (typeof TUTORIAL_FAKE_PLAYERS)[number]["name"];
type TutorialSeedUser = {
  id: string;
  name: string;
  gender: string;
  partnerPreference: string;
  elo: number;
};

interface TutorialPracticeMatchSeed {
  team1: [TutorialFakePlayerName, TutorialFakePlayerName];
  team2: [TutorialFakePlayerName, TutorialFakePlayerName];
  team1Score: number;
  team2Score: number;
  team1Delta: number;
  team2Delta: number;
}

interface TutorialPracticeSessionSeed {
  name: (typeof TUTORIAL_HISTORY_SESSION_NAMES)[number];
  daysAgo: number;
  matches: TutorialPracticeMatchSeed[];
}

export interface TutorialPlaygroundSummary {
  clubId: string;
  clubName: string;
  sessionCode: string | null;
  playersCount: number;
  courtsCount: number;
  isTutorial: true;
}

function getTutorialClubName(userId: string) {
  return `${TUTORIAL_PLAYGROUND_LABEL} ${userId.slice(-8)}`;
}

export function getTutorialClubDisplayName(club: {
  name: string;
  isTutorial?: boolean | null;
}) {
  return club.isTutorial ? TUTORIAL_PLAYGROUND_LABEL : club.name;
}

const TUTORIAL_PRACTICE_SESSIONS: TutorialPracticeSessionSeed[] = [
  {
    name: "Warm-up Cup",
    daysAgo: 6,
    matches: [
      {
        team1: ["Aiman", "Siti"],
        team2: ["Haziq", "Aina"],
        team1Score: 21,
        team2Score: 17,
        team1Delta: 12,
        team2Delta: -12,
      },
      {
        team1: ["Farah", "Danish"],
        team2: ["Amir", "Mira"],
        team1Score: 21,
        team2Score: 14,
        team1Delta: 14,
        team2Delta: -14,
      },
      {
        team1: ["Irfan", "Yana"],
        team2: ["Zul", "Rafi"],
        team1Score: 21,
        team2Score: 19,
        team1Delta: 8,
        team2Delta: -8,
      },
      {
        team1: ["Haziq", "Mira"],
        team2: ["Aiman", "Zul"],
        team1Score: 21,
        team2Score: 18,
        team1Delta: 11,
        team2Delta: -11,
      },
      {
        team1: ["Farah", "Danish"],
        team2: ["Aina", "Nadia"],
        team1Score: 21,
        team2Score: 12,
        team1Delta: 13,
        team2Delta: -13,
      },
      {
        team1: ["Amir", "Siti"],
        team2: ["Irfan", "Rafi"],
        team1Score: 21,
        team2Score: 16,
        team1Delta: 10,
        team2Delta: -10,
      },
    ],
  },
  {
    name: "Evening Rally",
    daysAgo: 3,
    matches: [
      {
        team1: ["Aiman", "Amir"],
        team2: ["Haziq", "Rafi"],
        team1Score: 21,
        team2Score: 18,
        team1Delta: 11,
        team2Delta: -11,
      },
      {
        team1: ["Farah", "Danish"],
        team2: ["Irfan", "Yana"],
        team1Score: 21,
        team2Score: 15,
        team1Delta: 13,
        team2Delta: -13,
      },
      {
        team1: ["Siti", "Mira"],
        team2: ["Nadia", "Zul"],
        team1Score: 21,
        team2Score: 19,
        team1Delta: 9,
        team2Delta: -9,
      },
      {
        team1: ["Haziq", "Nadia"],
        team2: ["Aiman", "Yana"],
        team1Score: 22,
        team2Score: 20,
        team1Delta: 12,
        team2Delta: -12,
      },
      {
        team1: ["Farah", "Danish"],
        team2: ["Amir", "Siti"],
        team1Score: 21,
        team2Score: 17,
        team1Delta: 12,
        team2Delta: -12,
      },
      {
        team1: ["Aina", "Rafi"],
        team2: ["Mira", "Zul"],
        team1Score: 21,
        team2Score: 18,
        team1Delta: 8,
        team2Delta: -8,
      },
    ],
  },
  {
    name: "Weekend Cup",
    daysAgo: 1,
    matches: [
      {
        team1: ["Farah", "Danish"],
        team2: ["Zul", "Rafi"],
        team1Score: 21,
        team2Score: 11,
        team1Delta: 15,
        team2Delta: -15,
      },
      {
        team1: ["Aiman", "Siti"],
        team2: ["Amir", "Mira"],
        team1Score: 21,
        team2Score: 19,
        team1Delta: 10,
        team2Delta: -10,
      },
      {
        team1: ["Amir", "Siti"],
        team2: ["Haziq", "Aina"],
        team1Score: 21,
        team2Score: 16,
        team1Delta: 11,
        team2Delta: -11,
      },
      {
        team1: ["Farah", "Danish"],
        team2: ["Irfan", "Nadia"],
        team1Score: 21,
        team2Score: 13,
        team1Delta: 14,
        team2Delta: -14,
      },
      {
        team1: ["Aiman", "Amir"],
        team2: ["Zul", "Yana"],
        team1Score: 21,
        team2Score: 18,
        team1Delta: 9,
        team2Delta: -9,
      },
      {
        team1: ["Mira", "Rafi"],
        team2: ["Haziq", "Nadia"],
        team1Score: 21,
        team2Score: 20,
        team1Delta: 7,
        team2Delta: -7,
      },
    ],
  },
];

async function summarizeTutorialPlayground(
  tx: TutorialTx,
  clubId: string
): Promise<TutorialPlaygroundSummary> {
  const club = await tx.club.findUnique({
    where: { id: clubId },
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

  if (!club) {
    throw new Error("Tutorial playground not found");
  }

  const session = club.sessions[0] ?? null;

  return withLegacyClubAliases({
    clubId: club.id,
    clubName: TUTORIAL_PLAYGROUND_LABEL,
    sessionCode: session?.code ?? null,
    playersCount: session?._count.players ?? 0,
    courtsCount: session?._count.courts ?? 0,
    isTutorial: true as const,
  });
}

async function createTutorialClub(tx: TutorialTx, userId: string) {
  return tx.club.create({
    data: {
      name: getTutorialClubName(userId),
      createdById: userId,
      isTutorial: true,
      tutorialOwnerId: userId,
      members: {
        create: {
          userId,
          role: "ADMIN",
          status: ClubPlayerStatus.CORE,
        },
      },
    },
    select: { id: true, isTutorial: true },
  });
}

async function seedTutorialPlaygroundData(
  tx: TutorialTx,
  clubId: string,
  ownerUserId: string
) {
  await tx.clubMember.upsert({
    where: {
      clubId_userId: {
        clubId,
        userId: ownerUserId,
      },
    },
    update: {
      role: "ADMIN",
      status: ClubPlayerStatus.CORE,
      elo: 1000,
    },
    create: {
      clubId,
      userId: ownerUserId,
      role: "ADMIN",
      status: ClubPlayerStatus.CORE,
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
        name: true,
        gender: true,
        partnerPreference: true,
        elo: true,
      },
    });
    fakeUsers.push(user);
  }

  await tx.clubMember.createMany({
    data: fakeUsers.map((user, index) => ({
      clubId,
      userId: user.id,
      role: "MEMBER",
      status:
        index % 6 === 4
          ? ClubPlayerStatus.OCCASIONAL
          : ClubPlayerStatus.CORE,
      elo: user.elo,
    })),
  });

  await seedCompletedPracticeSessions(tx, clubId, fakeUsers);
  await seedActiveTutorialSession(tx, clubId, ownerUserId, fakeUsers);
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function getSeedPlayer(
  playerByName: Map<string, TutorialSeedUser>,
  name: TutorialFakePlayerName
) {
  const player = playerByName.get(name);
  if (!player) {
    throw new Error(`Tutorial fake player missing: ${name}`);
  }
  return player;
}

async function seedCompletedPracticeSessions(
  tx: TutorialTx,
  clubId: string,
  fakeUsers: TutorialSeedUser[]
) {
  const now = new Date();
  const playerByName = new Map(fakeUsers.map((user) => [user.name, user]));
  const ratingByUserId = new Map(
    fakeUsers.map((user) => [user.id, user.elo])
  );

  for (const practiceSession of TUTORIAL_PRACTICE_SESSIONS) {
    const sessionId = randomUUID();
    const courtIds = [randomUUID(), randomUUID()];
    const createdAt = addDays(now, -practiceSession.daysAgo);
    createdAt.setHours(19, 0, 0, 0);
    const endedAt = new Date(createdAt);
    endedAt.setHours(21, 30, 0, 0);
    const sessionPointsByUserId = new Map(
      fakeUsers.map((user) => [user.id, 0])
    );
    const matchesPlayedByUserId = new Map(
      fakeUsers.map((user) => [user.id, 0])
    );
    const lastPartnerByUserId = new Map<string, string>();

    await tx.session.create({
      data: {
        id: sessionId,
        code: sessionId,
        clubId,
        name: practiceSession.name,
        type: SessionType.POINTS,
        mode: SessionMode.MEXICANO,
        status: SessionStatus.COMPLETED,
        isTest: false,
        autoQueueEnabled: true,
        createdAt,
        endedAt,
        courts: {
          create: courtIds.map((id, index) => ({
            id,
            courtNumber: index + 1,
          })),
        },
        sessionClubs: {
          create: {
            clubId,
            role: SessionClubRole.HOST,
            status: SessionClubStatus.ACCEPTED,
            reviewedAt: endedAt,
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
            joinedAt: createdAt,
            availableSince: endedAt,
            ladderEntryAt: createdAt,
            lastPlayedAt: endedAt,
          })),
        },
      },
    });

    for (const [matchIndex, seed] of practiceSession.matches.entries()) {
      const team1 = seed.team1.map((name) => getSeedPlayer(playerByName, name));
      const team2 = seed.team2.map((name) => getSeedPlayer(playerByName, name));
      const completedAt = new Date(createdAt);
      completedAt.setMinutes(15 + matchIndex * 18);
      const team1Won = seed.team1Score > seed.team2Score;
      const matchId = randomUUID();

      await tx.match.create({
        data: {
          id: matchId,
          sessionId,
          courtId: courtIds[matchIndex % courtIds.length],
          status: MatchStatus.COMPLETED,
          team1User1Id: team1[0].id,
          team1User2Id: team1[1].id,
          team2User1Id: team2[0].id,
          team2User2Id: team2[1].id,
          team1Score: seed.team1Score,
          team2Score: seed.team2Score,
          winnerTeam: team1Won ? 1 : 2,
          team1EloChange: seed.team1Delta,
          team2EloChange: seed.team2Delta,
          createdAt,
          completedAt,
        },
      });

      const teams = [
        { players: team1, score: seed.team1Score, delta: seed.team1Delta },
        { players: team2, score: seed.team2Score, delta: seed.team2Delta },
      ];

      for (const team of teams) {
        for (const player of team.players) {
          sessionPointsByUserId.set(
            player.id,
            (sessionPointsByUserId.get(player.id) ?? 0) + team.score
          );
          matchesPlayedByUserId.set(
            player.id,
            (matchesPlayedByUserId.get(player.id) ?? 0) + 1
          );
        }
        lastPartnerByUserId.set(team.players[0].id, team.players[1].id);
        lastPartnerByUserId.set(team.players[1].id, team.players[0].id);
      }

      await tx.matchEloAdjustment.createMany({
        data: teams.flatMap((team) =>
          team.players.map((player) => {
            const beforeElo = ratingByUserId.get(player.id) ?? player.elo;
            const afterElo = beforeElo + team.delta;
            ratingByUserId.set(player.id, afterElo);
            return {
              matchId,
              clubId,
              userId: player.id,
              delta: team.delta,
              beforeElo,
              afterElo,
              createdAt: completedAt,
            };
          })
        ),
      });
    }

    for (const user of fakeUsers) {
      await tx.sessionPlayer.update({
        where: {
          sessionId_userId: {
            sessionId,
            userId: user.id,
          },
        },
        data: {
          sessionPoints: sessionPointsByUserId.get(user.id) ?? 0,
          matchesPlayed: matchesPlayedByUserId.get(user.id) ?? 0,
          matchmakingMatchesCredit: matchesPlayedByUserId.get(user.id) ?? 0,
          lastPartnerId: lastPartnerByUserId.get(user.id) ?? null,
          lastPlayedAt:
            (matchesPlayedByUserId.get(user.id) ?? 0) > 0 ? endedAt : null,
          availableSince: endedAt,
        },
      });
    }
  }

  for (const user of fakeUsers) {
    await tx.clubMember.update({
      where: {
        clubId_userId: {
          clubId,
          userId: user.id,
        },
      },
      data: {
        elo: ratingByUserId.get(user.id) ?? user.elo,
      },
    });
  }
}

async function seedActiveTutorialSession(
  tx: TutorialTx,
  clubId: string,
  ownerUserId: string,
  fakeUsers: TutorialSeedUser[]
) {
  const now = new Date();
  const sessionId = randomUUID();
  const courtIds = [randomUUID(), randomUUID()];
  await tx.session.create({
    data: {
      id: sessionId,
      code: sessionId,
      clubId,
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
      sessionClubs: {
        create: {
          clubId,
          role: SessionClubRole.HOST,
          status: SessionClubStatus.ACCEPTED,
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

async function getSeededFakeUsers(tx: TutorialTx, clubId: string) {
  const members = await tx.clubMember.findMany({
    where: {
      clubId,
      user: {
        email: null,
        isClaimed: false,
        name: {
          in: TUTORIAL_FAKE_PLAYERS.map((player) => player.name),
        },
      },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          gender: true,
          partnerPreference: true,
        },
      },
    },
  });
  const memberByName = new Map(
    members.map((member) => [member.user.name, member.user])
  );

  const fakeUsers: TutorialSeedUser[] = [];

  for (const player of TUTORIAL_FAKE_PLAYERS) {
    const user = memberByName.get(player.name);
    if (!user) continue;
    fakeUsers.push({
      id: user.id,
      name: user.name,
      gender: user.gender,
      partnerPreference: user.partnerPreference,
      elo: player.elo,
    });
  }

  return fakeUsers;
}

async function deleteNamedPracticeSessions(
  tx: TutorialTx,
  clubId: string
) {
  const sessionRows = await tx.session.findMany({
    where: {
      clubId,
      isTest: false,
      name: { in: [...TUTORIAL_HISTORY_SESSION_NAMES] },
    },
    select: { id: true },
  });
  const sessionIds = sessionRows.map((session) => session.id);

  if (sessionIds.length === 0) {
    return;
  }

  const matchRows = await tx.match.findMany({
    where: { sessionId: { in: sessionIds } },
    select: { id: true },
  });
  const matchIds = matchRows.map((match) => match.id);

  if (matchIds.length > 0) {
    await tx.matchEloAdjustment.deleteMany({
      where: { matchId: { in: matchIds } },
    });
  }
  await tx.court.updateMany({
    where: { sessionId: { in: sessionIds } },
    data: { currentMatchId: null },
  });
  await tx.queuedMatch.deleteMany({ where: { sessionId: { in: sessionIds } } });
  await tx.match.deleteMany({ where: { sessionId: { in: sessionIds } } });
  await tx.sessionPlayer.deleteMany({
    where: { sessionId: { in: sessionIds } },
  });
  await tx.sessionClub.deleteMany({
    where: { sessionId: { in: sessionIds } },
  });
  await tx.court.deleteMany({ where: { sessionId: { in: sessionIds } } });
  await tx.session.deleteMany({ where: { id: { in: sessionIds } } });
}

async function hasCompletedPracticeHistory(
  tx: TutorialTx,
  clubId: string
) {
  const [sessionCount, matchCount] = await Promise.all([
    tx.session.count({
      where: {
        clubId,
        isTest: false,
        status: SessionStatus.COMPLETED,
        name: { in: [...TUTORIAL_HISTORY_SESSION_NAMES] },
      },
    }),
    tx.match.count({
      where: {
        status: MatchStatus.COMPLETED,
        session: {
          clubId,
          isTest: false,
          name: { in: [...TUTORIAL_HISTORY_SESSION_NAMES] },
        },
      },
    }),
  ]);

  return (
    sessionCount === TUTORIAL_HISTORY_SESSION_NAMES.length &&
    matchCount === TUTORIAL_PRACTICE_SESSIONS.reduce(
      (total, session) => total + session.matches.length,
      0
    )
  );
}

async function ensureCompletedPracticeHistory(
  tx: TutorialTx,
  clubId: string
) {
  if (await hasCompletedPracticeHistory(tx, clubId)) {
    return true;
  }

  const fakeUsers = await getSeededFakeUsers(tx, clubId);
  if (fakeUsers.length !== TUTORIAL_FAKE_PLAYERS.length) {
    return false;
  }

  await deleteNamedPracticeSessions(tx, clubId);
  await tx.clubMember.updateMany({
    where: {
      clubId,
      userId: { in: fakeUsers.map((user) => user.id) },
    },
    data: { elo: 1000 },
  });

  for (const player of TUTORIAL_FAKE_PLAYERS) {
    const user = fakeUsers.find((item) => item.name === player.name);
    if (!user) continue;
    await tx.clubMember.update({
      where: {
        clubId_userId: {
          clubId,
          userId: user.id,
        },
      },
      data: { elo: player.elo },
    });
  }

  await seedCompletedPracticeSessions(tx, clubId, fakeUsers);
  return true;
}

async function clearTutorialPlaygroundData(
  tx: TutorialTx,
  clubId: string,
  ownerUserId: string
) {
  const sessionRows = await tx.session.findMany({
    where: { clubId },
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
      where: { clubId },
    });
    await tx.match.deleteMany({
      where: { sessionId: { in: sessionIds } },
    });
    await tx.sessionPlayer.deleteMany({
      where: { sessionId: { in: sessionIds } },
    });
    await tx.sessionClub.deleteMany({
      where: { sessionId: { in: sessionIds } },
    });
    await tx.session.deleteMany({
      where: { id: { in: sessionIds } },
    });
  }

  await tx.claimRequest.deleteMany({ where: { clubId } });
  await tx.offlineIdentityLinkRequest.deleteMany({
    where: {
      OR: [
        { sourceClubId: clubId },
        { targetClubId: clubId },
      ],
    },
  });
  await tx.offlineIdentityMember.deleteMany({ where: { clubId } });

  const fakeMembers = await tx.clubMember.findMany({
    where: {
      clubId,
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
    await tx.clubMember.deleteMany({
      where: {
        clubId,
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

  await tx.clubMember.updateMany({
    where: { clubId, userId: ownerUserId },
    data: {
      role: "ADMIN",
      status: ClubPlayerStatus.CORE,
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
  const playground = await prisma.club.findUnique({
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
    let playground = await tx.club.findUnique({
      where: { tutorialOwnerId: userId },
      select: { id: true, isTutorial: true },
    });

    if (!playground) {
      playground = await createTutorialClub(tx, userId);
      await seedTutorialPlaygroundData(tx, playground.id, userId);
    } else if (!playground.isTutorial) {
      throw new Error("Tutorial owner is attached to a non-tutorial club");
    } else if (!(await ensureCompletedPracticeHistory(tx, playground.id))) {
      await clearTutorialPlaygroundData(tx, playground.id, userId);
      await seedTutorialPlaygroundData(tx, playground.id, userId);
    }

    return summarizeTutorialPlayground(tx, playground.id);
  });
}

export async function resetTutorialPlayground(userId: string) {
  return prisma.$transaction(async (tx) => {
    let playground = await tx.club.findUnique({
      where: { tutorialOwnerId: userId },
      select: { id: true, isTutorial: true },
    });

    if (!playground) {
      playground = await createTutorialClub(tx, userId);
    } else if (!playground.isTutorial) {
      throw new Error("Tutorial owner is attached to a non-tutorial club");
    } else {
      await clearTutorialPlaygroundData(tx, playground.id, userId);
    }

    await seedTutorialPlaygroundData(tx, playground.id, userId);
    return summarizeTutorialPlayground(tx, playground.id);
  });
}

export async function deleteTutorialPlayground(userId: string, clubId: string) {
  return prisma.$transaction(async (tx) => {
    const playground = await tx.club.findUnique({
      where: { id: clubId },
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
    await tx.club.delete({ where: { id: playground.id } });

    return { success: true };
  });
}
