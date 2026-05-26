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
  ADMIN_ONBOARDING_TUTORIAL_KEY,
} from "./adminOnboarding";
import {
  MatchStatus,
  PartnerPreference,
  PlayerGender,
  SessionStatus,
} from "@/types/enums";

type PrismaInstance = typeof import("@/lib/prisma")["prisma"];
type TutorialPlaygroundModule = typeof import("./tutorialPlayground");

const tempDatabaseFile = path.resolve(
  process.cwd(),
  "prisma",
  `tutorial-playground-${randomUUID()}.db`
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
let tutorialPlayground: TutorialPlaygroundModule;

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

async function createOwner(id = "owner-1") {
  return prisma.user.create({
    data: {
      id,
      email: `${id}@example.com`,
      passwordHash: "test-password-hash",
      name: "Owner",
      isClaimed: true,
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
    },
  });
}

async function clearDatabase() {
  await prisma.tutorialProgress.deleteMany();
  await prisma.matchEloAdjustment.deleteMany();
  await prisma.match.deleteMany();
  await prisma.court.deleteMany();
  await prisma.sessionPlayer.deleteMany();
  await prisma.sessionCommunity.deleteMany();
  await prisma.session.deleteMany();
  await prisma.claimRequest.deleteMany();
  await prisma.offlineIdentityLinkRequest.deleteMany();
  await prisma.offlineIdentityMember.deleteMany();
  await prisma.offlineIdentity.deleteMany();
  await prisma.communityMember.deleteMany();
  await prisma.community.deleteMany();
  await prisma.user.deleteMany();
}

function expectSeededNames(expectFn: typeof expect, names: string[]) {
  expectFn(names).toEqual(
    tutorialPlayground.TUTORIAL_FAKE_PLAYERS.map((player) => player.name).sort()
  );
  expectFn(names.every((name) => name.length < 9)).toBe(true);
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
  tutorialPlayground = await import("./tutorialPlayground");
});

beforeEach(async () => {
  await clearDatabase();
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

describe("tutorial playground service", () => {
  it("creates a private seeded playground with 13 fake players and a live two-court session", async () => {
    const owner = await createOwner();

    const summary = await tutorialPlayground.ensureTutorialPlayground(owner.id);

    expect(summary.playersCount).toBe(13);
    expect(summary.courtsCount).toBe(2);
    expect(summary.sessionCode).toEqual(expect.any(String));

    const community = await prisma.community.findUnique({
      where: { id: summary.communityId },
      include: {
        members: {
          include: { user: true },
          orderBy: { createdAt: "asc" },
        },
        sessions: {
          include: {
            courts: true,
            players: { include: { user: true } },
            matches: true,
          },
        },
      },
    });

    expect(community?.isTutorial).toBe(true);
    expect(community?.tutorialOwnerId).toBe(owner.id);
    expect(
      community?.members.find((member) => member.userId === owner.id)?.role
    ).toBe("ADMIN");

    const fakeMembers =
      community?.members.filter((member) => member.userId !== owner.id) ?? [];
    expect(fakeMembers).toHaveLength(13);
    expectSeededNames(
      expect,
      fakeMembers.map((member) => member.user.name).sort()
    );
    expect(
      fakeMembers.every(
        (member) => member.user.email === null && !member.user.isClaimed
      )
    ).toBe(true);

    const practiceSession = community?.sessions[0];
    expect(practiceSession?.status).toBe(SessionStatus.ACTIVE);
    expect(practiceSession?.isTest).toBe(true);
    expect(practiceSession?.players).toHaveLength(13);
    expect(practiceSession?.courts).toHaveLength(2);
    expect(
      practiceSession?.courts.every((court) => court.currentMatchId !== null)
    ).toBe(true);
    expect(
      practiceSession?.matches.filter(
        (match) => match.status === MatchStatus.IN_PROGRESS
      )
    ).toHaveLength(2);
  });

  it("resets seeded sessions, fake users, and tutorial progress", async () => {
    const owner = await createOwner();
    const firstSummary = await tutorialPlayground.ensureTutorialPlayground(owner.id);
    const originalFakeUserIds = (
      await prisma.communityMember.findMany({
        where: {
          communityId: firstSummary.communityId,
          userId: { not: owner.id },
        },
        select: { userId: true },
      })
    ).map((member) => member.userId);

    await prisma.tutorialProgress.create({
      data: {
        userId: owner.id,
        tutorialKey: ADMIN_ONBOARDING_TUTORIAL_KEY,
        completedStepIdsJson: JSON.stringify(["score-match"]),
      },
    });

    const resetSummary = await tutorialPlayground.resetTutorialPlayground(owner.id);

    expect(resetSummary.communityId).toBe(firstSummary.communityId);
    expect(resetSummary.sessionCode).not.toBe(firstSummary.sessionCode);
    expect(resetSummary.playersCount).toBe(13);
    expect(resetSummary.courtsCount).toBe(2);
    expect(
      await prisma.tutorialProgress.findUnique({
        where: {
          userId_tutorialKey: {
            userId: owner.id,
            tutorialKey: ADMIN_ONBOARDING_TUTORIAL_KEY,
          },
        },
      })
    ).toBeNull();
    expect(
      await prisma.user.findMany({
        where: { id: { in: originalFakeUserIds } },
      })
    ).toHaveLength(0);

    const fakeNames = (
      await prisma.communityMember.findMany({
        where: {
          communityId: resetSummary.communityId,
          userId: { not: owner.id },
        },
        include: { user: true },
      })
    )
      .map((member) => member.user.name)
      .sort();
    expectSeededNames(expect, fakeNames);
  });
});
