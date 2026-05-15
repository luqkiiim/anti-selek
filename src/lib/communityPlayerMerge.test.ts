import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  ClaimRequestStatus,
  CommunityPlayerStatus,
  MatchStatus,
  PartnerPreference,
  PlayerGender,
  SessionCommunityRole,
  SessionCommunityStatus,
  SessionMode,
  SessionStatus,
  SessionType,
} from "@/types/enums";

type PrismaInstance = typeof import("@/lib/prisma")["prisma"];
type MergeService = typeof import("./communityPlayerMerge");

const tempDatabaseFile = path.resolve(
  process.cwd(),
  "prisma",
  `community-player-merge-${randomUUID()}.db`
);
const tempDatabaseUrl = `file:${tempDatabaseFile.replace(/\\/g, "/")}`;
const mutableEnv = process.env as Record<string, string | undefined>;
const previousEnv = {
  DATABASE_URL: mutableEnv.DATABASE_URL,
  TURSO_DATABASE_URL: mutableEnv.TURSO_DATABASE_URL,
  TURSO_AUTH_TOKEN: mutableEnv.TURSO_AUTH_TOKEN,
  NODE_ENV: mutableEnv.NODE_ENV,
};

let prisma: PrismaInstance;
let mergeService: MergeService;

function getPrismaBinary() {
  return path.join(
    process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "prisma.cmd" : "prisma"
  );
}

async function removeDatabaseFiles() {
  await Promise.all(
    ["", "-journal", "-shm", "-wal"].map((suffix) =>
      fs.rm(`${tempDatabaseFile}${suffix}`, { force: true })
    )
  );
}

async function createUser(id: string, name = id, claimed = false) {
  await prisma.user.create({
    data: {
      id,
      email: claimed ? `${id}@example.com` : null,
      passwordHash: claimed ? "password-hash" : null,
      name,
      isClaimed: claimed,
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
    },
  });
}

async function createCommunity(id: string, createdById: string) {
  await prisma.community.create({
    data: {
      id,
      name: `${id} ${randomUUID()}`,
      createdById,
    },
  });
}

async function createSessionWithSourceReferences({
  id,
  hostCommunityId,
  sourceUserId,
  otherUserIds,
  participantCommunityId,
}: {
  id: string;
  hostCommunityId: string;
  sourceUserId: string;
  otherUserIds: string[];
  participantCommunityId?: string;
}) {
  const courtId = `${id}-court`;
  const matchId = `${id}-match`;

  await prisma.session.create({
    data: {
      id,
      code: `${id}-code`,
      communityId: hostCommunityId,
      name: id,
      type: SessionType.ELO,
      mode: SessionMode.MEXICANO,
      status: SessionStatus.ACTIVE,
      players: {
        create: [sourceUserId, ...otherUserIds].map((userId) => ({
          userId,
          gender: PlayerGender.MALE,
          partnerPreference: PartnerPreference.OPEN,
        })),
      },
      courts: {
        create: [{ id: courtId, courtNumber: 1 }],
      },
      sessionCommunities: participantCommunityId
        ? {
            create: [
              {
                communityId: participantCommunityId,
                role: SessionCommunityRole.PARTNER,
                status: SessionCommunityStatus.PENDING,
              },
            ],
          }
        : undefined,
    },
  });

  await prisma.match.create({
    data: {
      id: matchId,
      sessionId: id,
      courtId,
      status: MatchStatus.COMPLETED,
      scoreSubmittedByUserId: sourceUserId,
      team1User1Id: sourceUserId,
      team1User2Id: otherUserIds[0],
      team2User1Id: otherUserIds[1],
      team2User2Id: otherUserIds[2],
      team1Score: 11,
      team2Score: 9,
      winnerTeam: 1,
      completedAt: new Date("2026-05-14T10:00:00.000Z"),
    },
  });

  await prisma.queuedMatch.create({
    data: {
      id: `${id}-queue`,
      sessionId: id,
      team1User1Id: otherUserIds[0],
      team1User2Id: sourceUserId,
      team2User1Id: otherUserIds[1],
      team2User2Id: otherUserIds[2],
    },
  });

  return { matchId };
}

beforeAll(async () => {
  mutableEnv.DATABASE_URL = tempDatabaseUrl;
  mutableEnv.TURSO_DATABASE_URL = "";
  mutableEnv.TURSO_AUTH_TOKEN = "";
  mutableEnv.NODE_ENV = "test";

  await removeDatabaseFiles();
  await fs.writeFile(tempDatabaseFile, "");

  const prismaBinary = getPrismaBinary();
  if (process.platform === "win32") {
    execFileSync("cmd.exe", ["/c", prismaBinary, "db", "push", "--skip-generate"], {
      cwd: process.cwd(),
      env: process.env as NodeJS.ProcessEnv,
      stdio: "inherit",
    });
  } else {
    execFileSync(prismaBinary, ["db", "push", "--skip-generate"], {
      cwd: process.cwd(),
      env: process.env as NodeJS.ProcessEnv,
      stdio: "inherit",
    });
  }

  (globalThis as { prisma?: PrismaInstance }).prisma = undefined;
  const prismaModule = await import("@/lib/prisma");
  prisma = prismaModule.prisma;
  mergeService = await import("./communityPlayerMerge");
});

beforeEach(async () => {
  await prisma.rateLimitBucket.deleteMany();
  await prisma.claimRequest.deleteMany();
  await prisma.matchEloAdjustment.deleteMany();
  await prisma.queuedMatch.deleteMany();
  await prisma.match.deleteMany();
  await prisma.court.deleteMany();
  await prisma.sessionPlayer.deleteMany();
  await prisma.sessionCommunity.deleteMany();
  await prisma.session.deleteMany();
  await prisma.communityMember.deleteMany();
  await prisma.community.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma?.$disconnect();
  (globalThis as { prisma?: PrismaInstance }).prisma = undefined;

  mutableEnv.DATABASE_URL = previousEnv.DATABASE_URL;
  mutableEnv.TURSO_DATABASE_URL = previousEnv.TURSO_DATABASE_URL;
  mutableEnv.TURSO_AUTH_TOKEN = previousEnv.TURSO_AUTH_TOKEN;
  mutableEnv.NODE_ENV = previousEnv.NODE_ENV;

  await removeDatabaseFiles();
});

describe("mergeDuplicateUnclaimedCommunityPlayer", () => {
  it("moves a community duplicate onto the canonical user id and rewrites current-community history", async () => {
    const prefix = `merge-${randomUUID().slice(0, 8)}`;
    const adminId = `${prefix}-admin`;
    const currentCommunityId = `${prefix}-current`;
    const targetCommunityId = `${prefix}-target-community`;
    const sourceUserId = `${prefix}-source`;
    const targetUserId = `${prefix}-target`;
    const otherUserIds = ["p2", "p3", "p4"].map((key) => `${prefix}-${key}`);

    await createUser(adminId, "Admin", true);
    await createUser(sourceUserId, "Alex Lee");
    await createUser(targetUserId, "Alex Lee");
    for (const userId of otherUserIds) {
      await createUser(userId);
    }
    await createCommunity(currentCommunityId, adminId);
    await createCommunity(targetCommunityId, adminId);
    await prisma.communityMember.create({
      data: {
        communityId: currentCommunityId,
        userId: sourceUserId,
        elo: 1432,
        status: CommunityPlayerStatus.OCCASIONAL,
        role: "MEMBER",
      },
    });
    await prisma.communityMember.create({
      data: {
        communityId: targetCommunityId,
        userId: targetUserId,
        elo: 1190,
      },
    });

    const hostSession = await createSessionWithSourceReferences({
      id: `${prefix}-host-session`,
      hostCommunityId: currentCommunityId,
      sourceUserId,
      otherUserIds,
    });
    const collabSession = await createSessionWithSourceReferences({
      id: `${prefix}-collab-session`,
      hostCommunityId: targetCommunityId,
      participantCommunityId: currentCommunityId,
      sourceUserId,
      otherUserIds,
    });
    await prisma.matchEloAdjustment.createMany({
      data: [
        {
          matchId: hostSession.matchId,
          communityId: currentCommunityId,
          userId: sourceUserId,
          delta: 16,
          beforeElo: 1416,
          afterElo: 1432,
        },
        {
          matchId: collabSession.matchId,
          communityId: currentCommunityId,
          userId: sourceUserId,
          delta: -8,
          beforeElo: 1432,
          afterElo: 1424,
        },
      ],
    });

    const result = await prisma.$transaction((tx) =>
      mergeService.mergeDuplicateUnclaimedCommunityPlayer(tx, {
        communityId: currentCommunityId,
        sourceUserId,
        targetUserId,
        reviewerUserId: adminId,
      })
    );

    expect(result).toMatchObject({
      sourceUserId,
      targetUserId,
      deletedSourceUser: true,
    });

    await expect(
      prisma.communityMember.findUnique({
        where: {
          communityId_userId: {
            communityId: currentCommunityId,
            userId: sourceUserId,
          },
        },
      })
    ).resolves.toBeNull();
    await expect(
      prisma.communityMember.findUnique({
        where: {
          communityId_userId: {
            communityId: currentCommunityId,
            userId: targetUserId,
          },
        },
      })
    ).resolves.toMatchObject({
      elo: 1432,
      status: CommunityPlayerStatus.OCCASIONAL,
      role: "MEMBER",
    });

    expect(
      await prisma.sessionPlayer.count({ where: { userId: sourceUserId } })
    ).toBe(0);
    expect(
      await prisma.sessionPlayer.count({ where: { userId: targetUserId } })
    ).toBe(2);
    expect(await prisma.match.count({ where: { team1User1Id: sourceUserId } }))
      .toBe(0);
    expect(
      await prisma.match.count({ where: { scoreSubmittedByUserId: sourceUserId } })
    ).toBe(0);
    expect(await prisma.match.count({ where: { team1User1Id: targetUserId } }))
      .toBe(2);
    expect(
      await prisma.queuedMatch.count({ where: { team1User2Id: targetUserId } })
    ).toBe(2);
    expect(
      await prisma.matchEloAdjustment.count({
        where: { communityId: currentCommunityId, userId: targetUserId },
      })
    ).toBe(2);
    expect(await prisma.user.findUnique({ where: { id: sourceUserId } }))
      .toBeNull();
  });

  it("does not delete the source placeholder when it is still referenced by another community", async () => {
    const prefix = `keep-${randomUUID().slice(0, 8)}`;
    const adminId = `${prefix}-admin`;
    const currentCommunityId = `${prefix}-current`;
    const targetCommunityId = `${prefix}-target-community`;
    const sourceOtherCommunityId = `${prefix}-source-other-community`;
    const sourceUserId = `${prefix}-source`;
    const targetUserId = `${prefix}-target`;

    await createUser(adminId, "Admin", true);
    await createUser(sourceUserId, "Alex Lee");
    await createUser(targetUserId, "Alex Lee");
    await createCommunity(currentCommunityId, adminId);
    await createCommunity(targetCommunityId, adminId);
    await createCommunity(sourceOtherCommunityId, adminId);
    await prisma.communityMember.createMany({
      data: [
        { communityId: currentCommunityId, userId: sourceUserId, elo: 1310 },
        { communityId: sourceOtherCommunityId, userId: sourceUserId, elo: 990 },
        { communityId: targetCommunityId, userId: targetUserId, elo: 1200 },
      ],
    });

    const result = await prisma.$transaction((tx) =>
      mergeService.mergeDuplicateUnclaimedCommunityPlayer(tx, {
        communityId: currentCommunityId,
        sourceUserId,
        targetUserId,
        reviewerUserId: adminId,
      })
    );

    expect(result.deletedSourceUser).toBe(false);
    expect(await prisma.user.findUnique({ where: { id: sourceUserId } }))
      .toMatchObject({ id: sourceUserId });
    expect(
      await prisma.communityMember.findUnique({
        where: {
          communityId_userId: {
            communityId: sourceOtherCommunityId,
            userId: sourceUserId,
          },
        },
      })
    ).toMatchObject({ elo: 990 });
  });

  it("rejects merges when the target already appears in affected session history", async () => {
    const prefix = `conflict-${randomUUID().slice(0, 8)}`;
    const adminId = `${prefix}-admin`;
    const currentCommunityId = `${prefix}-current`;
    const targetCommunityId = `${prefix}-target-community`;
    const sourceUserId = `${prefix}-source`;
    const targetUserId = `${prefix}-target`;
    const otherUserIds = ["p2", "p3", "p4"].map((key) => `${prefix}-${key}`);

    await createUser(adminId, "Admin", true);
    await createUser(sourceUserId, "Alex Lee");
    await createUser(targetUserId, "Alex Lee");
    for (const userId of otherUserIds) {
      await createUser(userId);
    }
    await createCommunity(currentCommunityId, adminId);
    await createCommunity(targetCommunityId, adminId);
    await prisma.communityMember.createMany({
      data: [
        { communityId: currentCommunityId, userId: sourceUserId },
        { communityId: targetCommunityId, userId: targetUserId },
      ],
    });

    const { matchId } = await createSessionWithSourceReferences({
      id: `${prefix}-session`,
      hostCommunityId: currentCommunityId,
      sourceUserId,
      otherUserIds,
    });
    await prisma.sessionPlayer.create({
      data: {
        sessionId: `${prefix}-session`,
        userId: targetUserId,
        gender: PlayerGender.MALE,
        partnerPreference: PartnerPreference.OPEN,
      },
    });
    await prisma.matchEloAdjustment.create({
      data: {
        matchId,
        communityId: currentCommunityId,
        userId: sourceUserId,
        delta: 4,
        beforeElo: 1000,
        afterElo: 1004,
      },
    });

    await expect(
      prisma.$transaction((tx) =>
        mergeService.mergeDuplicateUnclaimedCommunityPlayer(tx, {
          communityId: currentCommunityId,
          sourceUserId,
          targetUserId,
          reviewerUserId: adminId,
        })
      )
    ).rejects.toMatchObject({
      message: "Target player already appears in this community's session history",
      statusCode: 409,
    });

    expect(
      await prisma.communityMember.findUnique({
        where: {
          communityId_userId: {
            communityId: currentCommunityId,
            userId: sourceUserId,
          },
        },
      })
    ).not.toBeNull();
  });

  it("rejects pending source claim requests before disposable cleanup", async () => {
    const prefix = `claim-${randomUUID().slice(0, 8)}`;
    const adminId = `${prefix}-admin`;
    const claimantId = `${prefix}-claimant`;
    const currentCommunityId = `${prefix}-current`;
    const targetCommunityId = `${prefix}-target-community`;
    const sourceOtherCommunityId = `${prefix}-source-other-community`;
    const sourceUserId = `${prefix}-source`;
    const targetUserId = `${prefix}-target`;

    await createUser(adminId, "Admin", true);
    await createUser(claimantId, "Alex Lee", true);
    await createUser(sourceUserId, "Alex Lee");
    await createUser(targetUserId, "Alex Lee");
    await createCommunity(currentCommunityId, adminId);
    await createCommunity(targetCommunityId, adminId);
    await createCommunity(sourceOtherCommunityId, adminId);
    await prisma.communityMember.createMany({
      data: [
        { communityId: currentCommunityId, userId: sourceUserId },
        { communityId: currentCommunityId, userId: claimantId },
        { communityId: sourceOtherCommunityId, userId: sourceUserId },
        { communityId: targetCommunityId, userId: targetUserId },
      ],
    });
    const claim = await prisma.claimRequest.create({
      data: {
        communityId: currentCommunityId,
        requesterUserId: claimantId,
        targetUserId: sourceUserId,
      },
    });

    await prisma.$transaction((tx) =>
      mergeService.mergeDuplicateUnclaimedCommunityPlayer(tx, {
        communityId: currentCommunityId,
        sourceUserId,
        targetUserId,
        reviewerUserId: adminId,
      })
    );

    await expect(
      prisma.claimRequest.findUnique({ where: { id: claim.id } })
    ).resolves.toMatchObject({
      status: ClaimRequestStatus.REJECTED,
      reviewedById: adminId,
    });
  });
});
