import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import { e2eDatabaseFile, e2eEnv } from "./env";

const adminUserId = "user-admin-e2e";
const hostCommunityId = "community-host-e2e";
const scoreCommunityId = "community-score-e2e";
const scoreSessionId = "session-score-e2e";
const scoreCourtId = "court-score-e2e";

const hostPlayerIds = [
  "user-host-1-e2e",
  "user-host-2-e2e",
  "user-host-3-e2e",
  "user-host-4-e2e",
  "user-host-5-e2e",
  "user-host-6-e2e",
  "user-host-7-e2e",
] as const;

const scorePlayerIds = [
  "user-score-1-e2e",
  "user-score-2-e2e",
  "user-score-3-e2e",
] as const;

async function resetDatabaseFiles() {
  await Promise.all(
    ["", "-journal", "-shm", "-wal"].map((suffix) =>
      fs.rm(`${e2eDatabaseFile}${suffix}`, { force: true })
    )
  );
}

async function seedDatabase() {
  Object.assign(process.env, e2eEnv);

  const prisma = new PrismaClient();
  const passwordHash = await bcrypt.hash("Password123!", 10);

  try {
    await prisma.user.createMany({
      data: [
        {
          id: adminUserId,
          email: "admin-e2e@example.com",
          name: "Admin E2E",
          passwordHash,
          isClaimed: true,
          gender: "MALE",
          partnerPreference: "OPEN",
        },
        ...hostPlayerIds.map((id, index) => ({
          id,
          email: `host-player-${index + 1}@example.com`,
          name: `Host Player ${index + 1}`,
          passwordHash,
          isClaimed: true,
          gender: index % 2 === 0 ? "MALE" : "FEMALE",
          partnerPreference: index % 2 === 0 ? "OPEN" : "FEMALE_FLEX",
        })),
        ...scorePlayerIds.map((id, index) => ({
          id,
          email: `score-player-${index + 1}@example.com`,
          name: `Score Player ${index + 1}`,
          passwordHash,
          isClaimed: true,
          gender: index % 2 === 0 ? "MALE" : "FEMALE",
          partnerPreference: index % 2 === 0 ? "OPEN" : "FEMALE_FLEX",
        })),
      ],
    });

    await prisma.community.createMany({
      data: [
        {
          id: hostCommunityId,
          name: "E2E Host Club",
          createdById: adminUserId,
        },
        {
          id: scoreCommunityId,
          name: "E2E Score Club",
          createdById: adminUserId,
        },
      ],
    });

    await prisma.communityMember.createMany({
      data: [
        {
          communityId: hostCommunityId,
          userId: adminUserId,
          role: "ADMIN",
        },
        ...hostPlayerIds.map((userId) => ({
          communityId: hostCommunityId,
          userId,
          role: "MEMBER",
        })),
        {
          communityId: scoreCommunityId,
          userId: adminUserId,
          role: "ADMIN",
        },
        ...scorePlayerIds.map((userId) => ({
          communityId: scoreCommunityId,
          userId,
          role: "MEMBER",
        })),
      ],
    });

    await prisma.session.create({
      data: {
        id: scoreSessionId,
        code: scoreSessionId,
        communityId: scoreCommunityId,
        name: "E2E Score Session",
        type: "POINTS",
        mode: "MEXICANO",
        status: "ACTIVE",
        courts: {
          create: [
            {
              id: scoreCourtId,
              courtNumber: 1,
            },
          ],
        },
        players: {
          create: [
            {
              userId: adminUserId,
              isGuest: false,
              gender: "MALE",
              partnerPreference: "OPEN",
            },
            {
              userId: scorePlayerIds[0],
              isGuest: false,
              gender: "FEMALE",
              partnerPreference: "FEMALE_FLEX",
            },
            {
              userId: scorePlayerIds[1],
              isGuest: false,
              gender: "MALE",
              partnerPreference: "OPEN",
            },
            {
              userId: scorePlayerIds[2],
              isGuest: false,
              gender: "FEMALE",
              partnerPreference: "FEMALE_FLEX",
            },
          ],
        },
      },
    });

    const seededMatch = await prisma.match.create({
      data: {
        id: "match-score-e2e",
        sessionId: scoreSessionId,
        courtId: scoreCourtId,
        status: "IN_PROGRESS",
        team1User1Id: adminUserId,
        team1User2Id: scorePlayerIds[0],
        team2User1Id: scorePlayerIds[1],
        team2User2Id: scorePlayerIds[2],
      },
    });

    await prisma.court.update({
      where: { id: scoreCourtId },
      data: { currentMatchId: seededMatch.id },
    });
  } finally {
    await prisma.$disconnect();
  }
}

export default async function globalSetup() {
  await resetDatabaseFiles();

  const prismaCli = path.join(
    process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "prisma.cmd" : "prisma"
  );

  execFileSync("cmd.exe", ["/c", prismaCli, "db", "push", "--skip-generate"], {
    cwd: process.cwd(),
    env: e2eEnv as NodeJS.ProcessEnv,
    stdio: "inherit",
  });

  await seedDatabase();
}
