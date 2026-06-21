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
import { buildClubPulse } from "./clubPulse";
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
  await prisma.sessionClub.deleteMany();
  await prisma.session.deleteMany();
  await prisma.claimRequest.deleteMany();
  await prisma.offlineIdentityLinkRequest.deleteMany();
  await prisma.offlineIdentityMember.deleteMany();
  await prisma.offlineIdentity.deleteMany();
  await prisma.clubMember.deleteMany();
  await prisma.club.deleteMany();
  await prisma.user.deleteMany();
}

function expectSeededNames(expectFn: typeof expect, names: string[]) {
  expectFn(names).toEqual(
    tutorialPlayground.TUTORIAL_FAKE_PLAYERS.map((player) => player.name).sort()
  );
  expectFn(names.every((name) => name.length < 9)).toBe(true);
}

async function buildSeededClubPulse(clubId: string) {
  const [members, sessions, completedMatches] = await Promise.all([
    prisma.clubMember.findMany({
      where: { clubId },
      include: { user: { select: { id: true, name: true } } },
    }),
    prisma.session.findMany({
      where: { clubId },
      include: {
        players: { include: { user: { select: { id: true, name: true } } } },
      },
    }),
    prisma.match.findMany({
      where: {
        status: MatchStatus.COMPLETED,
        session: { clubId, isTest: false },
      },
      include: {
        team1User1: { select: { id: true, name: true } },
        team1User2: { select: { id: true, name: true } },
        team2User1: { select: { id: true, name: true } },
        team2User2: { select: { id: true, name: true } },
        session: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
            createdAt: true,
            endedAt: true,
          },
        },
      },
    }),
  ]);

  return buildClubPulse({
    members: members.map((member) => ({
      id: member.user.id,
      name: member.user.name,
      elo: member.elo,
    })),
    sessions: sessions.map((session) => ({
      id: session.id,
      code: session.code,
      name: session.name,
      type: session.type,
      status: session.status,
      isTest: session.isTest,
      createdAt: session.createdAt,
      endedAt: session.endedAt,
      players: session.players.map((player) => ({
        user: {
          id: player.user.id,
          name: player.user.name,
        },
      })),
    })),
    completedMatches: completedMatches.map((match) => ({
      id: match.id,
      completedAt: match.completedAt,
      session: match.session,
      winnerTeam: match.winnerTeam,
      team1User1Id: match.team1User1Id,
      team1User2Id: match.team1User2Id,
      team2User1Id: match.team2User1Id,
      team2User2Id: match.team2User2Id,
      team1User1: match.team1User1,
      team1User2: match.team1User2,
      team2User1: match.team2User1,
      team2User2: match.team2User2,
      team1Score: match.team1Score,
      team2Score: match.team2Score,
      team1EloChange: match.team1EloChange,
      team2EloChange: match.team2EloChange,
    })),
  });
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
  it("creates a private seeded playground with history, fake players, and a live two-court session", async () => {
    const owner = await createOwner();

    const summary = await tutorialPlayground.ensureTutorialPlayground(owner.id);

    expect(summary.clubName).toBe(
      tutorialPlayground.TUTORIAL_PLAYGROUND_LABEL
    );
    expect(summary.playersCount).toBe(13);
    expect(summary.courtsCount).toBe(2);
    expect(summary.sessionCode).toEqual(expect.any(String));

    const club = await prisma.club.findUnique({
      where: { id: summary.clubId },
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

    expect(club?.isTutorial).toBe(true);
    expect(club?.tutorialOwnerId).toBe(owner.id);
    expect(club?.name).not.toBe(summary.clubName);
    expect(club?.name).toContain(summary.clubName);
    expect(
      club?.members.find((member) => member.userId === owner.id)?.role
    ).toBe("ADMIN");

    const fakeMembers =
      club?.members.filter((member) => member.userId !== owner.id) ?? [];
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

    const practiceSession = club?.sessions.find(
      (session) => session.isTest
    );
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

    const completedPracticeSessions =
      club?.sessions.filter(
        (session) =>
          !session.isTest && session.status === SessionStatus.COMPLETED
      ) ?? [];
    expect(completedPracticeSessions).toHaveLength(3);
    expect(completedPracticeSessions.map((session) => session.name).sort()).toEqual(
      [...tutorialPlayground.TUTORIAL_HISTORY_SESSION_NAMES].sort()
    );
    expect(
      completedPracticeSessions.flatMap((session) =>
        session.matches.filter((match) => match.status === MatchStatus.COMPLETED)
      )
    ).toHaveLength(18);
    expect(
      await prisma.matchEloAdjustment.count({
        where: { clubId: summary.clubId },
      })
    ).toBe(72);

    const rankedNames =
      club?.members
        .filter((member) => member.userId !== owner.id)
        .slice()
        .sort((left, right) => right.elo - left.elo)
        .slice(0, 5)
        .map((member) => member.user.name) ?? [];
    expect(rankedNames).toEqual([
      "Danish",
      "Farah",
      "Amir",
      "Aiman",
      "Siti",
    ]);

    const pulse = await buildSeededClubPulse(summary.clubId);
    expect(pulse.metrics.completedTournaments).toBe(3);
    expect(pulse.metrics.recentMatches).toBe(18);
    expect(pulse.hotPlayers.length).toBeGreaterThan(0);
    expect(pulse.hotPlayers.map((player) => player.user.name)).toContain(
      "Farah"
    );
    expect(pulse.rivalries[0].players.map((player) => player.name).sort()).toEqual([
      "Aiman",
      "Haziq",
    ]);
    expect(pulse.rivalries[0].matches).toBe(4);
    expect(pulse.rivalries[0].playerOneWins).toBe(2);
    expect(pulse.rivalries[0].playerTwoWins).toBe(2);
    expect(
      pulse.partnerships[0].players.map((player) => player.name).sort()
    ).toEqual(["Danish", "Farah"]);
    expect(pulse.partnerships[0].wins).toBe(6);
    expect(pulse.latestStory?.session.name).toBe("Weekend Cup");
  });

  it("resets seeded sessions, fake users, and tutorial progress", async () => {
    const owner = await createOwner();
    const firstSummary = await tutorialPlayground.ensureTutorialPlayground(owner.id);
    const originalFakeUserIds = (
      await prisma.clubMember.findMany({
        where: {
          clubId: firstSummary.clubId,
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

    expect(resetSummary.clubId).toBe(firstSummary.clubId);
    expect(resetSummary.sessionCode).not.toBe(firstSummary.sessionCode);
    expect(resetSummary.playersCount).toBe(13);
    expect(resetSummary.courtsCount).toBe(2);
    expect(resetSummary.clubName).toBe(
      tutorialPlayground.TUTORIAL_PLAYGROUND_LABEL
    );
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
      await prisma.clubMember.findMany({
        where: {
          clubId: resetSummary.clubId,
          userId: { not: owner.id },
        },
        include: { user: true },
      })
    )
      .map((member) => member.user.name)
      .sort();
    expectSeededNames(expect, fakeNames);
    expect(
      await prisma.session.count({
        where: {
          clubId: resetSummary.clubId,
          isTest: false,
          status: SessionStatus.COMPLETED,
        },
      })
    ).toBe(3);
    expect(
      await prisma.match.count({
        where: {
          status: MatchStatus.COMPLETED,
          session: {
            clubId: resetSummary.clubId,
            isTest: false,
          },
        },
      })
    ).toBe(18);
  });
});
