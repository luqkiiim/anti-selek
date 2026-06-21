import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import { e2eDatabaseFile, e2eEnv } from "./env";

const adminUserId = "user-admin-e2e";
const hostClubId = "community-host-e2e";
const adminControlsClubId = "community-admin-controls-e2e";
const claimClubId = "community-claim-e2e";
const scoreClubId = "community-score-e2e";
const scoreSessionId = "session-score-e2e";
const scoreCourtId = "court-score-e2e";
const adminControlResetUserId = "user-admin-control-reset-e2e";
const adminControlRemoveUserId = "user-admin-control-remove-e2e";
const adminControlPromoteUserId = "user-admin-control-promote-e2e";
const claimRequesterId = "user-claim-requester-e2e";
const claimPlaceholderId = "user-claim-placeholder-e2e";

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
        {
          id: claimRequesterId,
          email: "claim-requester@example.com",
          name: "CLAIM Candidate",
          passwordHash,
          isClaimed: true,
          gender: "FEMALE",
          partnerPreference: "FEMALE_FLEX",
        },
        {
          id: claimPlaceholderId,
          email: null,
          name: "Claim Candidate",
          passwordHash: null,
          isClaimed: false,
          gender: "FEMALE",
          partnerPreference: "FEMALE_FLEX",
        },
        {
          id: adminControlResetUserId,
          email: "admin-control-reset@example.com",
          name: "Admin Control Reset",
          passwordHash,
          isClaimed: true,
          gender: "MALE",
          partnerPreference: "OPEN",
        },
        {
          id: adminControlRemoveUserId,
          email: "admin-control-remove@example.com",
          name: "Admin Control Remove",
          passwordHash,
          isClaimed: true,
          gender: "FEMALE",
          partnerPreference: "FEMALE_FLEX",
        },
        {
          id: adminControlPromoteUserId,
          email: "admin-control-promote@example.com",
          name: "Admin Control Promote",
          passwordHash,
          isClaimed: true,
          gender: "MALE",
          partnerPreference: "OPEN",
        },
      ],
    });

    await prisma.club.createMany({
      data: [
        {
          id: hostClubId,
          name: "E2E Host Club",
          createdById: adminUserId,
        },
        {
          id: scoreClubId,
          name: "E2E Score Club",
          createdById: adminUserId,
        },
        {
          id: claimClubId,
          name: "E2E Claim Club",
          createdById: adminUserId,
        },
        {
          id: adminControlsClubId,
          name: "E2E Admin Controls Club",
          createdById: adminUserId,
        },
      ],
    });

    await prisma.clubMember.createMany({
      data: [
        {
          clubId: hostClubId,
          userId: adminUserId,
          role: "ADMIN",
        },
        ...hostPlayerIds.map((userId) => ({
          clubId: hostClubId,
          userId,
          role: "MEMBER",
        })),
        {
          clubId: scoreClubId,
          userId: adminUserId,
          role: "ADMIN",
        },
        ...scorePlayerIds.map((userId) => ({
          clubId: scoreClubId,
          userId,
          role: "MEMBER",
        })),
        {
          clubId: claimClubId,
          userId: adminUserId,
          role: "ADMIN",
        },
        {
          clubId: claimClubId,
          userId: claimRequesterId,
          role: "MEMBER",
        },
        {
          clubId: claimClubId,
          userId: claimPlaceholderId,
          role: "MEMBER",
        },
        {
          clubId: adminControlsClubId,
          userId: adminUserId,
          role: "ADMIN",
        },
        {
          clubId: adminControlsClubId,
          userId: adminControlResetUserId,
          role: "MEMBER",
        },
        {
          clubId: adminControlsClubId,
          userId: adminControlRemoveUserId,
          role: "MEMBER",
        },
        {
          clubId: adminControlsClubId,
          userId: adminControlPromoteUserId,
          role: "MEMBER",
        },
      ],
    });

    await prisma.session.create({
      data: {
        id: scoreSessionId,
        code: scoreSessionId,
        clubId: scoreClubId,
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
  await fs.writeFile(e2eDatabaseFile, "");

  const prismaCli = path.join(
    process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "prisma.cmd" : "prisma"
  );
  const prismaArgs = ["db", "push", "--skip-generate"];

  if (process.platform === "win32") {
    execFileSync("cmd.exe", ["/c", prismaCli, ...prismaArgs], {
      cwd: process.cwd(),
      env: e2eEnv as NodeJS.ProcessEnv,
      stdio: "inherit",
    });
  } else {
    execFileSync(prismaCli, prismaArgs, {
      cwd: process.cwd(),
      env: e2eEnv as NodeJS.ProcessEnv,
      stdio: "inherit",
    });
  }

  await seedDatabase();
}
